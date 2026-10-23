// CUR-03: pure rules of the syllabus board and of carrying syllabi forward. No I/O.
export type SyllabusStatus = "DRAFT" | "APPROVED" | "ARCHIVED";
export type VersionInfo = { id: string; version: number; status: SyllabusStatus };

/** AC-2: versions are 1, 2, 3 … per plan course and year, archived ones included. */
export const nextSyllabusVersion = (versions: readonly number[]): number =>
  versions.length === 0 ? 1 : Math.max(...versions) + 1;

export type CellState = {
  state: "approved" | "draft" | "missing";
  /** the approved version, else the newest draft */
  current: VersionInfo | null;
  /** a draft waiting next to an approved version */
  draft: VersionInfo | null;
  versions: number;
};

/** AC-8: what the board shows for a plan course and year. */
export function cellState(versions: readonly VersionInfo[]): CellState {
  const approved = versions.find((v) => v.status === "APPROVED") ?? null;
  const drafts = versions.filter((v) => v.status === "DRAFT").sort((a, b) => b.version - a.version);
  const draft = drafts[0] ?? null;
  return {
    state: approved ? "approved" : draft ? "draft" : "missing",
    current: approved ?? draft,
    draft: approved ? draft : null,
    versions: versions.length,
  };
}

export type CarryCourse = { planCourseId: string; courseId: string; live: boolean };
export type CarrySource = { syllabusId: string; academicYearStart: string };
export type CarryPlan = {
  create: { planCourseId: string; sourceSyllabusId: string }[];
  skipped: { planCourseId: string; reason: "existing" | "noSource" }[];
};

/**
 * AC-7: for each course without a draft or approved syllabus in the target year (`live`), take the
 * latest approved syllabus of the same course from an earlier year. `sources` maps a course id to
 * its candidates (any program plan, any year); only those starting before `targetStart` count.
 */
export function planCarryForward(
  courses: readonly CarryCourse[],
  sources: ReadonlyMap<string, readonly CarrySource[]>,
  targetStart: string,
): CarryPlan {
  const plan: CarryPlan = { create: [], skipped: [] };
  for (const c of courses) {
    if (c.live) {
      plan.skipped.push({ planCourseId: c.planCourseId, reason: "existing" });
      continue;
    }
    const best = (sources.get(c.courseId) ?? [])
      .filter((s) => s.academicYearStart < targetStart)
      .sort((a, b) => b.academicYearStart.localeCompare(a.academicYearStart))[0];
    if (best) plan.create.push({ planCourseId: c.planCourseId, sourceSyllabusId: best.syllabusId });
    else plan.skipped.push({ planCourseId: c.planCourseId, reason: "noSource" });
  }
  return plan;
}
