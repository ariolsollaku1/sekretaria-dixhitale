import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/authz/roles";
import { maySubmit, nextStates } from "@/lib/forms/answers";
import { validateDefinition, type FormDefinitionJson } from "@/lib/forms/definition";
import { STAFF_FORMS } from "./request-forms";
import { REQUEST_HANDLER, STAFF_FORM_KEYS } from "./request-rules";

const parsed = (key: string): FormDefinitionJson => {
  const form = STAFF_FORMS.find((f) => f.key === key)!;
  const res = validateDefinition(form.definition, form.audience);
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  return res.definition;
};

describe("staff request definitions (AC-1)", () => {
  it("are the four keys, authenticated, valid, and name the OFF handler", () => {
    expect(STAFF_FORMS.map((f) => f.key)).toEqual([...STAFF_FORM_KEYS]);
    for (const f of STAFF_FORMS) {
      expect(f.audience).toBe("AUTHENTICATED");
      expect(parsed(f.key).handler).toBe(REQUEST_HANDLER);
    }
  });
  it("can be filled in by every role except the student", () => {
    for (const f of STAFF_FORMS) {
      const def = parsed(f.key);
      for (const role of ROLES) expect(maySubmit(def, [role])).toBe(role !== "student");
    }
  });
});

describe("approval chain (AC-3, AC-4)", () => {
  const leave = parsed("staff-leave");
  it("lets the supervisor take the first step and not the second", () => {
    expect(nextStates(leave, "new", ["head_of_department"])).toEqual([
      "supervisor_approved",
      "rejected",
    ]);
    expect(nextStates(leave, "supervisor_approved", ["head_of_department"])).toEqual([]);
  });
  it("lets administration approve at once or after the supervisor", () => {
    expect(nextStates(leave, "new", ["administration"])).toEqual(["approved", "rejected"]);
    expect(nextStates(leave, "supervisor_approved", ["administration"])).toEqual([
      "approved",
      "rejected",
    ]);
  });
  it("gives nothing to other staff and everything to the sysadmin", () => {
    expect(nextStates(leave, "new", ["lecturer"])).toEqual([]);
    expect(nextStates(leave, "new", ["sysadmin"])).toHaveLength(3);
    expect(nextStates(leave, "new")).toHaveLength(3); // no roles given: structure only
  });
  it("keeps supplies and certificates with administration alone", () => {
    for (const key of ["staff-supplies", "staff-certificate"]) {
      const def = parsed(key);
      expect(nextStates(def, "new", ["head_of_department"])).toEqual([]);
      expect(nextStates(def, "new", ["administration"])).toEqual([
        "in_progress",
        "approved",
        "rejected",
      ]);
    }
  });
});
