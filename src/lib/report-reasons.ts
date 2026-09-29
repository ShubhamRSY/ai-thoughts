/** Report reasons: one list for the report routes and every report menu. */
export const CHILD_SAFETY = "Child safety";

export const REPORT_REASONS = [
  CHILD_SAFETY,
  "Hate or harassment",
  "Unsafe or explicit",
  "Spam or coordinated accounts",
  "Misleading or fake story",
  "Sounds AI-generated",
  "Impersonation",
  "Harms someone",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(v: unknown): v is ReportReason {
  return (REPORT_REASONS as readonly unknown[]).includes(v);
}
