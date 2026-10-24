import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { validateAnswers } from "@/lib/forms/answers";
import { getFormById, getInternalForm } from "@/lib/forms/queries";
import { notify } from "@/lib/notify/notify";
import { registerNotificationType } from "@/lib/notify/types";
import { QUESTIONNAIRE_KEY, STAFF_KIND_OF, scoreAnswers } from "../domain/evaluation-rules";
import type { OpenCampaignInput } from "../domain/evaluation-schemas";

registerNotificationType({ type: "hr.evaluation" });

type Ctx = ActionContext;
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const notFound = () => new DomainError("NOT_FOUND", "Evaluation not found");

/** Staff roles may evaluate; students never (AC-3). */
async function staffRoleUserIds(ctx: Ctx, ids: readonly string[]): Promise<Set<string>> {
  const now = new Date();
  const rows = await ctx.db.userRole.findMany({
    where: {
      userId: { in: [...ids] },
      role: { not: "student" },
      user: { active: true },
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

type Head = { userId: string; personId: string | null };

/**
 * AC-2: the head of department of each department when there is exactly one distinct active
 * holder (Q-134); departments with none or several are left for HR.
 */
async function defaultEvaluators(ctx: Ctx, departmentIds: readonly string[]) {
  const now = new Date();
  const rows = await ctx.db.userRole.findMany({
    where: {
      role: "head_of_department",
      scopeType: "DEPARTMENT",
      scopeId: { in: [...departmentIds] },
      user: { active: true },
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    select: { scopeId: true, userId: true, user: { select: { personId: true } } },
  });
  const byDept = new Map<string, Head[]>();
  for (const r of rows) {
    const list = byDept.get(r.scopeId!) ?? [];
    if (!list.some((x) => x.userId === r.userId))
      list.push({ userId: r.userId, personId: r.user.personId });
    byDept.set(r.scopeId!, list);
  }
  const out = new Map<string, Head>();
  for (const [dept, list] of byDept) if (list.length === 1) out.set(dept, list[0]!);
  return out;
}

/** AC-2, AC-11 */
export async function openCampaign(ctx: Ctx, input: OpenCampaignInput) {
  const form = await getInternalForm(QUESTIONNAIRE_KEY[input.kind], ctx.db);
  if (!form) throw new DomainError("VALIDATION", "No questionnaire", { kind: ["noQuestionnaire"] });
  const staff = await ctx.db.staff.findMany({
    where: { active: true, kind: STAFF_KIND_OF[input.kind] },
    select: { id: true, personId: true, departmentId: true },
  });
  if (staff.length === 0) throw new DomainError("VALIDATION", "No staff", { kind: ["noStaff"] });

  const heads =
    input.kind === "LECTURER"
      ? await defaultEvaluators(ctx, [
          ...new Set(staff.flatMap((s) => (s.departmentId ? [s.departmentId] : []))),
        ])
      : new Map<string, Head>();

  const campaign = await ctx.db.evaluationCampaign.create({
    data: {
      name: input.name,
      kind: input.kind,
      periodStart: date(input.periodStart),
      periodEnd: date(input.periodEnd),
      formDefinitionId: form.id,
      resultsVisible: input.resultsVisible,
      createdById: ctx.user.id,
    },
  });
  const evaluatorOf = (s: (typeof staff)[number]) => {
    const head = s.departmentId ? heads.get(s.departmentId) : undefined;
    // nobody evaluates themselves (AC-7)
    return head && head.personId !== s.personId ? head.userId : null;
  };
  await ctx.db.evaluation.createMany({
    data: staff.map((s) => ({
      campaignId: campaign.id,
      staffId: s.id,
      evaluatorId: evaluatorOf(s),
    })),
  });

  const perEvaluator = new Map<string, number>();
  for (const s of staff) {
    const e = evaluatorOf(s);
    if (e) perEvaluator.set(e, (perEvaluator.get(e) ?? 0) + 1);
  }
  for (const [userId, count] of perEvaluator)
    await notify(
      { db: ctx.db, afterCommit: ctx.afterCommit },
      {
        userId,
        type: "hr.evaluation",
        params: { campaign: campaign.name, count },
        link: "/hr/evaluations/mine",
        dedupeKey: `hr.evaluation:${campaign.id}:${userId}`,
      },
    );

  await ctx.audit({
    action: "hr.evaluation.open",
    entityType: "EvaluationCampaign",
    entityId: campaign.id,
    before: null,
    after: {
      name: campaign.name,
      kind: input.kind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      resultsVisible: input.resultsVisible,
      evaluations: staff.length,
      assigned: [...perEvaluator.values()].reduce((a, b) => a + b, 0),
    },
  });
  return { id: campaign.id, evaluations: staff.length };
}

/** AC-6 */
export async function closeCampaign(ctx: Ctx, input: { campaignId: string }) {
  const c = await ctx.db.evaluationCampaign.findUnique({ where: { id: input.campaignId } });
  if (!c) throw new DomainError("NOT_FOUND", "Campaign not found");
  if (c.status === "CLOSED") throw new DomainError("CONFLICT", "CAMPAIGN_CLOSED");
  await ctx.db.evaluationCampaign.update({
    where: { id: c.id },
    data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.user.id },
  });
  await ctx.audit({
    action: "hr.evaluation.close",
    entityType: "EvaluationCampaign",
    entityId: c.id,
    before: { status: "OPEN" },
    after: { status: "CLOSED" },
  });
  return { id: c.id };
}

/** AC-3 */
export async function assignEvaluator(
  ctx: Ctx,
  input: { evaluationId: string; evaluatorId: string },
) {
  const ev = await ctx.db.evaluation.findUnique({
    where: { id: input.evaluationId },
    include: { campaign: { select: { id: true, name: true, status: true } }, staff: true },
  });
  if (!ev) throw notFound();
  if (ev.campaign.status !== "OPEN") throw new DomainError("CONFLICT", "CAMPAIGN_CLOSED");
  const evaluator = await ctx.db.user.findFirst({
    where: { id: input.evaluatorId, active: true },
    select: { id: true, personId: true },
  });
  if (!evaluator || !(await staffRoleUserIds(ctx, [evaluator.id])).has(evaluator.id))
    throw new DomainError("VALIDATION", "Unknown evaluator", {
      evaluatorId: ["unknownEvaluator"],
    });
  if (evaluator.personId && evaluator.personId === ev.staff.personId)
    throw new DomainError("VALIDATION", "Self evaluation", { evaluatorId: ["selfEvaluation"] });
  if (ev.evaluatorId === evaluator.id) return { id: ev.id };
  await ctx.db.evaluation.update({ where: { id: ev.id }, data: { evaluatorId: evaluator.id } });
  await notify(
    { db: ctx.db, afterCommit: ctx.afterCommit },
    {
      userId: evaluator.id,
      type: "hr.evaluation",
      params: { campaign: ev.campaign.name, count: 1 },
      link: "/hr/evaluations/mine",
      dedupeKey: `hr.evaluation:${ev.campaign.id}:${evaluator.id}`,
    },
  );
  await ctx.audit({
    action: "hr.evaluation.assign",
    entityType: "Evaluation",
    entityId: ev.id,
    before: { evaluatorId: ev.evaluatorId },
    after: { evaluatorId: evaluator.id },
  });
  return { id: ev.id };
}

/** AC-4..AC-7 */
export async function submitEvaluation(
  ctx: Ctx,
  input: { evaluationId: string; answers: Record<string, unknown> },
) {
  const ev = await ctx.db.evaluation.findUnique({
    where: { id: input.evaluationId },
    include: { campaign: true, staff: { select: { personId: true } } },
  });
  // AC-7: not the assigned evaluator -> as if it did not exist (HR included)
  if (!ev || ev.evaluatorId !== ctx.user.id) throw notFound();
  const me = await ctx.db.user.findUnique({
    where: { id: ctx.user.id },
    select: { personId: true },
  });
  if (me?.personId && me.personId === ev.staff.personId) throw notFound();
  if (ev.campaign.status !== "OPEN") throw new DomainError("CONFLICT", "CAMPAIGN_CLOSED");

  const form = await getFormById(ev.campaign.formDefinitionId, ctx.db);
  if (!form) throw new DomainError("UNAVAILABLE", "QUESTIONNAIRE_UNAVAILABLE");
  const checked = validateAnswers(form.definition, input.answers, { allowFiles: false });
  if (!checked.ok)
    throw new DomainError(
      "VALIDATION",
      "Check the answers",
      Object.fromEntries(Object.entries(checked.errors).map(([k, v]) => [k, [v]])),
    );
  const score = scoreAnswers(form.definition, checked.answers);
  await ctx.db.evaluation.update({
    where: { id: ev.id },
    data: { state: "SUBMITTED", answers: checked.answers, score, submittedAt: new Date() },
  });
  await ctx.audit({
    action: "hr.evaluation.submit",
    entityType: "Evaluation",
    entityId: ev.id,
    before: { state: ev.state, score: ev.score ? Number(ev.score) : null },
    after: { state: "SUBMITTED", score },
  });
  return { id: ev.id, score };
}
