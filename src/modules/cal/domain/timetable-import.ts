// Pure import logic for the timetable (CAL-02 AC-6): map, normalize and validate rows. No I/O.
import { mapRows, type FileError, type RawRow } from "@/lib/import/table";
import { parseTime } from "./timetable-rules";

export const TEMPLATE_COLUMNS = [
  "program",
  "cohort",
  "group",
  "course",
  "kind",
  "weekday",
  "start",
  "end",
  "room",
  "valid_from",
  "valid_to",
  "lecturer_email",
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];
const REQUIRED: Column[] = [
  "program",
  "cohort",
  "group",
  "course",
  "kind",
  "weekday",
  "start",
  "end",
];

export const TEMPLATE_CSV = `﻿${TEMPLATE_COLUMNS.join(",")}\r\n`;

export type RawSlotRow = RawRow<Column>;
export function rowsFromTable(
  table: string[][],
): { ok: true; records: RawSlotRow[] } | { ok: false; error: FileError; missing?: string[] } {
  return mapRows(table, TEMPLATE_COLUMNS, REQUIRED);
}

const KINDS: Record<string, "LECTURE" | "SEMINAR" | "LAB"> = {
  lecture: "LECTURE",
  leksion: "LECTURE",
  seminar: "SEMINAR",
  lab: "LAB",
  laborator: "LAB",
  laboratory: "LAB",
};
const DAYS: Record<string, number> = {
  "1": 1,
  mon: 1,
  monday: 1,
  "e hënë": 1,
  hene: 1,
  "2": 2,
  tue: 2,
  tuesday: 2,
  "e martë": 2,
  marte: 2,
  "3": 3,
  wed: 3,
  wednesday: 3,
  "e mërkurë": 3,
  merkure: 3,
  "4": 4,
  thu: 4,
  thursday: 4,
  "e enjte": 4,
  enjte: 4,
  "5": 5,
  fri: 5,
  friday: 5,
  "e premte": 5,
  premte: 5,
  "6": 6,
  sat: 6,
  saturday: 6,
  "e shtunë": 6,
  shtune: 6,
  "7": 7,
  sun: 7,
  sunday: 7,
  "e diel": 7,
  diel: 7,
};

/** `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`; blank stays blank. */
export function normalizeDay(value: string | undefined): string {
  const v = (value ?? "").trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : v;
}

export type ParsedSlotRow = {
  row: number;
  program: string;
  cohort: string;
  group: string;
  course: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  validFrom: string | null;
  validTo: string | null;
  lecturerEmail: string | null;
};
export type RowError = { row: number; field: string; code: string };

/** Syntax only; resolving names to assignments and clashes happen on the server. */
export function parseRows(records: readonly RawSlotRow[]): {
  rows: ParsedSlotRow[];
  errors: RowError[];
} {
  const rows: ParsedSlotRow[] = [];
  const errors: RowError[] = [];
  for (const r of records) {
    const before = errors.length;
    const err = (field: string, code: string) => errors.push({ row: r.row, field, code });
    for (const f of ["program", "cohort", "group", "course"] as const)
      if (!(r[f] ?? "").trim()) err(f, "required");
    const kind = KINDS[(r.kind ?? "").trim().toLowerCase()];
    if (!kind) err("kind", "invalidKind");
    const weekday = DAYS[(r.weekday ?? "").trim().toLowerCase()];
    if (!weekday) err("weekday", "weekdayRange");
    const start = parseTime(r.start ?? "");
    const end = parseTime(r.end ?? "");
    if (start === null || start >= 1440) err("start", "timeRange");
    if (end === null || end <= 0) err("end", "timeRange");
    else if (start !== null && end <= start) err("end", "endBeforeStart");
    const from = normalizeDay(r.valid_from);
    const to = normalizeDay(r.valid_to);
    for (const [k, v] of [
      ["valid_from", from],
      ["valid_to", to],
    ] as const)
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) err(k, "invalidDate");
    if (errors.length === before)
      rows.push({
        row: r.row,
        program: r.program!.trim(),
        cohort: r.cohort!.trim(),
        group: r.group!.trim(),
        course: r.course!.trim(),
        kind: kind!,
        weekday: weekday!,
        startMinute: start!,
        endMinute: end!,
        room: (r.room ?? "").trim() || null,
        validFrom: from || null,
        validTo: to || null,
        lecturerEmail: (r.lecturer_email ?? "").trim().toLowerCase() || null,
      });
  }
  return { rows, errors };
}
