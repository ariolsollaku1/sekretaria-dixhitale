import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getYear } from "@/modules/org";
import {
  hasScaleQuestion,
  parseQuestions,
  questionsSchema,
  type Question,
} from "../domain/question-rules";
import type { CreateCampaignInput, SetQuestionsInput } from "../domain/schemas";

type Ctx = ActionContext;

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function load(ctx: Ctx, campaignId: string) {
  const c = await ctx.db.evalCampaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new DomainError("NOT_FOUND", "Campaign not found");
  return c;
}

/** AC-1: a draft campaign for a year, optionally with the questions of an earlier one. */
export async function createCampaign(ctx: Ctx, input: CreateCampaignInput) {
  if (!(await getYear(input.academicYearId, ctx.db)))
    throw new DomainError("NOT_FOUND", "Academic year not found");
  let questions: Question[] = [];
  if (input.copyFromId) {
    const source = await ctx.db.evalCampaign.findUnique({ where: { id: input.copyFromId } });
    if (!source) throw new DomainError("NOT_FOUND", "Campaign to copy not found");
    questions = parseQuestions(source.questions);
  }
  try {
    const created = await ctx.db.evalCampaign.create({
      data: {
        academicYearId: input.academicYearId,
        name: input.name,
        questions: questions as unknown as Prisma.InputJsonValue,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "qa.campaign.create",
      entityType: "EvalCampaign",
      entityId: created.id,
      before: null,
      after: {
        academicYearId: input.academicYearId,
        name: input.name,
        status: "DRAFT",
        questions: questions.length,
      },
    });
    return { campaignId: created.id };
  } catch (e) {
    if (isUnique(e)) throw new DomainError("CONFLICT", "DUPLICATE");
    throw e;
  }
}

/** AC-2: replace the questions of a draft. */
export async function setQuestions(ctx: Ctx, input: SetQuestionsInput) {
  const campaign = await load(ctx, input.campaignId);
  if (campaign.status !== "DRAFT") throw new DomainError("CONFLICT", "NOT_DRAFT");
  const parsed = questionsSchema.safeParse(input.questions);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new DomainError("VALIDATION", "QUESTIONS", {
      questions: [String(first?.message ?? "invalid")],
    });
  }
  const before = parseQuestions(campaign.questions);
  await ctx.db.evalCampaign.update({
    where: { id: campaign.id },
    data: {
      questions: parsed.data as unknown as Prisma.InputJsonValue,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "qa.campaign.questions",
    entityType: "EvalCampaign",
    entityId: campaign.id,
    before: { questions: before.map((q) => `${q.section}:${q.type}:${q.key}`).join(",") },
    after: { questions: parsed.data.map((q) => `${q.section}:${q.type}:${q.key}`).join(",") },
  });
  return { count: parsed.data.length };
}

/** AC-3: DRAFT -> OPEN; needs a scale question and a year that is not closed. */
export async function openCampaign(ctx: Ctx, campaignId: string) {
  const campaign = await load(ctx, campaignId);
  if (campaign.status !== "DRAFT") throw new DomainError("CONFLICT", "NOT_DRAFT");
  if (!hasScaleQuestion(parseQuestions(campaign.questions)))
    throw new DomainError("CONFLICT", "NO_SCALE_QUESTION");
  const year = await getYear(campaign.academicYearId, ctx.db);
  if (!year || year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  await ctx.db.evalCampaign.update({
    where: { id: campaign.id },
    data: { status: "OPEN", openedAt: new Date(), updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "qa.campaign.open",
    entityType: "EvalCampaign",
    entityId: campaign.id,
    before: { status: "DRAFT" },
    after: { status: "OPEN" },
  });
}

/** AC-3: OPEN -> CLOSED, final. */
export async function closeCampaign(ctx: Ctx, campaignId: string) {
  const campaign = await load(ctx, campaignId);
  if (campaign.status !== "OPEN") throw new DomainError("CONFLICT", "NOT_OPEN");
  await ctx.db.evalCampaign.update({
    where: { id: campaign.id },
    data: { status: "CLOSED", closedAt: new Date(), updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "qa.campaign.close",
    entityType: "EvalCampaign",
    entityId: campaign.id,
    before: { status: "OPEN" },
    after: { status: "CLOSED" },
  });
}
