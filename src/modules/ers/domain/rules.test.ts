import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/forms/answers";
import { validateDefinition } from "@/lib/forms/definition";
import { ERASMUS_FORMS } from "./erasmus-forms";
import {
  applicantKind,
  ERASMUS_FORM_KEYS,
  nameOf,
  periodOf,
  studentIdentityMatches,
} from "./rules";

const form = (key: string) => ERASMUS_FORMS.find((f) => f.key === key)!;
const keys = (key: string) => (form(key).definition.fields as { key: string }[]).map((f) => f.key);

describe("Erasmus definitions (AC-1..AC-3)", () => {
  it("has the six forms, matching the key list", () => {
    expect(ERASMUS_FORMS.map((f) => f.key).sort()).toEqual([...ERASMUS_FORM_KEYS].sort());
  });
  it.each(ERASMUS_FORMS)("$key passes the PLT-15 schema", (f) => {
    expect(validateDefinition(f.definition, f.audience).ok).toBe(true);
  });
  it("only the in-portal forms carry the optional file", () => {
    for (const f of ERASMUS_FORMS) {
      expect(keys(f.key).includes("letter")).toBe(f.audience === "AUTHENTICATED");
    }
  });
  it("public forms ask for identity, in-portal forms do not", () => {
    expect(keys("erasmus-student")).toEqual(
      expect.arrayContaining(["firstName", "email", "studentNumber", "birthDate"]),
    );
    expect(keys("erasmus-student-portal")).not.toContain("email");
    expect(keys("erasmus-admin")).toContain("unit");
    expect(keys("erasmus-academic")).toContain("department");
  });
  it("every form is handled by the Erasmus officer and has no handler", () => {
    for (const f of ERASMUS_FORMS) {
      expect(f.ownerRoles).toEqual(["erasmus"]);
      expect(f.definition.handler).toBeUndefined();
    }
  });
  it("workflow: selected can be closed or rejected, finals have no exit (AC-2)", () => {
    const w = form("erasmus-student").definition.workflow as {
      transitions: { from: string; to: string }[];
      states: { key: string; final?: boolean }[];
    };
    const to = (from: string) => w.transitions.filter((t) => t.from === from).map((t) => t.to);
    expect(to("selected").sort()).toEqual(["mobility_done", "rejected"]);
    expect(to("mobility_done")).toEqual([]);
    expect(to("rejected")).toEqual([]);
    expect(
      w.states
        .filter((s) => s.final)
        .map((s) => s.key)
        .sort(),
    ).toEqual(["mobility_done", "rejected"]);
  });
  it("a complete public student application validates, a missing destination does not", () => {
    const def = validateDefinition(form("erasmus-student").definition, "PUBLIC");
    if (!def.ok) throw new Error("invalid");
    const answers = {
      firstName: "Ana",
      lastName: "Dema",
      email: "ana@example.com",
      program: "Informatikë",
      yearOfStudy: 2,
      destination: "Univ. of Graz",
      mobilityType: "study",
      period: "autumn",
      academicYear: "2027/2028",
      motivation: "Dua të studioj jashtë.",
      confirm: true,
    };
    expect(validateAnswers(def.definition, answers).ok).toBe(true);
    expect(validateAnswers(def.definition, { ...answers, destination: "" }).ok).toBe(false);
  });
});

describe("rules", () => {
  it("applicantKind reads the form key", () => {
    expect(applicantKind("erasmus-student")).toBe("student");
    expect(applicantKind("erasmus-academic-portal")).toBe("academic");
    expect(applicantKind("erasmus-admin")).toBe("admin");
    expect(applicantKind("deregistration")).toBeNull();
    expect(applicantKind("erasmus-other")).toBeNull();
  });
  it("periodOf shows term and year for students, dates for staff", () => {
    const term = (t: string) => `T:${t}`;
    expect(periodOf("student", { period: "autumn", academicYear: "2027/2028" }, term)).toBe(
      "T:autumn 2027/2028",
    );
    expect(periodOf("student", {}, term)).toBe("");
    expect(periodOf("academic", { startDate: "2027-03-01", endDate: "2027-03-05" }, term)).toBe(
      "2027-03-01 – 2027-03-05",
    );
    expect(periodOf("admin", {}, term)).toBe("");
  });
  it("nameOf joins the given names", () => {
    expect(nameOf({ firstName: " Ana ", lastName: "Dema" })).toBe("Ana Dema");
    expect(nameOf({})).toBe("");
  });
  it("studentIdentityMatches needs both number and birth date", () => {
    const rec = { studentNumber: "000123", birthDate: "2001-02-03" };
    expect(studentIdentityMatches({ studentNumber: "000123", birthDate: "2001-02-03" }, rec)).toBe(
      true,
    );
    expect(studentIdentityMatches({ studentNumber: "000123", birthDate: "2001-02-04" }, rec)).toBe(
      false,
    );
    expect(studentIdentityMatches({ studentNumber: "", birthDate: "2001-02-03" }, rec)).toBe(false);
    expect(studentIdentityMatches({ birthDate: "2001-02-03" }, rec)).toBe(false);
  });
});
