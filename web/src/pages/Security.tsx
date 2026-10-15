import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { Alert, Spinner, StatusBadge, fmtDateTime } from "../components/ui";

interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}
interface SecurityEventRow {
  id: string;
  kind: string;
  details: string | null;
  at: string;
}

const KIND_LABELS: Record<string, string> = {
  login_success: "Signed in",
  login_failed: "Failed sign-in attempt",
  password_changed: "Password changed",
  session_revoked: "Session revoked",
  rate_limited: "Too many attempts blocked",
};

export default function Security() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [events, setEvents] = useState<SecurityEventRow[] | null>(null);
  const [alerts, setAlerts] = useState<{ failedLoginCount7d: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await api.get<{ sessions: SessionRow[] }>("/api/auth/sessions");
      setSessions(s.sessions);
      const e = await api.get<{ events: SecurityEventRow[] }>("/api/security/events");
      setEvents(e.events);
      const a = await api.get<{ failedLoginCount7d: number }>("/api/security/alerts");
      setAlerts(a);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const revokeOthers = async () => {
    try {
      const res = await api.post<{ revoked: number }>("/api/auth/sessions/revoke-others");
      setNotice(`Signed out ${res.revoked} other session${res.revoked === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const failedCount = alerts?.failedLoginCount7d ?? 0;

  return (
    <>
      <h1>Security Status</h1>
      <p className="muted">Session controls and security activity for your DigitalShield account.</p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid cols-3 mb">
        <div className="stat">
          <div className="label">Failed sign-ins (7 days)</div>
          <div className="value">{failedCount}</div>
          <div className="hint">
            {failedCount === 0 ? (
              <StatusBadge tone="ok" icon="🟢">
                No suspicious activity
              </StatusBadge>
            ) : (
              <StatusBadge tone="warn" icon="🟡">
                Review recent events below
              </StatusBadge>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="label">Active sessions</div>
          <div className="value">{sessions?.length ?? "—"}</div>
          <div className="hint">Including this device</div>
        </div>
        <div className="stat">
          <div className="label">Recovery scams</div>
          <div className="value" style={{ fontSize: "1.1rem", paddingTop: 8 }}>
            Scam Shield active
          </div>
          <div className="hint">
            <Link to="/security/scam-shield">Analyze a suspicious message →</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h2>Active sessions</h2>
            <div className="sub">Sessions are HttpOnly cookies; tokens are stored only as hashes.</div>
          </div>
          <button className="btn secondary sm" onClick={() => void revokeOthers()} disabled={!sessions || sessions.length <= 1}>
            Sign out all other sessions
          </button>
        </div>
        {!sessions ? (
          <Spinner />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">Last seen</th>
                <th scope="col">Expires</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="small">{(s.userAgent ?? "Unknown device").slice(0, 80)}</td>
                  <td className="muted small">{fmtDateTime(s.lastSeenAt)}</td>
                  <td className="muted small">{fmtDateTime(s.expiresAt)}</td>
                  <td>{s.current ? <span className="badge info">This device</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Security activity</h2>
        {!events ? (
          <Spinner />
        ) : events.length === 0 ? (
          <p className="muted small">No security events recorded.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 30).map((e) => (
                <tr key={e.id}>
                  <td>{KIND_LABELS[e.kind] ?? e.kind.replace(/_/g, " ")}</td>
                  <td className="muted small">{fmtDateTime(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
