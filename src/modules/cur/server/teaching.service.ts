import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { getStaffBriefs } from "@/modules/hr";
import { getGroupContext } from "@/modules/org";
import {
  defaultHours,
  planCopy,
  validateAssignment,
  type CopySource,
  type CopyTarget,
} from "../domain/teaching-rules";
import type { AssignmentInput } from "../domain/teaching-schemas";

type Ctx = ActionContext;
const WRITE = "cur.teaching.write";

/** AC-9: writing needs the permission on the group's program (a head: their department's). */
async function assertCanWriteGroup(ctx: Ctx, groupId: string) {
  if (!(await can(ctx.user, WRITE, { kind: "group", id: groupId })))
    throw new ForbiddenError(WRITE);
}

const snapshot = (a: {
  groupId: string;
  planCourseId: string;
  staffId: string;
  kind: string;
  plannedHours: number;
  semester: number;
}) => ({
  groupId: a.groupId,
  planCourseId: a.planCourseId,
  staffId: a.staffId,
  kind: a.kind,
  semester: a.semester,
  plannedHours: a.plannedHours,
});

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function refuse(errors: Record<string, string | undefined>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the assignment",
    Object.fromEntries(
      Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, [v!]]),
    ),
  );
}

/** AC-1..AC-3 */
export async function createAssignment(ctx: Ctx, input: AssignmentInput) {
  const group = await getGroupContext(input.groupId, ctx.db);
  if (!group) throw new DomainError("NOT_FOUND", "Group not found");
  await assertCanWriteGroup(ctx, group.id);
  const planCourse = await ctx.db.planCourse.findUnique({ where: { id: input.planCourseId } });
  if (!planCourse) return refuse({ planCourseId: "courseNotInGroup" });
  const staff = (await getStaffBriefs([input.staffId], ctx.db)).get(input.staffId);
  if (!staff) return refuse({ staffId: "staffUnknown" });

  const errors = validateAssignment({
    group: {
      active: group.active,
      yearOfStudy: group.yearOfStudy,
      cohortPlanId: group.cohortPlanId,
      yearStatus: group.yearStatus,
    },
    planCourse: { planId: planCourse.planId, yearOfStudy: planCourse.yearOfStudy },
    staff: { active: staff.active, kind: staff.kind },
  });
  if (Object.keys(errors).length > 0) refuse(errors);

  const data = {
    groupId: group.id,
    planCourseId: planCourse.id,
    staffId: staff.id,
    kind: input.kind,
    semester: planCourse.semester,
    plannedHours: input.plannedHours ?? defaultHours(planCourse, input.kind),
  };
  try {
    const created = await ctx.db.teachingAssignment.create({
      data: { ...data, createdById: ctx.user.id, updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "cur.teaching.create",
      entityType: "TeachingAssignment",
      entityId: created.id,
      before: null,
      after: snapshot(data),
    });
    return { assignmentId: created.id };
  } catch (error) {
    if (isUnique(error)) return refuse({ staffId: "alreadyAssigned" });
    throw error;
  }
}

async function loadAssignment(ctx: Ctx, assignmentId: string) {
  const a = await ctx.db.teachingAssignment.findUnique({ where: { id: assignmentId } });
  if (!a) throw new DomainError("NOT_FOUND", "Assignment not found");
  await assertCanWriteGroup(ctx, a.groupId);
  const group = await getGroupContext(a.groupId, ctx.db);
  if (group?.yearStatus === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  return a;
}

/** AC-4: another lecturer and/or other hours. */
export async function updateAssignment(
  ctx: Ctx,
  assignmentId: string,
  input: { staffId: string; plannedHours: number },
) {
  const before = await loadAssignment(ctx, assignmentId);
  if (input.staffId !== before.staffId) {
    const staff = (await getStaffBriefs([input.staffId], ctx.db)).get(input.staffId);
    if (!staff) return refuse({ staffId: "staffUnknown" });
    const errors = validateAssignment({
      group: { active: true, yearOfStudy: 0, cohortPlanId: "", yearStatus: "CURRENT" },
      planCourse: { planId: "", yearOfStudy: 0 },
      staff: { active: staff.active, kind: staff.kind },
    });
    if (errors.staffId) refuse({ staffId: errors.staffId });
  }
  try {
    await ctx.db.teachingAssignment.update({
      where: { id: assignmentId },
      data: { staffId: input.staffId, plannedHours: input.plannedHours, updatedById: ctx.user.id },
    });
  } catch (error) {
    if (isUnique(error)) return refuse({ staffId: "alreadyAssigned" });
    throw error;
  }
  await ctx.audit({
    action: "cur.teaching.update",
    entityType: "TeachingAssignment",
    entityId: assignmentId,
    before: snapshot(before),
    after: snapshot({ ...before, ...input }),
  });
  return { assignmentId };
}

export async function removeAssignment(ctx: Ctx, assignmentId: string) {
  const before = await loadAssignment(ctx, assignmentId);
  await ctx.db.teachingAssignment.delete({ where: { id: assignmentId } });
  await ctx.audit({
    action: "cur.teaching.remove",
    entityType: "TeachingAssignment",
    entityId: assignmentId,
    before: snapshot(before),
    after: null,
  });
  return { assignmentId };
}

/** AC-5: copy a year's assignments into another year's groups the user may write. */
export async function copyAssignments(ctx: Ctx, fromYearId: string, toYearId: string) {
  if (fromYearId === toYearId) throw new DomainError("VALIDATION", "SAME_YEAR");
  const to = await ctx.db.academicYear.findUnique({
    where: { id: toYearId },
    select: { status: true },
  });
  if (!to) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (to.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");

  const sourceRows = await ctx.db.teachingAssignment.findMany({
    where: { group: { academicYearId: fromYearId } },
    include: {
      group: { select: { name: true, yearOfStudy: true, cohort: { select: { programId: true } } } },
      planCourse: { select: { courseId: true } },
    },
  });
  const staff = await getStaffBriefs([...new Set(sourceRows.map((r) => r.staffId))], ctx.db);
  const sources: CopySource[] = sourceRows.map((r) => ({
    programId: r.group.cohort.programId,
    yearOfStudy: r.group.yearOfStudy,
    groupName: r.group.name,
    courseId: r.planCourse.courseId,
    kind: r.kind,
    staffId: r.staffId,
    staffActive: staff.get(r.staffId)?.active ?? false,
    plannedHours: r.plannedHours,
  }));

  const groups = await ctx.db.studentGroup.findMany({
    where: { academicYearId: toYearId, active: true },
    include: { cohort: { select: { programId: true, curriculumPlanId: true } } },
  });
  const targets: CopyTarget[] = [];
  for (const g of groups) {
    if (!(await can(ctx.user, WRITE, { kind: "group", id: g.id }))) continue;
    const planCourses = await ctx.db.planCourse.findMany({
      where: { planId: g.cohort.curriculumPlanId, yearOfStudy: g.yearOfStudy },
      select: { id: true, courseId: true, semester: true },
    });
    const existing = await ctx.db.teachingAssignment.findMany({
      where: { groupId: g.id },
      select: { planCourseId: true, kind: true, staffId: true },
    });
    targets.push({
      groupId: g.id,
      programId: g.cohort.programId,
      yearOfStudy: g.yearOfStudy,
      groupName: g.name,
      planCourses,
      existing: new Set(existing.map((e) => `${e.planCourseId}:${e.kind}:${e.staffId}`)),
    });
  }

  const plan = planCopy(sources, targets);
  if (plan.rows.length > 0)
    await ctx.db.teachingAssignment.createMany({
      data: plan.rows.map((r) => ({ ...r, createdById: ctx.user.id, updatedById: ctx.user.id })),
      skipDuplicates: true,
    });
  await ctx.audit({
    action: "cur.teaching.copy",
    entityType: "AcademicYear",
    entityId: toYearId,
    before: null,
    after: {
      fromYearId,
      copied: plan.rows.length,
      skippedExisting: plan.skippedExisting,
      skippedInactive: plan.skippedInactive,
    },
  });
  return {
    copied: plan.rows.length,
    skippedExisting: plan.skippedExisting,
    skippedInactive: plan.skippedInactive,
  };
}
