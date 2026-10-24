import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { todayInTirane } from "@/modules/att";
import { parseQuestions, validateAnswers } from "../domain/question-rules";
import type { SubmitInput } from "../domain/schemas";
import { ADMIN_TARGET, ownStudentId, targetsOf } from "./survey.queries";

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * AC-5..AC-7: one participation (who answered what) and one response (how) in the same
 * transaction; the two rows share nothing, and the audit entry names only campaign and target.
 */
export async function submitSurvey(ctx: ActionContext, input: SubmitInput) {
  const studentId = await ownStudentId(ctx.user.id, ctx.db);
  if (!studentId) throw new DomainError("NOT_FOUND", "NO_STUDENT");
  const campaign = await ctx.db.evalCampaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new DomainError("NOT_FOUND", "Campaign not found");
  if (campaign.status !== "OPEN") throw new DomainError("CONFLICT", "NOT_OPEN");

  const questions = parseQuestions(campaign.questions);
  const target = (await targetsOf(studentId, campaign.academicYearId, questions, ctx.db)).find(
    (t) => t.target === input.target,
  );
  if (!target) throw new DomainError("NOT_FOUND", "NOT_YOUR_TARGET");

  const checked = validateAnswers(questions, target.section, input.answers);
  if (!checked.ok)
    throw new DomainError(
      "VALIDATION",
      "ANSWERS",
      Object.fromEntries(Object.entries(checked.errors).map(([k, v]) => [k, [v]])),
    );

  const assignmentId = input.target === ADMIN_TARGET ? null : input.target;
  try {
    await ctx.db.evalParticipation.create({
      data: {
        campaignId: campaign.id,
        studentId,
        targetKey: input.target,
        assignmentId,
        completedOn: new Date(`${todayInTirane()}T00:00:00Z`),
      },
    });
  } catch (e) {
    if (isUnique(e)) throw new DomainError("CONFLICT", "ALREADY_ANSWERED");
    throw e;
  }
  await ctx.db.evalResponse.create({
    data: {
      campaignId: campaign.id,
      assignmentId,
      section: target.section,
      answers: checked.answers as Prisma.InputJsonObject,
    },
  });
  await ctx.audit({
    action: "qa.survey.submit",
    entityType: "EvalCampaign",
    entityId: campaign.id,
    before: null,
    after: { target: input.target, section: target.section },
  });
}
