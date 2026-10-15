import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { readJson } from "./auth";
import { badRequest, notFound } from "../lib/errors";
import { uuid, nowIso } from "../lib/ids";
import { sha256Hex } from "../lib/crypto";
import { audit } from "../lib/audit";
import { ipHashOf } from "../lib/ratelimit";
import {
  quarantineKey,
  publishedKeyFromQuarantine,
  validateUpload,
  scanBuffer,
  signDownloadUrl,
  assertOwnsKey,
} from "../lib/storage";
import { kindFromFilename, normalizeTitle } from "../import/normalize";
import type { AssetKind } from "../../../shared/types";

export const vaultRoutes = new Hono<AppEnv>();
vaultRoutes.use("*", requireAuth);

const KINDS: AssetKind[] = ["photo", "video", "document", "post", "screenshot", "other"];

// -------------------------------------------------------------- list/search

vaultRoutes.get("/assets", async (c) => {
  const userId = c.get("userId");
  const kind = c.req.query("kind");
  const q = c.req.query("q")?.trim();
  const tag = c.req.query("tag");
  const important = c.req.query("important");
  const sort = c.req.query("sort") ?? "created_desc";
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = 50;

  if (kind && !KINDS.includes(kind as AssetKind)) throw badRequest("Unknown asset kind.");
  const where: string[] = ["a.user_id = ?"];
  const binds: unknown[] = [userId];
  if (kind) {
    where.push("a.kind = ?");
    binds.push(kind);
  }
  if (q) {
    where.push("(a.title LIKE ? OR a.description LIKE ? OR a.original_filename LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (important === "1") where.push("a.is_important = 1");
  if (tag) {
    where.push("EXISTS (SELECT 1 FROM asset_tags t WHERE t.asset_id = a.id AND t.tag = ?)");
    binds.push(tag);
  }
  const orderBy =
    sort === "taken_asc" ? "COALESCE(a.taken_at, a.created_at) ASC"
    : sort === "taken_desc" ? "COALESCE(a.taken_at, a.created_at) DESC"
    : sort === "size_desc" ? "COALESCE(a.size_bytes, 0) DESC"
    : "a.created_at DESC";

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM digital_assets a WHERE ${where.join(" AND ")}`,
  )
    .bind(...binds)
    .first<{ n: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT a.* FROM digital_assets a WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<any>();

  const config = c.get("config");
  const signingKey = config.appOrigin; // pepper for URL signing (per-origin)
  const assets = await Promise.all(
    rows.results.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      description: r.description,
      platform: r.platform,
      source: r.source,
      originalFilename: r.original_filename,
      mime: r.mime,
      sizeBytes: r.size_bytes,
      takenAt: r.taken_at,
      isImportant: r.is_important === 1,
      tags: await tagsFor(c.env.DB, r.id),
      createdAt: r.created_at,
      downloadUrl:
        r.storage_key && r.storage_key.startsWith(`u/${userId}/published/`)
          ? await signDownloadUrl(`${signingKey}:${userId}`, userId, r.storage_key)
          : undefined,
    })),
  );

  return c.json({
    assets,
    total: totalRow?.n ?? 0,
    page,
    pageSize,
  });
});

async function tagsFor(db: D1Database, assetId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT tag FROM asset_tags WHERE asset_id = ? ORDER BY tag").bind(assetId).all<{ tag: string }>();
  return rows.results.map((r) => r.tag);
}

vaultRoutes.get("/summary", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT kind, COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes
     FROM digital_assets WHERE user_id = ? GROUP BY kind`,
  )
    .bind(userId)
    .all<{ kind: string; n: number; bytes: number }>();
  const counts: Record<string, number> = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let total = 0;
  let bytes = 0;
  for (const r of rows.results) {
    counts[r.kind] = r.n;
    total += r.n;
    bytes += r.bytes;
  }
  const important = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM digital_assets WHERE user_id = ? AND is_important = 1",
  )
    .bind(userId)
    .first<{ n: number }>();
  const tags = await c.env.DB.prepare(
    `SELECT t.tag, COUNT(*) AS n FROM asset_tags t JOIN digital_assets a ON a.id = t.asset_id
     WHERE a.user_id = ? GROUP BY t.tag ORDER BY n DESC LIMIT 50`,
  )
    .bind(userId)
    .all<{ tag: string; n: number }>();
  return c.json({ counts, total, bytes, important: important?.n ?? 0, tags: tags.results });
});

// ------------------------------------------------------------------- upload

vaultRoutes.post("/assets/upload", async (c) => {
  const userId = c.get("userId");
  const config = c.get("config");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.");
  if (file.size > config.maxUploadBytes) {
    throw badRequest(
      `File exceeds the ${Math.round(config.maxUploadBytes / 1048576)} MB upload limit. Your original file was not modified.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = await validateUpload(file.name, file.type, bytes);
  const scan = await scanBuffer(file.name, bytes);
  if (!scan.clean) {
    throw badRequest(`Upload rejected: ${scan.reason ?? "file failed validation"} Your original file was not modified.`);
  }

  const qKey = quarantineKey(userId, file.name);
  await c.env.FILES.put(qKey, bytes, { httpMetadata: { contentType: mime } });
  const pKey = publishedKeyFromQuarantine(qKey);
  await c.env.FILES.put(pKey, bytes, { httpMetadata: { contentType: mime } });
  await c.env.FILES.delete(qKey);

  const id = uuid();
  const hash = await sha256Hex(bytes);
  const kind = (form.get("kind") as string) || kindFromFilename(file.name);
  if (!KINDS.includes(kind as AssetKind)) throw badRequest("Unknown asset kind.");
  const title = normalizeTitle((form.get("title") as string) || file.name);
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO digital_assets (id, user_id, kind, title, source, storage_key, original_filename, content_hash, mime, size_bytes, is_important, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'upload', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, kind, title, pKey, file.name, hash, mime, bytes.length, form.get("important") === "1" ? 1 : 0, now, now)
    .run();
  await audit(env2(c), "ASSET_UPLOADED", {
    actorUserId: userId,
    targetType: "asset",
    targetId: id,
    ipHash: await ipHashOf(c),
    details: { filename: file.name, size: bytes.length, kind },
  });
  return c.json({ ok: true, asset: { id, title, kind, sizeBytes: bytes.length } }, 201);
});

function env2(c: any): D1Database {
  return c.env.DB;
}

// ------------------------------------------------------------------ metadata

vaultRoutes.patch("/assets/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await readJson(
    c,
    z.object({
      title: z.string().max(300).optional(),
      description: z.string().max(4000).optional(),
      isImportant: z.boolean().optional(),
      tags: z.array(z.string().min(1).max(40)).max(30).optional(),
    }),
  );
  const asset = await c.env.DB.prepare("SELECT id FROM digital_assets WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first();
  if (!asset) throw notFound("Asset not found.");

  if (body.title !== undefined || body.description !== undefined) {
    await c.env.DB.prepare(
      `UPDATE digital_assets SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ? AND user_id = ?`,
    )
      .bind(body.title ?? null, body.description ?? null, nowIso(), id, userId)
      .run();
  }
  if (body.isImportant !== undefined) {
    await c.env.DB.prepare("UPDATE digital_assets SET is_important = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(body.isImportant ? 1 : 0, nowIso(), id, userId)
      .run();
  }
  if (body.tags) {
    await c.env.DB.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(id).run();
    for (const tag of [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30)) {
      await c.env.DB.prepare("INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)").bind(id, tag).run();
    }
  }
  return c.json({ ok: true });
});

vaultRoutes.delete("/assets/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const asset = await c.env.DB.prepare("SELECT id, storage_key FROM digital_assets WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; storage_key: string | null }>();
  if (!asset) throw notFound("Asset not found.");
  if (asset.storage_key) {
    assertOwnsKey(userId, asset.storage_key);
    await c.env.FILES.delete(asset.storage_key);
  }
  await c.env.DB.prepare("DELETE FROM digital_assets WHERE id = ? AND user_id = ?").bind(id, userId).run();
  await audit(c.env.DB, "ASSET_DELETED", {
    actorUserId: userId,
    targetType: "asset",
    targetId: id,
    ipHash: await ipHashOf(c),
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------- platform accounts

vaultRoutes.get("/platforms", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT id, platform, username, display_name, profile_url, account_id, recovery_email, is_primary, created_at
     FROM platform_accounts WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<any>();
  const { decryptField } = await import("../lib/crypto");
  const master = c.env.ENCRYPTION_MASTER_KEY;
  const accounts = await Promise.all(
    rows.results.map(async (r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username,
      displayName: r.display_name,
      profileUrl: r.profile_url,
      accountId: r.account_id,
      recoveryEmail: r.recovery_email,
      isPrimary: r.is_primary === 1,
      createdAt: r.created_at,
      hasRecoveryPhone: !!(await decryptField(master, r.id, (await phoneRow(c.env.DB, r.id)) ?? "")),
    })),
  );
  return c.json({ accounts });
});

async function phoneRow(db: D1Database, id: string): Promise<string | null> {
  const r = await db.prepare("SELECT recovery_phone_enc FROM platform_accounts WHERE id = ?").bind(id).first<{ recovery_phone_enc: string | null }>();
  return r?.recovery_phone_enc ?? null;
}

vaultRoutes.post("/platforms", async (c) => {
  const userId = c.get("userId");
  const body = await readJson(
    c,
    z.object({
      platform: z.string().min(2).max(40),
      username: z.string().max(120).optional(),
      displayName: z.string().max(200).optional(),
      profileUrl: z.string().max(500).optional(),
      accountId: z.string().max(120).optional(),
      recoveryEmail: z.string().max(254).optional(),
      recoveryPhone: z.string().max(40).optional(),
      isPrimary: z.boolean().optional(),
    }),
  );
  const { encryptField } = await import("../lib/crypto");
  const id = uuid();
  const now = nowIso();
  const phoneEnc = body.recoveryPhone
    ? await encryptField(c.env.ENCRYPTION_MASTER_KEY, id, body.recoveryPhone)
    : null;
  await c.env.DB.prepare(
    `INSERT INTO platform_accounts (id, user_id, platform, username, display_name, profile_url, account_id, recovery_email, recovery_phone_enc, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      body.platform,
      body.username ?? null,
      body.displayName ?? null,
      body.profileUrl ?? null,
      body.accountId ?? null,
      body.recoveryEmail ?? null,
      phoneEnc,
      body.isPrimary ? 1 : 0,
      now,
      now,
    )
    .run();
  return c.json({ ok: true, id }, 201);
});

vaultRoutes.patch("/platforms/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await readJson(
    c,
    z.object({
      username: z.string().max(120).optional(),
      displayName: z.string().max(200).optional(),
      profileUrl: z.string().max(500).optional(),
      accountId: z.string().max(120).optional(),
      recoveryEmail: z.string().max(254).optional(),
      recoveryPhone: z.string().max(40).optional(),
      isPrimary: z.boolean().optional(),
    }),
  );
  const row = await c.env.DB.prepare("SELECT id FROM platform_accounts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first();
  if (!row) throw notFound("Platform account not found.");
  const { encryptField } = await import("../lib/crypto");
  await c.env.DB.prepare(
    `UPDATE platform_accounts SET
       username = COALESCE(?, username), display_name = COALESCE(?, display_name),
       profile_url = COALESCE(?, profile_url), account_id = COALESCE(?, account_id),
       recovery_email = COALESCE(?, recovery_email),
       recovery_phone_enc = COALESCE(?, recovery_phone_enc),
       is_primary = COALESCE(?, is_primary), updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      body.username ?? null,
      body.displayName ?? null,
      body.profileUrl ?? null,
      body.accountId ?? null,
      body.recoveryEmail ?? null,
      body.recoveryPhone
        ? await encryptField(c.env.ENCRYPTION_MASTER_KEY, id, body.recoveryPhone)
        : null,
      body.isPrimary === undefined ? null : body.isPrimary ? 1 : 0,
      nowIso(),
      id,
      userId,
    )
    .run();
  return c.json({ ok: true });
});

vaultRoutes.delete("/platforms/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const res = await c.env.DB.prepare("DELETE FROM platform_accounts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if ((res.meta.changes ?? 0) === 0) throw notFound("Platform account not found.");
  return c.json({ ok: true });
});


