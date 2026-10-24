// FIN-02 AC-7, AC-8 (Q-112): pure mapping and validation of the rows of a payments file.
// Matching to students and plans, and duplicates against the database, happen in the service.
import { mapRows, type FileError, type RawRow } from "@/lib/import/table";
import { isDay } from "./fee-rules";
import { parseCents } from "./money";
import { PAYMENT_METHODS, type PaymentMethod } from "./payment-rules";

export const TEMPLATE_COLUMNS = [
  "student_number",
  "nim",
  "amount",
  "paid_on",
  "reference",
  "method",
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];
const REQUIRED: Column[] = ["amount", "paid_on"];

export const TEMPLATE_CSV = `﻿${TEMPLATE_COLUMNS.join(",")}\r\n`;

export type RawPaymentRow = RawRow<Column>;

export function rowsFromTable(
  table: string[][],
): { ok: true; records: RawPaymentRow[] } | { ok: false; error: FileError; missing?: string[] } {
  return mapRows(table, TEMPLATE_COLUMNS, REQUIRED);
}

export type RowError = { row: number; field: string; code: string };
export type ValidPayment = {
  row: number;
  studentNumber: string | null;
  nim: string | null;
  amountCents: number;
  paidOn: string;
  reference: string;
  method: PaymentMethod;
};

/** `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`; anything else is returned unchanged (and fails validation). */
export function normalizeDay(value: string | undefined): string {
  const v = (value ?? "").trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : v;
}

const METHOD_WORDS: Record<string, PaymentMethod> = {
  cash: "CASH",
  para: "CASH",
  para_në_dorë: "CASH",
  bank: "BANK_TRANSFER",
  bank_transfer: "BANK_TRANSFER",
  transfer: "BANK_TRANSFER",
  bankë: "BANK_TRANSFER",
  card: "CARD",
  kartë: "CARD",
  other: "OTHER",
  tjetër: "OTHER",
};

/** "1234,50" and "1234.50" both mean the same; thousands separators are not accepted. */
function amountCents(value: string | undefined): number | null {
  const v = (value ?? "").trim().replace(",", ".");
  const cents = parseCents(v);
  return cents !== null && cents > 0 ? cents : null;
}

/** AC-7: validates the rows; `today` bounds the payment date (no future dates). */
export function validatePaymentRows(
  records: readonly RawPaymentRow[],
  today: string,
): { valid: ValidPayment[]; errors: RowError[] } {
  const valid: ValidPayment[] = [];
  const errors: RowError[] = [];
  for (const r of records) {
    const before = errors.length;
    const err = (field: string, code: string) => errors.push({ row: r.row, field, code });
    const studentNumber = (r.student_number ?? "").trim() || null;
    const nim = (r.nim ?? "").trim() || null;
    if (!studentNumber && !nim) err("student_number", "required");
    const cents = amountCents(r.amount);
    if (cents === null) err("amount", "amount");
    const paidOn = normalizeDay(r.paid_on);
    if (!isDay(paidOn)) err("paid_on", "invalidDate");
    else if (paidOn > today) err("paid_on", "future");
    const reference = (r.reference ?? "").trim();
    if (reference.length > 120) err("reference", "tooLong");
    const rawMethod = (r.method ?? "").trim();
    const key = rawMethod.toLowerCase().replace(/\s+/g, "_");
    const method: PaymentMethod | null =
      rawMethod === ""
        ? "BANK_TRANSFER"
        : (PAYMENT_METHODS as readonly string[]).includes(rawMethod.toUpperCase())
          ? (rawMethod.toUpperCase() as PaymentMethod)
          : (METHOD_WORDS[key] ?? null);
    if (!method) err("method", "method");
    if (errors.length === before && cents !== null && method)
      valid.push({ row: r.row, studentNumber, nim, amountCents: cents, paidOn, reference, method });
  }
  return { valid, errors };
}
