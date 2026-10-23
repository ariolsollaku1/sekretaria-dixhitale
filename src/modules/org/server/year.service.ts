import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import {
  canMakeCurrent,
  deriveCode,
  hasErrors,
  isEditable,
  validateYear,
  type YearErrors,
} from "../domain/year-rules";
import type { YearFormInput } from "../domain/schemas";
import { getYear, otherYearRanges, toDay, type YearView } from "./year.queries";

type Ctx = ActionContext;

const date = (day: string) => new Date(`${day}T00:00:00Z`);

/** Flattened view used for audit diffs. */
function snapshot(y: Pick<YearView, "code" | "status" | "startDate" | "endDate" | "semesters">) {
  const s = (n: number) => y.semesters.find((x) => x.number === n);
  return {
    code: y.code,
    status: y.status,
    startDate: y.startDate,
    endDate: y.endDate,
    semester1Start: s(1)?.startDate ?? null,
    semester1End: s(1)?.endDate ?? null,
    semester2Start: s(2)?.startDate ?? null,
    semester2End: s(2)?.endDate ?? null,
  };
}

const toFieldErrors = (e: YearErrors): Record<string, string[]> =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? []]));

async function validate(ctx: Ctx, input: YearFormInput, excludeId?: string): Promise<string> {
  const errors = validateYear(input, await otherYearRanges(excludeId, ctx.db));
  const code = deriveCode(input.startDate, input.endDate);
  if (!hasErrors(errors)) {
    const clash = await ctx.db.academicYear.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (clash) errors.startDate = [...(errors.startDate ?? []), "codeTaken"];
  }
  if (hasErrors(errors))
    throw new DomainError("VALIDATION", "Check the dates", toFieldErrors(errors));
  return code;
}

/** AC-1..AC-3: year + both semesters, atomically, as PLANNED. */
export async function createYear(ctx: Ctx, input: YearFormInput) {
  const code = await validate(ctx, input);
  const created = await ctx.db.academicYear.create({
    data: {
      code,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      status: "PLANNED",
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
      semesters: {
        create: [
          { number: 1, startDate: date(input.semester1.start), endDate: date(input.semester1.end) },
          { number: 2, startDate: date(input.semester2.start), endDate: date(input.semester2.end) },
        ],
      },
    },
    include: { semesters: { orderBy: { number: "asc" } } },
  });
  const view: YearView = {
    id: created.id,
    code,
    status: "PLANNED",
    startDate: input.startDate,
    endDate: input.endDate,
    semesters: created.semesters.map((s) => ({
      number: s.number,
      startDate: toDay(s.startDate),
      endDate: toDay(s.endDate),
    })),
  };
  await ctx.audit({
    action: "org.year.create",
    entityType: "AcademicYear",
    entityId: created.id,
    before: null,
    after: snapshot(view),
  });
  return { yearId: created.id, code };
}

/** AC-7/AC-8: not for closed years; validated like creation; audited with the diff. */
export async function updateYear(ctx: Ctx, yearId: string, input: YearFormInput) {
  const current = await getYear(yearId, ctx.db);
  if (!current) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (!isEditable(current.status)) throw new DomainError("CONFLICT", "YEAR_CLOSED");
  const code = await validate(ctx, input, yearId);

  await ctx.db.academicYear.update({
    where: { id: yearId },
    data: {
      code,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      updatedById: ctx.user.id,
    },
  });
  for (const [number, range] of [
    [1, input.semester1],
    [2, input.semester2],
  ] as const) {
    await ctx.db.semester.update({
      where: { academicYearId_number: { academicYearId: yearId, number } },
      data: { startDate: date(range.start), endDate: date(range.end) },
    });
  }
  const after = (await getYear(yearId, ctx.db))!;
  await ctx.audit({
    action: "org.year.update",
    entityType: "AcademicYear",
    entityId: yearId,
    before: snapshot(current),
    after: snapshot(after),
  });
  return { yearId, code };
}

/** AC-5/AC-6: close the previous current year and make this one current, in one transaction. */
export async function makeCurrent(ctx: Ctx, yearId: string) {
  const year = await getYear(yearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  const rule = canMakeCurrent(year.status);
  if (!rule.ok) throw new DomainError("CONFLICT", rule.reason);

  try {
    const previous = await ctx.db.academicYear.findFirst({
      where: { status: "CURRENT" },
      select: { id: true, code: true },
    });
    if (previous) {
      // Close first: the partial unique index allows only one CURRENT row at any time.
      await ctx.db.academicYear.update({
        where: { id: previous.id },
        data: { status: "CLOSED", updatedById: ctx.user.id },
      });
      await ctx.audit({
        action: "org.year.close",
        entityType: "AcademicYear",
        entityId: previous.id,
        before: { status: "CURRENT" },
        after: { status: "CLOSED" },
        reason: ctx.reason,
      });
    }
    await ctx.db.academicYear.update({
      where: { id: yearId },
      data: { status: "CURRENT", updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "org.year.make_current",
      entityType: "AcademicYear",
      entityId: yearId,
      before: { status: "PLANNED" },
      after: { status: "CURRENT" },
      reason: ctx.reason,
    });
    return { yearId, closedYearId: previous?.id ?? null };
  } catch (error) {
    // Two administrators switching at once: the database kept the invariant, tell the loser.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new DomainError("CONFLICT", "CURRENT_EXISTS");
    throw error;
  }
}
