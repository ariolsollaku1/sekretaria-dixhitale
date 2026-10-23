import "server-only";
import { can } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { cellState, type CellState, type SyllabusStatus } from "../domain/syllabus-rules";
import { planWhere } from "./plan.queries";

/** AC-8/AC-9: whether the user sees drafts and archived versions of this program's syllabi. */
export const seesAllVersions = (user: { id: string }, programId: string) =>
  can(user, "cur.syllabus.read", { kind: "program", id: programId });

export type BoardRow = {
  planCourseId: string;
  yearOfStudy: number;
  semester: number;
  code: string;
  name: string;
  state: CellState["state"];
  approved: { id: string; fileId: string; version: number; approvedAt: Date | null } | null;
  draft: { id: string; fileId: string; version: number } | null;
  versions: number;
};

export type Board = {
  plan: {
    id: string;
    version: number;
    programId: string;
    programCode: string;
    programName: string;
  };
  rows: BoardRow[];
  missing: number;
  staff: boolean;
};

/** Plans that take syllabi and that this user may see: approved, within their plan visibility. */
export async function listSyllabusPlans(user: { id: string }) {
  const plans = await db.curriculumPlan.findMany({
    where: { AND: [{ status: "APPROVED" }, await planWhere(user)] },
    orderBy: [{ program: { code: "asc" } }, { version: "desc" }],
    select: {
      id: true,
      version: true,
      program: { select: { id: true, code: true, name: true } },
      validFrom: { select: { code: true } },
    },
  });
  return plans.map((p) => ({
    id: p.id,
    version: p.version,
    validFrom: p.validFrom.code,
    programId: p.program.id,
    programCode: p.program.code,
    programName: p.program.name,
  }));
}

/** AC-8: each plan course with the state of its syllabus in the year; null when the plan is not visible. */
export async function board(
  user: { id: string },
  planId: string,
  academicYearId: string,
): Promise<Board | null> {
  const plan = await db.curriculumPlan.findFirst({
    where: { AND: [{ id: planId, status: "APPROVED" }, await planWhere(user)] },
    select: {
      id: true,
      version: true,
      program: { select: { id: true, code: true, name: true } },
      courses: {
        orderBy: [{ yearOfStudy: "asc" }, { semester: "asc" }, { course: { code: "asc" } }],
        select: {
          id: true,
          yearOfStudy: true,
          semester: true,
          course: { select: { code: true, name: true } },
          syllabi: {
            where: { academicYearId },
            select: { id: true, fileId: true, version: true, status: true, approvedAt: true },
          },
        },
      },
    },
  });
  if (!plan) return null;
  const staff = await seesAllVersions(user, plan.program.id);
  const rows: BoardRow[] = plan.courses.map((pc) => {
    const visible = staff ? pc.syllabi : pc.syllabi.filter((s) => s.status === "APPROVED");
    const cell = cellState(
      visible.map((s) => ({ id: s.id, version: s.version, status: s.status })),
    );
    const byId = new Map(visible.map((s) => [s.id, s]));
    const approved = cell.state === "approved" ? byId.get(cell.current!.id)! : null;
    const draftSource = cell.state === "draft" ? cell.current : cell.draft;
    const draft = draftSource ? byId.get(draftSource.id)! : null;
    return {
      planCourseId: pc.id,
      yearOfStudy: pc.yearOfStudy,
      semester: pc.semester,
      code: pc.course.code,
      name: pc.course.name,
      state: cell.state,
      approved: approved && {
        id: approved.id,
        fileId: approved.fileId,
        version: approved.version,
        approvedAt: approved.approvedAt,
      },
      draft: draft && { id: draft.id, fileId: draft.fileId, version: draft.version },
      versions: cell.versions,
    };
  });
  return {
    plan: {
      id: plan.id,
      version: plan.version,
      programId: plan.program.id,
      programCode: plan.program.code,
      programName: plan.program.name,
    },
    rows,
    missing: rows.filter((r) => r.state !== "approved").length,
    staff,
  };
}

export type HistoryEntry = {
  id: string;
  version: number;
  status: SyllabusStatus;
  fileId: string;
  fileName: string;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
};

/** AC-6: every version of a course and year, newest first; staff with `read` on the program only. */
export async function history(
  user: { id: string },
  planCourseId: string,
  academicYearId: string,
  client: Pick<Tx, "syllabus" | "storedFile" | "user" | "planCourse"> = db,
) {
  const pc = await client.planCourse.findUnique({
    where: { id: planCourseId },
    select: {
      plan: { select: { programId: true, version: true, program: { select: { code: true } } } },
      course: { select: { code: true, name: true } },
    },
  });
  if (!pc || !(await seesAllVersions(user, pc.plan.programId))) return null;
  const rows = await client.syllabus.findMany({
    where: { planCourseId, academicYearId },
    orderBy: { version: "desc" },
  });
  const files = await client.storedFile.findMany({
    where: { id: { in: rows.map((r) => r.fileId) } },
    select: { id: true, fileName: true },
  });
  const names = new Map(files.map((f) => [f.id, f.fileName]));
  const userIds = [...new Set(rows.flatMap((r) => [r.createdById, r.approvedById]))].filter(
    (x): x is string => !!x,
  );
  const users = await client.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const who = new Map(users.map((u) => [u.id, u.name]));
  const entries: HistoryEntry[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    fileId: r.fileId,
    fileName: names.get(r.fileId) ?? "",
    notes: r.notes,
    createdAt: r.createdAt,
    createdBy: (r.createdById && who.get(r.createdById)) || null,
    approvedAt: r.approvedAt,
    approvedBy: (r.approvedById && who.get(r.approvedById)) || null,
  }));
  return {
    course: pc.course,
    programCode: pc.plan.program.code,
    planVersion: pc.plan.version,
    entries,
  };
}
