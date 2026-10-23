// Pure visibility rules (no I/O).
export type Lifecycle = {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishAt: Date | null;
  expiresAt: Date | null;
};

/** AC-3: readers see it from `publishAt` (inclusive) until `expiresAt` (exclusive). */
export function isLive(a: Lifecycle, now: Date): boolean {
  if (a.status !== "PUBLISHED" || !a.publishAt) return false;
  if (a.publishAt > now) return false;
  return !a.expiresAt || a.expiresAt > now;
}

export type Viewer = {
  /** has at least one role other than student */
  staff: boolean;
  /** has the student role */
  student: boolean;
  cycles: readonly ("FIRST" | "SECOND")[];
  programIds: readonly string[];
};

export type Targeting = {
  audience: "ALL" | "STAFF" | "STUDENTS" | "CYCLE" | "PROGRAM";
  cycle: "FIRST" | "SECOND" | null;
  programId: string | null;
};

/**
 * AC-5: staff see everything except student-only notices; a student sees ALL, STUDENTS and the
 * cycle/program notices the audience resolvers give them. A user can be both (e.g. staff who study).
 */
export function matchesViewer(t: Targeting, v: Viewer): boolean {
  switch (t.audience) {
    case "ALL":
      return true;
    case "STAFF":
      return v.staff;
    case "STUDENTS":
      return v.student || v.staff;
    case "CYCLE":
      return v.staff || (!!t.cycle && v.cycles.includes(t.cycle));
    case "PROGRAM":
      return v.staff || (!!t.programId && v.programIds.includes(t.programId));
  }
}
