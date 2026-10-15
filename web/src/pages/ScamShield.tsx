import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { ScamCheckResult, WebSearchResult } from "@shared/types";
import { Alert, Field, Modal, Spinner } from "../components/ui";

interface Rule {
  id: string;
  label: string;
  severity: "high" | "medium";
}

export default function ScamShield() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ScamCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [webQuery, setWebQuery] = useState("");
  const [webSearch, setWebSearch] = useState<WebSearchResult | null>(null);
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ rules: Rule[] }>("/api/security/scam-shield/rules")
      .then((r) => setRules(r.rules))
      .catch(() => setRules([]));
  }, []);

  const analyze = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ result: ScamCheckResult }>("/api/security/scam/analyze", { message });
      setResult(res.result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const searchWeb = async (e: FormEvent) => {
    e.preventDefault();
    setWebBusy(true);
    setWebError(null);
    try {
      const res = await api.post<{ search: WebSearchResult }>("/api/security/scam/web-search", {
        query: webQuery.trim(),
      });
      setWebSearch(res.search);
    } catch (err) {
      setWebSearch(null);
      setWebError(errorMessage(err));
    } finally {
      setWebBusy(false);
    }
  };

  return (
    <>
      <h1>Recovery Scam Shield</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Fake “account recovery services” are one of the most common scams targeting people who just
        lost access to an account. Paste a suspicious message to check it against known warning
        signs.
      </p>

      <div className="honesty-note mb">
        <strong>Never give your password, authentication code, recovery code, session cookie, or other
        security credentials to someone claiming they can recover your account.</strong>
      </div>

      <div className="card">
        <h2>Check a suspicious message</h2>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <form onSubmit={analyze}>
          <Field label="Paste the message" htmlFor="scam-msg" help="Email, SMS or DM text. We analyze it and don't store the text unless you choose to report it.">
            <textarea id="scam-msg" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="row">
            <button className="btn" disabled={busy || message.trim().length < 3}>
              {busy ? "Analyzing…" : "Analyze message"}
            </button>
            {result ? (
              <button type="button" className="btn secondary" onClick={() => setReportOpen(true)}>
                🚩 Report this to DigitalShield
              </button>
            ) : null}
          </div>
        </form>

        {result ? (
          <div className="mt" aria-live="polite">
            <h3>
              {result.riskLevel === "high"
                ? "🔴 Multiple strong warning signs detected"
                : result.riskLevel === "elevated"
                  ? "🟡 Potential warning signs detected"
                  : "🟢 No common warning signs matched"}
            </h3>
            <table className="data">
              <tbody>
                {result.indicators
                  .filter((i) => i.matched)
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className={`badge ${i.severity === "high" ? "danger" : "warn"}`}>
                          {i.severity}
                        </span>
                      </td>
                      <td>{i.label}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {result.indicators.some((i) => i.matched) ? (
              <Alert tone="warn">
                <strong>Potential warning signs detected.</strong> {result.disclaimer}
              </Alert>
            ) : (
              <Alert tone="info">
                No common indicators matched, but that does not guarantee a message is safe. Always
                verify the sender independently and use official platform channels.
              </Alert>
            )}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Search the web for reports</h2>
        <div className="sub">
          Look up the offer, sender or domain on the public web. Results are third-party pages —
          DigitalShield does not verify or endorse them.
        </div>
        {webError ? <Alert tone="error">{webError}</Alert> : null}
        <form onSubmit={searchWeb}>
          <Field
            label="What should we search for?"
            htmlFor="scam-web-query"
            help="For example a domain, an email address, a phone number, or a phrase from the message."
          >
            <input
              id="scam-web-query"
              type="search"
              value={webQuery}
              maxLength={300}
              placeholder="e.g. account recovery service scam"
              onChange={(e) => setWebQuery(e.target.value)}
            />
          </Field>
          <div className="row">
            <button className="btn" disabled={webBusy || webQuery.trim().length < 3}>
              {webBusy ? "Searching…" : "Search the web"}
            </button>
            {message.trim().length >= 3 ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setWebQuery(message.trim().slice(0, 300))}
              >
                Use the message above
              </button>
            ) : null}
          </div>
        </form>

        {webBusy ? (
          <div className="mt">
            <Spinner label="Searching the web…" />
          </div>
        ) : null}

        {!webBusy && webSearch ? (
          <div className="mt" aria-live="polite">
            {webSearch.hits.length === 0 ? (
              <Alert tone="info">
                No public pages matched “{webSearch.query}”. That is not proof the offer is
                legitimate — absence of reports is common for new scams.
              </Alert>
            ) : (
              <>
                <div className="sub">
                  {webSearch.hits.length} result{webSearch.hits.length === 1 ? "" : "s"} for “
                  {webSearch.query}”
                </div>
                <table className="data">
                  <tbody>
                    {webSearch.hits.map((hit) => (
                      <tr key={hit.url}>
                        <td>
                          <a href={hit.url} target="_blank" rel="noreferrer">
                            {hit.title ?? hit.url}
                          </a>
                          <div className="muted small">{hit.url}</div>
                          {hit.author || hit.publishedDate ? (
                            <div className="muted small">
                              {[hit.author, hit.publishedDate].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                          {hit.highlights.map((h, i) => (
                            <p key={`${hit.url}-${i}`} className="muted small" style={{ margin: "6px 0 0" }}>
                              “{h}”
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Alert tone="warn">
                  These are external pages found by a web search. Verify anything you read before
                  acting on it, and never share your password, authentication codes, recovery codes
                  or session cookies with anyone.
                </Alert>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Warning signs we check for</h2>
        <div className="sub">The analyzer never declares a verdict — it reports indicators only.</div>
        <ul style={{ lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          {(rules.length > 0 ? rules : [{ id: "-", label: "Loading…", severity: "medium" as const }]).map((r) => (
            <li key={r.id}>
              {r.label}{" "}
              <span className={`badge ${r.severity === "high" ? "danger" : "neutral"}`}>{r.severity}</span>
            </li>
          ))}
        </ul>
      </div>

      {reportOpen ? (
        <ReportModal
          excerpt={message}
          onClose={() => setReportOpen(false)}
          onDone={() => setReportOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReportModal({ excerpt, onClose, onDone }: { excerpt: string; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState("email");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/security/scam/reports", { channel, messageExcerpt: excerpt, notes: notes || undefined });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Report suspicious recovery offer" onClose={onClose}>
      <p className="muted small">
        Reports help DigitalShield warn others. The message is stored for abuse review.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="How did you receive it?" htmlFor="rep-channel">
        <select id="rep-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="dm">Social media DM</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Anything to add?" htmlFor="rep-notes">
        <textarea id="rep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn danger" onClick={() => void submit()} disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
