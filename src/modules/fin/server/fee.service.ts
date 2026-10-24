import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getYear } from "@/modules/org";
import { validateDiscount, validateInstallments } from "../domain/fee-rules";
import { MAX_CENTS, formatCents } from "../domain/money";
import type { FeeItemInput } from "../domain/schemas";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const day = (d: Date) => d.toISOString().slice(0, 10);

function refuse(errors: Record<string, string | undefined>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the fee",
    Object.fromEntries(
      Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, [v!]]),
    ),
  );
}

/** AC-5: nothing changes in a closed year. */
export async function assertYearOpen(ctx: Ctx, academicYearId: string) {
  const year = await getYear(academicYearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  return year;
}

const itemInclude = {
  installments: { orderBy: { sequence: "asc" as const } },
  discounts: { orderBy: { validFrom: "asc" as const } },
};

type ItemRow = Prisma.FeeScheduleItemGetPayload<{ include: typeof itemInclude }>;

const snapshot = (i: ItemRow) => ({
  programId: i.programId,
  academicYearId: i.academicYearId,
  kind: i.kind,
  label: i.label,
  amount: i.amount.toFixed(2),
  active: i.active,
  installments: i.installments.map((t) => `${day(t.dueDate)} ${t.amount.toFixed(2)}`),
  discounts: i.discounts.map(
    (d) => `${d.label}|${d.kind} ${d.value.toFixed(2)} ${day(d.validFrom)}..${day(d.validTo)}`,
  ),
});

/**
 * AC-1..AC-3: create or replace a fee with its installments and discounts in one go. Plans already
 * generated are copies and are not touched.
 */
export async function saveFeeItem(ctx: Ctx, input: FeeItemInput) {
  await assertYearOpen(ctx, input.academicYearId);
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: input.programId },
    select: { id: true, active: true },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");
  if (!program.active) refuse({ programId: "inactive" });

  const errors: Record<string, string> = {};
  if (input.amount <= 0 || input.amount > MAX_CENTS) errors.amount = "range";
  else {
    Object.assign(
      errors,
      validateInstallments(
        input.amount,
        input.installments.map((r) => ({ dueDate: r.dueDate, amountCents: r.amount })),
      ),
    );
    for (const d of input.discounts) {
      const e = validateDiscount(input.amount, { ...d });
      if (Object.keys(e).length > 0) {
        errors.discounts = e.window ?? e.value ?? "range";
        break;
      }
    }
  }
  if (Object.keys(errors).length > 0) refuse(errors);

  const data = {
    kind: input.kind,
    label: input.label,
    amount: formatCents(input.amount),
  };
  const children = (itemId: string) => ({
    installments: input.installments.map((r, n) => ({
      itemId,
      sequence: n + 1,
      dueDate: date(r.dueDate),
      amount: formatCents(r.amount),
    })),
    discounts: input.discounts.map((d) => ({
      itemId,
      label: d.label,
      kind: d.kind,
      value: formatCents(d.value),
      validFrom: date(d.validFrom),
      validTo: date(d.validTo),
    })),
  });

  try {
    if (!input.itemId) {
      const created = await ctx.db.feeScheduleItem.create({
        data: {
          ...data,
          programId: input.programId,
          academicYearId: input.academicYearId,
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
      const c = children(created.id);
      await ctx.db.feeInstallmentTemplate.createMany({ data: c.installments });
      await ctx.db.feeDiscount.createMany({ data: c.discounts });
      const after = await ctx.db.feeScheduleItem.findUniqueOrThrow({
        where: { id: created.id },
        include: itemInclude,
      });
      await ctx.audit({
        action: "fin.fee.create",
        entityType: "FeeScheduleItem",
        entityId: created.id,
        before: null,
        after: snapshot(after),
      });
      return { itemId: created.id };
    }

    const before = await ctx.db.feeScheduleItem.findUnique({
      where: { id: input.itemId },
      include: itemInclude,
    });
    if (!before) throw new DomainError("NOT_FOUND", "Fee not found");
    if (before.programId !== input.programId || before.academicYearId !== input.academicYearId)
      throw new DomainError("NOT_FOUND", "Fee not found");
    await ctx.db.feeScheduleItem.update({
      where: { id: before.id },
      data: { ...data, updatedById: ctx.user.id },
    });
    await ctx.db.feeInstallmentTemplate.deleteMany({ where: { itemId: before.id } });
    await ctx.db.feeDiscount.deleteMany({ where: { itemId: before.id } });
    const c = children(before.id);
    await ctx.db.feeInstallmentTemplate.createMany({ data: c.installments });
    await ctx.db.feeDiscount.createMany({ data: c.discounts });
    const after = await ctx.db.feeScheduleItem.findUniqueOrThrow({
      where: { id: before.id },
      include: itemInclude,
    });
    await ctx.audit({
      action: "fin.fee.update",
      entityType: "FeeScheduleItem",
      entityId: before.id,
      before: snapshot(before),
      after: snapshot(after),
    });
    return { itemId: before.id };
  } catch (e) {
    if (isUnique(e)) return refuse({ label: "duplicate" });
    throw e;
  }
}

/** AC-4: deactivate or reactivate a fee (it is never deleted). */
export async function setItemActive(ctx: Ctx, itemId: string, active: boolean) {
  const item = await ctx.db.feeScheduleItem.findUnique({ where: { id: itemId } });
  if (!item) throw new DomainError("NOT_FOUND", "Fee not found");
  await assertYearOpen(ctx, item.academicYearId);
  if (item.active === active) return { itemId };
  await ctx.db.feeScheduleItem.update({
    where: { id: itemId },
    data: { active, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: active ? "fin.fee.activate" : "fin.fee.deactivate",
    entityType: "FeeScheduleItem",
    entityId: itemId,
    before: { active: item.active },
    after: { active },
  });
  return { itemId };
}
