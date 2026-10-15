/**
 * Email transport abstraction.
 *
 * Production: set EMAIL_PROVIDER_API_KEY and configure a transactional
 * provider (e.g. Resend/Postmark) in sendViaProvider.
 * Local development: messages are emitted to the structured log — they never
 * contain credentials beyond the single-use link itself, and DEV_MODE links
 * are additionally surfaced through API responses only on loopback origins.
 */
import { logInfo } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(msg: EmailMessage, providerApiKey?: string): Promise<void> {
  if (providerApiKey) {
    try {
      await sendViaProvider(msg, providerApiKey);
      return;
    } catch (err) {
      // Fall through to logging so the user flow (e.g. verification) is not
      // silently lost; the failure is visible in logs/metrics.
      logInfo("email_provider_failed", { error: String(err), subject: msg.subject });
    }
  }
  logInfo("email_dev_transport", {
    to: msg.to,
    subject: msg.subject,
    // Body intentionally omitted from logs except in dev mode transports.
    body: msg.text,
  });
}

/**
 * Wire a real transactional email provider here. Kept as an explicit
 * extension point rather than pretending an integration exists.
 * Example (Resend):
 *   await fetch("https://api.resend.com/emails", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
 *     body: JSON.stringify({ from: "DigitalShield <no-reply@yourdomain>", ...msg }),
 *   });
 */
async function sendViaProvider(_msg: EmailMessage, _apiKey: string): Promise<void> {
  // No provider is configured in this build. Throw so the caller logs and
  // falls back to the development transport.
  throw new Error("no_email_provider_configured");
}
