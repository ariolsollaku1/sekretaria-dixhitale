import { describe, expect, it } from "vitest";
import { validateDefinition } from "@/lib/forms/definition";
import { SCHOLARSHIP_FORMS } from "./scholarship-forms";
import { SCHOLARSHIP_HANDLER } from "./scholarship-rules";

describe("scholarship application forms (SRC-037a)", () => {
  it.each(SCHOLARSHIP_FORMS)("$key is a valid PLT-15 definition handled by Finance", (form) => {
    const check = validateDefinition(form.definition, form.audience);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.definition.handler).toBe(SCHOLARSHIP_HANDLER);
    expect(form.ownerRoles).toEqual(["finance"]);
  });
  it("offers a public and an in-portal variant", () => {
    expect(SCHOLARSHIP_FORMS.map((f) => f.audience).sort()).toEqual(["AUTHENTICATED", "PUBLIC"]);
  });
});
