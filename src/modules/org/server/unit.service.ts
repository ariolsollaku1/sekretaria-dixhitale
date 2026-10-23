import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import type { Tx } from "@/lib/db";
import { canDeactivateFaculty, canPlaceDepartment } from "../domain/unit-rules";

type Ctx = ActionContext;
type UnitFields = { code: string; name: string; nameEn: string | null };

const summary = (u: { code: string; name: string; nameEn: string | null; active: boolean }) => ({
  code: u.code,
  name: u.name,
  nameEn: u.nameEn,
  active: u.active,
});

/** AC-2: codes are unique across faculties AND departments (stored normalised). */
async function assertCodeFree(
  db: Tx,
  code: string,
  except?: { faculty?: string; department?: string },
) {
  const [faculty, department] = await Promise.all([
    db.faculty.findFirst({
      where: { code, ...(except?.faculty ? { id: { not: except.faculty } } : {}) },
      select: { id: true },
    }),
    db.department.findFirst({
      where: { code, ...(except?.department ? { id: { not: except.department } } : {}) },
      select: { id: true },
    }),
  ]);
  if (faculty || department)
    throw new DomainError("VALIDATION", "Code already used", { code: ["codeTaken"] });
}

/** A concurrent create of the same code loses on the unique index. */
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

// ---- faculties ---------------------------------------------------------------------------------

export async function createFaculty(ctx: Ctx, input: UnitFields) {
  await assertCodeFree(ctx.db, input.code);
  const faculty = await guarded(() =>
    ctx.db.faculty.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    }),
  );
  await ctx.audit({
    action: "org.faculty.create",
    entityType: "Faculty",
    entityId: faculty.id,
    before: null,
    after: summary(faculty),
  });
  return { id: faculty.id };
}

async function loadFaculty(db: Tx, id: string) {
  const faculty = await db.faculty.findUnique({ where: { id } });
  if (!faculty) throw new DomainError("NOT_FOUND", "Faculty not found");
  return faculty;
}

export async function updateFaculty(ctx: Ctx, id: string, input: UnitFields) {
  const before = await loadFaculty(ctx.db, id);
  await assertCodeFree(ctx.db, input.code, { faculty: id });
  const after = await guarded(() =>
    ctx.db.faculty.update({ where: { id }, data: { ...input, updatedById: ctx.user.id } }),
  );
  await ctx.audit({
    action: "org.faculty.update",
    entityType: "Faculty",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
  return { id };
}

export async function deactivateFaculty(ctx: Ctx, id: string) {
  const faculty = await loadFaculty(ctx.db, id);
  if (!faculty.active) throw new DomainError("CONFLICT", "ALREADY_INACTIVE");
  const rule = canDeactivateFaculty(
    await ctx.db.department.count({ where: { facultyId: id, active: true } }),
  );
  if (!rule.ok) throw new DomainError("CONFLICT", `${rule.reason}:${rule.count ?? 0}`);
  await ctx.db.faculty.update({ where: { id }, data: { active: false, updatedById: ctx.user.id } });
  await ctx.audit({
    action: "org.faculty.deactivate",
    entityType: "Faculty",
    entityId: id,
    before: { active: true },
    after: { active: false },
    reason: ctx.reason,
  });
}

export async function reactivateFaculty(ctx: Ctx, id: string) {
  const faculty = await loadFaculty(ctx.db, id);
  if (faculty.active) throw new DomainError("CONFLICT", "ALREADY_ACTIVE");
  await ctx.db.faculty.update({ where: { id }, data: { active: true, updatedById: ctx.user.id } });
  await ctx.audit({
    action: "org.faculty.reactivate",
    entityType: "Faculty",
    entityId: id,
    before: { active: false },
    after: { active: true },
    reason: ctx.reason,
  });
}

// ---- departments -------------------------------------------------------------------------------

export async function createDepartment(ctx: Ctx, input: UnitFields & { facultyId: string }) {
  const faculty = await ctx.db.faculty.findUnique({ where: { id: input.facultyId } });
  if (!faculty)
    throw new DomainError("VALIDATION", "Faculty not found", { facultyId: ["facultyNotFound"] });
  if (!canPlaceDepartment(faculty.active).ok)
    throw new DomainError("VALIDATION", "Faculty is inactive", { facultyId: ["facultyInactive"] });
  await assertCodeFree(ctx.db, input.code);
  const department = await guarded(() =>
    ctx.db.department.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    }),
  );
  await ctx.audit({
    action: "org.department.create",
    entityType: "Department",
    entityId: department.id,
    before: null,
    after: { ...summary(department), facultyCode: faculty.code },
  });
  return { id: department.id };
}

async function loadDepartment(db: Tx, id: string) {
  const department = await db.department.findUnique({ where: { id }, include: { faculty: true } });
  if (!department) throw new DomainError("NOT_FOUND", "Department not found");
  return department;
}

/** The faculty is fixed after creation (AC-1): the input has no facultyId. */
export async function updateDepartment(ctx: Ctx, id: string, input: UnitFields) {
  const before = await loadDepartment(ctx.db, id);
  await assertCodeFree(ctx.db, input.code, { department: id });
  const after = await guarded(() =>
    ctx.db.department.update({ where: { id }, data: { ...input, updatedById: ctx.user.id } }),
  );
  await ctx.audit({
    action: "org.department.update",
    entityType: "Department",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
  return { id };
}

export async function deactivateDepartment(ctx: Ctx, id: string) {
  const department = await loadDepartment(ctx.db, id);
  if (!department.active) throw new DomainError("CONFLICT", "ALREADY_INACTIVE");
  await ctx.db.department.update({
    where: { id },
    data: { active: false, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "org.department.deactivate",
    entityType: "Department",
    entityId: id,
    before: { active: true },
    after: { active: false },
    reason: ctx.reason,
  });
}

export async function reactivateDepartment(ctx: Ctx, id: string) {
  const department = await loadDepartment(ctx.db, id);
  if (department.active) throw new DomainError("CONFLICT", "ALREADY_ACTIVE");
  const rule = canPlaceDepartment(department.faculty.active);
  if (!rule.ok) throw new DomainError("CONFLICT", rule.reason);
  await ctx.db.department.update({
    where: { id },
    data: { active: true, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "org.department.reactivate",
    entityType: "Department",
    entityId: id,
    before: { active: false },
    after: { active: true },
    reason: ctx.reason,
  });
}
