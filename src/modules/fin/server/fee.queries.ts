import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import type { DiscountKind, FeeKind } from "../domain/fee-rules";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
/** AC-12: a Decimal(12,2) as its two-decimal string. */
export const money = (d: { toFixed(n: number): string }) => d.toFixed(2);

/** AC-10/AC-11: the programs a reader may see (institution = all). */
export async function finProgramScope(
  user: { id: string },
  permission:
    "fin.fee.read" | "fin.fee.write" | "fin.plan.read" | "fin.plan.write" | "fin.payment.read",
): Promise<Prisma.StudyProgramWhereInput> {
  const g = await grantScopes(user, permission);
  if (g.institution) return {};
  return {
    OR: [
      { id: { in: g.programIds } },
      { departmentId: { in: g.departmentIds } },
      { department: { facultyId: { in: g.facultyIds } } },
    ],
  };
}

export type FeeItemView = {
  id: string;
  programId: string;
  kind: FeeKind;
  label: string;
  amount: string;
  active: boolean;
  installments: { dueDate: string; amount: string }[];
  discounts: {
    label: string;
    kind: DiscountKind;
    value: string;
    validFrom: string;
    validTo: string;
  }[];
};
export type FeeProgramView = { id: string; code: string; name: string; items: FeeItemView[] };

/** AC-1: the fee schedule of an academic year, per program within the reader's scope. */
export async function feeBoard(
  user: { id: string },
  yearId: string,
  programCode?: string,
): Promise<FeeProgramView[]> {
  const programs = await db.studyProgram.findMany({
    where: {
      active: true,
      AND: [await finProgramScope(user, "fin.fee.read"), programCode ? { code: programCode } : {}],
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      feeItems: {
        where: { academicYearId: yearId },
        orderBy: [{ kind: "asc" }, { label: "asc" }],
        include: {
          installments: { orderBy: { sequence: "asc" } },
          discounts: { orderBy: { validFrom: "asc" } },
        },
      },
    },
  });
  return programs.map(toProgramView);
}

type ProgramRow = Prisma.StudyProgramGetPayload<{
  select: {
    id: true;
    code: true;
    name: true;
    feeItems: { include: { installments: true; discounts: true } };
  };
}>;

const toProgramView = (p: ProgramRow): FeeProgramView => ({
  id: p.id,
  code: p.code,
  name: p.name,
  items: p.feeItems.map((i) => ({
    id: i.id,
    programId: i.programId,
    kind: i.kind,
    label: i.label,
    amount: money(i.amount),
    active: i.active,
    installments: [...i.installments]
      .sort((a, b) => a.sequence - b.sequence)
      .map((t) => ({ dueDate: toDay(t.dueDate), amount: money(t.amount) })),
    discounts: [...i.discounts]
      .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
      .map((d) => ({
        label: d.label,
        kind: d.kind,
        value: money(d.value),
        validFrom: toDay(d.validFrom),
        validTo: toDay(d.validTo),
      })),
  })),
});

/**
 * ADM-06 AC-4/AC-8: the active fees of a year with their preferential windows, with no user scope
 * (the data of a published registration notice is public). One program, or every active program
 * that has fees.
 */
export async function feeSummary(yearId: string, programId?: string | null) {
  const programs = await db.studyProgram.findMany({
    where: { active: true, ...(programId ? { id: programId } : {}) },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      feeItems: {
        where: { academicYearId: yearId, active: true },
        orderBy: [{ kind: "asc" }, { label: "asc" }],
        include: { installments: true, discounts: true },
      },
    },
  });
  return programs.filter((p) => p.feeItems.length > 0).map(toProgramView);
}

/** Programs for the pickers (active, within the reader's scope). */
export async function listProgramOptions(
  user: { id: string },
  permission: "fin.fee.read" | "fin.plan.read",
) {
  const rows = await db.studyProgram.findMany({
    where: { active: true, ...(await finProgramScope(user, permission)) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}
