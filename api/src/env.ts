/**
 * Worker environment bindings and typed runtime configuration.
 */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;

  APP_ORIGIN: string;
  REQUIRE_EMAIL_VERIFICATION: string;
  DEV_MODE: string;
  SESSION_TTL_SECONDS: string;
  MAX_UPLOAD_BYTES: string;
  MAX_IMPORT_FILES: string;
  PBKDF2_ITERATIONS?: string;
  ENCRYPTION_MASTER_KEY?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  /** Exa API key. Server-side only — never exposed to the SPA. */
  EXA_API_KEY?: string;
}

export interface Config {
  appOrigin: string;
  requireEmailVerification: boolean;
  /** Local-development escape hatch. Refused unless appOrigin is localhost. */
  devMode: boolean;
  sessionTtlSeconds: number;
  maxUploadBytes: number;
  maxImportFiles: number;
  pbkdf2Iterations: number;
  hasEncryptionKey: boolean;
}

const TRUTHY = new Set(["1", "true", "yes"]);

export function loadConfig(env: Env): Config {
  const appOrigin = (env.APP_ORIGIN || "http://localhost:8787").replace(/\/+$/, "");
  const isLocalHost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(appOrigin);
  // DEV_MODE may only take effect on loopback origins. This structurally
  // prevents development escape hatches from ever being enabled in production.
  const devMode = TRUTHY.has((env.DEV_MODE || "").toLowerCase()) && isLocalHost;
  return {
    appOrigin,
    requireEmailVerification: TRUTHY.has((env.REQUIRE_EMAIL_VERIFICATION || "").toLowerCase()),
    devMode,
    sessionTtlSeconds: int(env.SESSION_TTL_SECONDS, 14 * 24 * 3600),
    maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 25 * 1024 * 1024),
    maxImportFiles: int(env.MAX_IMPORT_FILES, 200),
    pbkdf2Iterations: int(env.PBKDF2_ITERATIONS, 600_000),
    hasEncryptionKey: typeof env.ENCRYPTION_MASTER_KEY === "string" && env.ENCRYPTION_MASTER_KEY.length > 0,
  };
}

function int(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type AppVariables = {
  userId: string;
  userRole: "user" | "admin";
  userEmail: string;
  emailVerified: boolean;
  config: Config;
};
export type AppEnv = { Bindings: Env; Variables: AppVariables };
