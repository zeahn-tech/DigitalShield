import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import type { DigitalAsset } from "@shared/types";
import { EmptyState, Field, Modal, Spinner, fmtBytes, fmtDate, KIND_ICONS } from "../components/ui";

interface Summary {
  counts: Record<string, number>;
  total: number;
  bytes: number;
  important: number;
  tags: { tag: string; n: number }[];
}

const TABS = [
  { id: "", label: "All" },
  { id: "photo", label: "Photos" },
  { id: "video", label: "Videos" },
  { id: "document", label: "Documents" },
  { id: "post", label: "Posts" },
  { id: "screenshot", label: "Screenshots" },
  { id: "important", label: "⭐ Important" },
];

export default function Vault() {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [assets, setAssets] = useState<DigitalAsset[] | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DigitalAsset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (kind && kind !== "important") params.set("kind", kind);
      if (kind === "important") params.set("important", "1");
      if (q) params.set("q", q);
      params.set("sort", sort);
      const res = await api.get<{ assets: DigitalAsset[]; total: number }>(`/api/vault/assets?${params}`);
      setAssets(res.assets);
      setTotal(res.total);
      setSummary(await api.get<Summary>("/api/vault/summary"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [kind, q, sort]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const toggleImportant = async (a: DigitalAsset) => {
    try {
      await api.patch(`/api/vault/assets/${a.id}`, { isImportant: !a.isImportant });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <div className="row between mb">
        <div>
          <h1>Digital Vault</h1>
          <p className="muted" style={{ margin: 0 }}>
            {summary ? `${summary.total.toLocaleString()} items preserved · ${fmtBytes(summary.bytes)}` : "Loading…"}
          </p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setUploadOpen(true)}>
            ⬆️ Upload files
          </button>
          <Link className="btn" to="/import">
            📥 Import archive
          </Link>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="card">
        <div className="tabs" role="tablist" aria-label="Vault categories">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={kind === t.id}
              className={kind === t.id ? "active" : ""}
              onClick={() => setKind(t.id)}
            >
              {t.label}
              {summary && t.id === "important" ? ` (${summary.important})` : ""}
            </button>
          ))}
        </div>

        <div className="row mb">
          <div style={{ flex: "1 1 260px" }}>
            <label htmlFor="vault-search" className="small muted">
              Search title, description or filename
            </label>
            <input
              id="vault-search"
              type="search"
              value={q}
              placeholder="Search…"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="vault-sort" className="small muted">
              Sort
            </label>
            <select id="vault-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="created_desc">Newest added</option>
              <option value="taken_desc">Newest taken</option>
              <option value="taken_asc">Oldest taken</option>
              <option value="size_desc">Largest first</option>
            </select>
          </div>
        </div>

        {!assets ? (
          <Spinner label="Loading vault…" />
        ) : assets.length === 0 ? (
          <EmptyState icon="🗃️" title="Nothing here yet" action={<Link className="btn" to="/import">Import your first archive</Link>}>
            <p>
              Import an official archive from your platform, or upload photos and documents directly.
            </p>
          </EmptyState>
        ) : (
          <>
            <p className="small muted" aria-live="polite">
              {total.toLocaleString()} item{total === 1 ? "" : "s"} match.
            </p>
            <div className="asset-grid">
              {assets.map((a) => (
                <div className="asset-card" key={a.id}>
                  <div className="thumb" aria-hidden="true">
                    {a.mime?.startsWith("image/") && a.downloadUrl ? (
                      <img src={a.downloadUrl} alt="" loading="lazy" />
                    ) : (
                      (KIND_ICONS[a.kind] ?? "📦")
                    )}
                  </div>
                  <div className="name">{a.title ?? a.originalFilename ?? "Untitled"}</div>
                  <div className="meta">
                    {a.kind} · {a.takenAt ? fmtDate(a.takenAt) : fmtDate(a.createdAt)}
                    {a.sizeBytes ? ` · ${fmtBytes(a.sizeBytes)}` : ""}
                  </div>
                  {a.tags.length > 0 ? (
                    <div className="row" style={{ gap: 4 }}>
                      {a.tags.slice(0, 3).map((t) => (
                        <span key={t} className="badge neutral">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="row between mt">
                    <button
                      className={`star ${a.isImportant ? "on" : ""}`}
                      onClick={() => void toggleImportant(a)}
                      aria-pressed={a.isImportant}
                      title={a.isImportant ? "Remove Important mark" : "Mark as important"}
                    >
                      ⭐ {a.isImportant ? "Important" : "Protect this"}
                    </button>
                    <button className="btn ghost sm" onClick={() => setEditing(a)}>
                      Edit
                    </button>
                  </div>
                  {a.downloadUrl ? (
                    <a className="btn secondary sm" href={a.downloadUrl}>
                      Download
                    </a>
                  ) : (
                    <span className="small muted">Metadata preserved from import (no file content in archive)</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {editing ? (
        <AssetEditModal
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
      {uploadOpen ? (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function AssetEditModal({ asset, onClose, onSaved }: { asset: DigitalAsset; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(asset.title ?? "");
  const [description, setDescription] = useState(asset.description ?? "");
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/vault/assets/${asset.id}`, {
        title,
        description,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit item" onClose={onClose}>
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="Title" htmlFor="edit-title">
        <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="edit-desc">
        <textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Tags" htmlFor="edit-tags" help="Comma-separated, e.g. family, business">
        <input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        if (kind) form.append("kind", kind);
        await api.upload("/api/vault/assets/upload", form);
      }
      onUploaded();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload files" onClose={onClose}>
      <p className="muted small">
        Photos, videos, documents, screenshots and PDFs up to 25 MB each. Your original files are never
        modified.
      </p>
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="Files" htmlFor="up-files">
        <input
          id="up-files"
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </Field>
      <Field label="Kind (optional)" htmlFor="up-kind" help="Auto-detected from file type when left blank.">
        <select id="up-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Auto-detect</option>
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="document">Document</option>
          <option value="screenshot">Screenshot</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <div className="row">
        <button className="btn" disabled={busy || files.length === 0} onClick={() => void upload()}>
          {busy ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
