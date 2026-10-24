import "server-only";
import type { Answers } from "../domain/question-rules";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { getOwnStaffId } from "@/modules/hr";
import { parseQuestions, questionsOf } from "../domain/question-rules";
import { pool, resolveMinResponses, summarize, type TargetResult } from "../domain/result-rules";
import { ADMIN_TARGET } from "./survey.queries";

type User = { id: string };

/** The setting `qa.minResponses` (Q-106). */
export async function getMinResponses(): Promise<number> {
  const row = await db.systemSetting.findUnique({ where: { key: "qa.minResponses" } });
  return resolveMinResponses(row?.value);
}

export type ResultCampaign = { id: string; name: string; yearCode: string };

/** AC-8: results exist only for closed campaigns; the caller has checked a result permission. */
export async function listResultCampaigns(): Promise<ResultCampaign[]> {
  const rows = await db.evalCampaign.findMany({
    where: { status: "CLOSED" },
    include: { academicYear: { select: { code: true, startDate: true } } },
    orderBy: [{ academicYear: { startDate: "desc" } }, { name: "asc" }],
  });
  return rows.map((c) => ({ id: c.id, name: c.name, yearCode: c.academicYear.code }));
}

export type AssignmentResultRow = {
  target: string;
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  group: string;
  lecturer: string;
  departmentCode: string;
  departmentName: string;
  result: TargetResult;
};

export type DepartmentResultRow = { code: string; name: string; result: TargetResult };

export type CampaignResults = {
  id: string;
  name: string;
  yearCode: string;
  minResponses: number;
  /** AC-11: the quality officer's extras */
  institution: boolean;
  rows: AssignmentResultRow[];
  departments: DepartmentResultRow[];
  administration: TargetResult | null;
};

type Viewer = { institution: boolean; read: boolean; staffId: string | null };

async function viewerOf(user: User): Promise<Viewer | null> {
  const institution = await can(user, "qa.campaign.manage");
  const read = institution || (await can(user, "qa.result.read"));
  const self = !institution && (await can(user, "qa.result.self"));
  const staffId = self ? await getOwnStaffId(user.id) : null;
  if (!read && !staffId) return null;
  return { institution, read, staffId };
}

const assignmentInclude = {
  group: {
    select: {
      name: true,
      cohort: {
        select: {
          name: true,
          program: {
            select: { code: true, department: { select: { code: true, name: true } } },
          },
        },
      },
    },
  },
  planCourse: { select: { course: { select: { code: true, name: true } } } },
  staff: { select: { person: { select: { firstName: true, lastName: true } } } },
} as const;

/**
 * AC-11: may this viewer see the results of the assignment? The quality officer all; a reader by
 * the scope of the group; a lecturer their own.
 */
async function mayView(
  user: User,
  v: Viewer,
  a: { staffId: string; groupId: string },
  cache: Map<string, boolean>,
) {
  if (v.institution) return true;
  if (v.staffId && a.staffId === v.staffId) return true;
  if (!v.read) return false;
  let ok = cache.get(a.groupId);
  if (ok === undefined) {
    ok = await can(user, "qa.result.read", { kind: "group", id: a.groupId });
    cache.set(a.groupId, ok);
  }
  return ok;
}

/** AC-8..AC-11: the results of a closed campaign as far as the viewer may see them. */
export async function campaignResults(
  user: User,
  campaignId: string,
): Promise<CampaignResults | null> {
  const viewer = await viewerOf(user);
  if (!viewer) return null;
  const c = await db.evalCampaign.findUnique({
    where: { id: campaignId },
    include: { academicYear: { select: { code: true } } },
  });
  if (!c || c.status !== "CLOSED") return null;
  const questions = parseQuestions(c.questions);
  const lecturerQuestions = questionsOf(questions, "LECTURER");
  const min = await getMinResponses();

  const assignments = await db.teachingAssignment.findMany({
    where: { group: { academicYearId: c.academicYearId } },
    include: assignmentInclude,
    orderBy: [{ planCourse: { course: { code: "asc" } } }, { kind: "asc" }],
  });
  const responses = await db.evalResponse.findMany({
    where: { campaignId: c.id, section: "LECTURER" },
    select: { assignmentId: true, answers: true },
  });
  const byAssignment = new Map<string, Answers[]>();
  for (const r of responses) {
    if (!r.assignmentId) continue;
    const list = byAssignment.get(r.assignmentId) ?? [];
    list.push(r.answers as Answers);
    byAssignment.set(r.assignmentId, list);
  }

  const cache = new Map<string, boolean>();
  const rows: AssignmentResultRow[] = [];
  const perDepartment = new Map<string, { name: string; sheets: Answers[][] }>();
  for (const a of assignments) {
    if (!(await mayView(user, viewer, a, cache))) continue;
    const sheets = byAssignment.get(a.id) ?? [];
    const dept = a.group.cohort.program.department;
    rows.push({
      target: a.id,
      courseCode: a.planCourse.course.code,
      courseName: a.planCourse.course.name,
      kind: a.kind,
      group: `${a.group.cohort.program.code} · ${a.group.cohort.name} · ${a.group.name}`,
      lecturer: `${a.staff.person.lastName} ${a.staff.person.firstName}`,
      departmentCode: dept.code,
      departmentName: dept.name,
      result: stripComments(summarize(lecturerQuestions, sheets, min), viewer.institution),
    });
    const bucket = perDepartment.get(dept.code) ?? { name: dept.name, sheets: [] };
    bucket.sheets.push(sheets);
    perDepartment.set(dept.code, bucket);
  }

  let departments: DepartmentResultRow[] = [];
  let administration: TargetResult | null = null;
  if (viewer.institution) {
    // roll-ups pool the answers: a mean of means would weigh a small class like a large one
    departments = [...perDepartment.entries()]
      .map(([code, d]) => ({
        code,
        name: d.name,
        result: stripComments(summarize(lecturerQuestions, pool(d.sheets), min), true),
      }))
      .sort((x, y) => x.code.localeCompare(y.code));
    const adminSheets = (
      await db.evalResponse.findMany({
        where: { campaignId: c.id, section: "ADMINISTRATION" },
        select: { answers: true },
      })
    ).map((r) => r.answers as Answers);
    administration = summarize(questionsOf(questions, "ADMINISTRATION"), adminSheets, min);
  }
  return {
    id: c.id,
    name: c.name,
    yearCode: c.academicYear.code,
    minResponses: min,
    institution: viewer.institution,
    rows,
    departments,
    administration,
  };
}

/** Q-107: comments are for the quality officer only. */
function stripComments(r: TargetResult, institution: boolean): TargetResult {
  return r.withheld || institution ? r : { ...r, comments: [] };
}

export type TargetDetail = {
  campaignId: string;
  campaignName: string;
  title: {
    courseCode: string;
    courseName: string;
    kind: "LECTURE" | "SEMINAR" | "LAB";
    group: string;
    lecturer: string;
  } | null;
  result: TargetResult;
};

/** AC-9, AC-11: the figures per question of one target (an assignment id or "ADMIN"). */
export async function targetResults(
  user: User,
  campaignId: string,
  target: string,
): Promise<TargetDetail | null> {
  const viewer = await viewerOf(user);
  if (!viewer) return null;
  const c = await db.evalCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "CLOSED") return null;
  const questions = parseQuestions(c.questions);
  const min = await getMinResponses();
  if (target === ADMIN_TARGET) {
    if (!viewer.institution) return null;
    const sheets = (
      await db.evalResponse.findMany({
        where: { campaignId, section: "ADMINISTRATION" },
        select: { answers: true },
      })
    ).map((r) => r.answers as Answers);
    return {
      campaignId,
      campaignName: c.name,
      title: null,
      result: summarize(questionsOf(questions, "ADMINISTRATION"), sheets, min),
    };
  }
  const a = await db.teachingAssignment.findFirst({
    where: { id: target, group: { academicYearId: c.academicYearId } },
    include: assignmentInclude,
  });
  if (!a || !(await mayView(user, viewer, a, new Map()))) return null;
  const sheets = (
    await db.evalResponse.findMany({
      where: { campaignId, assignmentId: a.id, section: "LECTURER" },
      select: { answers: true },
    })
  ).map((r) => r.answers as Answers);
  return {
    campaignId,
    campaignName: c.name,
    title: {
      courseCode: a.planCourse.course.code,
      courseName: a.planCourse.course.name,
      kind: a.kind,
      group: `${a.group.cohort.program.code} · ${a.group.cohort.name} · ${a.group.name}`,
      lecturer: `${a.staff.person.lastName} ${a.staff.person.firstName}`,
    },
    result: stripComments(
      summarize(questionsOf(questions, "LECTURER"), sheets, min),
      viewer.institution,
    ),
  };
}
