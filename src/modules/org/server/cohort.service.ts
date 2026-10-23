import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import type { CohortInput } from "../domain/schemas";
import { blockingCohortDependents, dependentsMessage } from "./cohort-dependents";
import { getCohortRow } from "./cohort.queries";
import { getPlanDirectory } from "./plan-directory";

type Ctx = ActionContext;

const snapshot = (c: {
  programId: string;
  startAcademicYearId: string;
  curriculumPlanId: string;
  name: string;
  active: boolean;
}) => ({
  programId: c.programId,
  startAcademicYearId: c.startAcademicYearId,
  curriculumPlanId: c.curriculumPlanId,
  name: c.name,
  active: c.active,
});

/** AC-2: an approved plan of the same program. */
async function checkPlan(programId: string, planId: string) {
  const plan = await getPlanDirectory().get(planId);
  if (!plan || plan.programId !== programId || plan.status !== "APPROVED")
    throw new DomainError("VALIDATION", "Check the plan", {
      curriculumPlanId: ["planNotApproved"],
    });
}

const nameTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** AC-1/AC-2 */
export async function createCohort(ctx: Ctx, input: CohortInput) {
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: input.programId },
    select: { id: true, active: true },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");
  if (!program.active) throw new DomainError("CONFLICT", "PROGRAM_INACTIVE");
  const year = await ctx.db.academicYear.findUnique({
    where: { id: input.startAcademicYearId },
    select: { id: true },
  });
  if (!year)
    throw new DomainError("VALIDATION", "Check the year", { startAcademicYearId: ["unknownYear"] });
  await checkPlan(input.programId, input.curriculumPlanId);
  try {
    const cohort = await ctx.db.cohort.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "org.cohort.create",
      entityType: "Cohort",
      entityId: cohort.id,
      before: null,
      after: snapshot({ ...input, active: true }),
    });
    return { cohortId: cohort.id };
  } catch (error) {
    if (nameTaken(error))
      throw new DomainError("VALIDATION", "Check the name", { name: ["nameTaken"] });
    throw error;
  }
}

export async function renameCohort(ctx: Ctx, cohortId: string, name: string) {
  const before = await getCohortRow(cohortId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Cohort not found");
  try {
    await ctx.db.cohort.update({
      where: { id: cohortId },
      data: { name, updatedById: ctx.user.id },
    });
  } catch (error) {
    if (nameTaken(error))
      throw new DomainError("VALIDATION", "Check the name", { name: ["nameTaken"] });
    throw error;
  }
  await ctx.audit({
    action: "org.cohort.update",
    entityType: "Cohort",
    entityId: cohortId,
    before: snapshot(before),
    after: snapshot({ ...before, name }),
  });
  return { cohortId };
}

/** AC-3: another approved plan of the program, with a reason, while the cohort has no students. */
export async function changeCohortPlan(ctx: Ctx, cohortId: string, planId: string) {
  const before = await getCohortRow(cohortId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Cohort not found");
  if (before.curriculumPlanId === planId) throw new DomainError("CONFLICT", "SAME_PLAN");
  await checkPlan(before.programId, planId);
  const blocking = await blockingCohortDependents(cohortId);
  if (blocking.length > 0) throw new DomainError("CONFLICT", dependentsMessage(blocking));
  await ctx.db.cohort.update({
    where: { id: cohortId },
    data: { curriculumPlanId: planId, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "org.cohort.change_plan",
    entityType: "Cohort",
    entityId: cohortId,
    before: { curriculumPlanId: before.curriculumPlanId },
    after: { curriculumPlanId: planId },
    reason: ctx.reason,
  });
  return { cohortId };
}

/** AC-5 */
export async function setCohortActive(ctx: Ctx, cohortId: string, active: boolean) {
  const before = await getCohortRow(cohortId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Cohort not found");
  if (before.active === active)
    throw new DomainError("CONFLICT", active ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE");
  if (active) {
    if (!before.program.active) throw new DomainError("CONFLICT", "PROGRAM_INACTIVE");
  } else {
    const groups = await ctx.db.studentGroup.count({
      where: { cohortId, active: true, academicYear: { status: { not: "CLOSED" } } },
    });
    const blocking = await blockingCohortDependents(cohortId);
    if (groups > 0)
      blocking.push({ id: "org.groups", labelKey: "org.dependents.groups", count: groups });
    if (blocking.length > 0) throw new DomainError("CONFLICT", dependentsMessage(blocking));
  }
  await ctx.db.cohort.update({
    where: { id: cohortId },
    data: { active, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: active ? "org.cohort.reactivate" : "org.cohort.deactivate",
    entityType: "Cohort",
    entityId: cohortId,
    before: { active: before.active },
    after: { active },
    reason: ctx.reason,
  });
  return { cohortId };
}
