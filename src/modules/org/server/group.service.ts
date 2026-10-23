import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { planBulkGroups, yearNotBeforeCohort } from "../domain/cohort-rules";
import type { GroupInput } from "../domain/schemas";
import { blockingGroupDependents, dependentsMessage } from "./cohort-dependents";
import { getCohortRow, getDefaultGroupName, listYearRefs } from "./cohort.queries";
import { getYear, toDay } from "./year.queries";

type Ctx = ActionContext;

const snapshot = (g: {
  name: string;
  capacity: number | null;
  active: boolean;
  yearOfStudy: number;
  academicYearId: string;
  cohortId: string;
}) => ({
  cohortId: g.cohortId,
  academicYearId: g.academicYearId,
  yearOfStudy: g.yearOfStudy,
  name: g.name,
  capacity: g.capacity,
  active: g.active,
});

const nameTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** AC-6/AC-7 */
export async function createGroup(ctx: Ctx, input: GroupInput) {
  const cohort = await getCohortRow(input.cohortId, ctx.db);
  if (!cohort) throw new DomainError("NOT_FOUND", "Cohort not found");
  const year = await getYear(input.academicYearId, ctx.db);
  if (!year)
    throw new DomainError("VALIDATION", "Check the year", { academicYearId: ["unknownYear"] });
  const errors: Record<string, string[]> = {};
  if (year.status === "CLOSED") errors.academicYearId = ["yearClosed"];
  else if (!yearNotBeforeCohort(year.startDate, toDay(cohort.startYear.startDate)))
    errors.academicYearId = ["beforeCohortStart"];
  if (input.yearOfStudy > cohort.program.durationYears) errors.yearOfStudy = ["yearOutOfRange"];
  if (!cohort.active) throw new DomainError("CONFLICT", "COHORT_INACTIVE");
  if (Object.keys(errors).length > 0)
    throw new DomainError("VALIDATION", "Check the group", errors);
  try {
    const group = await ctx.db.studentGroup.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "org.group.create",
      entityType: "StudentGroup",
      entityId: group.id,
      before: null,
      after: snapshot({ ...input, active: true }),
    });
    return { groupId: group.id };
  } catch (error) {
    if (nameTaken(error))
      throw new DomainError("VALIDATION", "Check the name", { name: ["nameTaken"] });
    throw error;
  }
}

async function loadGroup(ctx: Ctx, groupId: string) {
  const group = await ctx.db.studentGroup.findUnique({
    where: { id: groupId },
    include: { academicYear: { select: { status: true } } },
  });
  if (!group) throw new DomainError("NOT_FOUND", "Group not found");
  return group;
}

export async function updateGroup(
  ctx: Ctx,
  groupId: string,
  input: { name: string; capacity: number | null },
) {
  const before = await loadGroup(ctx, groupId);
  if (before.academicYear.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  try {
    await ctx.db.studentGroup.update({
      where: { id: groupId },
      data: { name: input.name, capacity: input.capacity, updatedById: ctx.user.id },
    });
  } catch (error) {
    if (nameTaken(error))
      throw new DomainError("VALIDATION", "Check the name", { name: ["nameTaken"] });
    throw error;
  }
  await ctx.audit({
    action: "org.group.update",
    entityType: "StudentGroup",
    entityId: groupId,
    before: snapshot(before),
    after: snapshot({ ...before, ...input }),
  });
  return { groupId };
}

/** AC-8 */
export async function setGroupActive(ctx: Ctx, groupId: string, active: boolean) {
  const before = await loadGroup(ctx, groupId);
  if (before.academicYear.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  if (before.active === active)
    throw new DomainError("CONFLICT", active ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE");
  if (!active) {
    const blocking = await blockingGroupDependents(groupId);
    if (blocking.length > 0) throw new DomainError("CONFLICT", dependentsMessage(blocking));
  }
  await ctx.db.studentGroup.update({
    where: { id: groupId },
    data: { active, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: active ? "org.group.reactivate" : "org.group.deactivate",
    entityType: "StudentGroup",
    entityId: groupId,
    before: { active: before.active },
    after: { active },
    reason: ctx.reason,
  });
  return { groupId };
}

/** AC-9/AC-10: what the start-of-year tool would create for a year. Reads only. */
export async function previewStartOfYear(yearId: string, client: Ctx["db"]) {
  const [years, cohorts, defaultName] = await Promise.all([
    listYearRefs(client),
    client.cohort.findMany({
      where: { active: true, program: { active: true } },
      select: {
        id: true,
        name: true,
        startAcademicYearId: true,
        program: { select: { code: true, durationYears: true } },
        groups: { where: { academicYearId: yearId, active: true }, select: { yearOfStudy: true } },
      },
      orderBy: [{ program: { code: "asc" } }, { name: "asc" }],
    }),
    getDefaultGroupName(client),
  ]);
  const plan = planBulkGroups(
    years,
    yearId,
    cohorts.map((c) => {
      const byYear = new Map<number, number>();
      for (const g of c.groups) byYear.set(g.yearOfStudy, (byYear.get(g.yearOfStudy) ?? 0) + 1);
      return {
        id: c.id,
        name: c.name,
        startAcademicYearId: c.startAcademicYearId,
        durationYears: c.program.durationYears,
        activeGroupsByYear: byYear,
      };
    }),
    defaultName,
  );
  const programOf = new Map(cohorts.map((c) => [c.id, c.program.code]));
  return plan.map((g) => ({ ...g, programCode: programOf.get(g.cohortId) ?? "" }));
}

/** AC-9: creates the planned groups in the caller's transaction; running it again creates nothing. */
export async function startOfYear(ctx: Ctx, yearId: string) {
  const year = await getYear(yearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  const plan = await previewStartOfYear(yearId, ctx.db);
  for (const g of plan) {
    // an inactive group with the same key is brought back instead of colliding with it
    const existing = await ctx.db.studentGroup.findFirst({
      where: {
        cohortId: g.cohortId,
        academicYearId: yearId,
        yearOfStudy: g.yearOfStudy,
        name: g.name,
      },
    });
    if (existing) {
      await ctx.db.studentGroup.update({
        where: { id: existing.id },
        data: { active: true, updatedById: ctx.user.id },
      });
      await ctx.audit({
        action: "org.group.reactivate",
        entityType: "StudentGroup",
        entityId: existing.id,
        before: { active: false },
        after: { active: true },
      });
      continue;
    }
    const created = await ctx.db.studentGroup.create({
      data: {
        cohortId: g.cohortId,
        academicYearId: yearId,
        yearOfStudy: g.yearOfStudy,
        name: g.name,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "org.group.create",
      entityType: "StudentGroup",
      entityId: created.id,
      before: null,
      after: snapshot({
        cohortId: g.cohortId,
        academicYearId: yearId,
        yearOfStudy: g.yearOfStudy,
        name: g.name,
        capacity: null,
        active: true,
      }),
    });
  }
  return { created: plan.length };
}
