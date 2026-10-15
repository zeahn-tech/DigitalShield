import { useCallback, useEffect, useState } from "react";
import { unzip } from "fflate";
import { api, errorMessage } from "../lib/api";
import type { ImportSummary } from "@shared/types";
import { Alert, EmptyState, Spinner, fmtDate } from "../components/ui";

interface PlatformInfo {
  id: string;
  name: string;
  supported: boolean;
  notes: string;
}

const MAX_FILES = 200;

export default function ImportData() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [platform, setPlatform] = useState("facebook");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [imports, setImports] = useState<ImportSummary[] | null>(null);

  useEffect(() => {
    api
      .get<{ platforms: PlatformInfo[] }>("/api/platforms")
      .then((r) => setPlatforms(r.platforms))
      .catch(() => setPlatforms([]));
    void loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const r = await api.get<{ imports: ImportSummary[] }>("/api/imports");
      setImports(r.imports);
    } catch {
      setImports([]);
    }
  };

  const runImport = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("platform", platform);
      form.append("archiveName", file.name);

      if (/\.zip$/i.test(file.name)) {
        // Client-side extraction keeps server request sizes manageable and
        // lets us report per-file outcomes instead of failing wholesale.
        const entries = await extractZip(file);
        if (entries.length === 0) {
          throw new Error("This ZIP archive appears to be empty. Your original file has not been modified.");
        }
        for (const entry of entries.slice(0, MAX_FILES)) {
          const blobPart = entry.data.slice() as unknown as BlobPart;
          form.append("files", new Blob([blobPart]), entry.path);
          form.append(`path:${entry.path}`, entry.path);
        }
        if (entries.length > MAX_FILES) {
          setNotice(`Archive contains ${entries.length} files; the first ${MAX_FILES} were submitted. Split the archive for full coverage.`);
        }
      } else {
        form.append("files", file);
      }

      const res = await api.upload<{ import: ImportSummary }>("/api/imports", form);
      setResult(res.import);
      setNotice((prev) => res.import.notes?.join(" ") ?? prev);
      await loadHistory();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [file, platform]);

  const selected = platforms.find((p) => p.id === platform);

  return (
    <>
      <h1>Import Data</h1>
      <p className="muted">
        Import your own official archive — for example Facebook's “Download Your Information” export.
        DigitalShield never asks for your platform password and never accesses your account.
      </p>

      <div className="card">
        <h2>Before you start</h2>
        <ol className="muted" style={{ lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
          <li>Open your platform's settings and find “Download your information” (or equivalent).</li>
          <li>Choose the date range and include the content you want to preserve.</li>
          <li>Select <strong>JSON</strong> format for the most complete import.</li>
          <li>Download the archive, then select it below.</li>
        </ol>
      </div>

      <div className="card">
        <h2>New import</h2>
        {selected && !selected.supported ? (
          <Alert tone="info">
            {selected.name} import is not available yet — {selected.notes}
          </Alert>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {result ? (
          <Alert tone="success">
            <strong>Import {result.status.replace(/_/g, " ")}.</strong>{" "}
            {result.assetsCreated.toLocaleString()} items added, {result.duplicatesSkipped} duplicates
            skipped, {result.filesSkipped} file(s) not parsed.{" "}
            <a href="/vault">Open your vault →</a>
          </Alert>
        ) : null}

        <div className="field">
          <label htmlFor="imp-platform">Platform</label>
          <select id="imp-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.supported ? "" : " (coming soon)"}
              </option>
            ))}
            {platforms.length === 0 ? <option value="facebook">Facebook</option> : null}
          </select>
        </div>

        <label
          className="dropzone"
          htmlFor="imp-file"
          onDragOver={(e) => e.preventDefault()}
          style={{ display: "block", cursor: "pointer" }}
        >
          <input
            id="imp-file"
            type="file"
            accept=".zip,.json,.html,.htm"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <strong>{file.name}</strong>
              <div className="small muted">{(file.size / 1048576).toFixed(1)} MB selected — click to change</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "1.8rem" }} aria-hidden="true">
                📦
              </div>
              <strong>Choose your archive</strong>
              <div className="small muted">ZIP, JSON or HTML export from the platform</div>
            </>
          )}
        </label>

        <button className="btn mt" disabled={!file || busy} onClick={() => void runImport()}>
          {busy ? "Importing — this can take a moment…" : "Start import"}
        </button>
        {busy ? (
          <div className="mt">
            <Spinner label="Validating archive and organizing your data…" />
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Import history</h2>
        {!imports ? (
          <Spinner />
        ) : imports.length === 0 ? (
          <EmptyState icon="📥" title="No imports yet" />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Archive</th>
                <th scope="col">Status</th>
                <th scope="col">Assets</th>
                <th scope="col">Skipped</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id}>
                  <td>
                    {imp.originalFilename ?? imp.id}
                    <div className="small muted">{imp.format ?? "unknown format"}</div>
                  </td>
                  <td>
                    <span
                      className={`badge ${imp.status.startsWith("completed") ? (imp.status.includes("warnings") ? "warn" : "ok") : imp.status === "failed" ? "danger" : "info"}`}
                    >
                      {imp.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{imp.assetsCreated.toLocaleString()}</td>
                  <td>{imp.filesSkipped.toLocaleString()}</td>
                  <td className="muted small">{fmtDate(imp.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

async function extractZip(file: File): Promise<{ path: string; data: Uint8Array }[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    unzip(buf, (err, entries) => {
      if (err) {
        reject(
          new Error(
            "We couldn't read this ZIP archive. Your original file has not been modified — try downloading a fresh archive.",
          ),
        );
        return;
      }
      const out: { path: string; data: Uint8Array }[] = [];
      for (const [path, data] of Object.entries(entries)) {
        if (data.length === 0) continue;
        out.push({ path, data });
      }
      resolve(out);
    });
  });
}
