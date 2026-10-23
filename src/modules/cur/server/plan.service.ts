import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { validatePlacement, nextVersion } from "../domain/plan-rules";
import type {
  AddPlanCourseInput,
  CreatePlanInput,
  UpdatePlanCourseInput,
} from "../domain/plan-schemas";
import { blockingPlanDependents } from "./plan-dependents";
import { getPlanRow, type PlanRecord } from "./plan.queries";

type Ctx = ActionContext;
const WRITE = "cur.plan.write";

/** AC-11: writing needs the permission on the plan's program (coordinator: theirs; head: their department's). */
async function assertCanWriteProgram(ctx: Ctx, programId: string) {
  if (!(await can(ctx.user, WRITE, { kind: "program", id: programId })))
    throw new ForbiddenError(WRITE);
}

async function loadPlan(ctx: Ctx, planId: string): Promise<PlanRecord> {
  const plan = await getPlanRow(planId, ctx.db);
  if (!plan) throw new DomainError("NOT_FOUND", "Plan not found");
  await assertCanWriteProgram(ctx, plan.programId);
  return plan;
}

/** AC-4 */
const assertDraft = (plan: { status: string }) => {
  if (plan.status !== "DRAFT") throw new DomainError("CONFLICT", "PLAN_FROZEN");
};

const planSummary = (p: {
  programId: string;
  version: number;
  validFromAcademicYearId: string;
  status: string;
  notes: string | null;
}) => ({
  programId: p.programId,
  version: p.version,
  validFromAcademicYearId: p.validFromAcademicYearId,
  status: p.status,
  notes: p.notes,
});

const courseSummary = (c: {
  courseId: string;
  yearOfStudy: number;
  semester: number;
  credits: number;
  categoryId: string | null;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  isElective: boolean;
}) => ({
  courseId: c.courseId,
  yearOfStudy: c.yearOfStudy,
  semester: c.semester,
  credits: c.credits,
  categoryId: c.categoryId,
  hoursLecture: c.hoursLecture,
  hoursSeminar: c.hoursSeminar,
  hoursLab: c.hoursLab,
  isElective: c.isElective,
});

async function checkYear(ctx: Ctx, id: string) {
  const year = await ctx.db.academicYear.findUnique({ where: { id }, select: { id: true } });
  if (!year)
    throw new DomainError("VALIDATION", "Check the year", {
      validFromAcademicYearId: ["unknownYear"],
    });
}

/** AC-1/AC-6: a new draft with the next version, optionally copied from a plan of the same program. */
export async function createPlan(ctx: Ctx, input: CreatePlanInput) {
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: input.programId },
    select: { id: true, active: true },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");
  await assertCanWriteProgram(ctx, program.id);
  if (!program.active) throw new DomainError("CONFLICT", "PROGRAM_INACTIVE");
  await checkYear(ctx, input.validFromAcademicYearId);

  let source: PlanRecord | null = null;
  if (input.copyFromPlanId) {
    source = await getPlanRow(input.copyFromPlanId, ctx.db);
    if (!source || source.programId !== program.id)
      throw new DomainError("VALIDATION", "Check the source plan", {
        copyFromPlanId: ["unknownPlan"],
      });
  }

  const versions = await ctx.db.curriculumPlan.findMany({
    where: { programId: program.id },
    select: { version: true },
  });
  const plan = await ctx.db.curriculumPlan.create({
    data: {
      programId: program.id,
      version: nextVersion(versions.map((v) => v.version)),
      validFromAcademicYearId: input.validFromAcademicYearId,
      notes: input.notes,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });

  let copied = 0;
  let skipped = 0;
  if (source) {
    const active = new Set(
      (
        await ctx.db.course.findMany({
          where: { id: { in: source.courses.map((c) => c.courseId) }, active: true },
          select: { id: true },
        })
      ).map((c) => c.id),
    );
    const rows = source.courses.filter((c) => active.has(c.courseId));
    skipped = source.courses.length - rows.length;
    copied = rows.length;
    if (rows.length > 0)
      await ctx.db.planCourse.createMany({
        data: rows.map((c) => ({ planId: plan.id, ...courseSummary(c) })),
      });
  }
  await ctx.audit({
    action: "cur.plan.create",
    entityType: "CurriculumPlan",
    entityId: plan.id,
    before: null,
    after: {
      ...planSummary({ ...plan, status: "DRAFT" }),
      copiedFrom: source?.id ?? null,
      copied,
      skipped,
    },
  });
  return { planId: plan.id, version: plan.version, copied, skipped };
}

export async function updatePlan(
  ctx: Ctx,
  planId: string,
  input: { validFromAcademicYearId: string; notes: string | null },
) {
  const plan = await loadPlan(ctx, planId);
  assertDraft(plan);
  await checkYear(ctx, input.validFromAcademicYearId);
  await ctx.db.curriculumPlan.update({
    where: { id: planId },
    data: {
      validFromAcademicYearId: input.validFromAcademicYearId,
      notes: input.notes,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cur.plan.update",
    entityType: "CurriculumPlan",
    entityId: planId,
    before: planSummary(plan),
    after: planSummary({ ...plan, ...input }),
  });
  return { planId };
}

function placementError(errors: ReturnType<typeof validatePlacement>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the course",
    Object.fromEntries(
      Object.entries(errors).map(([k, v]) => [k === "hours" ? "hoursLecture" : k, [v!]]),
    ),
  );
}

/** AC-2/AC-3: figures default to the catalog's. */
export async function addPlanCourse(ctx: Ctx, input: AddPlanCourseInput) {
  const plan = await loadPlan(ctx, input.planId);
  assertDraft(plan);
  const course = await ctx.db.course.findUnique({ where: { id: input.courseId } });
  if (!course)
    throw new DomainError("VALIDATION", "Check the course", { courseId: ["unknownCourse"] });
  if (!course.active)
    throw new DomainError("VALIDATION", "Check the course", { courseId: ["inactiveCourse"] });
  if (plan.courses.some((c) => c.courseId === course.id))
    throw new DomainError("VALIDATION", "Check the course", { courseId: ["alreadyInPlan"] });

  const data = {
    yearOfStudy: input.yearOfStudy,
    semester: input.semester,
    credits: input.credits ?? course.defaultCredits,
    categoryId: input.categoryId === undefined ? course.categoryId : input.categoryId || null,
    hoursLecture: input.hoursLecture ?? course.hoursLecture,
    hoursSeminar: input.hoursSeminar ?? course.hoursSeminar,
    hoursLab: input.hoursLab ?? course.hoursLab,
    isElective: input.isElective,
  };
  const errors = validatePlacement(data, plan.program.durationYears);
  if (Object.keys(errors).length > 0) placementError(errors);

  const created = await ctx.db.planCourse.create({
    data: { planId: plan.id, courseId: course.id, ...data },
  });
  await ctx.audit({
    action: "cur.plan_course.add",
    entityType: "PlanCourse",
    entityId: created.id,
    before: null,
    after: { planId: plan.id, ...courseSummary({ ...created }) },
  });
  return { planCourseId: created.id };
}

async function loadPlanCourse(ctx: Ctx, planCourseId: string) {
  const row = await ctx.db.planCourse.findUnique({ where: { id: planCourseId } });
  if (!row) throw new DomainError("NOT_FOUND", "Plan course not found");
  const plan = await loadPlan(ctx, row.planId);
  assertDraft(plan);
  return { row, plan };
}

export async function updatePlanCourse(ctx: Ctx, input: UpdatePlanCourseInput) {
  const { row, plan } = await loadPlanCourse(ctx, input.planCourseId);
  const errors = validatePlacement(input, plan.program.durationYears);
  if (Object.keys(errors).length > 0) placementError(errors);
  const { planCourseId: _id, ...data } = input;
  void _id;
  await ctx.db.planCourse.update({ where: { id: row.id }, data });
  await ctx.audit({
    action: "cur.plan_course.update",
    entityType: "PlanCourse",
    entityId: row.id,
    before: courseSummary(row),
    after: courseSummary({ ...row, ...data }),
  });
  return { planCourseId: row.id };
}

export async function removePlanCourse(ctx: Ctx, planCourseId: string) {
  const { row } = await loadPlanCourse(ctx, planCourseId);
  await ctx.db.planCourse.delete({ where: { id: row.id } });
  await ctx.audit({
    action: "cur.plan_course.remove",
    entityType: "PlanCourse",
    entityId: row.id,
    before: { planId: row.planId, ...courseSummary(row) },
    after: null,
  });
  return { planCourseId: row.id };
}

/** AC-7: records who and when; the database freezes the plan from here on. */
export async function approvePlan(ctx: Ctx, planId: string) {
  const plan = await loadPlan(ctx, planId);
  assertDraft(plan);
  if (plan.courses.length === 0) throw new DomainError("CONFLICT", "PLAN_EMPTY");
  const approvedAt = new Date();
  await ctx.db.curriculumPlan.update({
    where: { id: planId },
    data: { status: "APPROVED", approvedAt, approvedById: ctx.user.id, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "cur.plan.approve",
    entityType: "CurriculumPlan",
    entityId: planId,
    before: { status: "DRAFT" },
    after: { status: "APPROVED", approvedAt },
  });
  return { planId };
}

/** AC-8: retire an approved plan; blocked while cohorts (ORG-04) still follow it. */
export async function archivePlan(ctx: Ctx, planId: string) {
  const plan = await loadPlan(ctx, planId);
  if (plan.status !== "APPROVED") throw new DomainError("CONFLICT", "NOT_APPROVED");
  const blocking = await blockingPlanDependents(planId);
  if (blocking.length > 0)
    throw new DomainError(
      "CONFLICT",
      `HAS_DEPENDENTS:${blocking.map((b) => `${b.labelKey}=${b.count}`).join(",")}`,
    );
  await ctx.db.curriculumPlan.update({
    where: { id: planId },
    data: { status: "ARCHIVED", archivedAt: new Date(), updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "cur.plan.archive",
    entityType: "CurriculumPlan",
    entityId: planId,
    before: { status: "APPROVED" },
    after: { status: "ARCHIVED" },
    reason: ctx.reason,
  });
  return { planId };
}

/** AC-8: a draft is a technical row and may be deleted; approved and archived plans never. */
export async function deleteDraftPlan(ctx: Ctx, planId: string) {
  const plan = await loadPlan(ctx, planId);
  assertDraft(plan);
  await ctx.db.curriculumPlan.delete({ where: { id: planId } });
  await ctx.audit({
    action: "cur.plan.delete",
    entityType: "CurriculumPlan",
    entityId: planId,
    before: { ...planSummary(plan), courses: plan.courses.length },
    after: null,
  });
  return { programId: plan.programId };
}
