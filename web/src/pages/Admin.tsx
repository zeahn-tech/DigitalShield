import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Field, Modal, Spinner, StatusBadge, fmtDate, fmtDateTime } from "../components/ui";

interface Overview {
  users: { total: number; active: number };
  assets: number;
  imports: { total: number; failed: number };
  openCases: number;
  scamReports: number;
  securityEvents24h: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  assetCount: number;
  caseCount: number;
}

interface ResourceRow {
  id: string;
  platform: string;
  title: string;
  url: string;
  purpose: string;
  status: string;
  lastVerifiedAt: string;
  notes: string | null;
}

interface AuditRow {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  at: string;
}

interface ScamReportRow {
  id: string;
  channel: string;
  messageExcerpt: string;
  indicators: string[];
  createdAt: string;
}

interface PrivacyReqRow {
  id: string;
  email: string;
  kind: string;
  status: string;
  createdAt: string;
}

const TABS = ["Overview", "Users", "Resources", "Scam reports", "Audit log", "Privacy requests"] as const;

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [scamReports, setScamReports] = useState<ScamReportRow[]>([]);
  const [requests, setRequests] = useState<PrivacyReqRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resourceModal, setResourceModal] = useState(false);

  const load = async () => {
    try {
      setOverview(await api.get<Overview>("/api/admin/overview"));
      setUsers((await api.get<{ users: AdminUser[] }>("/api/admin/users")).users);
      setResources((await api.get<{ resources: ResourceRow[] }>("/api/admin/resources")).resources);
      setLogs((await api.get<{ logs: AuditRow[] }>("/api/admin/audit-logs")).logs);
      setScamReports((await api.get<{ reports: ScamReportRow[] }>("/api/admin/scam-reports")).reports);
      setRequests((await api.get<{ requests: PrivacyReqRow[] }>("/api/admin/privacy-requests")).requests);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (user && user.role !== "admin") {
    return <div className="alert error">Administrator access required.</div>;
  }

  const completeRequest = async (id: string) => {
    if (!window.confirm("Complete this request? Account deletion is permanent.")) return;
    try {
      await api.post(`/api/admin/privacy-requests/${id}/complete`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const verifyResource = async (id: string) => {
    try {
      await api.patch(`/api/admin/resources/${id}`, { reverify: true, status: "verified" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <h1>Admin Portal</h1>
      <p className="muted">
        Least-privilege operations: resources, aggregates, abuse review and audit. Private vault
        contents are not accessible from this portal by design.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        overview ? (
          <div className="grid cols-3">
            <div className="stat">
              <div className="label">Users</div>
              <div className="value">{overview.users.total}</div>
              <div className="hint">{overview.users.active} active</div>
            </div>
            <div className="stat">
              <div className="label">Vault assets</div>
              <div className="value">{overview.assets.toLocaleString()}</div>
              <div className="hint">Metadata rows (contents not visible here)</div>
            </div>
            <div className="stat">
              <div className="label">Imports</div>
              <div className="value">{overview.imports.total}</div>
              <div className="hint">{overview.imports.failed} failed</div>
            </div>
            <div className="stat">
              <div className="label">Open recovery cases</div>
              <div className="value">{overview.openCases}</div>
            </div>
            <div className="stat">
              <div className="label">Scam reports</div>
              <div className="value">{overview.scamReports}</div>
            </div>
            <div className="stat">
              <div className="label">Security events (24h)</div>
              <div className="value">{overview.securityEvents24h}</div>
            </div>
          </div>
        ) : (
          <Spinner />
        )
      ) : null}

      {tab === "Users" ? (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Verified</th>
                <th scope="col">Assets</th>
                <th scope="col">Cases</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.email} {u.role === "admin" ? <span className="badge info">admin</span> : null}
                  </td>
                  <td>
                    <StatusBadge tone={u.status === "active" ? "ok" : "warn"}>{u.status}</StatusBadge>
                  </td>
                  <td>{u.emailVerified ? "✅" : "—"}</td>
                  <td>{u.assetCount}</td>
                  <td>{u.caseCount}</td>
                  <td className="muted small">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "Resources" ? (
        <div className="card">
          <div className="row between mb">
            <p className="muted small" style={{ margin: 0 }}>
              Official recovery links shown to users. Editable here — updates go live without a
              deployment.
            </p>
            <button className="btn sm" onClick={() => setResourceModal(true)}>
              + Add resource
            </button>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Verified</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td>{r.platform}</td>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                    <div className="small muted">{r.purpose}</div>
                  </td>
                  <td>
                    <StatusBadge tone={r.status === "verified" ? "ok" : r.status === "retired" ? "neutral" : "warn"}>
                      {r.status}
                    </StatusBadge>
                  </td>
                  <td className="muted small">{fmtDate(r.lastVerifiedAt)}</td>
                  <td>
                    <button className="btn secondary sm" onClick={() => void verifyResource(r.id)}>
                      Mark verified
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "Scam reports" ? (
        <div className="card">
          {scamReports.length === 0 ? (
            <p className="muted small">No scam reports yet.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  <th scope="col">Excerpt</th>
                  <th scope="col">Indicators</th>
                  <th scope="col">Reported</th>
                </tr>
              </thead>
              <tbody>
                {scamReports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.channel}</td>
                    <td className="small">{r.messageExcerpt.slice(0, 160)}…</td>
                    <td className="small">{r.indicators.join(", ") || "—"}</td>
                    <td className="muted small">{fmtDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "Audit log" ? (
        <div className="card">
          <div className="sub">Append-only. Never modified or deleted through the API.</div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Actor</th>
                <th scope="col">Target</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="mono small">{l.action}</td>
                  <td className="mono small">{l.actorUserId ?? "—"}</td>
                  <td className="small">
                    {l.targetType ?? "—"} {l.targetId ? <span className="mono">{l.targetId.slice(0, 12)}…</span> : null}
                  </td>
                  <td className="muted small">{fmtDateTime(l.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "Privacy requests" ? (
        <div className="card">
          <div className="sub">
            Deletion requests remove the user's data after an administrator confirms. Exports complete
            automatically when the user downloads them.
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Requested</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.email}</td>
                  <td>{r.kind}</td>
                  <td>
                    <StatusBadge tone={r.status === "completed" ? "ok" : "warn"}>{r.status}</StatusBadge>
                  </td>
                  <td className="muted small">{fmtDate(r.createdAt)}</td>
                  <td>
                    {r.kind === "deletion" && r.status !== "completed" ? (
                      <button className="btn danger sm" onClick={() => void completeRequest(r.id)}>
                        Complete deletion
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {resourceModal ? (
        <AddResourceModal
          onClose={() => setResourceModal(false)}
          onSaved={() => {
            setResourceModal(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function AddResourceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [platform, setPlatform] = useState("facebook");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/resources", { platform, title, url, purpose });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add official resource" onClose={onClose}>
      <p className="muted small">Only add links from official platform or government sources.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Platform" htmlFor="rs-platform">
        <select id="rs-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="global">General / cross-platform</option>
        </select>
      </Field>
      <Field label="Title" htmlFor="rs-title">
        <input id="rs-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Official URL" htmlFor="rs-url">
        <input id="rs-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Purpose" htmlFor="rs-purpose">
        <input id="rs-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => void submit()} disabled={!title || !url || !purpose || busy}>
          {busy ? "Saving…" : "Add resource"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
