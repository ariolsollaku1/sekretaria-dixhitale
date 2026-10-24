// CUR-07: pure rules of the approved-documents archive. No I/O.
export type PlanCandidate = {
  id: string;
  version: number;
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  /** start date (YYYY-MM-DD) of the plan's valid-from academic year */
  validFromStart: string;
};

/**
 * AC-6: the plan in force in a year is the approved or archived plan with the latest valid-from year
 * not after it; the highest version wins a tie. Drafts never count.
 */
export function planInForce<T extends PlanCandidate>(
  plans: readonly T[],
  yearStart: string,
): T | null {
  const eligible = plans.filter((p) => p.status !== "DRAFT" && p.validFromStart <= yearStart);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) =>
    p.validFromStart > best.validFromStart ||
    (p.validFromStart === best.validFromStart && p.version > best.version)
      ? p
      : best,
  );
}
