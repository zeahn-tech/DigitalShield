/**
 * Defensive Facebook export parsers.
 *
 * Facebook's "Download Your Information" format is not formally specified and
 * has changed repeatedly (folder names, wrapper objects, field names). Every
 * parser here therefore:
 *  - accepts several known historical shapes,
 *  - never throws on missing/renamed fields (returns what it can),
 *  - reports what it could NOT parse instead of silently dropping data.
 */
import type { IncomingFile } from "./detect";
import { looksLikeFbPosts, looksLikeFbProfile } from "./detect";

export interface ParsedAssetDraft {
  kind: "photo" | "video" | "document" | "post" | "other";
  title: string | null;
  description: string | null;
  platform: string;
  sourcePath: string;
  takenAt: string | null;
  /** Stable identity for duplicate detection within/between imports. */
  dedupeKey: string;
  /** Optional remote-ish reference (archive uri field); not fetched. */
  refUri?: string;
}

export interface ParsedProfile {
  name?: string;
  username?: string;
  profileUrl?: string;
  accountId?: string;
  recoveryEmail?: string;
  phone?: string;
}

export interface ParseResult {
  assets: ParsedAssetDraft[];
  profile: ParsedProfile | null;
  parsedFiles: number;
  skippedFiles: number;
  skippedReasons: { path: string; reason: string }[];
}

export function parseFacebookArchive(files: IncomingFile[]): ParseResult {
  const result: ParseResult = {
    assets: [],
    profile: null,
    parsedFiles: 0,
    skippedFiles: 0,
    skippedReasons: [],
  };

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!lower.endsWith(".json")) continue; // non-JSON handled by caller (html limited pass)
    try {
      const parsed: unknown = JSON.parse(file.text);
      const before = result.assets.length;
      let recognized = false;

      if (looksLikeFbProfile(parsed)) {
        const profile = parseProfile(parsed);
        if (profile && (!result.profile || Object.keys(profile).length > Object.keys(result.profile ?? {}).length)) {
          result.profile = { ...result.profile, ...profile };
        }
        recognized = true;
      }
      if (looksLikeFbPosts(parsed)) {
        result.assets.push(...parsePosts(parsed, file.path));
        recognized = true;
      }
      // Media metadata files: arrays of objects with uri/creation_timestamp.
      const media = parseMediaArray(parsed, file.path);
      if (media.length > 0) {
        result.assets.push(...media);
        recognized = true;
      }

      if (recognized && (result.assets.length > before || result.profile)) {
        result.parsedFiles++;
      } else {
        result.skippedFiles++;
        result.skippedReasons.push({
          path: file.path,
          reason: "Unrecognized JSON structure — your file was listed but not imported.",
        });
      }
    } catch {
      result.skippedFiles++;
      result.skippedReasons.push({
        path: file.path,
        reason: "File is not valid JSON — it was listed but not imported.",
      });
    }
  }
  return result;
}

/** posts_v2-style: [{ title, timestamp, data: [{ post: { text, timestamp, ... } }] }] */
export function parsePosts(parsed: unknown, sourcePath: string): ParsedAssetDraft[] {
  if (!Array.isArray(parsed)) return [];
  const drafts: ParsedAssetDraft[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title : null;
    const ts = typeof e.timestamp === "number" ? e.timestamp : null;
    const data = Array.isArray(e.data) ? e.data : [];
    const texts: string[] = [];
    for (const d of data) {
      const post = d && typeof d === "object" ? (d as any).post : null;
      if (post && typeof post === "object") {
        if (typeof post.text === "string") texts.push(post.text);
        // Attachments may carry media references.
        const attachments = post.attachments?.data;
        if (Array.isArray(attachments)) {
          for (const att of attachments) {
            const media = att?.media?.uri;
            if (typeof media === "string") {
              drafts.push(mediaDraft(media, post.timestamp ?? ts, sourcePath));
            }
          }
        }
      }
    }
    const body = texts.join("\n\n").trim();
    if (title || body) {
      drafts.push({
        kind: "post",
        title: title ?? body.slice(0, 80),
        description: body || null,
        platform: "facebook",
        sourcePath,
        takenAt: ts ? fromFbTimestamp(ts) : null,
        dedupeKey: `post:${sourcePath}:${ts ?? ""}:${hashString((title ?? "") + body)}`,
      });
    }
  }
  return drafts;
}

/**
 * Generic media-metadata array: objects with `uri` and/or
 * `creation_timestamp`/`taken_timestamp`, including nested media arrays.
 */
export function parseMediaArray(parsed: unknown, sourcePath: string): ParsedAssetDraft[] {
  const drafts: ParsedAssetDraft[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || drafts.length > 5000) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const uri = typeof obj.uri === "string" ? obj.uri : typeof obj.path === "string" ? obj.path : null;
    if (uri && /\.(jpe?g|png|gif|webp|heic|mp4|mov)(\?|$)/i.test(uri)) {
      const ts =
        (typeof obj.creation_timestamp === "number" ? obj.creation_timestamp : null) ??
        (typeof obj.taken_timestamp === "number" ? obj.taken_timestamp : null) ??
        (typeof obj.timestamp === "number" ? obj.timestamp : null);
      drafts.push(mediaDraft(uri, ts, sourcePath));
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  try {
    visit(parsed, 0);
  } catch {
    /* defensive: never let one bad node kill the import */
  }
  return drafts;
}

function mediaDraft(uri: string, ts: number | null, sourcePath: string): ParsedAssetDraft {
  const isVideo = /\.mov(\?|$)/i.test(uri) || /\.mp4(\?|$)/i.test(uri);
  const name = uri.split("/").pop()?.split("?")[0] ?? uri;
  return {
    kind: isVideo ? "video" : "photo",
    title: name,
    description: null,
    platform: "facebook",
    sourcePath,
    takenAt: ts ? fromFbTimestamp(ts) : null,
    dedupeKey: `media:${uri}`,
    refUri: uri,
  };
}

/** profile_v2 / personal_information shapes. */
export function parseProfile(parsed: unknown): ParsedProfile | null {
  const values = new Map<string, string>();
  const collect = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.name === "string" && o.value !== undefined) {
        const v =
          typeof o.value === "object" && o.value !== null
            ? JSON.stringify(o.value)
            : String(o.value);
        values.set(o.name.toLowerCase(), v.slice(0, 500));
      }
    }
  };
  if (Array.isArray(parsed)) collect(parsed);
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.profile_v2)) collect(o.profile_v2);
    if (Array.isArray(o.personal_information)) collect(o.personal_information);
  }
  if (values.size === 0) return null;

  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = values.get(k);
      if (v) return v;
    }
    return undefined;
  };
  const profileUrl = pick("profile uri", "profile_uri", "profile url", "url");
  return {
    name: pick("name", "full name"),
    username: pick("username", "user name"),
    profileUrl,
    accountId: pick("user id", "user id fb", "account id"),
    recoveryEmail: pick("email", "primary email", "emails"),
    phone: pick("phone number", "mobile number", "phone"),
  };
}

function fromFbTimestamp(ts: number): string {
  // Facebook timestamps are unix seconds; some exports use milliseconds.
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
