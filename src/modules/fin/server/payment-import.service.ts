import "server-only";
import { randomUUID } from "node:crypto";
import { DomainError, type ActionContext } from "@/lib/actions";
import { db } from "@/lib/db";
import { tableFromFile, type ImportFile } from "@/lib/import/read";
import type { FileError } from "@/lib/import/table";
import { centsOf, formatCents, parseCents } from "../domain/money";
import {
  rowsFromTable,
  validatePaymentRows,
  type RowError,
  type ValidPayment,
} from "../domain/payment-import";
import { dayInTirane, type PaymentMethod } from "../domain/payment-rules";
import * as payments from "./payment.service";

export type { ImportFile };
export type PreviewRow = {
  row: number;
  studentNumber: string;
  studentName: string;
  planId: string;
  amount: string;
  paidOn: string;
  reference: string;
  method: PaymentMethod;
  status: "new" | "duplicate";
};
export type PaymentImportPreview =
  | { ok: false; error: FileError; missing?: string[] }
  | {
      ok: true;
      rows: PreviewRow[];
      errors: RowError[];
      counts: {
        total: number;
        valid: number;
        invalid: number;
        created: number;
        duplicates: number;
      };
    };

/** AC-7, AC-8 (Q-112): parse, match and validate everything, save nothing. */
export async function previewPaymentImport(
  file: ImportFile,
  academicYearId: string,
): Promise<PaymentImportPreview> {
  const table = await tableFromFile(file);
  if (!table.ok) return table;
  const mapped = rowsFromTable(table.table);
  if (!mapped.ok) return mapped;
  const { valid, errors } = validatePaymentRows(mapped.records, dayInTirane());

  const numbers = valid.map((v) => v.studentNumber).filter((v): v is string => !!v);
  const nims = valid.map((v) => v.nim).filter((v): v is string => !!v);
  const plans = await db.paymentPlan.findMany({
    where: {
      academicYearId,
      enrollment: { student: { OR: [{ studentNumber: { in: numbers } }, { nim: { in: nims } }] } },
    },
    select: {
      id: true,
      enrollment: {
        select: {
          student: {
            select: {
              studentNumber: true,
              nim: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  const planOf = (v: ValidPayment) => {
    const found = plans.filter(
      (p) =>
        (v.studentNumber && p.enrollment.student.studentNumber === v.studentNumber) ||
        (v.nim && p.enrollment.student.nim === v.nim),
    );
    return new Set(found.map((p) => p.id)).size === 1 ? found[0]! : found.length;
  };

  const matched: { v: ValidPayment; plan: (typeof plans)[number] }[] = [];
  for (const v of valid) {
    const m = planOf(v);
    if (typeof m === "number")
      errors.push({
        row: v.row,
        field: v.studentNumber ? "student_number" : "nim",
        code: m === 0 ? "noPlan" : "ambiguousPlan",
      });
    else matched.push({ v, plan: m });
  }

  const existing = await db.payment.findMany({
    where: {
      status: "RECORDED",
      planId: { in: matched.map((m) => m.plan.id) },
      paidOn: { in: matched.map((m) => new Date(`${m.v.paidOn}T00:00:00Z`)) },
    },
    select: { planId: true, paidOn: true, amount: true, reference: true },
  });
  const key = (planId: string, paidOn: string, cents: number, reference: string) =>
    `${planId}|${paidOn}|${cents}|${reference}`;
  const known = new Set(
    existing.map((e) =>
      key(e.planId, e.paidOn.toISOString().slice(0, 10), centsOf(e.amount), e.reference),
    ),
  );
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];
  for (const { v, plan } of matched) {
    const k = key(plan.id, v.paidOn, v.amountCents, v.reference);
    if (seen.has(k)) {
      errors.push({ row: v.row, field: "reference", code: "duplicateInFile" });
      continue;
    }
    seen.add(k);
    const s = plan.enrollment.student;
    rows.push({
      row: v.row,
      studentNumber: s.studentNumber,
      studentName: `${s.person.lastName} ${s.person.firstName}`,
      planId: plan.id,
      amount: formatCents(v.amountCents),
      paidOn: v.paidOn,
      reference: v.reference,
      method: v.method,
      status: known.has(k) ? "duplicate" : "new",
    });
  }
  errors.sort((a, b) => a.row - b.row);
  rows.sort((a, b) => a.row - b.row);
  const created = rows.filter((r) => r.status === "new").length;
  return {
    ok: true,
    rows,
    errors,
    counts: {
      total: mapped.records.length,
      valid: rows.length,
      invalid: new Set(errors.map((e) => e.row)).size,
      created,
      duplicates: rows.length - created,
    },
  };
}

/**
 * AC-7: re-validates on the server (nothing from the preview is trusted) and records every new row
 * in the caller's transaction; duplicates are skipped; any invalid row aborts everything.
 * The audit entry of the batch holds counts only; each payment is audited too.
 */
export async function commitPaymentImport(
  ctx: ActionContext,
  file: ImportFile,
  academicYearId: string,
) {
  const preview = await previewPaymentImport(file, academicYearId);
  if (!preview.ok) throw new DomainError("VALIDATION", preview.error, { file: [preview.error] });
  if (preview.errors.length > 0)
    throw new DomainError("VALIDATION", "IMPORT_HAS_ERRORS", { file: ["importHasErrors"] });

  const batch = randomUUID();
  let created = 0;
  for (const r of preview.rows) {
    if (r.status === "duplicate") continue;
    await payments.recordPayment(
      ctx,
      {
        planId: r.planId,
        amount: parseCents(r.amount) ?? 0,
        paidOn: r.paidOn,
        reference: r.reference,
        method: r.method,
        installmentId: null,
      },
      batch,
    );
    created++;
  }
  const skipped = preview.rows.length - created;
  await ctx.audit({
    action: "fin.payment.import",
    entityType: "Payment",
    entityId: batch,
    after: { file: file.name.slice(0, 100), academicYearId, created, skipped },
  });
  return { created, skipped };
}
