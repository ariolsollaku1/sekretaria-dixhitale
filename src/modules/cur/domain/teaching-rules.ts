// Pure teaching-assignment rules (CUR-04). No I/O.
import { MAX_HOURS } from "./course-rules";

export const TEACHING_KINDS = ["LECTURE", "SEMINAR", "LAB"] as const;
export type TeachingKind = (typeof TEACHING_KINDS)[number];

type Hours = { hoursLecture: number; hoursSeminar: number; hoursLab: number };

/** AC-3: the plan course's hours for the kind. */
export function defaultHours(planCourse: Hours, kind: TeachingKind): number {
  return kind === "LECTURE"
    ? planCourse.hoursLecture
    : kind === "SEMINAR"
      ? planCourse.hoursSeminar
      : planCourse.hoursLab;
}

export type AssignmentContext = {
  group: {
    active: boolean;
    yearOfStudy: number;
    cohortPlanId: string;
    yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
  };
  planCourse: { planId: string; yearOfStudy: number };
  staff: { active: boolean; kind: "ACADEMIC" | "ADMINISTRATIVE" };
};
export type AssignmentErrors = Partial<Record<"groupId" | "planCourseId" | "staffId", string>>;

/** AC-2: group open, course in the group's plan and year, lecturer active academic staff. */
export function validateAssignment(c: AssignmentContext): AssignmentErrors {
  const errors: AssignmentErrors = {};
  if (!c.group.active) errors.groupId = "groupInactive";
  else if (c.group.yearStatus === "CLOSED") errors.groupId = "yearClosed";
  if (
    c.planCourse.planId !== c.group.cohortPlanId ||
    c.planCourse.yearOfStudy !== c.group.yearOfStudy
  )
    errors.planCourseId = "courseNotInGroup";
  if (!c.staff.active) errors.staffId = "staffInactive";
  else if (c.staff.kind !== "ACADEMIC") errors.staffId = "staffNotAcademic";
  return errors;
}

export const validHours = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_HOURS;

/** AC-6: planned hours per lecturer. */
export function lecturerLoads(
  assignments: readonly { staffId: string; plannedHours: number }[],
): Map<string, number> {
  const loads = new Map<string, number>();
  for (const a of assignments) loads.set(a.staffId, (loads.get(a.staffId) ?? 0) + a.plannedHours);
  return loads;
}

/** AC-6: lecturers above the configured limit; no limit (null) means no warning. */
export function overloaded(
  loads: ReadonlyMap<string, number>,
  max: number | null,
): { staffId: string; hours: number }[] {
  if (max === null) return [];
  return [...loads.entries()]
    .filter(([, hours]) => hours > max)
    .map(([staffId, hours]) => ({ staffId, hours }))
    .sort((a, b) => b.hours - a.hours);
}

/** The setting `cur.teaching.maxPlannedHours`: a positive whole number, else off. */
export function resolveMaxPlannedHours(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export type CoveredCourse = { groupId: string; planCourseId: string };

/** AC-6: group × course pairs without any assignment. */
export function unassignedCourses(
  groupCourses: readonly CoveredCourse[],
  assignments: readonly CoveredCourse[],
): CoveredCourse[] {
  const covered = new Set(assignments.map((a) => `${a.groupId}:${a.planCourseId}`));
  return groupCourses.filter((g) => !covered.has(`${g.groupId}:${g.planCourseId}`));
}

export type CopySource = {
  programId: string;
  yearOfStudy: number;
  groupName: string;
  courseId: string;
  kind: TeachingKind;
  staffId: string;
  staffActive: boolean;
  plannedHours: number;
};
export type CopyTarget = {
  groupId: string;
  programId: string;
  yearOfStudy: number;
  groupName: string;
  planCourses: { id: string; courseId: string; semester: number }[];
  /** `${planCourseId}:${kind}:${staffId}` already assigned */
  existing: ReadonlySet<string>;
};
export type CopyRow = {
  groupId: string;
  planCourseId: string;
  staffId: string;
  kind: TeachingKind;
  semester: number;
  plannedHours: number;
};

/**
 * AC-5: for each target group, the source assignments of the group with the same name in the same
 * program and year of study, for the same course, kind and lecturer. Existing rows are skipped,
 * inactive lecturers are skipped and counted.
 */
export function planCopy(
  sources: readonly CopySource[],
  targets: readonly CopyTarget[],
): { rows: CopyRow[]; skippedExisting: number; skippedInactive: number } {
  const rows: CopyRow[] = [];
  let skippedExisting = 0;
  let skippedInactive = 0;
  for (const t of targets) {
    for (const s of sources) {
      if (
        s.programId !== t.programId ||
        s.yearOfStudy !== t.yearOfStudy ||
        s.groupName !== t.groupName
      )
        continue;
      const pc = t.planCourses.find((p) => p.courseId === s.courseId);
      if (!pc) continue;
      if (!s.staffActive) {
        skippedInactive += 1;
        continue;
      }
      if (t.existing.has(`${pc.id}:${s.kind}:${s.staffId}`)) {
        skippedExisting += 1;
        continue;
      }
      rows.push({
        groupId: t.groupId,
        planCourseId: pc.id,
        staffId: s.staffId,
        kind: s.kind,
        semester: pc.semester,
        plannedHours: s.plannedHours,
      });
    }
  }
  return { rows, skippedExisting, skippedInactive };
}
