/**
 * Shared API types used by both the Worker and the SPA.
 * Kept dependency-free so it can be imported anywhere.
 */

export type Role = "user" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export type AssetKind = "photo" | "video" | "document" | "post" | "screenshot" | "other";

export interface DigitalAsset {
  id: string;
  kind: AssetKind;
  title: string | null;
  description: string | null;
  platform: string | null;
  source: "upload" | "import" | "manual";
  originalFilename: string | null;
  mime: string | null;
  sizeBytes: number | null;
  takenAt: string | null;
  isImportant: boolean;
  tags: string[];
  createdAt: string;
  downloadUrl?: string;
}

export type CaseStatus =
  | "open"
  | "investigating"
  | "user_action_required"
  | "submitted_to_platform"
  | "waiting_for_platform"
  | "resolved"
  | "closed";

export const CASE_STATUSES: CaseStatus[] = [
  "open",
  "investigating",
  "user_action_required",
  "submitted_to_platform",
  "waiting_for_platform",
  "resolved",
  "closed",
];

export const PROBLEM_TYPES = [
  "hacked",
  "password_no_longer_works",
  "email_changed",
  "phone_changed_or_lost",
  "disabled",
  "locked",
  "cannot_complete_verification",
  "account_disappeared",
  "accidentally_deleted",
  "unknown",
  "other",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export interface RecoveryEvent {
  id: string;
  at: string;
  kind: string;
  actor: "user" | "system";
  title: string;
  body: string | null;
}

export interface EvidenceItem {
  id: string;
  originalFilename: string;
  sha256: string;
  mime: string | null;
  sizeBytes: number;
  source: string;
  category: string | null;
  description: string | null;
  uploadedAt: string;
  downloadUrl?: string;
}

export interface RecoveryCase {
  id: string;
  caseNumber: string;
  platform: string;
  problemType: ProblemType | string;
  status: CaseStatus;
  discoveredAt: string | null;
  lastKnownLoginAt: string | null;
  changedSummary: string | null;
  contextNotes: string | null;
  previousAttempts: number;
  createdAt: string;
  updatedAt: string;
  events?: RecoveryEvent[];
  evidence?: EvidenceItem[];
  packages?: { id: string; createdAt: string }[];
}

export interface PlatformResource {
  id: string;
  platform: string;
  title: string;
  url: string;
  purpose: string;
  region: string;
  status: "verified" | "unverified" | "retired";
  lastVerifiedAt: string;
  notes: string | null;
}

export interface ReadinessItem {
  id: string;
  label: string;
  weight: number;
  satisfied: boolean;
  detail: string;
}

export interface ReadinessReport {
  score: number; // 0..100
  status: "protected" | "action_required" | "needs_setup" | "emergency";
  checklist: ReadinessItem[];
}

export interface ImportSummary {
  id: string;
  platform: string;
  status: string;
  format: string | null;
  originalFilename: string | null;
  filesTotal: number;
  filesParsed: number;
  filesSkipped: number;
  assetsCreated: number;
  duplicatesSkipped: number;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
  notes?: string[];
  files?: { path: string; status: string; reason: string | null }[];
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SecurityEventRow {
  id: string;
  kind: string;
  details: string | null;
  at: string;
}

export interface ScamIndicator {
  id: string;
  label: string;
  matched: boolean;
  severity: "high" | "medium";
}

export interface ScamCheckResult {
  indicators: ScamIndicator[];
  riskLevel: "low" | "elevated" | "high";
  disclaimer: string;
}

/** A third-party web page returned by the Exa-backed Scam Shield web search. */
export interface WebSearchHit {
  title: string | null;
  url: string;
  publishedDate: string | null;
  author: string | null;
  /** Query-relevant passages from the page, verbatim. */
  highlights: string[];
}

export interface WebSearchResult {
  query: string;
  hits: WebSearchHit[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
