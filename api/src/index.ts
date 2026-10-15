/**
 * DigitalShield Worker entrypoint.
 *
 * Request flow: security headers → config → session load → API routes →
 * static SPA assets (single-page fallback). Non-/api paths delegate to the
 * ASSETS binding so the SPA handles its own client-side routing.
 */
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";
import { securityHeaders } from "./middleware/security";
import { withConfig, loadSession } from "./middleware/context";
import { ApiError } from "./lib/errors";
import { logError } from "./lib/logger";
import { authRoutes } from "./routes/auth";
import { vaultRoutes } from "./routes/vault";
import { importRoutes } from "./routes/imports";
import { recoveryRoutes } from "./routes/recovery";
import { securityRoutes } from "./routes/security";
import { privacyRoutes } from "./routes/privacy";
import { adminRoutes } from "./routes/admin";
import { miscRoutes } from "./routes/misc";
import { fileRoutes } from "./routes/files";
import { seedResources } from "./resources/seed";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", withConfig);
app.use("/api/*", loadSession);

app.route("/api/auth", authRoutes);
app.route("/api/vault", vaultRoutes);
app.route("/api/imports", importRoutes);
app.route("/api/recovery", recoveryRoutes);
app.route("/api/security", securityRoutes);
app.route("/api/privacy", privacyRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/files", fileRoutes);
app.route("/api", miscRoutes);

// Idempotent resource seeding (no-op once rows exist).
app.get("/api/meta/bootstrap", async (c) => {
  const seeded = await seedResources(c.env.DB);
  return c.json({ ok: true, seeded });
});

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: { code: "not_found", message: "Endpoint not found." } }, 404);
  }
  // SPA fallback via assets binding.
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    );
  }
  // D1 uniqueness/conflict surfaces as a 500 from the runtime; map known cases.
  const msg = String(err?.message ?? "");
  if (msg.includes("UNIQUE constraint failed")) {
    return c.json(
      { error: { code: "conflict", message: "That item already exists." } },
      409,
    );
  }
  logError("unhandled_error", { message: msg, stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined });
  return c.json(
    { error: { code: "server_error", message: "Something went wrong on our side. Please try again." } },
    500,
  );
});

export default app;
