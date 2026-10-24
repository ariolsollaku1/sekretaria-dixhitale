// Pure rules of the leads (ADM-01). No I/O.

export const INTEREST_HANDLER = "adm.interest";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "APPLIED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = ["WEBSITE", "CAMPAIGN", "EVENT", "OTHER"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** AC-6 (Q-136 working assumption). APPLIED is final until ADM-02 links applications. */
export const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["CONTACTED", "APPLIED", "LOST"],
  CONTACTED: ["APPLIED", "LOST"],
  APPLIED: [],
  LOST: ["NEW"],
};
export const allowedTransitions = (from: LeadStatus): readonly LeadStatus[] => TRANSITIONS[from];
export const canTransition = (from: LeadStatus, to: LeadStatus): boolean =>
  TRANSITIONS[from].includes(to);

/** AC-8: who may be invited — an address, consent, and a lead that is still open. */
export function inviteBlocker(lead: {
  email: string | null;
  consent: boolean;
  status: LeadStatus;
}): "NO_EMAIL" | "NO_CONSENT" | "FINISHED" | null {
  if (lead.status === "LOST" || lead.status === "APPLIED") return "FINISHED";
  if (!lead.email) return "NO_EMAIL";
  if (!lead.consent) return "NO_CONSENT";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => v.length <= 254 && EMAIL.test(v);
export const normalizeEmail = (v: string) => v.trim().toLowerCase();

export type ProgramRef = { id: string; code: string; name: string; nameEn: string | null };

/**
 * AC-2 (Q-135): the program a typed text refers to — its code or name (either language), ignoring
 * case and surrounding space. Only a single match counts; none or several leave it unlinked.
 */
export function matchProgram(
  text: string | null | undefined,
  programs: ProgramRef[],
): string | null {
  const needle = (text ?? "").trim().toLowerCase();
  if (!needle) return null;
  const hits = programs.filter(
    (p) =>
      p.code.toLowerCase() === needle ||
      p.name.trim().toLowerCase() === needle ||
      (p.nameEn ?? "").trim().toLowerCase() === needle,
  );
  return hits.length === 1 ? hits[0]!.id : null;
}

// ---- CSV import (AC-4, Q-137) ----------------------------------------------------------------------

export const CSV_MAX_BYTES = 1024 * 1024;
export const CSV_MAX_ROWS = 1000;

/** Splits CSV text into rows of cells; handles quotes, doubled quotes, CRLF and a BOM. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** `;` when the header line has more of them than `,` (spreadsheets in Albanian locales). */
export function detectDelimiter(text: string): string {
  const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => header.split(ch).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

export type CsvLead = {
  line: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  consent: boolean;
};
export type CsvError = { line: number; code: string };
export type CsvResult =
  | { ok: true; rows: CsvLead[] }
  | { ok: false; fileError: string }
  | { ok: false; errors: CsvError[] };

const YES = new Set(["yes", "y", "po", "1", "true", "x"]);
const HEADER_ALIASES: Record<string, string> = {
  firstname: "firstName",
  first_name: "firstName",
  emri: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  mbiemri: "lastName",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  telefon: "phone",
  telefoni: "phone",
  program: "program",
  programi: "program",
  consent: "consent",
  pelqim: "consent",
  pëlqim: "consent",
};

/** AC-4: parse and validate a whole file; one bad row refuses the file (Q-137). */
export function parseLeadCsv(text: string): CsvResult {
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES)
    return { ok: false, fileError: "tooBig" };
  const table = parseCsv(text, detectDelimiter(text));
  if (table.length === 0) return { ok: false, fileError: "empty" };
  const header = table[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  for (const required of ["firstName", "lastName"])
    if (!header.includes(required)) return { ok: false, fileError: "missingColumns" };
  if (!header.includes("email") && !header.includes("phone"))
    return { ok: false, fileError: "missingColumns" };
  const data = table.slice(1);
  if (data.length === 0) return { ok: false, fileError: "empty" };
  if (data.length > CSV_MAX_ROWS) return { ok: false, fileError: "tooManyRows" };

  const rows: CsvLead[] = [];
  const errors: CsvError[] = [];
  data.forEach((cells, index) => {
    const line = index + 2;
    const value = (key: string) => {
      const col = header.indexOf(key);
      return col >= 0 ? (cells[col] ?? "").trim() : "";
    };
    const firstName = value("firstName");
    const lastName = value("lastName");
    const email = value("email");
    const phone = value("phone");
    const before = errors.length;
    if (!firstName || !lastName) errors.push({ line, code: "nameRequired" });
    if (firstName.length > 100 || lastName.length > 100) errors.push({ line, code: "tooLong" });
    if (!email && !phone) errors.push({ line, code: "contactRequired" });
    if (email && !isEmail(email)) errors.push({ line, code: "invalidEmail" });
    if (phone.length > 40) errors.push({ line, code: "tooLong" });
    if (errors.length > before) return;
    rows.push({
      line,
      firstName,
      lastName,
      email: email ? normalizeEmail(email) : null,
      phone: phone || null,
      program: value("program") || null,
      consent: YES.has(value("consent").toLowerCase()),
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}
