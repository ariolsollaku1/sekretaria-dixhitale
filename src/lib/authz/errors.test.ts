import { describe, expect, it } from "vitest";
import { ForbiddenError } from "./check";
import { actionErrorFrom } from "./errors";

describe("actionErrorFrom (AC-6)", () => {
  it("maps ForbiddenError to the typed FORBIDDEN action result", () => {
    expect(actionErrorFrom(new ForbiddenError("iam.user.read"))).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "You are not allowed to do this." },
    });
  });
  it("rethrows anything else", () => {
    const boom = new Error("boom");
    expect(() => actionErrorFrom(boom)).toThrow(boom);
  });
});
