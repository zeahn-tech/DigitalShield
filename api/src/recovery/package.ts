/**
 * Recovery Package generator.
 *
 * Produces a structured summary of a recovery case as JSON plus a
 * professionally formatted, printable HTML document (print-to-PDF from any
 * browser — no heavyweight PDF library needed on the edge).
 *
 * The package deliberately EXCLUDES authentication credentials, session
 * tokens, cookies, and password/reset material by construction: none of
 * those are ever stored in DigitalShield.
 */
import type { Env } from "../env";
import { uuid, nowIso } from "../lib/ids";
import { hmacSign } from "../lib/crypto";
import { notFound } from "../lib/errors";
import { PLATFORMS } from "../lib/platforms";

export interface PackageData {
  caseNumber: string;
  platform: string;
  problemType: string;
  status: string;
  discoveredAt: string | null;
  lastKnownLoginAt: string | null;
  changedSummary: string | null;
  contextNotes: string | null;
  previousAttempts: number;
  identity: { available: boolean; displayName: string | null; recoveryEmail: string | null };
  evidenceCount: number;
  evidence: { filename: string; sha256: string; source: string; uploadedAt: string }[];
  timeline: { at: string; title: string; body: string | null; kind: string }[];
  resources: { title: string; url: string; purpose: string; lastVerifiedAt: string }[];
  generatedAt: string;
  disclaimer: string;
}

const DISCLAIMER =
  "This package was assembled by DigitalShield from information you provided. DigitalShield is an independent protection and recovery-assistance tool — it is not affiliated with, endorsed by, or connected to any social platform, and it does not restore accounts itself. Submit this material only through the platform's own official recovery channels.";

export async function buildPackageData(env: Env, userId: string, caseId: string): Promise<PackageData> {
  const c = await env.DB.prepare(
    `SELECT id, case_number, platform, problem_type, status, discovered_at, last_known_login_at,
            changed_summary, context_notes, previous_attempts
     FROM recovery_cases WHERE id = ? AND user_id = ?`,
  )
    .bind(caseId, userId)
    .first<{
      case_number: string;
      platform: string;
      problem_type: string;
      status: string;
      discovered_at: string | null;
      last_known_login_at: string | null;
      changed_summary: string | null;
      context_notes: string | null;
      previous_attempts: number;
    }>();
  if (!c) throw notFound("Recovery case not found.");

  const identityRow = await env.DB.prepare(
    `SELECT display_name, recovery_email FROM platform_accounts WHERE user_id = ? AND platform = ? LIMIT 1`,
  )
    .bind(userId, c.platform)
    .first<{ display_name: string | null; recovery_email: string | null }>();

  const evidence = await env.DB.prepare(
    `SELECT original_filename, sha256, source, uploaded_at FROM evidence_items WHERE case_id = ? ORDER BY uploaded_at ASC LIMIT 500`,
  )
    .bind(caseId)
    .all<{ original_filename: string; sha256: string; source: string; uploaded_at: string }>();

  const timeline = await env.DB.prepare(
    `SELECT at, title, body, kind FROM recovery_events WHERE case_id = ? ORDER BY at ASC LIMIT 500`,
  )
    .bind(caseId)
    .all<{ at: string; title: string; body: string | null; kind: string }>();

  const resources = await env.DB.prepare(
    `SELECT title, url, purpose, last_verified_at FROM platform_resources
     WHERE (platform = ? OR platform = 'global') AND status = 'verified'
     ORDER BY platform DESC, title ASC LIMIT 20`,
  )
    .bind(c.platform)
    .all<{ title: string; url: string; purpose: string; last_verified_at: string }>();

  return {
    caseNumber: c.case_number,
    platform: PLATFORMS.find((p) => p.id === c.platform)?.name ?? c.platform,
    problemType: c.problem_type,
    status: c.status,
    discoveredAt: c.discovered_at,
    lastKnownLoginAt: c.last_known_login_at,
    changedSummary: c.changed_summary,
    contextNotes: c.context_notes,
    previousAttempts: c.previous_attempts,
    identity: {
      available: !!identityRow,
      displayName: identityRow?.display_name ?? null,
      recoveryEmail: identityRow?.recovery_email ?? null,
    },
    evidenceCount: evidence.results.length,
    evidence: evidence.results.map((e) => ({
      filename: e.original_filename,
      sha256: e.sha256,
      source: e.source,
      uploadedAt: e.uploaded_at,
    })),
    timeline: timeline.results.map((t) => ({ at: t.at, title: t.title, body: t.body, kind: t.kind })),
    resources: resources.results.map((r) => ({
      title: r.title,
      url: r.url,
      purpose: r.purpose,
      lastVerifiedAt: r.last_verified_at,
    })),
    generatedAt: nowIso(),
    disclaimer: DISCLAIMER,
  };
}

export async function renderPackageHtml(data: PackageData): Promise<string> {
  const esc = (s: unknown): string =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const fmtDate = (iso: string | null): string => (iso ? new Date(iso).toUTCString() : "—");

  const rows = (items: string[][]) =>
    items.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DigitalShield Recovery Package — ${esc(data.caseNumber)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #101828; margin: 0; background: #fff; }
  .wrap { max-width: 800px; margin: 0 auto; padding: 40px 28px 80px; }
  header { border-bottom: 3px solid #14508c; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: #55627a; font-size: 14px; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: #14508c; margin: 28px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: #55627a; font-weight: 600; padding: 6px 12px 6px 0; width: 260px; vertical-align: top; }
  td { padding: 6px 0; }
  li { font-size: 14px; margin-bottom: 6px; }
  .disclaimer { margin-top: 36px; padding: 14px 16px; background: #f2f6fb; border-left: 4px solid #14508c; font-size: 12.5px; color: #38415a; }
  code { font-size: 12px; }
  footer { margin-top: 28px; color: #8a93a6; font-size: 12px; }
  @media print { .wrap { padding: 0; } a { color: inherit; text-decoration: none; } }
</style></head>
<body><div class="wrap">
<header>
  <h1>DigitalShield Recovery Package</h1>
  <div class="sub">Case <strong>${esc(data.caseNumber)}</strong> · Generated ${esc(fmtDate(data.generatedAt))}</div>
</header>

<h2>Case summary</h2>
<table>
${rows([
  ["Case number", esc(data.caseNumber)],
  ["Platform", esc(data.platform)],
  ["Problem", esc(data.problemType.replace(/_/g, " "))],
  ["Case status", esc(data.status.replace(/_/g, " "))],
  ["Incident discovered", esc(fmtDate(data.discoveredAt))],
  ["Last known successful access", esc(fmtDate(data.lastKnownLoginAt))],
  ["Known changes", esc(data.changedSummary || "—")],
  ["Previous recovery attempts", esc(String(data.previousAttempts))],
])}
</table>

<h2>User-provided context</h2>
<table>${rows([["Notes", esc(data.contextNotes || "—")]])}</table>

<h2>User identity information</h2>
<table>
${rows([
  ["Available", data.identity.available ? "Yes" : "No"],
  ["Display name on platform account", esc(data.identity.displayName || "—")],
  ["Recovery email on file", esc(data.identity.recoveryEmail || "—")],
])}
</table>

<h2>Supporting evidence (${data.evidenceCount} file${data.evidenceCount === 1 ? "" : "s"})</h2>
<ul>
${data.evidence.map((e) => `<li>${esc(e.filename)} — ${esc(e.source)}, uploaded ${esc(fmtDate(e.uploadedAt))}, <code>sha256:${esc(e.sha256.slice(0, 24))}…</code></li>`).join("") || "<li>No evidence attached.</li>"}
</ul>

<h2>Timeline</h2>
<ul>
${data.timeline.map((t) => `<li><strong>${esc(fmtDate(t.at))}</strong> — ${esc(t.title)}${t.body ? `: ${esc(t.body)}` : ""}</li>`).join("") || "<li>No timeline entries.</li>"}
</ul>

<h2>Official recovery resources (verified ${esc(data.generatedAt.slice(0, 10))})</h2>
<ul>
${data.resources.map((r) => `<li><a href="${esc(r.url)}">${esc(r.title)}</a> — ${esc(r.purpose)}</li>`).join("") || "<li>No resources recorded.</li>"}
</ul>

<div class="disclaimer"><strong>Please read:</strong> ${esc(data.disclaimer)}</div>
<footer>DigitalShield · Protect → Detect → Preserve → Document → Guide → Recover</footer>
</div></body></html>`;
}

export async function storePackage(
  env: Env,
  userId: string,
  caseId: string,
  data: PackageData,
): Promise<string> {
  const id = uuid();
  const html = await renderPackageHtml(data);
  const storageKey = `${`u/${userId}`}/published/packages/${id}.html`;
  await env.FILES.put(storageKey, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await env.DB.prepare(
    `INSERT INTO recovery_packages (id, case_id, user_id, storage_key, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, caseId, userId, storageKey, nowIso())
    .run();
  void hmacSign; // reserved for future signed package links
  return id;
}
