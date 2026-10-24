import { describe, expect, it } from "vitest";
import { validateDefinition } from "@/lib/forms/definition";
import { validateAnswers } from "@/lib/forms/answers";
import { INTEREST_FORM } from "./interest-form";
import {
  CSV_MAX_ROWS,
  LEAD_STATUSES,
  allowedTransitions,
  canTransition,
  detectDelimiter,
  inviteBlocker,
  matchProgram,
  parseCsv,
  parseLeadCsv,
} from "./lead-rules";
import { changeLeadStatusSchema, createLeadSchema, importLeadsSchema } from "./lead-schemas";

describe("interest form (AC-1)", () => {
  it("passes the PLT-15 definition schema and names the handler", () => {
    const check = validateDefinition(INTEREST_FORM.definition, INTEREST_FORM.audience);
    expect(check.ok).toBe(true);
    expect(INTEREST_FORM.definition.handler).toBe("adm.interest");
    expect(INTEREST_FORM.audience).toBe("PUBLIC");
    expect(INTEREST_FORM.ownerRoles).toEqual(["secretary", "student_affairs"]);
  });
  it("needs consent to be given", () => {
    const check = validateDefinition(INTEREST_FORM.definition, "PUBLIC");
    if (!check.ok) throw new Error("invalid");
    const base = { firstName: "A", lastName: "B", email: "a@b.co" };
    const without = validateAnswers(check.definition, base, { allowFiles: false });
    expect(without.ok).toBe(false);
    const withConsent = validateAnswers(
      check.definition,
      { ...base, consent: true },
      { allowFiles: false },
    );
    expect(withConsent.ok).toBe(true);
  });
});

describe("transitions (AC-6)", () => {
  it("allows exactly the documented changes", () => {
    expect(allowedTransitions("NEW")).toEqual(["CONTACTED", "APPLIED", "LOST"]);
    expect(allowedTransitions("CONTACTED")).toEqual(["APPLIED", "LOST"]);
    expect(allowedTransitions("APPLIED")).toEqual([]);
    expect(allowedTransitions("LOST")).toEqual(["NEW"]);
    expect(canTransition("CONTACTED", "NEW")).toBe(false);
    for (const s of LEAD_STATUSES) expect(canTransition(s, s)).toBe(false);
  });
  it("needs a reason in the schema only through the service (reason is optional text)", () => {
    expect(changeLeadStatusSchema.safeParse({ leadId: "x", to: "LOST" }).success).toBe(true);
    expect(changeLeadStatusSchema.safeParse({ leadId: "x", to: "GONE" }).success).toBe(false);
  });
});

describe("inviteBlocker (AC-8)", () => {
  const ok = { email: "a@b.co", consent: true, status: "NEW" as const };
  it("allows an open consenting lead with an address", () => {
    expect(inviteBlocker(ok)).toBeNull();
    expect(inviteBlocker({ ...ok, status: "CONTACTED" })).toBeNull();
  });
  it("refuses without address, without consent, or when finished", () => {
    expect(inviteBlocker({ ...ok, email: null })).toBe("NO_EMAIL");
    expect(inviteBlocker({ ...ok, consent: false })).toBe("NO_CONSENT");
    expect(inviteBlocker({ ...ok, status: "LOST" })).toBe("FINISHED");
    expect(inviteBlocker({ ...ok, status: "APPLIED" })).toBe("FINISHED");
  });
});

describe("matchProgram (AC-2)", () => {
  const programs = [
    { id: "1", code: "BSC-INF", name: "Informatikë", nameEn: "Informatics" },
    { id: "2", code: "BA-EKO", name: "Ekonomi", nameEn: null },
    { id: "3", code: "BA-EK2", name: "Ekonomi", nameEn: null },
  ];
  it("matches a code or a name, ignoring case and space", () => {
    expect(matchProgram(" bsc-inf ", programs)).toBe("1");
    expect(matchProgram("INFORMATIKË", programs)).toBe("1");
    expect(matchProgram("informatics", programs)).toBe("1");
  });
  it("leaves it unlinked when empty, unknown or ambiguous", () => {
    expect(matchProgram("", programs)).toBeNull();
    expect(matchProgram(null, programs)).toBeNull();
    expect(matchProgram("Drejtësi", programs)).toBeNull();
    expect(matchProgram("Ekonomi", programs)).toBeNull();
  });
});

describe("createLeadSchema (AC-3)", () => {
  const base = { firstName: "Ana", lastName: "Koci", source: "EVENT" as const };
  it("needs an e-mail or a phone", () => {
    expect(createLeadSchema.safeParse(base).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, phone: "+355" }).success).toBe(true);
    expect(createLeadSchema.safeParse({ ...base, email: "A@B.CO" }).data?.email).toBe("a@b.co");
  });
  it("rejects a bad e-mail, a bad source and missing names", () => {
    expect(createLeadSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, email: "a@b.co", source: "X" }).success).toBe(
      false,
    );
    expect(createLeadSchema.safeParse({ ...base, firstName: " ", email: "a@b.co" }).success).toBe(
      false,
    );
  });
  it("import needs a source", () => {
    expect(importLeadsSchema.safeParse({ csv: "x", source: "EVENT" }).success).toBe(true);
    expect(importLeadsSchema.safeParse({ csv: "x" }).success).toBe(false);
  });
});

describe("CSV parsing (AC-4)", () => {
  it("handles quotes, doubled quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n', ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
  it("detects a semicolon header", () => {
    expect(detectDelimiter("firstName;lastName;email\n")).toBe(";");
    expect(detectDelimiter("firstName,lastName,email\n")).toBe(",");
  });
  it("parses valid rows, normalizes e-mail and reads consent", () => {
    const r = parseLeadCsv(
      "firstName;lastName;email;phone;program;consent\nAna;Koci;ANA@X.CO;;BSC-INF;po\nBen;Lala;;+355;;\n",
    );
    expect(r).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          firstName: "Ana",
          lastName: "Koci",
          email: "ana@x.co",
          phone: null,
          program: "BSC-INF",
          consent: true,
        },
        {
          line: 3,
          firstName: "Ben",
          lastName: "Lala",
          email: null,
          phone: "+355",
          program: null,
          consent: false,
        },
      ],
    });
  });
  it("accepts Albanian header names and ignores unknown columns", () => {
    const r = parseLeadCsv("Emri,Mbiemri,Email,Qyteti\nAna,Koci,a@b.co,Tiranë\n");
    expect(r.ok).toBe(true);
  });
  it("reports every bad row with its line", () => {
    const r = parseLeadCsv(
      "firstName,lastName,email,phone\n,Koci,a@b.co,\nBen,Lala,,\nCia,Dosi,bad,\n",
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        { line: 2, code: "nameRequired" },
        { line: 3, code: "contactRequired" },
        { line: 4, code: "invalidEmail" },
      ],
    });
  });
  it("refuses a file with missing columns, no rows, too many rows or too big", () => {
    expect(parseLeadCsv("firstName,email\nA,a@b.co\n")).toEqual({
      ok: false,
      fileError: "missingColumns",
    });
    expect(parseLeadCsv("firstName,lastName\nA,B\n")).toEqual({
      ok: false,
      fileError: "missingColumns",
    });
    expect(parseLeadCsv("firstName,lastName,email\n")).toEqual({ ok: false, fileError: "empty" });
    expect(parseLeadCsv("")).toEqual({ ok: false, fileError: "empty" });
    const many =
      "firstName,lastName,email\n" +
      Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `A,B,a${i}@b.co`).join("\n");
    expect(parseLeadCsv(many)).toEqual({ ok: false, fileError: "tooManyRows" });
    expect(parseLeadCsv("x".repeat(1024 * 1024 + 1))).toEqual({ ok: false, fileError: "tooBig" });
  });
});
