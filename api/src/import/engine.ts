/**
 * Import engine orchestrator: validation → detection → parser → normalization
 * → duplicate detection → persistence → audit + notification.
 *
 * Files are processed in-request for the MVP (bounded by MAX_IMPORT_FILES and
 * per-file size). The job table exists so an async runner (Queues/cron) can
 * take over without API changes.
 */
import type { Env, Config } from "../env";
import { badRequest, serverError, ApiError } from "../lib/errors";
import { uuid, nowIso } from "../lib/ids";
import { sha256Hex } from "../lib/crypto";
import { audit } from "../lib/audit";
import { notify } from "../auth/service";
import { detectFormat, type IncomingFile } from "./detect";
import { parseFacebookArchive, type ParsedAssetDraft } from "./facebook";
import { normalizeTitle, kindFromFilename } from "./normalize";

export interface ImportRequestFile {
  path: string;
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export interface RunImportResult {
  importId: string;
  status: string;
  format: string | null;
  filesTotal: number;
  filesParsed: number;
  filesSkipped: number;
  assetsCreated: number;
  duplicatesSkipped: number;
  notes: string[];
}

const TEXT_EXTENSIONS = new Set(["json", "html", "htm", "txt", "csv"]);

export async function runImport(
  env: Env,
  config: Config,
  userId: string,
  platform: string,
  originalFilename: string,
  files: ImportRequestFile[],
): Promise<RunImportResult> {
  const importId = uuid();
  const startedAt = nowIso();

  if (files.length === 0) throw badRequest("No files were included in this import.");
  if (files.length > config.maxImportFiles) {
    throw badRequest(`Imports are limited to ${config.maxImportFiles} files per archive.`);
  }
  for (const f of files) {
    if (f.bytes.length > config.maxUploadBytes) {
      throw badRequest(
        `“${f.name}” exceeds the ${Math.round(config.maxUploadBytes / 1048576)} MB per-file limit. Your original file has not been modified.`,
      );
    }
  }

  await env.DB.prepare(
    `INSERT INTO imports (id, user_id, platform, status, original_filename, files_total, started_at)
     VALUES (?, ?, ?, 'received', ?, ?, ?)`,
  )
    .bind(importId, userId, platform, originalFilename, files.length, startedAt)
    .run();
  await env.DB.prepare(
    `INSERT INTO import_jobs (id, import_id, user_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, 'running', 1, ?, ?)`,
  )
    .bind(uuid(), importId, userId, startedAt, startedAt)
    .run();
  await audit(env.DB, "IMPORT_STARTED", {
    actorUserId: userId,
    targetType: "import",
    targetId: importId,
    details: { platform, files: files.length },
  });

  try {
    const result = await processFiles(env, config, userId, importId, platform, files);
    const status =
      result.filesSkipped > 0 ? "completed_with_warnings" : "completed";
    await finishImport(env, importId, status, result);
    await audit(env.DB, "IMPORT_COMPLETED", {
      actorUserId: userId,
      targetType: "import",
      targetId: importId,
      details: { assetsCreated: result.assetsCreated, duplicates: result.duplicatesSkipped },
    });
    await notify(
      env,
      userId,
      "import_done",
      "Import complete",
      `${result.assetsCreated.toLocaleString()} items were added to your vault from “${originalFilename}”.`,
      "/vault",
    );
    return { ...result, status };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "The archive could not be processed.";
    await finishImport(env, importId, "failed", {
      importId,
      status: "failed",
      format: null,
      filesTotal: files.length,
      filesParsed: 0,
      filesSkipped: files.length,
      assetsCreated: 0,
      duplicatesSkipped: 0,
      notes: [message],
    });
    await audit(env.DB, "IMPORT_FAILED", {
      actorUserId: userId,
      targetType: "import",
      targetId: importId,
      details: { error: message },
    });
    await notify(
      env,
      userId,
      "import_failed",
      "Import could not be completed",
      "We couldn't import this archive. Your original file has not been modified. Please download a fresh archive and try again.",
      "/import",
    );
    throw err;
  }
}

async function processFiles(
  env: Env,
  config: Config,
  userId: string,
  importId: string,
  platform: string,
  files: ImportRequestFile[],
): Promise<RunImportResult> {
  const notes: string[] = [];

  // 1. Decode text-ish files for detection/parsing.
  const incoming: IncomingFile[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        incoming.push({ path: f.path || f.name, name: f.name, text: new TextDecoder().decode(f.bytes), size: f.bytes.length });
      } catch {
        incoming.push({ path: f.path || f.name, name: f.name, text: "", size: f.bytes.length });
      }
    } else {
      // Binary media file directly in the archive: preserve as an asset.
      incoming.push({ path: f.path || f.name, name: f.name, text: "", size: f.bytes.length });
    }
  }

  const detected = detectFormat(incoming);
  if (!detected) {
    throw badRequest(
      "This archive doesn't match a supported export format. DigitalShield supports Facebook 'Download Your Information' JSON exports. Your original file has not been modified.",
    );
  }
  if (platform !== "unknown" && detected.platform !== "unknown" && detected.platform !== platform) {
    notes.push(`Archive appears to be a ${detected.platform} export but was submitted as ${platform}.`);
  }

  // 2. Parse.
  let drafts: ParsedAssetDraft[] = [];
  let profile = null as ReturnType<typeof parseFacebookArchive>["profile"];
  let filesParsed = 0;
  let filesSkipped = 0;
  const skippedReasons: { path: string; reason: string }[] = [];

  if (detected.formatId === "facebook-json-v1") {
    const parsed = parseFacebookArchive(incoming);
    drafts = parsed.assets;
    profile = parsed.profile;
    filesParsed = parsed.parsedFiles;
    filesSkipped = parsed.skippedFiles;
    skippedReasons.push(...parsed.skippedReasons);
    if (parsed.skippedReasons.length > 0) {
      notes.push(
        `${parsed.skippedReasons.length} file(s) were listed but could not be imported (unsupported or unrecognized structure). Nothing was deleted.`,
      );
    }
  } else if (detected.formatId === "facebook-html-limited") {
    // Limited pass: extract only obvious profile markers; preserve counts.
    const htmlFiles = incoming.filter((f) => /\.html?$/i.test(f.path));
    filesParsed = htmlFiles.length > 0 ? 1 : 0;
    filesSkipped = htmlFiles.length > 1 ? htmlFiles.length - 1 : 0;
    notes.push(
      "HTML exports provide limited structure. For complete preservation, download your Facebook archive in JSON format and re-import.",
    );
    for (const hf of htmlFiles.slice(0, 1)) {
      const titleMatch = hf.text.match(/<title>([^<]{3,120})<\/title>/i);
      if (titleMatch?.[1]) {
        drafts.push({
          kind: "document",
          title: normalizeTitle(titleMatch[1]),
          description: "Facebook HTML export index",
          platform: "facebook",
          sourcePath: hf.path,
          takenAt: null,
          dedupeKey: `htmlindex:${hf.path}`,
        });
      }
    }
  } else {
    throw badRequest(
      "We detected JSON files but they don't match a known Facebook export structure. Your original file has not been modified.",
    );
  }

  // 3. Direct binary media files (photos/videos zipped alongside metadata).
  for (const f of files) {
    const lower = (f.path || f.name).toLowerCase();
    if (!/\.(jpe?g|png|gif|webp|heic|mp4|mov)$/.test(lower)) continue;
    const isVideo = /\.(mp4|mov)$/.test(lower);
    drafts.push({
      kind: isVideo ? "video" : "photo",
      title: normalizeTitle(f.name),
      description: null,
      platform: detected.platform === "unknown" ? platform : detected.platform,
      sourcePath: f.path || f.name,
      takenAt: null,
      dedupeKey: `file:${lower}`,
    });
  }

  // 4. Normalize + dedupe against existing user assets.
  let assetsCreated = 0;
  let duplicatesSkipped = 0;
  const seen = new Set<string>();
  for (const draft of drafts) {
    if (seen.has(draft.dedupeKey)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(draft.dedupeKey);
    const contentHash = await sha256Hex(draft.dedupeKey);
    const dupe = await env.DB.prepare(
      "SELECT 1 FROM digital_assets WHERE user_id = ? AND content_hash = ? LIMIT 1",
    )
      .bind(userId, contentHash)
      .first();
    if (dupe) {
      duplicatesSkipped++;
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO digital_assets
        (id, user_id, platform, kind, title, description, source, import_id, content_hash, taken_at, is_important, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, 0, ?, ?)`,
    )
      .bind(
        uuid(),
        userId,
        draft.platform,
        draft.kind,
        draft.title ? draft.title.slice(0, 300) : null,
        draft.description ? draft.description.slice(0, 4000) : null,
        importId,
        contentHash,
        draft.takenAt || null,
        nowIso(),
        nowIso(),
      )
      .run();
    assetsCreated++;
  }

  // 5. Persist file-level report (never silently discard).
  for (const f of incoming) {
    const skipped = skippedReasons.find((s) => s.path === f.path);
    const isParsed = skipped === undefined;
    await env.DB.prepare(
      `INSERT INTO import_files (id, import_id, path, size_bytes, status, reason) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(uuid(), importId, f.path.slice(0, 500), f.size, isParsed ? "parsed" : "skipped", skipped?.reason ?? null)
      .run();
  }

  // 6. Extract profile into a platform account (best-effort, non-destructive).
  if (profile && (profile.name || profile.username || profile.profileUrl || profile.recoveryEmail)) {
    const existing = await env.DB.prepare(
      "SELECT id FROM platform_accounts WHERE user_id = ? AND platform = ? LIMIT 1",
    )
      .bind(userId, detected.platform === "unknown" ? platform : detected.platform)
      .first();
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO platform_accounts (id, user_id, platform, username, display_name, profile_url, account_id, recovery_email, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
        .bind(
          uuid(),
          userId,
          detected.platform === "unknown" ? platform : detected.platform,
          profile.username ?? null,
          profile.name ?? null,
          profile.profileUrl ?? null,
          profile.accountId ?? null,
          profile.recoveryEmail ?? null,
          nowIso(),
          nowIso(),
        )
        .run();
      notes.push("Profile information from the archive was added to Platforms.");
    }
  }

  return {
    importId,
    status: "completed",
    format: detected.formatId,
    filesTotal: files.length,
    filesParsed,
    filesSkipped,
    assetsCreated,
    duplicatesSkipped,
    notes,
  };
}

async function finishImport(
  env: Env,
  importId: string,
  status: string,
  result: RunImportResult,
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE imports SET status = ?, format = COALESCE(format, ?), files_parsed = ?, files_skipped = ?,
        assets_created = ?, duplicates_skipped = ?, error_summary = ?, finished_at = ? WHERE id = ?`,
    )
    .bind(
      status,
      result.format,
      result.filesParsed,
      result.filesSkipped,
      result.assetsCreated,
      result.duplicatesSkipped,
      status === "failed" ? (result.notes[0] ?? "Import failed.").slice(0, 500) : result.notes.join(" ").slice(0, 500) || null,
      nowIso(),
      importId,
    )
    .run();
  await env.DB
    .prepare("UPDATE import_jobs SET status = ?, updated_at = ? WHERE import_id = ?")
    .bind(status === "failed" ? "failed" : "done", nowIso(), importId)
    .run();
}

export { kindFromFilename };
export { serverError };
