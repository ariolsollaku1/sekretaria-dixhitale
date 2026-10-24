import { describe, expect, it } from "vitest";
import { validateDefinition } from "@/lib/forms/definition";
import { validateAnswers } from "@/lib/forms/answers";
import { REQUEST_FORMS } from "./request-forms";
import { clampEffectiveDate, identityMatches, pickEnrollment } from "./request-rules";

describe("request definitions (AC-1)", () => {
  it("has the four forms with unique keys", () => {
    expect(REQUEST_FORMS.map((f) => f.key).sort()).toEqual([
      "deregistration",
      "deregistration-student",
      "recognition",
      "recognition-student",
    ]);
  });
  it.each(REQUEST_FORMS)("$key passes the PLT-15 schema", (f) => {
    const check = validateDefinition(f.definition, f.audience);
    expect(check.ok).toBe(true);
  });
  it("public forms carry no file, the recognition form of students may", () => {
    const types = (key: string) =>
      (REQUEST_FORMS.find((f) => f.key === key)!.definition.fields as { type: string }[]).map(
        (x) => x.type,
      );
    expect(types("recognition")).not.toContain("file");
    expect(types("recognition-student")).toContain("file");
  });
  it("public forms ask for identity, in-portal forms do not", () => {
    const keys = (key: string) =>
      (REQUEST_FORMS.find((f) => f.key === key)!.definition.fields as { key: string }[]).map(
        (x) => x.key,
      );
    expect(keys("deregistration")).toEqual(expect.arrayContaining(["studentNumber", "birthDate"]));
    expect(keys("deregistration-student")).not.toContain("studentNumber");
  });
  it("every state is reachable from the initial one and ends in approved or rejected", () => {
    for (const f of REQUEST_FORMS) {
      const w = f.definition.workflow as {
        initial: string;
        states: { key: string; kind?: string; final?: boolean }[];
        transitions: { from: string; to: string }[];
      };
      const reached = new Set([w.initial]);
      for (let i = 0; i < w.states.length; i++)
        for (const t of w.transitions) if (reached.has(t.from)) reached.add(t.to);
      expect(reached.size).toBe(w.states.length);
      expect(w.states.filter((s) => s.kind === "approved" && s.final)).toHaveLength(1);
    }
  });
  it("a deregistration needs the confirmation and a reason", () => {
    const def = validateDefinition(
      REQUEST_FORMS.find((f) => f.key === "deregistration-student")!.definition,
      "AUTHENTICATED",
    );
    if (!def.ok) throw new Error("invalid");
    const bad = validateAnswers(def.definition, { requestedDate: "2026-10-01" });
    expect(bad.ok).toBe(false);
    const good = validateAnswers(def.definition, {
      reason: "Kalim në punë",
      requestedDate: "2026-10-01",
      confirm: true,
    });
    expect(good.ok).toBe(true);
  });
});

describe("clampEffectiveDate (AC-3)", () => {
  it("keeps a date in range", () => {
    expect(clampEffectiveDate("2026-10-01", "2026-09-15", "2026-10-24")).toBe("2026-10-01");
  });
  it("moves a future date to today", () => {
    expect(clampEffectiveDate("2027-01-01", "2026-09-15", "2026-10-24")).toBe("2026-10-24");
  });
  it("moves a date before the floor to the floor", () => {
    expect(clampEffectiveDate("2026-01-01", "2026-09-15", "2026-10-24")).toBe("2026-09-15");
  });
  it("uses today when the date is missing or malformed", () => {
    expect(clampEffectiveDate(null, "2026-09-15", "2026-10-24")).toBe("2026-10-24");
    expect(clampEffectiveDate("1/2/2026", "2026-09-15", "2026-10-24")).toBe("2026-10-24");
  });
});

describe("pickEnrollment (AC-4)", () => {
  const a = { id: "e1", programCode: "BSC-CS" };
  const b = { id: "e2", programCode: "MSC-IT" };
  it("refuses when nothing is open", () => {
    expect(pickEnrollment([])).toEqual({ ok: false, code: "NO_OPEN_ENROLLMENT" });
  });
  it("takes the only open enrollment without a program", () => {
    expect(pickEnrollment([a])).toEqual({ ok: true, enrollmentId: "e1" });
  });
  it("selects by program code, ignoring case", () => {
    expect(pickEnrollment([a, b], " msc-it ")).toEqual({ ok: true, enrollmentId: "e2" });
  });
  it("refuses several enrollments without a matching code", () => {
    expect(pickEnrollment([a, b])).toEqual({ ok: false, code: "AMBIGUOUS_ENROLLMENT" });
    expect(pickEnrollment([a, b], "XYZ")).toEqual({ ok: false, code: "AMBIGUOUS_ENROLLMENT" });
  });
  it("refuses a code that does not match the only enrollment", () => {
    expect(pickEnrollment([a], "XYZ")).toEqual({ ok: false, code: "AMBIGUOUS_ENROLLMENT" });
  });
});

describe("identityMatches (AC-2)", () => {
  const record = { studentNumber: "000012", birthDate: "2005-06-20" };
  it("needs both to match", () => {
    expect(identityMatches({ studentNumber: "000012", birthDate: "2005-06-20" }, record)).toBe(
      true,
    );
    expect(identityMatches({ studentNumber: "000012", birthDate: "2005-06-21" }, record)).toBe(
      false,
    );
    expect(identityMatches({ studentNumber: "000013", birthDate: "2005-06-20" }, record)).toBe(
      false,
    );
    expect(identityMatches({ studentNumber: 12, birthDate: "2005-06-20" }, record)).toBe(false);
  });
});
