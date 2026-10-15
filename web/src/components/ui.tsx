import type { ReactNode } from "react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <span className="row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted small">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon = "📭",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children}
      {action ? <div className="mt">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "info" | "neutral";
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge ${tone}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info" | "warn"; children: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn secondary sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help && !error ? <div className="help">{help}</div> : null}
      {error ? (
        <div className="err" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const KIND_ICONS: Record<string, string> = {
  photo: "🖼️",
  video: "🎬",
  document: "📄",
  post: "📝",
  screenshot: "📸",
  other: "📦",
};
