import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ReadinessReport } from "@shared/types";
import { Spinner, StatusBadge, fmtDate, KIND_ICONS } from "../components/ui";

interface DashboardData {
  readiness: ReadinessReport;
  counts: Record<string, number>;
  totals: { assets: number; important: number; cases: number; openCases: number; evidence: number; platforms: number };
  lastImportAt: string | null;
  recentSecurity: { kind: string; at: string }[];
  recentActivity: { action: string; at: string }[];
  unreadNotifications: number;
  recommendedActions: { id: string; label: string; detail: string }[];
}

const STATUS_META: Record<string, { tone: "ok" | "warn" | "danger" | "info"; icon: string; label: string }> = {
  protected: { tone: "ok", icon: "🟢", label: "Protected" },
  action_required: { tone: "warn", icon: "🟡", label: "Action required" },
  needs_setup: { tone: "warn", icon: "🟡", label: "Setup needed" },
  emergency: { tone: "danger", icon: "🔴", label: "Account emergency in progress" },
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <Spinner label="Loading your protection status…" />;

  const meta = STATUS_META[data.readiness.status] ?? STATUS_META.needs_setup!;
  const progressTone = data.readiness.score >= 80 ? "ok" : data.readiness.score >= 40 ? "warn" : "danger";

  return (
    <>
      <div className="row between mb">
        <div>
          <h1>Dashboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            Your digital protection overview.
          </p>
        </div>
        <Link className="btn" to="/recovery/emergency">
          🚨 Account Emergency
        </Link>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h2>Digital Protection</h2>
            <StatusBadge tone={meta.tone} icon={meta.icon}>
              {meta.label}
            </StatusBadge>
          </div>
          <div style={{ minWidth: 240, flex: "0 1 380px" }}>
            <div className="row between small muted">
              <span>Recovery readiness</span>
              <strong style={{ color: "var(--ink)" }}>{data.readiness.score}% Ready</strong>
            </div>
            <div
              className="progress-track mt"
              role="progressbar"
              aria-valuenow={data.readiness.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Recovery readiness"
            >
              <div className={`progress-fill ${progressTone}`} style={{ width: `${data.readiness.score}%` }} />
            </div>
          </div>
        </div>
        {data.recommendedActions.length > 0 ? (
          <div className="alert warn mt" style={{ marginBottom: 0 }}>
            <strong>Recommended next steps:</strong>{" "}
            {data.recommendedActions.slice(0, 3).map((a) => a.detail).join(" ")}
          </div>
        ) : (
          <div className="alert success mt" style={{ marginBottom: 0 }}>
            All readiness checks pass. Keep your archive fresh — re-import every few weeks.
          </div>
        )}
      </div>

      <div className="grid cols-4 mt">
        <div className="stat">
          <div className="label">Digital assets</div>
          <div className="value">{data.totals.assets.toLocaleString()}</div>
          <div className="hint">{data.totals.important} marked important</div>
        </div>
        <div className="stat">
          <div className="label">Connected platforms</div>
          <div className="value">{data.totals.platforms}</div>
          <div className="hint">
            <Link to="/vault">Manage in Vault</Link>
          </div>
        </div>
        <div className="stat">
          <div className="label">Recovery cases</div>
          <div className="value">{data.totals.cases}</div>
          <div className="hint">
            {data.totals.openCases > 0 ? `${data.totals.openCases} active` : "No active cases"}
          </div>
        </div>
        <div className="stat">
          <div className="label">Last backup/import</div>
          <div className="value" style={{ fontSize: "1.1rem", paddingTop: 8 }}>
            {fmtDate(data.lastImportAt)}
          </div>
          <div className="hint">
            <Link to="/import">Import data</Link>
          </div>
        </div>
      </div>

      <div className="grid cols-2 mt">
        <div className="card">
          <h2>Backup status</h2>
          <div className="sub">Everything preserved per item kind.</div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Items</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.counts).map(([kind, n]) => (
                <tr key={kind}>
                  <td>
                    <span aria-hidden="true">{KIND_ICONS[kind] ?? "📦"}</span> {kind}
                  </td>
                  <td>{n.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Recovery readiness checklist</h2>
          <div className="sub">Each item is a measurable criterion — this is exactly why your score is what it is.</div>
          {data.readiness.checklist.map((item) => (
            <div className="checklist-item" key={item.id}>
              <span className="mark" aria-hidden="true">
                {item.satisfied ? "✅" : "⚠️"}
              </span>
              <div>
                <strong>
                  {item.label} <span className="muted small">({item.weight} pts)</span>
                </strong>
                <div className="detail">{item.detail}</div>
              </div>
              <span className="badge neutral" style={{ marginLeft: "auto" }}>
                {item.satisfied ? "Done" : "Todo"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid cols-2 mt">
        <div className="card">
          <h2>Recent activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="muted small">No activity recorded yet.</p>
          ) : (
            <table className="data">
              <tbody>
                {data.recentActivity.slice(0, 8).map((a, i) => (
                  <tr key={i}>
                    <td>{a.action.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="muted small" style={{ textAlign: "right" }}>
                      {fmtDate(a.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Security alerts</h2>
          {data.recentSecurity.length === 0 ? (
            <p className="muted small">No recent security events.</p>
          ) : (
            <table className="data">
              <tbody>
                {data.recentSecurity.slice(0, 8).map((a, i) => (
                  <tr key={i}>
                    <td>
                      {a.kind === "login_failed"
                        ? "Failed sign-in attempt"
                        : a.kind === "password_changed"
                          ? "Password changed"
                          : a.kind.replace(/_/g, " ")}
                    </td>
                    <td className="muted small" style={{ textAlign: "right" }}>
                      {fmtDate(a.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="btn secondary sm mt" to="/security">
            Open security center
          </Link>
        </div>
      </div>
    </>
  );
}
