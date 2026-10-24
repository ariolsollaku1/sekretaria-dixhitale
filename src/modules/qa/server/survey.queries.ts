import "server-only";
import { db, type Tx } from "@/lib/db";
import { parseQuestions, questionsOf, type Question, type Section } from "../domain/question-rules";

type Client = Pick<Tx, "user" | "student" | "yearRegistration" | "teachingAssignment">;

/** The student record of a user (null for users without one). */
export async function ownStudentId(userId: string, client: Client = db): Promise<string | null> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return null;
  const s = await client.student.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  return s?.id ?? null;
}

export const ADMIN_TARGET = "ADMIN";

export type SurveyTarget = {
  /** the assignment id, or "ADMIN" */
  target: string;
  section: Section;
  courseCode: string | null;
  courseName: string | null;
  kind: "LECTURE" | "SEMINAR" | "LAB" | null;
  lecturer: string | null;
};

/** Groups the student is registered in (active enrollment) in the year. */
async function activeGroups(studentId: string, academicYearId: string, client: Client) {
  const rows = await client.yearRegistration.findMany({
    where: { academicYearId, enrollment: { studentId, status: "ACTIVE" } },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** AC-4/AC-6 (Q-105): the assignments of the student's groups, then the administration. */
export async function targetsOf(
  studentId: string,
  academicYearId: string,
  questions: Question[],
  client: Client = db,
): Promise<SurveyTarget[]> {
  const groups = await activeGroups(studentId, academicYearId, client);
  if (groups.length === 0) return [];
  const out: SurveyTarget[] = [];
  if (questionsOf(questions, "LECTURER").length > 0) {
    const rows = await client.teachingAssignment.findMany({
      where: { groupId: { in: groups } },
      select: {
        id: true,
        kind: true,
        planCourse: { select: { course: { select: { code: true, name: true } } } },
        staff: { select: { person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ semester: "asc" }, { kind: "asc" }],
    });
    for (const a of rows)
      out.push({
        target: a.id,
        section: "LECTURER",
        courseCode: a.planCourse.course.code,
        courseName: a.planCourse.course.name,
        kind: a.kind,
        lecturer: `${a.staff.person.lastName} ${a.staff.person.firstName}`,
      });
  }
  if (questionsOf(questions, "ADMINISTRATION").length > 0)
    out.push({
      target: ADMIN_TARGET,
      section: "ADMINISTRATION",
      courseCode: null,
      courseName: null,
      kind: null,
      lecturer: null,
    });
  return out;
}

export type OpenSurvey = {
  campaignId: string;
  campaignName: string;
  yearCode: string;
  targets: (SurveyTarget & { done: boolean })[];
};

/** AC-4: open campaigns with the surveys of the student, done or not. Null without a student record. */
export async function ownSurveys(userId: string): Promise<OpenSurvey[] | null> {
  const studentId = await ownStudentId(userId);
  if (!studentId) return null;
  const campaigns = await db.evalCampaign.findMany({
    where: { status: "OPEN" },
    include: { academicYear: { select: { code: true } } },
    orderBy: { openedAt: "desc" },
  });
  const result: OpenSurvey[] = [];
  for (const c of campaigns) {
    const targets = await targetsOf(studentId, c.academicYearId, parseQuestions(c.questions));
    if (targets.length === 0) continue;
    const done = new Set(
      (
        await db.evalParticipation.findMany({
          where: { campaignId: c.id, studentId },
          select: { targetKey: true },
        })
      ).map((p) => p.targetKey),
    );
    result.push({
      campaignId: c.id,
      campaignName: c.name,
      yearCode: c.academicYear.code,
      targets: targets.map((t) => ({ ...t, done: done.has(t.target) })),
    });
  }
  return result;
}

export type SurveyForm = {
  campaignId: string;
  campaignName: string;
  target: SurveyTarget;
  questions: Question[];
};

/** AC-5/AC-6: the questionnaire of one target, only while open, not yet answered and the student's own. */
export async function surveyForm(
  userId: string,
  campaignId: string,
  target: string,
): Promise<SurveyForm | null> {
  const studentId = await ownStudentId(userId);
  if (!studentId) return null;
  const c = await db.evalCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "OPEN") return null;
  const questions = parseQuestions(c.questions);
  const t = (await targetsOf(studentId, c.academicYearId, questions)).find(
    (x) => x.target === target,
  );
  if (!t) return null;
  const done = await db.evalParticipation.count({
    where: { campaignId, studentId, targetKey: target },
  });
  if (done > 0) return null;
  return {
    campaignId,
    campaignName: c.name,
    target: t,
    questions: questionsOf(questions, t.section),
  };
}
