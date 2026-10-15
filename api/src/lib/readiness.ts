/**
 * Recovery readiness scoring.
 *
 * Every point comes from a measurable, user-visible criterion. The score is
 * the sum of satisfied checklist weights (max 100). No invented or
 * unexplainable scoring — the UI renders this exact checklist so users can
 * see precisely why they have their status.
 */
import type { ReadinessItem, ReadinessReport, ReadinessReport as RR } from "../../../shared/types";

export interface ReadinessInput {
  hasIdentity: boolean; // platform account with recovery email or phone
  hasProfile: boolean; // platform account with username or profile URL
  photoCount: number;
  videoCount: number;
  documentCount: number;
  importantCount: number;
  evidenceCount: number;
  hasCase: boolean;
  lastImportAt: string | null;
  now?: Date;
}

const RECENT_BACKUP_DAYS = 30;

export function computeReadiness(input: ReadinessInput, hasOpenEmergency = false): RR {
  const now = input.now ?? new Date();
  const lastImport = input.lastImportAt ? new Date(input.lastImportAt) : null;
  const recentBackup =
    lastImport !== null && now.getTime() - lastImport.getTime() < RECENT_BACKUP_DAYS * 86_400_000;

  const checklist: ReadinessItem[] = [
    {
      id: "identity",
      label: "Identity information",
      weight: 20,
      satisfied: input.hasIdentity,
      detail: input.hasIdentity
        ? "You have recovery contact information stored for at least one platform account."
        : "Add recovery email or phone for at least one platform account in Platforms.",
    },
    {
      id: "profile",
      label: "Profile information",
      weight: 10,
      satisfied: input.hasProfile,
      detail: input.hasProfile
        ? "Username or profile URL is recorded."
        : "Record a username or profile URL for at least one platform account.",
    },
    {
      id: "photos",
      label: "Photos preserved",
      weight: 20,
      satisfied: input.photoCount >= 10 || input.importantCount > 0,
      detail:
        input.photoCount >= 10
          ? `${input.photoCount.toLocaleString()} photos are preserved in your vault.`
          : `Only ${input.photoCount.toLocaleString()} photos preserved — import an archive or upload important photos (10+ recommended).`,
    },
    {
      id: "videos_docs",
      label: "Videos & documents",
      weight: 10,
      satisfied: input.videoCount > 0 || input.documentCount > 0,
      detail:
        input.videoCount > 0 || input.documentCount > 0
          ? `${input.videoCount} videos and ${input.documentCount} documents preserved.`
          : "No videos or documents preserved yet.",
    },
    {
      id: "evidence",
      label: "Recovery documentation",
      weight: 15,
      satisfied: input.evidenceCount > 0 || input.hasCase,
      detail:
        input.evidenceCount > 0 || input.hasCase
          ? `Recovery documentation on file (${input.evidenceCount} evidence items).`
          : "No recovery case or evidence preserved yet — start an emergency case or add evidence.",
    },
    {
      id: "recent_backup",
      label: "Recent backup",
      weight: 15,
      satisfied: recentBackup,
      detail: recentBackup
        ? `Last import ${lastImport ? lastImport.toISOString().slice(0, 10) : ""} (within ${RECENT_BACKUP_DAYS} days).`
        : `No import in the last ${RECENT_BACKUP_DAYS} days — download a fresh archive from your platform.`,
    },
    {
      id: "emergency_contact",
      label: "Emergency contact",
      weight: 10,
      satisfied: input.hasIdentity && input.hasProfile,
      detail:
        input.hasIdentity && input.hasProfile
          ? "Identity and profile information are complete enough for an emergency."
          : "Complete identity and profile information so you can prove ownership during recovery.",
    },
  ];

  const score = checklist.reduce((sum, i) => sum + (i.satisfied ? i.weight : 0), 0);
  let status: ReadinessReport["status"];
  if (hasOpenEmergency) status = "emergency";
  else if (score >= 80) status = "protected";
  else if (score >= 40) status = "action_required";
  else status = "needs_setup";

  return { score, status, checklist };
}
