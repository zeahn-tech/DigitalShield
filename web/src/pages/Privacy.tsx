import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { Alert, Spinner, StatusBadge, fmtBytes, fmtDate } from "../components/ui";

interface PrivacySummary {
  stored: {
    assets: number;
    assetBytes: number;
    imports: number;
    platformAccounts: number;
    recoveryCases: number;
    evidenceItems: number;
  };
  accountStatus: string;
}

interface RequestRow {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export default function Privacy() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try {
      setSummary(await api.get<PrivacySummary>("/api/privacy/summary"));
      const r = await api.get<{ requests: RequestRow[] }>("/api/privacy/requests");
      setRequests(r.requests);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const exportData = async () => {
    try {
      const data = await api.get<unknown>("/api/privacy/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `digitalshield-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Export downloaded. It contains your data summary and metadata (not file contents, which are listed by hash).");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const requestDeletion = async () => {
    try {
      const res = await api.post<{ message: string }>("/api/privacy/deletion-request");
      setNotice(res.message);
      setConfirmDelete(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!summary) return <Spinner label="Loading your data summary…" />;

  return (
    <>
      <h1>Privacy &amp; Data</h1>
      <p className="muted">You own your data. See exactly what DigitalShield stores about you.</p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid cols-3 mb">
        <div className="stat">
          <div className="label">Vault items</div>
          <div className="value">{summary.stored.assets.toLocaleString()}</div>
          <div className="hint">{fmtBytes(summary.stored.assetBytes)} of metadata + files</div>
        </div>
        <div className="stat">
          <div className="label">Imported archives</div>
          <div className="value">{summary.stored.imports}</div>
          <div className="hint">{summary.stored.platformAccounts} platform accounts recorded</div>
        </div>
        <div className="stat">
          <div className="label">Recovery cases / evidence</div>
          <div className="value">
            {summary.stored.recoveryCases} / {summary.stored.evidenceItems}
          </div>
          <div className="hint">Cases and evidence items stored</div>
        </div>
      </div>

      <div className="card">
        <h2>Export my data</h2>
        <p className="muted small">
          Download a JSON file with everything DigitalShield stores about you: profile, vault metadata
          (with file hashes), imports, cases, evidence records, notifications and your audit trail.
        </p>
        <button className="btn" onClick={() => void exportData()}>
          Download my data (JSON)
        </button>
      </div>

      <div className="card">
        <h2>Delete my account</h2>
        <p className="muted small">
          Requesting deletion removes your account and all associated vault items, imports, recovery
          cases and evidence after an administrator processes the request. Consider exporting your
          data first — deletion cannot be undone.
        </p>
        {requests.filter((r) => r.kind === "deletion").length > 0 ? (
          <div className="mb">
            {requests
              .filter((r) => r.kind === "deletion")
              .map((r) => (
                <div key={r.id} className="row">
                  <StatusBadge tone={r.status === "completed" ? "ok" : "warn"}>
                    {r.status}
                  </StatusBadge>
                  <span className="small muted">requested {fmtDate(r.createdAt)}</span>
                </div>
              ))}
          </div>
        ) : null}
        {confirmDelete ? (
          <div className="alert error">
            <strong>This cannot be undone.</strong> Your vault, imports, cases and evidence will be
            permanently deleted.
            <div className="row mt">
              <button className="btn danger sm" onClick={() => void requestDeletion()}>
                Yes, request deletion
              </button>
              <button className="btn secondary sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>
            Request account deletion
          </button>
        )}
      </div>

      <div className="card">
        <h2>Principles we build by</h2>
        <ul className="muted small" style={{ lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          <li>Data minimization — we collect only what helps protection and recovery.</li>
          <li>Your vault is visible only to you; administrators cannot browse vault contents.</li>
          <li>Sensitive fields are encrypted at rest; passwords are stored only as salted hashes.</li>
          <li>Every sensitive action is recorded in an append-only audit log.</li>
        </ul>
      </div>
    </>
  );
}
