/** Human-readable labels for enum values (mirrors shared/types.ts). */
import { PROBLEM_TYPES } from "@shared/types";

export const PROBLEM_TYPE_LABELS: Record<string, string> = {
  hacked: "My account was hacked",
  password_no_longer_works: "My password no longer works",
  email_changed: "My email was changed",
  phone_changed_or_lost: "My phone number was changed or lost",
  disabled: "My account was disabled",
  locked: "My account is locked",
  cannot_complete_verification: "I cannot complete verification",
  account_disappeared: "My account appears to have disappeared",
  accidentally_deleted: "I accidentally deleted my account",
  unknown: "I don't know what happened",
  other: "Other",
};

export { PROBLEM_TYPES };
