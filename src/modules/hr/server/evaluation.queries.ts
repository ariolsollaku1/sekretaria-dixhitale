import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { localize, type FormDefinitionJson } from "@/lib/forms/definition";
import { visibleFields } from "@/lib/forms/answers";
import { getFormById, type ServedForm } from "@/lib/forms/queries";
import { aggregate, type ReportGroup, type ReportLevel } from "../domain/evaluation-rules";
import { getOwnStaffId } from "./staff-lookup";

const toDay = (d: Date) => d.toISOString().slice(0, 10);

/** AC-8: institution-wide readers see everything, others the staff of their departments / faculties. */
export async function evaluationScopeWhere(user: {
  id: string;
}): Promise<Prisma.EvaluationWhereInput> {
  const g = await grantScopes(user, "hr.evaluation.read");
  if (g.institution) return {};
  return {
    staff: {
      OR: [
        { departmentId: { in: g.departmentIds } },
        { department: { facultyId: { in: g.facultyIds } } },
      ],
    },
  };
}

export type CampaignRow = {
  id: string;
  name: string;
  kind: "LECTURER" | "STAFF";
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "CLOSED";
  resultsVisible: boolean;
  total: number;
  submitted: number;
};

const campaignRow = (
  c: {
    id: string;
    name: string;
    kind: "LECTURER" | "STAFF";
    periodStart: Date;
    periodEnd: Date;
    status: "OPEN" | "CLOSED";
    resultsVisible: boolean;
  },
  total: number,
  submitted: number,
): CampaignRow => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  periodStart: toDay(c.periodStart),
  periodEnd: toDay(c.periodEnd),
  status: c.status,
  resultsVisible: c.resultsVisible,
  total,
  submitted,
});

/** AC-8: the campaigns, with the counts of the evaluations inside the reader's scope. */
export async function listCampaigns(user: { id: string }): Promise<CampaignRow[]> {
  const scope = await evaluationScopeWhere(user);
  const campaigns = await db.evaluationCampaign.findMany({ orderBy: { createdAt: "desc" } });
  const groups = await db.evaluation.groupBy({
    by: ["campaignId", "state"],
    where: scope,
    _count: { _all: true },
  });
  return campaigns.map((c) => {
    const mine = groups.filter((g) => g.campaignId === c.id);
    const total = mine.reduce((n, g) => n + g._count._all, 0);
    const submitted = mine.find((g) => g.state === "SUBMITTED")?._count._all ?? 0;
    return campaignRow(c, total, submitted);
  });
}

export type CampaignEvaluation = {
  id: string;
  staffId: string;
  name: string;
  departmentCode: string | null;
  evaluatorId: string | null;
  evaluatorName: string | null;
  state: "PENDING" | "SUBMITTED";
  score: number | null;
};

export type CampaignView = {
  campaign: CampaignRow;
  evaluations: CampaignEvaluation[];
  report: Record<ReportLevel, ReportGroup[]>;
};

/** AC-8, AC-10: one campaign with the evaluations and the report inside the reader's scope. */
export async function getCampaignView(
  user: { id: string },
  campaignId: string,
): Promise<CampaignView | null> {
  const campaign = await db.evaluationCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  const rows = await db.evaluation.findMany({
    where: { AND: [{ campaignId }, await evaluationScopeWhere(user)] },
    include: {
      staff: {
        select: {
          person: { select: { firstName: true, lastName: true } },
          department: { select: { code: true, faculty: { select: { code: true } } } },
        },
      },
      evaluator: { select: { name: true } },
    },
    orderBy: [
      { staff: { person: { lastName: "asc" } } },
      { staff: { person: { firstName: "asc" } } },
    ],
  });
  const evaluations = rows.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    name: `${r.staff.person.lastName} ${r.staff.person.firstName}`,
    departmentCode: r.staff.department?.code ?? null,
    evaluatorId: r.evaluatorId,
    evaluatorName: r.evaluator?.name ?? null,
    state: r.state,
    score: r.score === null ? null : Number(r.score),
  }));
  const reportRows = rows.map((r, i) => ({
    departmentCode: r.staff.department?.code ?? null,
    facultyCode: r.staff.department?.faculty.code ?? null,
    submitted: r.state === "SUBMITTED",
    score: evaluations[i]!.score,
  }));
  return {
    campaign: campaignRow(
      campaign,
      rows.length,
      rows.filter((r) => r.state === "SUBMITTED").length,
    ),
    evaluations,
    report: {
      department: aggregate(reportRows, "department"),
      faculty: aggregate(reportRows, "faculty"),
      institution: aggregate(reportRows, "institution"),
    },
  };
}

/** AC-3: active users with a current staff role (never a student-only account). */
export async function listEvaluatorOptions() {
  const now = new Date();
  const users = await db.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: { not: "student" },
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return users;
}

export type MyEvaluation = {
  id: string;
  campaignName: string;
  periodEnd: string;
  name: string;
  departmentCode: string | null;
  state: "PENDING" | "SUBMITTED";
};

/** AC-4: what the signed-in evaluator has to do in open campaigns. */
export async function myEvaluations(userId: string): Promise<MyEvaluation[]> {
  const rows = await db.evaluation.findMany({
    where: { evaluatorId: userId, campaign: { status: "OPEN" } },
    include: {
      campaign: { select: { name: true, periodEnd: true } },
      staff: {
        select: {
          person: { select: { firstName: true, lastName: true } },
          department: { select: { code: true } },
        },
      },
    },
    orderBy: [{ state: "asc" }, { staff: { person: { lastName: "asc" } } }],
  });
  return rows.map((r) => ({
    id: r.id,
    campaignName: r.campaign.name,
    periodEnd: toDay(r.campaign.periodEnd),
    name: `${r.staff.person.lastName} ${r.staff.person.firstName}`,
    departmentCode: r.staff.department?.code ?? null,
    state: r.state,
  }));
}

export type EvaluationToFill = {
  id: string;
  campaignName: string;
  evaluatedName: string;
  form: ServedForm;
  answers: Record<string, string | number | boolean>;
  submitted: boolean;
};

/** AC-4, AC-7: only the assigned evaluator, only while the campaign is open, otherwise null. */
export async function getEvaluationToFill(
  userId: string,
  evaluationId: string,
): Promise<EvaluationToFill | null> {
  const row = await db.evaluation.findFirst({
    where: { id: evaluationId, evaluatorId: userId, campaign: { status: "OPEN" } },
    include: {
      campaign: true,
      staff: {
        select: {
          person: { select: { firstName: true, lastName: true, user: { select: { id: true } } } },
        },
      },
    },
  });
  if (!row || row.staff.person.user?.id === userId) return null; // nobody evaluates themselves
  const form = await getFormById(row.campaign.formDefinitionId);
  if (!form) return null;
  return {
    id: row.id,
    campaignName: row.campaign.name,
    evaluatedName: `${row.staff.person.lastName} ${row.staff.person.firstName}`,
    form,
    answers: (row.answers ?? {}) as Record<string, string | number | boolean>,
    submitted: row.state === "SUBMITTED",
  };
}

export type AnswerLine = { key: string; label: string; value: string | boolean };

/** The answers as readable lines (visible fields only), labels in the reader's locale. */
export function answerLines(
  def: FormDefinitionJson,
  answers: Record<string, string | number | boolean>,
  locale: string,
): AnswerLine[] {
  return visibleFields(def, answers).flatMap((f) => {
    const raw = answers[f.key];
    if (raw === undefined || f.type === "file") return [];
    const option = f.options?.find((o) => o.value === String(raw));
    return [
      {
        key: f.key,
        label: localize(f.label, locale),
        value: option
          ? localize(option.label, locale)
          : typeof raw === "boolean"
            ? raw
            : String(raw),
      },
    ];
  });
}

export type OwnResult = {
  id: string;
  campaignName: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  lines: AnswerLine[];
};

/** AC-9: own submitted evaluations of closed campaigns that show results; nothing else. */
export async function ownResults(userId: string, locale: string): Promise<OwnResult[]> {
  const staffId = await getOwnStaffId(userId);
  if (!staffId) return [];
  const rows = await db.evaluation.findMany({
    where: {
      staffId,
      state: "SUBMITTED",
      campaign: { status: "CLOSED", resultsVisible: true },
    },
    include: { campaign: true },
    orderBy: { campaign: { periodEnd: "desc" } },
  });
  const out: OwnResult[] = [];
  for (const r of rows) {
    const form = await getFormById(r.campaign.formDefinitionId);
    out.push({
      id: r.id,
      campaignName: r.campaign.name,
      periodStart: toDay(r.campaign.periodStart),
      periodEnd: toDay(r.campaign.periodEnd),
      score: r.score === null ? null : Number(r.score),
      lines: form
        ? answerLines(
            form.definition,
            (r.answers ?? {}) as Record<string, string | number | boolean>,
            locale,
          )
        : [],
    });
  }
  return out;
}
