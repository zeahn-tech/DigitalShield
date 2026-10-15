import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { PROBLEM_TYPES, PROBLEM_TYPE_LABELS } from "../lib/labels";
import { Alert, Field } from "../components/ui";

const STEPS = ["What happened", "When & what changed", "Review & create"];

export default function Emergency() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [problemType, setProblemType] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [discoveredAt, setDiscoveredAt] = useState("");
  const [lastKnownLoginAt, setLastKnownLoginAt] = useState("");
  const [changedSummary, setChangedSummary] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [previousAttempts, setPreviousAttempts] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ case: { id: string; caseNumber: string } }>("/api/recovery/cases", {
        platform,
        problemType,
        discoveredAt: discoveredAt ? new Date(discoveredAt).toISOString() : undefined,
        lastKnownLoginAt: lastKnownLoginAt ? new Date(lastKnownLoginAt).toISOString() : undefined,
        changedSummary: changedSummary || undefined,
        contextNotes: contextNotes || undefined,
        previousAttempts: Number.parseInt(previousAttempts, 10) || 0,
      });
      navigate(`/recovery/case/${res.case.id}`, {
        state: { created: res.case.caseNumber },
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="emergency-banner mb">
        <div style={{ fontSize: "1.8rem" }} aria-hidden="true">
          🚨
        </div>
        <div>
          <h2>Account Emergency</h2>
          <p>
            Let's document what happened and get you on the right track. DigitalShield will guide you
            through legitimate platform recovery steps — we cannot and do not restore accounts
            ourselves.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="step-nav" aria-label="Progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`step ${i === step ? "active" : i < step ? "done" : ""}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        {step === 0 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (problemType) setStep(1);
            }}
          >
            <h3>What happened?</h3>
            <div className="field">
              <label htmlFor="em-platform">Platform</label>
              <select id="em-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="small muted" style={{ marginBottom: 8 }}>
                Choose the closest match
              </legend>
              <div className="grid cols-2">
                {PROBLEM_TYPES.map((p) => (
                  <label
                    key={p}
                    className="row"
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      cursor: "pointer",
                      gap: 10,
                      background: problemType === p ? "var(--navy-50)" : "var(--surface)",
                    }}
                  >
                    <input
                      type="radio"
                      name="problem"
                      value={p}
                      checked={problemType === p}
                      onChange={() => setProblemType(p)}
                    />
                    <span>{PROBLEM_TYPE_LABELS[p]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn mt" type="submit" disabled={!problemType}>
              Continue
            </button>
          </form>
        ) : null}

        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <h3>When did you discover the problem?</h3>
            <div className="grid cols-2">
              <Field label="Date discovered" htmlFor="em-discovered">
                <input
                  id="em-discovered"
                  type="date"
                  value={discoveredAt}
                  onChange={(e) => setDiscoveredAt(e.target.value)}
                />
              </Field>
              <Field label="Last known successful login" htmlFor="em-lastlogin" help="Approximate is fine.">
                <input
                  id="em-lastlogin"
                  type="date"
                  value={lastKnownLoginAt}
                  onChange={(e) => setLastKnownLoginAt(e.target.value)}
                />
              </Field>
            </div>
            <Field label="What has changed?" htmlFor="em-changed" help="e.g. recovery email changed, password stopped working, profile gone">
              <input id="em-changed" value={changedSummary} onChange={(e) => setChangedSummary(e.target.value)} />
            </Field>
            <Field label="Anything else we should know?" htmlFor="em-notes">
              <textarea id="em-notes" value={contextNotes} onChange={(e) => setContextNotes(e.target.value)} />
            </Field>
            <Field label="Recovery attempts already made" htmlFor="em-attempts">
              <input
                id="em-attempts"
                type="text"
                inputMode="numeric"
                value={previousAttempts}
                onChange={(e) => setPreviousAttempts(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            </Field>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn" type="submit">
                Continue
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <div>
            <h3>Review & create your case</h3>
            <dl className="kv">
              <dt>Platform</dt>
              <dd style={{ textTransform: "capitalize" }}>{platform}</dd>
              <dt>Problem</dt>
              <dd>{problemType ? PROBLEM_TYPE_LABELS[problemType] : "—"}</dd>
              <dt>Discovered</dt>
              <dd>{discoveredAt || "—"}</dd>
              <dt>Last known login</dt>
              <dd>{lastKnownLoginAt || "—"}</dd>
              <dt>What changed</dt>
              <dd>{changedSummary || "—"}</dd>
              <dt>Prior attempts</dt>
              <dd>{previousAttempts}</dd>
            </dl>
            <div className="alert info mt">
              After creating the case you'll add evidence (screenshots, emails, notifications) and get
              a unique case number plus guided official recovery steps.
            </div>
            <div className="row">
              <button className="btn secondary" onClick={() => setStep(1)} disabled={busy}>
                Back
              </button>
              <button className="btn danger" onClick={() => void submit()} disabled={busy}>
                {busy ? "Creating case…" : "Create recovery case"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
