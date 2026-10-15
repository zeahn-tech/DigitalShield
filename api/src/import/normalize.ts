/** Normalization helpers for imported/uploaded item metadata. */

export function normalizeTitle(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300) || "Untitled item";
}

export function kindFromFilename(name: string): "photo" | "video" | "document" | "screenshot" | "other" {
  const lower = name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|avif)$/.test(lower)) {
    return /screen|screenshot|capture/.test(lower) ? "screenshot" : "photo";
  }
  if (/\.(mp4|mov|m4v|webm|avi)$/.test(lower)) return "video";
  if (/\.(pdf|docx?|xlsx?|txt|csv|rtf)$/.test(lower)) return "document";
  return "other";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
