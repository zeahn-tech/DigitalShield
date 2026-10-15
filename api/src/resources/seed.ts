/**
 * Seed rows for the official Recovery Resources directory.
 *
 * These are official platform URLs as of the seed date and are intended to be
 * maintained by an administrator through the app (last_verified_at +
 * status are tracked per resource). The architecture deliberately avoids
 * hard-coding recovery URLs in UI code so links can be updated without a
 * deployment — see the admin resource management endpoints.
 *
 * Seed date: 2026-00-00 (re-verify on first admin login).
 */
import { uuid, nowIso } from "../lib/ids";

interface SeedResource {
  platform: string;
  title: string;
  url: string;
  purpose: string;
  notes?: string;
}

const RESOURCES: SeedResource[] = [
  {
    platform: "facebook",
    title: "Facebook — Find your account / login help",
    url: "https://www.facebook.com/login/identify",
    purpose: "Official account recovery entry point when you can't log in.",
  },
  {
    platform: "facebook",
    title: "Facebook — Hacked accounts",
    url: "https://www.facebook.com/hacked",
    purpose: "Official flow to report a compromised account and secure it.",
  },
  {
    platform: "facebook",
    title: "Facebook — My account is disabled",
    url: "https://www.facebook.com/help/contact/379982657936166",
    purpose: "Official review request for disabled accounts.",
    notes: "Meta may require identity verification; outcomes are decided by Meta.",
  },
  {
    platform: "facebook",
    title: "Facebook — Download your information",
    url: "https://www.facebook.com/settings?tab=your_facebook_information",
    purpose: "Request the official archive you can import into DigitalShield.",
  },
  {
    platform: "facebook",
    title: "Facebook — Security and login settings",
    url: "https://www.facebook.com/settings?tab=security_and_login",
    purpose: "Review login sessions, trusted contacts, and recovery methods.",
  },
  {
    platform: "facebook",
    title: "Meta — Privacy Policy",
    url: "https://www.facebook.com/privacy/policy/",
    purpose: "Official Meta privacy policy.",
  },
  {
    platform: "facebook",
    title: "Meta — Terms of Service",
    url: "https://www.facebook.com/terms",
    purpose: "Official Meta terms governing account use and appeals.",
  },
  {
    platform: "instagram",
    title: "Instagram — Help with account access",
    url: "https://help.instagram.com/1348405002885005",
    purpose: "Official Instagram account access help.",
  },
  {
    platform: "global",
    title: "FTC — Recover from a hacked Account",
    url: "https://www.consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams",
    purpose: "Government guidance on recognizing and avoiding phishing/scam recovery offers.",
  },
  {
    platform: "global",
    title: "DigitalShield — Recovery Scam warnings",
    url: "https://www.ftc.gov/business-guidance/resources/ftcs-top-frauds",
    purpose: "General fraud awareness reference maintained by the FTC.",
  },
];

export async function seedResources(db: D1Database): Promise<number> {
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM platform_resources").first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return 0;
  const now = nowIso();
  let inserted = 0;
  for (const r of RESOURCES) {
    await db
      .prepare(
        `INSERT INTO platform_resources (id, platform, title, url, purpose, region, status, last_verified_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'global', 'verified', ?, ?, ?, ?)`,
      )
      .bind(uuid(), r.platform, r.title, r.url, r.purpose, now, r.notes ?? null, now, now)
      .run();
    inserted++;
  }
  return inserted;
}
