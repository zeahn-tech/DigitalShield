import { Link } from "react-router-dom";
import { ShieldMark } from "../App";

const STEPS = [
  { title: "Create your vault", body: "Set up a secure, private space that belongs only to you." },
  { title: "Import or preserve important information", body: "Import your official platform archive, upload photos, documents and evidence." },
  { title: "Monitor your protection status", body: "An explainable readiness checklist shows exactly what is covered and what is missing." },
  { title: "If an emergency happens, activate Recovery Assistant", body: "Open a recovery case, preserve evidence on a timeline, and follow guided steps." },
  { title: "Follow legitimate platform recovery procedures", body: "DigitalShield points you to official platform resources — it never claims privileged access." },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Does DigitalShield recover or unlock Facebook accounts?",
    a: "No. DigitalShield cannot restore, unlock, or bypass any platform's security. Account recovery is always performed by the platform itself through its official processes. DigitalShield helps you prepare, preserve evidence, and follow those official procedures correctly.",
  },
  {
    q: "Do you need my Facebook password?",
    a: "Never. DigitalShield never asks for your platform passwords, session cookies, or authentication codes. Anyone asking for those claiming they can recover your account is likely running a scam.",
  },
  {
    q: "How does data import work?",
    a: "You download your own official archive from the platform (for example Facebook's “Download Your Information”), then import it into DigitalShield. We parse what we can, tell you exactly what was imported, and list anything unsupported — we never silently discard data.",
  },
  {
    q: "Can you guarantee my account won't be lost?",
    a: "No product can guarantee that. What we can do is make sure that if an emergency happens, you have preserved information, evidence, and documentation ready — which meaningfully improves recovery outcomes.",
  },
  {
    q: "What is the Recovery Scam Shield?",
    a: "Fake “account recovery services” are a major scam. DigitalShield flags common warning signs — requests for passwords, one-time codes, recovery codes, or upfront payment — and points you back to official channels.",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to main content</a>
      <header>
        <Link to="/" className="brand">
          <ShieldMark /> DigitalShield
        </Link>
        <nav className="row" aria-label="Account">
          <Link className="btn ghost sm" to="/login">
            Sign in
          </Link>
          <Link className="btn sm" to="/register">
            Create account
          </Link>
        </nav>
      </header>

      <section className="hero" id="main" style={{ maxWidth: "none" }}>
        <h1>Protect what you've built online.</h1>
        <p className="lede">
          DigitalShield helps you preserve important digital assets, prepare for account emergencies,
          organize recovery evidence, and navigate legitimate account-recovery processes.
        </p>
        <div className="cta-row">
          <Link className="btn primary" to="/register">
            Protect My Digital Assets
          </Link>
          <a className="btn secondary" href="#how-it-works">
            Learn How It Works
          </a>
        </div>
        <div className="trust-strip">
          <span>🔒 Privacy-first — your data belongs to you</span>
          <span>⚠️ Built-in recovery-scam protection</span>
          <span>🧭 Official platform recovery guidance only</span>
        </div>
      </section>

      <section aria-labelledby="problem-h">
        <h2 id="problem-h">Accounts can be hacked, disabled, or suddenly unavailable</h2>
        <p className="muted" style={{ maxWidth: 720 }}>
          Social accounts hold years of family memories, business identity, customer relationships and
          personal history. When access is lost — through hacking, a lost phone number, an accidental
          deletion, or a platform restriction — the damage is immediate and often stressful. Waiting
          until an emergency to prepare means starting with nothing.
        </p>
        <div className="honesty-note mt">
          <strong>What DigitalShield is:</strong> an independent protection, preservation,
          documentation and recovery-assistance tool. <strong>What it is not:</strong> a service that
          restores accounts, bypasses security, or has privileged access to any platform. We will
          never pretend otherwise.
        </div>
      </section>

      <section aria-labelledby="how-h" id="how-it-works" style={{ background: "var(--surface-2)", maxWidth: "none" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 id="how-h">How it works</h2>
          <div className="grid cols-3 mt">
            {STEPS.map((s, i) => (
              <div className="feature" key={s.title}>
                <div className="icon" aria-hidden="true">
                  {["🗄️", "📥", "📊", "🚨", "🧭"][i]}
                </div>
                <h3>
                  {i + 1}. {s.title}
                </h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="security-h">
        <h2 id="security-h">Security & privacy by design</h2>
        <div className="grid cols-3">
          <div className="feature">
            <h3>Encryption</h3>
            <p className="muted small">
              Passwords are stored only as salted, iterated hashes. Sensitive fields are
              envelope-encrypted at rest. All traffic is encrypted in transit.
            </p>
          </div>
          <div className="feature">
            <h3>Data minimization</h3>
            <p className="muted small">
              We collect only what helps you protect and recover. You can export everything we store
              or request deletion at any time.
            </p>
          </div>
          <div className="feature">
            <h3>Least-privilege access</h3>
            <p className="muted small">
              Your vault is accessible only to you. Even administrators cannot browse private vault
              contents, and every sensitive action is audit-logged.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="scam-h" style={{ background: "var(--surface-2)", maxWidth: "none" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 id="scam-h">Recovery Scam Shield</h2>
          <p className="muted" style={{ maxWidth: 720 }}>
            After losing an account, people are targeted by fake “recovery experts.” DigitalShield
            flags common warning signs and reminds you of the one rule that stops almost every scam:
          </p>
          <div className="honesty-note">
            <strong>Never give your password, authentication code, recovery code, session cookie, or
            other security credentials to someone claiming they can recover your account.</strong>
          </div>
          <ul className="muted" style={{ marginTop: 16, lineHeight: 2 }}>
            <li>Someone guarantees recovery or claims inside access</li>
            <li>Someone asks for your password, OTP, or recovery codes</li>
            <li>Someone demands cryptocurrency or upfront payment</li>
            <li>Someone requests remote access to your device</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq-h">
        <h2 id="faq-h">Honest answers</h2>
        <dl className="faq" style={{ maxWidth: 760 }}>
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt">
          <Link className="btn" to="/register">
            Protect My Digital Assets
          </Link>
        </div>
      </section>

      <footer>
        <div className="row between">
          <span>
            <strong>DigitalShield</strong> — Protect your digital identity. Preserve your memories.
            Prepare for account emergencies.
          </span>
          <span>Independent tool. Not affiliated with or endorsed by any social platform.</span>
        </div>
      </footer>
    </div>
  );
}
