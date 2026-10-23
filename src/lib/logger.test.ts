import { describe, expect, it } from "vitest";
import { sanitizeFields } from "./logger";

describe("sanitizeFields (AC-9)", () => {
  it("keeps ids, codes and counts", () => {
    expect(sanitizeFields({ userId: "u1", code: "FORBIDDEN", count: 3, ok: true })).toEqual({
      userId: "u1",
      code: "FORBIDDEN",
      count: 3,
      ok: true,
    });
  });
  it("drops personal data keys, case-insensitively", () => {
    expect(
      sanitizeFields({
        userId: "u1",
        email: "a@b.c",
        FirstName: "Ana",
        nationalId: "J1",
        NIM: "1",
      }),
    ).toEqual({ userId: "u1" });
  });
  it("accepts no fields", () => {
    expect(sanitizeFields()).toEqual({});
  });
});
