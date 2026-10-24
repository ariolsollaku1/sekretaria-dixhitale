import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { currentRoles, mayHandle } from "@/lib/forms/access";
import { validateDefinition } from "@/lib/forms/definition";
import { stateDef } from "@/lib/forms/answers";
import { enrollmentOf, resolveRequester } from "@/modules/stu";
import { MAX_CENTS, centsOf, formatCents } from "../domain/money";
import { SCHOLARSHIP_HANDLER, computeCuts, validateTerms } from "../domain/scholarship-rules";
import type { Terms } from "../domain/scholarship-rules";
import type { GrantScholarshipInput } from "../domain/scholarship-schemas";
import { finProgramScope } from "./fee.queries";
import { assertYearOpen } from "./fee.service";

type Ctx = ActionContext;
/** Marks an installment cancelled because a scholarship took all of it. */
export const SCHOLARSHIP_CANCEL_REASON = "SCHOLARSHIP";

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function refuse(errors: Record<string, string | undefined>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the scholarship",
    Object.fromEntries(
      Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, [v!]]),
    ),
  );
}

type OpenRequest = Awaited<ReturnType<typeof loadOpenApplication>>;

/** The scholarship application the user handles and that is not decided yet; else it does not exist. */
async function loadOpenApplication(ctx: Ctx, submissionId: string) {
  const submission = await ctx.db.formSubmission.findUnique({
    where: { id: submissionId },
    include: { definition: true },
  });
  if (!submission) throw new DomainError("NOT_FOUND", "Application not found");
  if (!mayHandle(await currentRoles(ctx.user.id, ctx.db), submission.definition.ownerRoles))
    throw new DomainError("NOT_FOUND", "Application not found");
  const parsed = validateDefinition(
    submission.definition.definition,
    submission.definition.audience,
  );
  if (!parsed.ok || parsed.definition.handler !== SCHOLARSHIP_HANDLER)
    throw new DomainError("NOT_FOUND", "Application not found");
  if (stateDef(parsed.definition, submission.state)?.final)
    throw new DomainError("CONFLICT", "REQUEST_CLOSED");
  return submission;
}

/** Which enrollment a direct grant is for: the student's open enrollment, within the Finance scope. */
async function directEnrollment(ctx: Ctx, studentNumber: string, programCode: string | null) {
  const rows = await ctx.db.enrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED"] },
      student: { studentNumber },
      program: {
        AND: [
          await finProgramScope(ctx.user, "fin.scholarship.write"),
          programCode ? { code: { equals: programCode, mode: "insensitive" } } : {},
        ],
      },
    },
    select: { id: true },
  });
  if (rows.length === 0) refuse({ studentNumber: "notFound" });
  if (rows.length > 1) refuse({ programCode: "ambiguous" });
  return rows[0]!.id;
}

/**
 * AC-4 (Q-23): take the scholarship off the tuition installments of the plan, and remember how much
 * each lost so that voiding gives it back. Returns the reduction in cents, or the reason nothing
 * could be applied.
 */
export async function applyToPlan(
  ctx: Ctx,
  scholarship: { id: string; terms: Terms },
  planId: string,
): Promise<{ ok: true; cutCents: number; installments: number } | { ok: false; code: string }> {
  const tuition = await ctx.db.planInstallment.findMany({
    where: { planId, kind: "TUITION", status: "ACTIVE" },
    select: { id: true, amount: true },
    orderBy: { sequence: "asc" },
  });
  const result = computeCuts(
    tuition.map((i) => ({ id: i.id, amountCents: centsOf(i.amount) })),
    scholarship.terms,
  );
  if (!result.ok) return result;
  const now = new Date();
  for (const c of result.cuts) {
    const row = tuition.find((i) => i.id === c.installmentId)!;
    await ctx.db.scholarshipCut.create({
      data: {
        scholarshipId: scholarship.id,
        installmentId: c.installmentId,
        amount: formatCents(c.cutCents),
        cancelled: c.cancels,
      },
    });
    await ctx.db.planInstallment.update({
      where: { id: c.installmentId },
      data: c.cancels
        ? {
            status: "CANCELLED",
            cancelReason: SCHOLARSHIP_CANCEL_REASON,
            adjustedAt: now,
            updatedById: ctx.user.id,
          }
        : {
            amount: formatCents(centsOf(row.amount) - c.cutCents),
            // the early-payment amount was worked out on the old amount (FIN-01 AC-8)
            earlyAmount: null,
            earlyUntil: null,
            adjustedAt: now,
            updatedById: ctx.user.id,
          },
    });
  }
  return {
    ok: true,
    cutCents: result.cuts.reduce((a, c) => a + c.cutCents, 0),
    installments: result.cuts.length,
  };
}

const termsOf = (s: {
  type: string;
  percent: { toString(): string } | null;
  amount: { toString(): string } | null;
}): Terms =>
  s.type === "FULL"
    ? { type: "FULL" }
    : s.percent
      ? { type: "PARTIAL", percent: centsOf(s.percent) }
      : { type: "PARTIAL", amount: centsOf(s.amount!) };

/** Applies the live scholarship of an enrollment and year, if any, to a plan that was just created. */
export async function applyLiveScholarship(
  ctx: Ctx,
  enrollmentId: string,
  academicYearId: string,
  planId: string,
) {
  const s = await ctx.db.scholarship.findFirst({
    where: { enrollmentId, academicYearId, voidedAt: null },
  });
  if (!s) return null;
  const applied = await applyToPlan(ctx, { id: s.id, terms: termsOf(s) }, planId);
  if (applied.ok)
    await ctx.audit({
      action: "fin.scholarship.apply",
      entityType: "Scholarship",
      entityId: s.id,
      before: null,
      after: {
        planId,
        reduction: formatCents(applied.cutCents),
        installments: applied.installments,
      },
    });
  return applied;
}

/**
 * AC-2..AC-5: grant a scholarship, as the decision on an application or directly, and recalculate
 * the plan of that year if it exists (otherwise it is applied when the plan is generated).
 */
export async function grantScholarship(ctx: Ctx, input: GrantScholarshipInput) {
  await assertYearOpen(ctx, input.academicYearId);
  const errors = validateTerms({
    type: input.type,
    percent: input.percent,
    amount: input.amount,
  });
  if (input.percent !== null && input.percent > MAX_CENTS) errors.percent = "range";
  if (input.amount !== null && input.amount > MAX_CENTS) errors.amount = "range";
  if (Object.keys(errors).length > 0) refuse(errors);

  let enrollmentId: string;
  let submission: OpenRequest | null = null;
  if (input.submissionId) {
    submission = await loadOpenApplication(ctx, input.submissionId);
    const requester = await resolveRequester(ctx.db, ctx.user, submission);
    enrollmentId = enrollmentOf(requester, submission.answers);
    // the enrollment must also be one Finance may see
    const visible = await ctx.db.enrollment.count({
      where: {
        id: enrollmentId,
        program: await finProgramScope(ctx.user, "fin.scholarship.write"),
      },
    });
    if (visible === 0) throw new DomainError("NOT_FOUND", "Application not found");
  } else {
    if (!input.studentNumber) refuse({ studentNumber: "required" });
    enrollmentId = await directEnrollment(ctx, input.studentNumber!, input.programCode);
  }

  const terms: Terms =
    input.type === "FULL"
      ? { type: "FULL" }
      : input.percent !== null
        ? { type: "PARTIAL", percent: input.percent }
        : { type: "PARTIAL", amount: input.amount! };

  let created;
  try {
    created = await ctx.db.scholarship.create({
      data: {
        enrollmentId,
        academicYearId: input.academicYearId,
        type: input.type,
        category: input.category,
        percent: input.percent === null ? null : formatCents(input.percent),
        amount: input.amount === null ? null : formatCents(input.amount),
        reason: input.reason,
        submissionId: submission?.id ?? null,
        createdById: ctx.user.id,
      },
    });
  } catch (error) {
    if (isUnique(error)) refuse({ studentNumber: "alreadyHas" });
    throw error;
  }

  const plan = await ctx.db.paymentPlan.findUnique({
    where: {
      enrollmentId_academicYearId: { enrollmentId, academicYearId: input.academicYearId },
    },
    select: { id: true },
  });
  let applied: Awaited<ReturnType<typeof applyToPlan>> | null = null;
  if (plan) {
    applied = await applyToPlan(ctx, { id: created.id, terms }, plan.id);
    // a scholarship that cannot be applied to the existing plan is refused as a whole (rolled back)
    if (!applied.ok) refuse({ amount: applied.code, percent: applied.code });
  }
  await ctx.audit({
    action: "fin.scholarship.grant",
    entityType: "Scholarship",
    entityId: created.id,
    before: null,
    after: {
      enrollmentId,
      academicYearId: input.academicYearId,
      type: input.type,
      category: input.category,
      percent: created.percent?.toFixed(2) ?? null,
      amount: created.amount?.toFixed(2) ?? null,
      submissionId: submission?.id ?? null,
      reduction: applied?.ok ? formatCents(applied.cutCents) : null,
      applied: applied?.ok ?? false,
    },
    reason: input.reason,
  });
  return { id: created.id, applied: applied?.ok ?? false };
}

/** AC-6: void a scholarship with a reason; the reduction goes back to the plan, the row stays. */
export async function voidScholarship(ctx: Ctx, input: { id: string }) {
  const reason = ctx.reason?.trim();
  if (!reason) refuse({ reason: "required" });
  const row = await ctx.db.scholarship.findFirst({
    where: {
      id: input.id,
      enrollment: { program: await finProgramScope(ctx.user, "fin.scholarship.write") },
    },
    include: { cuts: true },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Scholarship not found");
  await assertYearOpen(ctx, row.academicYearId);
  if (row.voidedAt) throw new DomainError("CONFLICT", "ALREADY_VOID");
  let restored = 0;
  for (const cut of row.cuts) {
    const inst = await ctx.db.planInstallment.findUniqueOrThrow({
      where: { id: cut.installmentId },
    });
    if (cut.cancelled) {
      // only an installment this scholarship cancelled comes back; a hand-cancelled one stays so
      if (inst.status === "CANCELLED" && inst.cancelReason === SCHOLARSHIP_CANCEL_REASON)
        await ctx.db.planInstallment.update({
          where: { id: inst.id },
          data: { status: "ACTIVE", cancelReason: null, updatedById: ctx.user.id },
        });
    } else {
      await ctx.db.planInstallment.update({
        where: { id: inst.id },
        data: {
          amount: formatCents(centsOf(inst.amount) + centsOf(cut.amount)),
          updatedById: ctx.user.id,
        },
      });
    }
    restored += centsOf(cut.amount);
  }
  await ctx.db.scholarship.update({
    where: { id: row.id },
    data: { voidedAt: new Date(), voidedById: ctx.user.id, voidReason: reason },
  });
  await ctx.audit({
    action: "fin.scholarship.void",
    entityType: "Scholarship",
    entityId: row.id,
    before: { voided: false },
    after: { voided: true, restored: formatCents(restored) },
    reason,
  });
  return { id: row.id };
}
