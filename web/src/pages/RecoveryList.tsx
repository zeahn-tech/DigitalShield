import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import type { RecoveryCase } from "@shared/types";
import { EmptyState, Spinner, StatusBadge, fmtDate } from "../components/ui";

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  open: "info",
  investigating: "info",
  user_action_required: "warn",
  submitted_to_platform: "info",
  waiting_for_platform: "warn",
  resolved: "ok",
  closed: "neutral",
};

export function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecoveryList() {
  const [cases, setCases] = useState<RecoveryCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ cases: RecoveryCase[] }>("/api/recovery/cases")
      .then((r) => setCases(r.cases))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <>
      <div className="row between mb">
        <div>
          <h1>Recovery Cases</h1>
          <p className="muted" style={{ margin: 0 }}>
            User-side recovery management: document what happened, preserve evidence, and follow
            official platform procedures.
          </p>
        </div>
        <Link className="btn danger" to="/recovery/emergency">
          🚨 Start Emergency
        </Link>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="card">
        {!cases ? (
          <Spinner label="Loading cases…" />
        ) : cases.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No recovery cases"
            action={
              <Link className="btn" to="/recovery/emergency">
                Start an emergency case
              </Link>
            }
          >
            <p>If you've lost access to an account, start here. Otherwise, no action is needed.</p>
          </EmptyState>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Platform</th>
                <th scope="col">Problem</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
                <th scope="col">Opened</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/recovery/case/${c.id}`} className="mono">
                      {c.caseNumber}
                    </Link>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{c.platform}</td>
                  <td style={{ textTransform: "capitalize" }}>{String(c.problemType).replace(/_/g, " ")}</td>
                  <td>
                    <StatusBadge tone={STATUS_TONE[c.status] ?? "neutral"}>{statusLabel(c.status)}</StatusBadge>
                  </td>
                  <td>{(c as any).evidenceCount ?? "—"}</td>
                  <td className="muted small">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
