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
import { allocateCaseNumber } from "../lib/caseNumber";
import { quarantineKey, publishedKeyFromQuarantine, validateUpload, scanBuffer, signDownloadUrl, assertOwnsKey } from "../lib/storage";
import { buildPackageData, storePackage } from "../recovery/package";
import { PLATFORMS } from "../lib/platforms";
import { notify } from "../auth/service";
import { CASE_STATUSES, PROBLEM_TYPES } from "../../../shared/types";

export const recoveryRoutes = new Hono<AppEnv>();
recoveryRoutes.use("*", requireAuth);

// ------------------------------------------------------------------- cases

recoveryRoutes.post("/cases", async (c) => {
  const userId = c.get("userId");
  const body = await readJson(
    c,
    z.object({
      platform: z.string().min(2).max(40),
      problemType: z.enum(PROBLEM_TYPES),
      discoveredAt: z.string().max(40).optional(),
      lastKnownLoginAt: z.string().max(40).optional(),
      changedSummary: z.string().max(2000).optional(),
      contextNotes: z.string().max(8000).optional(),
      previousAttempts: z.number().int().min(0).max(999).optional(),
    }),
  );
  const caseNumber = await allocateCaseNumber(c.env.DB, body.platform);
  const id = uuid();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO recovery_cases (id, user_id, case_number, platform, problem_type, status, discovered_at,
       last_known_login_at, changed_summary, context_notes, previous_attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      caseNumber,
      body.platform,
      body.problemType,
      body.discoveredAt || null,
      body.lastKnownLoginAt || null,
      body.changedSummary || null,
      body.contextNotes || null,
      body.previousAttempts ?? 0,
      now,
      now,
    )
    .run();
  await c.env.DB.prepare(
    `INSERT INTO recovery_events (id, case_id, at, kind, actor, title, body) VALUES (?, ?, ?, 'note', 'user', ?, ?)`,
  )
    .bind(uuid(), id, now, "Recovery case created", body.contextNotes?.slice(0, 1000) ?? null)
    .run();
  await audit(c.env.DB, "RECOVERY_CASE_CREATED", {
    actorUserId: userId,
    targetType: "recovery_case",
    targetId: id,
    details: { caseNumber, platform: body.platform, problemType: body.problemType },
    ipHash: await ipHashOf(c),
  });
  return c.json({ ok: true, case: { id, caseNumber } }, 201);
});

recoveryRoutes.get("/cases", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM evidence_items e WHERE e.case_id = c.id) AS evidence_count,
            (SELECT COUNT(*) FROM recovery_events t WHERE t.case_id = c.id) AS event_count
     FROM recovery_cases c WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`,
  )
    .bind(userId)
    .all<any>();
  return c.json({
    cases: rows.results.map((r) => ({
      id: r.id,
      caseNumber: r.case_number,
      platform: r.platform,
      problemType: r.problem_type,
      status: r.status,
      discoveredAt: r.discovered_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      evidenceCount: r.evidence_count,
      eventCount: r.event_count,
    })),
  });
});

recoveryRoutes.get("/cases/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    `SELECT * FROM recovery_cases WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<any>();
  if (!r) throw notFound("Recovery case not found.");

  const events = await c.env.DB.prepare(
    "SELECT id, at, kind, actor, title, body FROM recovery_events WHERE case_id = ? ORDER BY at ASC LIMIT 500",
  )
    .bind(id)
    .all<any>();
  const evidence = await c.env.DB.prepare(
    "SELECT * FROM evidence_items WHERE case_id = ? ORDER BY uploaded_at ASC LIMIT 500",
  )
    .bind(id)
    .all<any>();
  const packages = await c.env.DB.prepare(
    "SELECT id, created_at FROM recovery_packages WHERE case_id = ? ORDER BY created_at DESC LIMIT 20",
  )
    .bind(id)
    .all<{ id: string; created_at: string }>();
  const config = c.get("config");

  return c.json({
    case: {
      id: r.id,
      caseNumber: r.case_number,
      platform: r.platform,
      problemType: r.problem_type,
      status: r.status,
      discoveredAt: r.discovered_at,
      lastKnownLoginAt: r.last_known_login_at,
      changedSummary: r.changed_summary,
      contextNotes: r.context_notes,
      previousAttempts: r.previous_attempts,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      events: events.results.map((e: any) => ({
        id: e.id,
        at: e.at,
        kind: e.kind,
        actor: e.actor,
        title: e.title,
        body: e.body,
      })),
      evidence: await Promise.all(
        evidence.results.map(async (e: any) => ({
          id: e.id,
          originalFilename: e.original_filename,
          sha256: e.sha256,
          mime: e.mime,
          sizeBytes: e.size_bytes,
          source: e.source,
          category: e.category,
          description: e.description,
          uploadedAt: e.uploaded_at,
          downloadUrl: await signDownloadUrl(
            `${config.appOrigin}:${userId}`,
            userId,
            e.storage_key,
          ),
        })),
      ),
      packages: packages.results.map((p) => ({ id: p.id, createdAt: p.created_at })),
    },
  });
});

recoveryRoutes.patch("/cases/:id/status", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await readJson(c, z.object({ status: z.enum(CASE_STATUSES as [string, ...string[]]) }));
  const row = await c.env.DB.prepare("SELECT id, status, case_number FROM recovery_cases WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; status: string; case_number: string }>();
  if (!row) throw notFound("Recovery case not found.");
  await c.env.DB.prepare("UPDATE recovery_cases SET status = ?, updated_at = ? WHERE id = ?")
    .bind(body.status, nowIso(), id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO recovery_events (id, case_id, at, kind, actor, title, body) VALUES (?, ?, ?, 'status_change', 'user', ?, ?)`,
  )
    .bind(uuid(), id, nowIso(), `Status changed to ${body.status.replace(/_/g, " ")}`, null)
    .run();
  await audit(c.env.DB, "RECOVERY_CASE_STATUS_CHANGED", {
    actorUserId: userId,
    targetType: "recovery_case",
    targetId: id,
    details: { from: row.status, to: body.status },
  });
  return c.json({ ok: true });
});

recoveryRoutes.post("/cases/:id/events", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await readJson(
    c,
    z.object({
      kind: z.enum(["note", "attempt", "platform_contact", "resource_used"]).default("note"),
      title: z.string().min(1).max(200),
      body: z.string().max(4000).optional(),
    }),
  );
  const row = await c.env.DB.prepare("SELECT id FROM recovery_cases WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first();
  if (!row) throw notFound("Recovery case not found.");
  const eventId = uuid();
  await c.env.DB.prepare(
    `INSERT INTO recovery_events (id, case_id, at, kind, actor, title, body) VALUES (?, ?, ?, ?, 'user', ?, ?)`,
  )
    .bind(eventId, id, nowIso(), body.kind, body.title, body.body ?? null)
    .run();
  await c.env.DB.prepare("UPDATE recovery_cases SET updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  return c.json({ ok: true, id: eventId }, 201);
});

// ---------------------------------------------------------------- evidence

recoveryRoutes.post("/cases/:id/evidence", async (c) => {
  const userId = c.get("userId");
  const config = c.get("config");
  const caseId = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT id FROM recovery_cases WHERE id = ? AND user_id = ?")
    .bind(caseId, userId)
    .first();
  if (!row) throw notFound("Recovery case not found.");

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No evidence file was uploaded.");
  if (file.size > config.maxUploadBytes) {
    throw badRequest(`Evidence exceeds the ${Math.round(config.maxUploadBytes / 1048576)} MB limit.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = await validateUpload(file.name, file.type, bytes);
  const scan = await scanBuffer(file.name, bytes);
  if (!scan.clean) throw badRequest(`Upload rejected: ${scan.reason ?? "file failed validation"}`);

  const qKey = quarantineKey(userId, file.name);
  await c.env.FILES.put(qKey, bytes, { httpMetadata: { contentType: mime } });
  const pKey = publishedKeyFromQuarantine(qKey);
  await c.env.FILES.put(pKey, bytes, { httpMetadata: { contentType: mime } });
  await c.env.FILES.delete(qKey);

  const id = uuid();
  const hash = await sha256Hex(bytes);
  const source = (form.get("source") as string) || "other";
  const description = ((form.get("description") as string) || "").slice(0, 2000) || null;
  await c.env.DB.prepare(
    `INSERT INTO evidence_items (id, case_id, user_id, storage_key, original_filename, sha256, mime, size_bytes, source, category, description, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, caseId, userId, pKey, file.name, hash, mime, bytes.length, source, (form.get("category") as string) || null, description, nowIso())
    .run();
  await c.env.DB.prepare(
    `INSERT INTO recovery_events (id, case_id, at, kind, actor, title, body) VALUES (?, ?, ?, 'evidence_added', 'user', ?, ?)`,
  )
    .bind(uuid(), caseId, nowIso(), `Evidence added: ${file.name}`, description)
    .run();
  await c.env.DB.prepare("UPDATE recovery_cases SET updated_at = ? WHERE id = ?").bind(nowIso(), caseId).run();
  await audit(c.env.DB, "EVIDENCE_ADDED", {
    actorUserId: userId,
    targetType: "recovery_case",
    targetId: caseId,
    details: { filename: file.name, sha256: hash },
  });
  assertOwnsKey(userId, pKey);
  return c.json({ ok: true, id, sha256: hash }, 201);
});

// --------------------------------------------------------------- resources

recoveryRoutes.get("/resources", async (c) => {
  const platform = c.req.query("platform");
  const rows = platform
    ? await c.env.DB.prepare(
        `SELECT id, platform, title, url, purpose, region, status, last_verified_at, notes
         FROM platform_resources WHERE (platform = ? OR platform = 'global') AND status != 'retired'
         ORDER BY platform DESC, title ASC LIMIT 100`,
      )
        .bind(platform)
        .all<any>()
    : await c.env.DB.prepare(
        `SELECT id, platform, title, url, purpose, region, status, last_verified_at, notes
         FROM platform_resources WHERE status != 'retired' ORDER BY platform, title LIMIT 200`,
      ).all<any>();
  return c.json({
    resources: rows.results.map((r) => ({
      id: r.id,
      platform: r.platform,
      title: r.title,
      url: r.url,
      purpose: r.purpose,
      region: r.region,
      status: r.status,
      lastVerifiedAt: r.last_verified_at,
      notes: r.notes,
    })),
    platforms: PLATFORMS,
  });
});

// --------------------------------------------------------------- packages

recoveryRoutes.post("/cases/:id/package", async (c) => {
  const userId = c.get("userId");
  const caseId = c.req.param("id");
  const data = await buildPackageData(c.env, userId, caseId);
  const packageId = await storePackage(c.env, userId, caseId, data);
  await c.env.DB.prepare(
    `INSERT INTO recovery_events (id, case_id, at, kind, actor, title, body) VALUES (?, ?, ?, 'note', 'system', 'Recovery package generated', ?)`,
  )
    .bind(uuid(), caseId, nowIso(), `Package ${packageId} created`)
    .run();
  await audit(c.env.DB, "RECOVERY_PACKAGE_GENERATED", {
    actorUserId: userId,
    targetType: "recovery_case",
    targetId: caseId,
    details: { packageId },
  });
  return c.json({ ok: true, packageId }, 201);
});

recoveryRoutes.get("/packages/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const pkg = await c.env.DB.prepare(
    "SELECT id, case_id, storage_key, created_at FROM recovery_packages WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first<{ id: string; case_id: string; storage_key: string; created_at: string }>();
  if (!pkg) throw notFound("Recovery package not found.");
  const obj = await c.env.FILES.get(pkg.storage_key);
  if (!obj) throw notFound("Package file is no longer available.");
  const html = await obj.text();
  const download = c.req.query("download");
  if (download === "1") {
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="digitalshield-recovery-package-${id}.html"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }
  // Preview mode serves the document with a strict sandbox (no script origin).
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:;",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

recoveryRoutes.get("/packages/:id/data", async (c) => {
  const userId = c.get("userId");
  const pkgId = c.req.param("id");
  const pkg = await c.env.DB.prepare(
    "SELECT case_id FROM recovery_packages WHERE id = ? AND user_id = ?",
  )
    .bind(pkgId, userId)
    .first<{ case_id: string }>();
  if (!pkg) throw notFound("Recovery package not found.");
  const data = await buildPackageData(c.env, userId, pkg.case_id);
  return c.json({ data });
});

export { notify };
