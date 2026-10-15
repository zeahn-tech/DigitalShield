import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import type { PlatformResource, RecoveryCase } from "@shared/types";
import { Alert, Field, Modal, Spinner, StatusBadge, fmtDate, fmtDateTime } from "../components/ui";
import { statusLabel } from "./RecoveryList";
import { CASE_STATUSES } from "@shared/types";

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  open: "info",
  investigating: "info",
  user_action_required: "warn",
  submitted_to_platform: "info",
  waiting_for_platform: "warn",
  resolved: "ok",
  closed: "neutral",
};

const EVIDENCE_SOURCES = [
  { id: "screenshot", label: "Screenshot" },
  { id: "email", label: "Email" },
  { id: "notification", label: "Notification" },
  { id: "platform_message", label: "Platform message" },
  { id: "document", label: "Document" },
  { id: "other", label: "Other" },
];

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation() as { state?: { created?: string } };
  const [rec, setRec] = useState<RecoveryCase | null>(null);
  const [resources, setResources] = useState<PlatformResource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageId, setPackageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ case: RecoveryCase }>(`/api/recovery/cases/${id}`);
      setRec(res.case);
      const rr = await api.get<{ resources: PlatformResource[] }>(
        `/api/recovery/resources?platform=${encodeURIComponent(res.case.platform)}`,
      );
      setResources(rr.resources);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (status: string) => {
    try {
      await api.patch(`/api/recovery/cases/${id}/status`, { status });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const generatePackage = async () => {
    setPackageBusy(true);
    try {
      const res = await api.post<{ packageId: string }>(`/api/recovery/cases/${id}/package`);
      setPackageId(res.packageId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPackageBusy(false);
    }
  };

  if (error && !rec) return <div className="alert error">{error}</div>;
  if (!rec) return <Spinner label="Loading case…" />;

  return (
    <>
      <div className="row between mb">
        <div>
          <Link to="/recovery" className="small">
            ← All cases
          </Link>
          <h1 className="mono" style={{ marginTop: 4 }}>
            {rec.caseNumber}
          </h1>
          <div className="row">
            <StatusBadge tone={STATUS_TONE[rec.status] ?? "neutral"}>{statusLabel(rec.status)}</StatusBadge>
            <span className="badge neutral" style={{ textTransform: "capitalize" }}>
              {rec.platform}
            </span>
            <span className="badge neutral">{String(rec.problemType).replace(/_/g, " ")}</span>
          </div>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setNoteOpen(true)}>
            + Add note
          </button>
          <button className="btn secondary" onClick={() => setEvidenceOpen(true)}>
            ⬆️ Add evidence
          </button>
          <button className="btn" onClick={() => void generatePackage()} disabled={packageBusy}>
            {packageBusy ? "Generating…" : "📄 Generate Recovery Package"}
          </button>
        </div>
      </div>

      {location.state?.created ? (
        <Alert tone="success">
          Case {location.state.created} created. Add evidence next — screenshots and notifications are
          often requested during platform recovery.
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {packageId ? (
        <Alert tone="success">
          Recovery package generated.{" "}
          <a href={`/api/recovery/packages/${packageId}`} target="_blank" rel="noreferrer">
            Preview (print to PDF)
          </a>{" "}
          ·{" "}
          <a href={`/api/recovery/packages/${packageId}?download=1`}>Download HTML</a>
        </Alert>
      ) : null}

      <div className="grid cols-2">
        <div className="card">
          <h2>Case summary</h2>
          <dl className="kv">
            <dt>Discovered</dt>
            <dd>{fmtDate(rec.discoveredAt)}</dd>
            <dt>Last known access</dt>
            <dd>{fmtDate(rec.lastKnownLoginAt)}</dd>
            <dt>Known changes</dt>
            <dd>{rec.changedSummary || "—"}</dd>
            <dt>Context</dt>
            <dd>{rec.contextNotes || "—"}</dd>
            <dt>Prior attempts</dt>
            <dd>{rec.previousAttempts}</dd>
          </dl>
          <div className="field mt">
            <label htmlFor="case-status">Case status</label>
            <select id="case-status" value={rec.status} onChange={(e) => void setStatus(e.target.value)}>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <h2>Evidence ({rec.evidence?.length ?? 0})</h2>
          <div className="sub">
            Originals are preserved unchanged, with a SHA-256 fingerprint for each file.
          </div>
          {(rec.evidence ?? []).length === 0 ? (
            <p className="muted small">
              No evidence yet. Screenshots of error messages, notification emails, and changed-login
              alerts all help.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Source</th>
                  <th scope="col">Added</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {(rec.evidence ?? []).map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      {ev.originalFilename}
                      <div className="small muted mono">sha256:{ev.sha256.slice(0, 12)}…</div>
                    </td>
                    <td>{ev.source}</td>
                    <td className="muted small">{fmtDate(ev.uploadedAt)}</td>
                    <td>
                      {ev.downloadUrl ? (
                        <a className="btn secondary sm" href={ev.downloadUrl}>
                          Download
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Timeline</h2>
        <div className="timeline">
          {(rec.events ?? []).map((ev) => (
            <div className="item" key={ev.id}>
              <div className="when">{fmtDateTime(ev.at)}</div>
              <strong>{ev.title}</strong>
              {ev.body ? <div className="muted small">{ev.body}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Official recovery resources</h2>
        <div className="sub">Verified links maintained by DigitalShield administrators — never hard-coded guesses.</div>
        {resources.map((r) => (
          <div className="resource-item" key={r.id}>
            <a href={r.url} target="_blank" rel="noreferrer">
              <strong>{r.title}</strong>
            </a>
            <div className="small muted">{r.purpose}</div>
            <div className="small muted">
              Verified {fmtDate(r.lastVerifiedAt)} · <span className="badge ok">{r.status}</span>
            </div>
          </div>
        ))}
      </div>

      {(rec.packages ?? []).length > 0 ? (
        <div className="card">
          <h2>Previous packages</h2>
          <table className="data">
            <tbody>
              {(rec.packages ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="muted small">{fmtDateTime(p.createdAt)}</td>
                  <td>
                    <a href={`/api/recovery/packages/${p.id}`} target="_blank" rel="noreferrer">
                      Preview
                    </a>{" "}
                    · <a href={`/api/recovery/packages/${p.id}?download=1`}>Download</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {noteOpen ? (
        <NoteModal
          caseId={rec.id}
          onClose={() => setNoteOpen(false)}
          onSaved={() => {
            setNoteOpen(false);
            void load();
          }}
        />
      ) : null}
      {evidenceOpen ? (
        <EvidenceModal
          caseId={rec.id}
          onClose={() => setEvidenceOpen(false)}
          onSaved={() => {
            setEvidenceOpen(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function NoteModal({ caseId, onClose, onSaved }: { caseId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/recovery/cases/${caseId}/events`, { kind, title, body: body || undefined });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add timeline note" onClose={onClose}>
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="Type" htmlFor="note-kind">
        <select id="note-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="note">Note</option>
          <option value="attempt">Recovery attempt</option>
          <option value="platform_contact">Contacted platform</option>
          <option value="resource_used">Used an official resource</option>
        </select>
      </Field>
      <Field label="Title" htmlFor="note-title">
        <input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Details" htmlFor="note-body">
        <textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => void save()} disabled={!title || busy}>
          {busy ? "Saving…" : "Add to timeline"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function EvidenceModal({ caseId, onClose, onSaved }: { caseId: string; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("screenshot");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("source", source);
      form.append("description", description);
      await api.upload(`/api/recovery/cases/${caseId}/evidence`, form);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add evidence" onClose={onClose}>
      <p className="muted small">
        Screenshots of error messages, emails from the platform, and security notifications are all
        valuable. Files are preserved exactly as uploaded, with a SHA-256 fingerprint.
      </p>
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="File" htmlFor="ev-file">
        <input id="ev-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Source" htmlFor="ev-source">
        <select id="ev-source" value={source} onChange={(e) => setSource(e.target.value)}>
          {EVIDENCE_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" htmlFor="ev-desc">
        <textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => void save()} disabled={!file || busy}>
          {busy ? "Uploading…" : "Add evidence"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
