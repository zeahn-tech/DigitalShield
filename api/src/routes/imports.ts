import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/context";
import { badRequest } from "../lib/errors";
import { runImport, type ImportRequestFile } from "../import/engine";
import { ipHashOf } from "../lib/ratelimit";

/**
 * Import routes.
 *
 * The SPA extracts a user-selected archive client-side (zip via fflate) and
 * POSTs the individual files as multipart form data — this keeps Workers'
 * request-size limits manageable and lets us report per-file outcomes.
 * The server treats every file defensively: validation, format detection,
 * per-file parse/skip reporting, and never silent data loss.
 */
export const importRoutes = new Hono<AppEnv>();
importRoutes.use("*", requireAuth);

importRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const config = c.get("config");
  const form = await c.req.formData();

  const platform = (form.get("platform") as string) || "facebook";
  const archiveName = (form.get("archiveName") as string) || "archive";
  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0) throw badRequest("No files were included in this import.");
  if (entries.length > config.maxImportFiles) {
    throw badRequest(
      `This archive contains ${entries.length} files; the limit is ${config.maxImportFiles} per import. Split the archive or select a smaller date range.`,
    );
  }

  const files: ImportRequestFile[] = [];
  for (const f of entries) {
    const path = (form.get(`path:${f.name}`) as string) || f.name;
    if (f.size > config.maxUploadBytes) {
      throw badRequest(
        `“${f.name}” exceeds the per-file size limit. Your original file has not been modified.`,
      );
    }
    files.push({
      path,
      name: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
      mime: f.type,
    });
  }

  const result = await runImport(c.env, config, userId, platform, archiveName, files);
  void (await ipHashOf(c));
  return c.json({ import: result }, 201);
});

importRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT id, platform, status, original_filename, format, files_total, files_parsed, files_skipped,
            assets_created, duplicates_skipped, error_summary, started_at, finished_at
     FROM imports WHERE user_id = ? ORDER BY started_at DESC LIMIT 50`,
  )
    .bind(userId)
    .all<any>();
  return c.json({
    imports: rows.results.map((r) => ({
      id: r.id,
      platform: r.platform,
      status: r.status,
      originalFilename: r.original_filename,
      format: r.format,
      filesTotal: r.files_total,
      filesParsed: r.files_parsed,
      filesSkipped: r.files_skipped,
      assetsCreated: r.assets_created,
      duplicatesSkipped: r.duplicates_skipped,
      errorSummary: r.error_summary,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    })),
  });
});

importRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT id, platform, status, original_filename, format, files_total, files_parsed, files_skipped,
            assets_created, duplicates_skipped, error_summary, started_at, finished_at
     FROM imports WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<any>();
  if (!row) throw badRequest("Import not found.");
  const files = await c.env.DB.prepare(
    "SELECT path, status, reason FROM import_files WHERE import_id = ? ORDER BY path LIMIT 1000",
  )
    .bind(id)
    .all<{ path: string; status: string; reason: string | null }>();
  return c.json({
    import: {
      id: row.id,
      platform: row.platform,
      status: row.status,
      originalFilename: row.original_filename,
      format: row.format,
      filesTotal: row.files_total,
      filesParsed: row.files_parsed,
      filesSkipped: row.files_skipped,
      assetsCreated: row.assets_created,
      duplicatesSkipped: row.duplicates_skipped,
      errorSummary: row.error_summary,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      files: files.results,
    },
  });
});
