import "server-only";
import { db } from "@/lib/db";
import { parseQuestions, questionsOf, type Question } from "../domain/question-rules";
import { ADMIN_TARGET } from "./survey.queries";

export type CampaignRow = {
  id: string;
  name: string;
  yearId: string;
  yearCode: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  questions: number;
};

/** AC-1: all campaigns, newest first (the caller checks `qa.campaign.manage`). */
export async function listCampaigns(): Promise<CampaignRow[]> {
  const rows = await db.evalCampaign.findMany({
    include: { academicYear: { select: { code: true, startDate: true } } },
    orderBy: [{ academicYear: { startDate: "desc" } }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    yearId: c.academicYearId,
    yearCode: c.academicYear.code,
    status: c.status,
    questions: parseQuestions(c.questions).length,
  }));
}

export type ParticipationRow = {
  target: string;
  /** null for the administration */
  courseCode: string | null;
  courseName: string | null;
  kind: "LECTURE" | "SEMINAR" | "LAB" | null;
  group: string | null;
  lecturer: string | null;
  eligible: number;
  answered: number;
};

export type CampaignDetail = CampaignRow & {
  questionList: Question[];
  openedAt: Date | null;
  closedAt: Date | null;
  participation: ParticipationRow[];
};

/** AC-10: how many of the eligible students answered each target: counts only, never who or what. */
export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const c = await db.evalCampaign.findUnique({
    where: { id },
    include: { academicYear: { select: { code: true } } },
  });
  if (!c) return null;
  const questions = parseQuestions(c.questions);
  const participation: ParticipationRow[] = [];
  if (c.status !== "DRAFT") {
    const registrations = await db.yearRegistration.groupBy({
      by: ["groupId"],
      where: { academicYearId: c.academicYearId, enrollment: { status: "ACTIVE" } },
      _count: { _all: true },
    });
    const eligibleOfGroup = new Map(registrations.map((r) => [r.groupId, r._count._all]));
    const answeredOf = new Map(
      (
        await db.evalParticipation.groupBy({
          by: ["targetKey"],
          where: { campaignId: c.id },
          _count: { _all: true },
        })
      ).map((p) => [p.targetKey, p._count._all]),
    );
    if (questionsOf(questions, "LECTURER").length > 0) {
      const assignments = await db.teachingAssignment.findMany({
        where: { group: { academicYearId: c.academicYearId } },
        select: {
          id: true,
          kind: true,
          groupId: true,
          group: {
            select: {
              name: true,
              cohort: { select: { name: true, program: { select: { code: true } } } },
            },
          },
          planCourse: { select: { course: { select: { code: true, name: true } } } },
          staff: { select: { person: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: [{ planCourse: { course: { code: "asc" } } }, { kind: "asc" }],
      });
      for (const a of assignments)
        participation.push({
          target: a.id,
          courseCode: a.planCourse.course.code,
          courseName: a.planCourse.course.name,
          kind: a.kind,
          group: `${a.group.cohort.program.code} · ${a.group.cohort.name} · ${a.group.name}`,
          lecturer: `${a.staff.person.lastName} ${a.staff.person.firstName}`,
          eligible: eligibleOfGroup.get(a.groupId) ?? 0,
          answered: answeredOf.get(a.id) ?? 0,
        });
    }
    if (questionsOf(questions, "ADMINISTRATION").length > 0) {
      const all = [...eligibleOfGroup.values()].reduce((s, n) => s + n, 0);
      participation.push({
        target: ADMIN_TARGET,
        courseCode: null,
        courseName: null,
        kind: null,
        group: null,
        lecturer: null,
        eligible: all,
        answered: answeredOf.get(ADMIN_TARGET) ?? 0,
      });
    }
  }
  return {
    id: c.id,
    name: c.name,
    yearId: c.academicYearId,
    yearCode: c.academicYear.code,
    status: c.status,
    questions: questions.length,
    questionList: questions,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    participation,
  };
}
