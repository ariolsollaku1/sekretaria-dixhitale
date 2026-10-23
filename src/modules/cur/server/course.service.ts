import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import type { Tx } from "@/lib/db";
import type { CourseInput } from "../domain/schemas";
import { blockingCourseDependents } from "./course-dependents";

type Ctx = ActionContext;
const WRITE = "cur.course.write";

const summary = (c: {
  code: string;
  name: string;
  nameEn: string | null;
  defaultCredits: number;
  categoryId: string | null;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  departmentId: string;
  active: boolean;
}) => ({
  code: c.code,
  name: c.name,
  nameEn: c.nameEn,
  defaultCredits: c.defaultCredits,
  categoryId: c.categoryId,
  hoursLecture: c.hoursLecture,
  hoursSeminar: c.hoursSeminar,
  hoursLab: c.hoursLab,
  departmentId: c.departmentId,
  active: c.active,
});

/** AC-3/AC-4: write permission on one department (sysadmin everywhere, head of department only theirs). */
export async function assertCanWriteDepartment(
  ctx: Pick<Ctx, "user">,
  departmentId: string,
): Promise<void> {
  if (!(await can(ctx.user, WRITE, { kind: "department", id: departmentId })))
    throw new ForbiddenError(WRITE);
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("VALIDATION", "Code already used", { code: ["codeTaken"] });
    }
    throw error;
  }
}

async function checkRefs(db: Tx, input: CourseInput, keepCategoryId?: string | null) {
  const department = await db.department.findUnique({
    where: { id: input.departmentId },
    include: { faculty: { select: { active: true } } },
  });
  if (!department)
    throw new DomainError("VALIDATION", "Department not found", {
      departmentId: ["departmentNotFound"],
    });
  if (!department.active || !department.faculty.active)
    throw new DomainError("VALIDATION", "Department inactive", {
      departmentId: ["departmentInactive"],
    });
  if (input.categoryId && input.categoryId !== keepCategoryId) {
    const category = await db.courseCategory.findUnique({ where: { id: input.categoryId } });
    if (!category)
      throw new DomainError("VALIDATION", "Category not found", {
        categoryId: ["categoryNotFound"],
      });
    if (!category.active)
      throw new DomainError("VALIDATION", "Category inactive", {
        categoryId: ["categoryInactive"],
      });
  }
}

async function assertCodeFree(db: Tx, code: string, exceptId?: string) {
  const clash = await db.course.findFirst({
    where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new DomainError("VALIDATION", "Code already used", { code: ["codeTaken"] });
}

/** Creation used by the form and by the import (same checks, same audit). */
export async function createCourse(ctx: Ctx, input: CourseInput) {
  await assertCanWriteDepartment(ctx, input.departmentId);
  await checkRefs(ctx.db, input);
  await assertCodeFree(ctx.db, input.code);
  const course = await guarded(() =>
    ctx.db.course.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    }),
  );
  await ctx.audit({
    action: "cur.course.create",
    entityType: "Course",
    entityId: course.id,
    before: null,
    after: summary(course),
  });
  return { id: course.id };
}

async function load(db: Tx, id: string) {
  const course = await db.course.findUnique({ where: { id } });
  if (!course) throw new DomainError("NOT_FOUND", "Course not found");
  return course;
}

/** AC-3/AC-4: permission on the current department and, when moving, on the new one. */
export async function updateCourse(ctx: Ctx, id: string, input: CourseInput) {
  const before = await load(ctx.db, id);
  await assertCanWriteDepartment(ctx, before.departmentId);
  if (input.departmentId !== before.departmentId)
    await assertCanWriteDepartment(ctx, input.departmentId);
  await checkRefs(ctx.db, input, before.categoryId);
  await assertCodeFree(ctx.db, input.code, id);
  const after = await guarded(() =>
    ctx.db.course.update({ where: { id }, data: { ...input, updatedById: ctx.user.id } }),
  );
  await ctx.audit({
    action: "cur.course.update",
    entityType: "Course",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
  return { id };
}

/** Used by the import to update an existing course by code (permission checked by the caller's rows). */
export async function updateCourseFromImport(ctx: Ctx, existingId: string, input: CourseInput) {
  return updateCourse(ctx, existingId, input);
}

export async function deactivateCourse(ctx: Ctx, id: string) {
  const course = await load(ctx.db, id);
  await assertCanWriteDepartment(ctx, course.departmentId);
  if (!course.active) throw new DomainError("CONFLICT", "ALREADY_INACTIVE");
  const blocking = await blockingCourseDependents(id);
  if (blocking.length > 0)
    throw new DomainError(
      "CONFLICT",
      `HAS_DEPENDENTS:${blocking.map((b) => `${b.labelKey}=${b.count}`).join(",")}`,
    );
  await ctx.db.course.update({ where: { id }, data: { active: false, updatedById: ctx.user.id } });
  await ctx.audit({
    action: "cur.course.deactivate",
    entityType: "Course",
    entityId: id,
    before: { active: true },
    after: { active: false },
    reason: ctx.reason,
  });
}

export async function reactivateCourse(ctx: Ctx, id: string) {
  const course = await load(ctx.db, id);
  await assertCanWriteDepartment(ctx, course.departmentId);
  if (course.active) throw new DomainError("CONFLICT", "ALREADY_ACTIVE");
  const department = await ctx.db.department.findUniqueOrThrow({
    where: { id: course.departmentId },
    include: { faculty: { select: { active: true } } },
  });
  if (!department.active || !department.faculty.active)
    throw new DomainError("CONFLICT", "DEPARTMENT_INACTIVE");
  await ctx.db.course.update({ where: { id }, data: { active: true, updatedById: ctx.user.id } });
  await ctx.audit({
    action: "cur.course.reactivate",
    entityType: "Course",
    entityId: id,
    before: { active: false },
    after: { active: true },
    reason: ctx.reason,
  });
}
