/**
 * End-to-end smoke test against a running DigitalShield Worker (wrangler dev).
 *
 * Exercises the real HTTP interface a user would hit: registration, login,
 * dashboard, vault upload, archive import, recovery case + evidence +
 * package, scam analysis, privacy export, authorization (IDOR), CSRF origin
 * checks, and admin endpoints (admin promoted directly in local D1).
 *
 * Exit code 0 = all checks passed.
 */
import { execSync } from "node:child_process";

/**
 * Base URL of the running Worker. SMOKE_BASE wins; otherwise the documented
 * dev port is tried first, then the port the preview/dev harness serves on.
 * A missing server fails with a clear message instead of an uncaught fetch
 * error, so the check output stays machine-readable.
 */
const ENV_BASE = process.env.SMOKE_BASE;
const CANDIDATE_BASES = ENV_BASE
  ? [ENV_BASE]
  : ["http://127.0.0.1:8787", "http://127.0.0.1:3000"];

async function resolveBase() {
  for (const base of CANDIDATE_BASES) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return base;
    } catch {
      // Not listening here — try the next candidate.
    }
  }
  return null;
}

const BASE = await resolveBase();
if (!BASE) {
  console.log(
    `Smoke test: 0 passed, 0 failed — no DigitalShield dev server responded (tried ${CANDIDATE_BASES.join(", ")}).`,
  );
  console.log("Start one with `npm run dev:api`, or set SMOKE_BASE to the URL it serves on.");
  process.exit(1);
}
console.log(`Smoke test target: ${BASE}`);
/**
 * Registration is budgeted per client IP (10/hour, 100/hour when DEV_MODE is
 * active for a loopback APP_ORIGIN). A local dev server reaches the database
 * through one address, so a check pipeline that runs this suite several times
 * an hour exhausts that budget and the suite fails for reasons unrelated to
 * the code under test. Clear the ephemeral fixed-window counters first.
 * The command targets the local dev database only (`--local`), never a
 * deployed environment; if it cannot run, the suite continues and reports it.
 */
function resetRateLimitCounters() {
  try {
    execSync(
      `npx wrangler d1 execute DS_DB --local --config api/wrangler.toml --command "DELETE FROM rate_limits"`,
      { stdio: "pipe", timeout: 60_000 },
    );
    return "cleared (local dev database)";
  } catch (e) {
    return `not cleared: ${String(e.message).slice(0, 100)}`;
  }
}
console.log(`Rate-limit counters: ${resetRateLimitCounters()}`);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function req(path, { method = "GET", body, cookie, headers = {}, form } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/ds_session=([^;]+)/);
  return { status: res.status, json, text, cookie: m ? m[1] : null };
}

function sessionFrom(res) {
  if (!res.cookie) throw new Error("no session cookie in response: " + res.status);
  return `ds_session=${res.cookie}`;
}

const stamp = Date.now().toString(36);
const userA = { email: `ada.${stamp}@example.com`, password: "Corr3ct-Horse-Battery!" };
const userB = { email: `bob.${stamp}@example.com`, password: "An0ther-Str0ng-Pass!" };

console.log("\n— Bootstrap & auth —");
let r = await req("/api/meta/bootstrap", { method: "GET" });
check("resource seeding", r.status === 200 && r.json?.ok === true);

r = await req("/api/auth/register", { method: "POST", body: userA });
check("register user A", r.status === 201, `status=${r.status} ${r.text.slice(0, 160)}`);
if (r.status !== 201) {
  console.log(`\nThe smoke test cannot continue: registration was refused with ${r.status}.`);
  if (r.status === 429) {
    console.log(
      "This address reached its hourly registration budget. Re-run against a fresh local database, or wait for the limiter window to reset.",
    );
  }
  process.exit(1);
}
const t0 = Date.now();
r = await req("/api/auth/login", { method: "POST", body: userA });
const loginMs = Date.now() - t0;
check("login user A", r.status === 200 && !!r.cookie, `status=${r.status} ${r.text.slice(0, 160)}`);
console.log(`    (password hashing took ${loginMs}ms)`);
const A = sessionFrom(r);

r = await req("/api/auth/login", { method: "POST", body: { email: userA.email, password: "WrongPass99!" } });
check("wrong password rejected (generic)", r.status === 401 && r.json?.error?.message.includes("Incorrect email or password"));

r = await req("/api/auth/session", { cookie: A });
check("session endpoint returns user", r.json?.user?.email === userA.email);

r = await req("/api/dashboard", { cookie: A });
check("dashboard for fresh user", r.status === 200 && typeof r.json?.readiness?.score === "number");

r = await req("/api/dashboard");
check("dashboard without auth → 401", r.status === 401);

// CSRF / cross-origin defense
r = await req("/api/auth/login", {
  method: "POST",
  body: userA,
  headers: { Origin: "https://evil.example.com", "Sec-Fetch-Site": "cross-site" },
});
check("foreign Origin POST blocked (CSRF)", r.status === 403, `status=${r.status}`);

console.log("\n— Vault —");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
let form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "pixel.png");
form.append("title", "Family photo");
form.append("important", "1");
r = await req("/api/vault/assets/upload", { method: "POST", form, cookie: A });
check("upload image asset", r.status === 201, `status=${r.status} ${r.text.slice(0, 200)}`);
const assetId = r.json?.asset?.id;

form = new FormData();
form.append("file", new Blob([Buffer.from("#!/bin/sh\necho hacked")], { type: "text/plain" }), "evil.sh");
r = await req("/api/vault/assets/upload", { method: "POST", form, cookie: A });
check("dangerous extension rejected", r.status === 400, `status=${r.status}`);

r = await req("/api/vault/assets?q=Family&important=1", { cookie: A });
check("search + important filter", r.status === 200 && r.json?.assets?.some((a) => a.id === assetId));
check("asset has signed download URL", !!r.json?.assets?.[0]?.downloadUrl);

r = await req(r.json.assets[0].downloadUrl, { cookie: A });
check("signed download works with session", r.status === 200);
const dlUrl = r.status === 200 ? null : null;

// download without cookie → 401 (requireAuth)
const signedPath = (await req("/api/vault/assets?q=Family", { cookie: A })).json.assets[0].downloadUrl;
r = await req(signedPath);
check("signed download without session → 401", r.status === 401);

r = await req("/api/vault/summary", { cookie: A });
check("vault summary counts", r.json?.total >= 1 && r.json?.important >= 1);

form = new FormData();
form.append("platform", "facebook");
form.append("profileUrl", "https://facebook.com/adalovelace");
form.append("recoveryEmail", "ada-recovery@example.com");
r = await req("/api/vault/platforms", { method: "POST", form: undefined, body: { platform: "facebook", profileUrl: "https://facebook.com/adalovelace", recoveryEmail: "ada-recovery@example.com" }, cookie: A });
check("platform account created", r.status === 201, `status=${r.status}`);

console.log("\n— Import engine —");
const fbPosts = [
  { title: "Hello world", timestamp: 1712345678, data: [{ post: { text: "First post from the archive" } }] },
  { title: "Trip photos", timestamp: 1612345678, data: [{ post: { text: "Vacation 2021" } }] },
];
const fbProfile = [
  { name: "Name", value: "Ada Lovelace" },
  { name: "Profile URI", value: "https://facebook.com/adalovelace" },
];
const manifest = JSON.stringify({ some: "manifest" });
form = new FormData();
form.append("platform", "facebook");
form.append("archiveName", `${stamp}-facebook.zip`);
form.append("files", new Blob([JSON.stringify(fbPosts)]), "your_facebook_activity/posts/posts_v2.json");
form.append("path:your_facebook_activity/posts/posts_v2.json", "your_facebook_activity/posts/posts_v2.json");
form.append("files", new Blob([JSON.stringify(fbProfile)]), "personal_information/personal_information.json");
form.append("path:personal_information/personal_information.json", "personal_information/personal_information.json");
form.append("files", new Blob([manifest]), "manage_your_information/manifest.json");
form.append("path:manage_your_information/manifest.json", "manage_your_information/manifest.json");
r = await req("/api/imports", { method: "POST", form, cookie: A });
check("import accepted", r.status === 201, `status=${r.status} ${r.text.slice(0, 300)}`);
const imp = r.json?.import;
check("import created assets (posts; profile merges into platforms)", imp?.assetsCreated >= 2, JSON.stringify(imp));
check("unrecognized files reported, not dropped", (imp?.filesSkipped ?? -1) >= 1);

r = await req("/api/imports", { cookie: A });
check("import history lists import", r.json?.imports?.length >= 1);

r = await req("/api/vault/assets?kind=post", { cookie: A });
check("imported posts appear in vault", r.json?.total >= 2, `total=${r.json?.total}`);

r = await req("/api/dashboard", { cookie: A });
check("readiness improved after import", r.json?.readiness?.score > 0, `score=${r.json?.readiness?.score}`);

console.log("\n— Recovery —");
r = await req("/api/recovery/cases", {
  method: "POST",
  cookie: A,
  body: {
    platform: "facebook",
    problemType: "hacked",
    discoveredAt: "2026-09-16T00:00:00.000Z",
    lastKnownLoginAt: "2026-09-15T00:00:00.000Z",
    changedSummary: "Recovery email changed",
    contextNotes: "Noticed login failure after phishing email.",
    previousAttempts: 2,
  },
});
check("recovery case created", r.status === 201, `status=${r.status} ${r.text.slice(0, 200)}`);
const caseId = r.json?.case?.id;
check("case number format DS-FB-YYYY-NNNNNN", /^DS-FB-20\d\d-\d{6}$/.test(r.json?.case?.caseNumber ?? ""), r.json?.case?.caseNumber);

r = await req(`/api/recovery/cases/${caseId}/events`, {
  method: "POST",
  cookie: A,
  body: { kind: "attempt", title: "Tried official recovery flow", body: "Submitted ID via official page." },
});
check("timeline event added", r.status === 201);

form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "screenshot-error.png");
form.append("source", "screenshot");
form.append("description", "Login error screenshot");
r = await req(`/api/recovery/cases/${caseId}/evidence`, { method: "POST", form, cookie: A });
check("evidence uploaded with sha256", r.status === 201 && /^[0-9a-f]{64}$/.test(r.json?.sha256 ?? ""), r.text.slice(0, 200));

r = await req(`/api/recovery/cases/${caseId}/package`, { method: "POST", cookie: A });
check("recovery package generated", r.status === 201, `status=${r.status}`);
const pkgId = r.json?.packageId;
r = await req(`/api/recovery/packages/${pkgId}`, { cookie: A });
check("package preview renders HTML", r.status === 200 && r.text.includes("DigitalShield Recovery Package"));
check("package excludes credential fields", !r.text.toLowerCase().includes("password_hash") && !r.text.includes("session token"));

r = await req(`/api/recovery/resources?platform=facebook`, { cookie: A });
check("official resources seeded", r.json?.resources?.length >= 5);

r = await req("/api/recovery/cases", { cookie: A });
check("case list includes evidence count", r.json?.cases?.[0]?.evidenceCount >= 1);

console.log("\n— Security & scam shield —");
r = await req("/api/security/scam/analyze", {
  method: "POST",
  cookie: A,
  body: { message: "I'm from Facebook support, we guarantee recovery — send me your OTP code and 0.1 BTC." },
});
check("scam analysis flags indicators", r.status === 200 && r.json?.result?.riskLevel === "high", JSON.stringify(r.json?.result?.riskLevel));
check("scam result includes non-verdict disclaimer", /not a verdict/i.test(r.json?.result?.disclaimer ?? ""));

r = await req("/api/security/scam/reports", {
  method: "POST",
  cookie: A,
  body: { channel: "email", messageExcerpt: "Send password please", notes: "Suspicious DM" },
});
check("scam report stored", r.status === 201);

r = await req("/api/auth/sessions", { cookie: A });
check("sessions listed with current flag", r.json?.sessions?.some((s) => s.current));

r = await req("/api/auth/sessions/revoke-others", { method: "POST", cookie: A });
check("revoke other sessions", r.status === 200);

console.log("\n— Privacy —");
r = await req("/api/privacy/summary", { cookie: A });
check("privacy summary", r.status === 200 && r.json?.stored?.assets >= 1);
r = await req("/api/privacy/export", { cookie: A });
check("data export includes user + cases", r.status === 200 && r.json?.user?.email === userA.email && (r.json?.recoveryCases?.length ?? 0) >= 1);
check("export does not leak password hash", r.json?.user?.password_hash === undefined);
r = await req("/api/privacy/deletion-request", { method: "POST", cookie: A });
check("deletion request created", r.status === 201);

console.log("\n— Authorization (IDOR) —");
r = await req("/api/auth/register", { method: "POST", body: userB });
check("register user B", r.status === 201, `status=${r.status} ${r.text.slice(0, 160)}`);
if (r.status !== 201) {
  console.log(`\nThe smoke test cannot continue: registration was refused with ${r.status}.`);
  process.exit(1);
}
r = await req("/api/auth/login", { method: "POST", body: userB });
const B = sessionFrom(r);

r = await req(`/api/recovery/cases/${caseId}`, { cookie: B });
check("user B cannot read user A case", r.status === 404, `status=${r.status}`);
r = await req(`/api/recovery/cases/${caseId}/evidence`, { method: "POST", cookie: B, form: (() => { const f = new FormData(); f.append("file", new Blob([png]), "x.png"); return f; })() });
check("user B cannot add evidence to A's case", r.status === 404, `status=${r.status}`);
r = await req("/api/vault/assets", { cookie: B });
check("user B sees empty vault (no leakage)", r.json?.total === 0);
r = await req(`/api/recovery/packages/${pkgId}`, { cookie: B });
check("user B cannot fetch A's package", r.status === 404, `status=${r.status}`);

// path traversal in signed URL
r = await req("/api/files?key=u/" + (await req("/api/auth/session", { cookie: A })).json.user.id + "/published/../../etc&exp=9999999999&sig=x", { cookie: A });
check("path traversal blocked", r.status === 403 || r.status === 400, `status=${r.status}`);
r = await req("/api/files?key=u/someoneelse/published/a.png&exp=9999999999&sig=x", { cookie: A });
check("foreign key prefix blocked", r.status === 403, `status=${r.status}`);

console.log("\n— Admin (promoted in local D1) —");
try {
  execSync(
    `npx wrangler d1 execute DS_DB --local --config api/wrangler.toml --command "UPDATE users SET role='admin' WHERE email='${userB.email}'"`,
    { stdio: "pipe" },
  );
} catch (e) {
  console.log("    (admin promotion failed: " + e.message.slice(0, 200) + ")");
}
// new session needed? role is read per-request from DB in loadSession → same cookie works
r = await req("/api/admin/overview", { cookie: B });
check("admin overview accessible after promotion", r.status === 200 && typeof r.json?.users?.total === "number", `status=${r.status}`);
r = await req("/api/admin/resources", { cookie: B });
check("admin resource list", r.status === 200 && r.json?.resources?.length >= 5);
r = await req("/api/admin/audit-logs", { cookie: B });
check("admin audit log", r.status === 200 && r.json?.logs?.length >= 5 && !JSON.stringify(r.json.logs).includes("password"));
r = await req("/api/admin/overview", { cookie: A });
check("non-admin blocked from admin API", r.status === 403, `status=${r.status}`);

// admin must not see vault contents
r = await req("/api/admin/users", { cookie: B });
const hasPrivateContent = JSON.stringify(r.json ?? {}).includes("Family photo");
check("admin user list contains no vault contents", !hasPrivateContent);

console.log("\n— Security headers & SPA —");
const raw = await fetch(BASE + "/api/health");
check("security headers present", raw.headers.get("x-content-type-options") === "nosniff" && !!raw.headers.get("content-security-policy"));
check("API responses no-store", (raw.headers.get("cache-control") ?? "").includes("no-store"));
const spa = await fetch(BASE + "/dashboard");
check("SPA fallback serves index.html", spa.status === 200 && (await spa.text()).includes("<div id=\"root\">"));
const asset = await fetch(BASE + "/");
const html = await asset.text();
const jsMatch = html.match(/assets\/index-[^"]+\.js/);
check("SPA bundle referenced", !!jsMatch);
if (jsMatch) {
  const js = await fetch(BASE + "/" + jsMatch[0]);
  check("SPA bundle loads", js.status === 200 && js.headers.get("content-type")?.includes("javascript"));
}

console.log(`\n==============================`);
console.log(`Smoke test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
process.exit(0);
