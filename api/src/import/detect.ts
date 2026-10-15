/**
 * Format detection for user-provided archives/exports.
 * Detection is conservative: we only claim a format when structure matches.
 */

export interface DetectedFormat {
  formatId: string;
  platform: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export interface IncomingFile {
  path: string; // path inside the original archive, e.g. "your_facebook_activity/posts/posts_v2.json"
  name: string; // original filename
  text: string; // decoded text (text-ish files only)
  size: number;
}

const FB_POST_MARKERS = ["posts_v2", "wall", "Your Posts", "profile_v2", "facebook"];
const FB_KNOWN_FILENAMES = [
  "posts_v2.json",
  "profile_v2.json",
  "about.json",
  "friends.json",
  "personal_information.json",
];

/**
 * Detect the export format from the file set. A JSON archive containing any
 * Facebook-structured files (by name or content markers) is detected as
 * `facebook-json-v1`. HTML-only archives get `facebook-html-limited`
 * (parsed only for basic profile markers; users are encouraged to download
 * the JSON variant for full preservation).
 */
export function detectFormat(files: IncomingFile[]): DetectedFormat | null {
  const jsonFiles = files.filter((f) => f.path.toLowerCase().endsWith(".json"));
  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));

  if (jsonFiles.length > 0) {
    let fbScore = 0;
    for (const f of jsonFiles) {
      const lowerPath = f.path.toLowerCase();
      if (FB_KNOWN_FILENAMES.some((n) => lowerPath.endsWith(n))) fbScore += 2;
      const head = f.text.slice(0, 2000);
      if (FB_POST_MARKERS.some((m) => head.includes(m))) fbScore += 1;
      try {
        const parsed: unknown = JSON.parse(f.text);
        if (looksLikeFbPosts(parsed) || looksLikeFbProfile(parsed)) fbScore += 2;
      } catch {
        /* invalid JSON handled by parser stage */
      }
    }
    if (fbScore >= 2) {
      return {
        formatId: "facebook-json-v1",
        platform: "facebook",
        confidence: fbScore >= 4 ? "high" : "medium",
        notes: "JSON export detected from your Facebook 'Download Your Information' archive.",
      };
    }
    return {
      formatId: "generic-json",
      platform: "unknown",
      confidence: "low",
      notes: "JSON files detected but they do not match a known export structure.",
    };
  }

  if (htmlFiles.length > 0) {
    const fbHint = htmlFiles.some(
      (f) => /facebook/i.test(f.text.slice(0, 5000)) || /facebook/i.test(f.path),
    );
    if (fbHint) {
      return {
        formatId: "facebook-html-limited",
        platform: "facebook",
        confidence: "medium",
        notes:
          "HTML export detected. Structured parsing of HTML archives is limited — download the JSON variant for complete preservation.",
      };
    }
  }

  return null;
}

export function looksLikeFbPosts(parsed: unknown): boolean {
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  const first = parsed[0];
  if (!first || typeof first !== "object") return false;
  const obj = first as Record<string, unknown>;
  return "title" in obj && "timestamp" in obj && "data" in obj;
}

export function looksLikeFbProfile(parsed: unknown): boolean {
  const arr = Array.isArray(parsed) ? parsed : null;
  if (arr && arr.length > 0) {
    const first = arr[0] as Record<string, unknown> | null;
    if (first && typeof first === "object" && "name" in first && "value" in first) return true;
    const inner = first && typeof first === "object" ? (first as any).profile_v2 : null;
    if (Array.isArray(inner)) return true;
  }
  if (parsed && typeof parsed === "object" && "profile_v2" in (parsed as object)) return true;
  return false;
}
