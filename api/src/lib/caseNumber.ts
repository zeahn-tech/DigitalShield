/** Recovery case number generation: DS-<CODE>-<YEAR>-<SEQUENCE> */
import { PLATFORM_CODES } from "./platforms";

export function caseNumber(platform: string, year: number, sequence: number): string {
  const code = PLATFORM_CODES[platform] ?? platform.slice(0, 2).toUpperCase();
  return `DS-${code}-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Allocate the next case number for a platform/year inside a transaction-ish
 * pair of statements. D1 lacks explicit transactions across .bind chains in a
 * single statement, so we rely on a UNIQUE index retry loop for correctness
 * under concurrency.
 */
export async function allocateCaseNumber(db: D1Database, platform: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const code = PLATFORM_CODES[platform] ?? platform.slice(0, 2).toUpperCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .prepare(
        `SELECT COALESCE(MAX(CAST(substr(case_number, -6) AS INTEGER)), 0) AS maxseq
         FROM recovery_cases WHERE case_number LIKE ?`,
      )
      .bind(`DS-${code}-${year}-%`)
      .first<{ maxseq: number }>();
    const next = (row?.maxseq ?? 0) + 1;
    const candidate = caseNumber(platform, year, next);
    const existing = await db
      .prepare("SELECT 1 FROM recovery_cases WHERE case_number = ?")
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }
  // Extremely unlikely; fall back to a random suffix that still fits the format.
  return `DS-${code}-${year}-${String(Math.floor(Math.random() * 999999)).padStart(6, "0")}`;
}
