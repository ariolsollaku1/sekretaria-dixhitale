import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import type { Tx } from "@/lib/db";
import { hasProgramErrors, validateProgramShape, type Cycle } from "../domain/program-rules";
import { blockingDependents } from "./program-dependents";
import { getProgramConfig } from "./program.queries";

type Ctx = ActionContext;
type ProgramFields = {
  cycle: Cycle;
  subtype: string | null;
  code: string;
  name: string;
  nameEn: string | null;
  durationYears: number;
  totalCredits: number;
};

const summary = (p: ProgramFields & { active: boolean }) => ({
  code: p.code,
  name: p.name,
  nameEn: p.nameEn,
  cycle: p.cycle,
  subtype: p.subtype,
  durationYears: p.durationYears,
  totalCredits: p.totalCredits,
  active: p.active,
});

async function checkShape(ctx: Ctx, input: ProgramFields, keepSubtype?: string | null) {
  const errors = validateProgramShape(input, await getProgramConfig(ctx.db), keepSubtype);
  if (hasProgramErrors(errors))
    throw new DomainError("VALIDATION", "Check the program", errors as Record<string, string[]>);
}

async function assertCodeFree(db: Tx, code: string, exceptId?: string) {
  const clash = await db.studyProgram.findFirst({
    where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new DomainError("VALIDATION", "Code already used", { code: ["codeTaken"] });
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

/** "dependents:cohorts:3,plans:1" travels in the message so the UI can name what blocks. */
async function assertNoBlockingDependents(programId: string) {
  const blocking = await blockingDependents(programId);
  if (blocking.length > 0) {
    throw new DomainError(
      "CONFLICT",
      `HAS_DEPENDENTS:${blocking.map((b) => `${b.labelKey}=${b.count}`).join(",")}`,
    );
  }
}

export async function createProgram(ctx: Ctx, input: ProgramFields & { departmentId: string }) {
  const department = await ctx.db.department.findUnique({
    where: { id: input.departmentId },
    include: { faculty: true },
  });
  if (!department)
    throw new DomainError("VALIDATION", "Department not found", {
      departmentId: ["departmentNotFound"],
    });
  if (!department.active || !department.faculty.active)
    throw new DomainError("VALIDATION", "Department inactive", {
      departmentId: ["departmentInactive"],
    });
  await checkShape(ctx, input);
  await assertCodeFree(ctx.db, input.code);
  const program = await guarded(() =>
    ctx.db.studyProgram.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    }),
  );
  await ctx.audit({
    action: "org.program.create",
    entityType: "StudyProgram",
    entityId: program.id,
    before: null,
    after: { ...summary(program), departmentCode: department.code },
  });
  return { id: program.id };
}

async function load(db: Tx, id: string) {
  const program = await db.studyProgram.findUnique({
    where: { id },
    include: { department: { include: { faculty: true } } },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");
  return program;
}

/** AC-5/AC-6: the department is fixed; cycle or duration changes are blocked by dependents. */
export async function updateProgram(ctx: Ctx, id: string, input: ProgramFields) {
  const before = await load(ctx.db, id);
  await checkShape(ctx, input, before.subtype);
  await assertCodeFree(ctx.db, input.code, id);
  if (input.cycle !== before.cycle || input.durationYears !== before.durationYears)
    await assertNoBlockingDependents(id);
  const after = await guarded(() =>
    ctx.db.studyProgram.update({ where: { id }, data: { ...input, updatedById: ctx.user.id } }),
  );
  await ctx.audit({
    action: "org.program.update",
    entityType: "StudyProgram",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
  return { id };
}

export async function deactivateProgram(ctx: Ctx, id: string) {
  const program = await load(ctx.db, id);
  if (!program.active) throw new DomainError("CONFLICT", "ALREADY_INACTIVE");
  await assertNoBlockingDependents(id);
  await ctx.db.studyProgram.update({
    where: { id },
    data: { active: false, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "org.program.deactivate",
    entityType: "StudyProgram",
    entityId: id,
    before: { active: true },
    after: { active: false },
    reason: ctx.reason,
  });
}

/** AC-7: not under an inactive department (or faculty). */
export async function reactivateProgram(ctx: Ctx, id: string) {
  const program = await load(ctx.db, id);
  if (program.active) throw new DomainError("CONFLICT", "ALREADY_ACTIVE");
  if (!program.department.active || !program.department.faculty.active)
    throw new DomainError("CONFLICT", "DEPARTMENT_INACTIVE");
  await ctx.db.studyProgram.update({
    where: { id },
    data: { active: true, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "org.program.reactivate",
    entityType: "StudyProgram",
    entityId: id,
    before: { active: false },
    after: { active: true },
    reason: ctx.reason,
  });
}
