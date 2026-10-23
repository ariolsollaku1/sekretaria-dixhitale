import { describe, expect, it } from "vitest";
import { decideAccess, isSessionExpired, safeCallbackUrl } from "./policy";

describe("decideAccess", () => {
  it("allows an active user", () => {
    expect(decideAccess({ active: true })).toEqual({ allow: true });
  });
  it("refuses unknown users without creating anything (AC-4)", () => {
    expect(decideAccess(null)).toEqual({ allow: false, reason: "no-user" });
    expect(decideAccess(undefined)).toEqual({ allow: false, reason: "no-user" });
  });
  it("refuses deactivated users (AC-8)", () => {
    expect(decideAccess({ active: false })).toEqual({ allow: false, reason: "inactive" });
  });
});

describe("isSessionExpired (AC-6)", () => {
  const created = new Date("2026-01-01T08:00:00Z");
  const at = (minutes: number) => new Date(created.getTime() + minutes * 60_000);

  it("is valid while inside both limits", () => {
    expect(isSessionExpired({ createdAt: created, expiresAt: at(30) }, at(10), 12)).toBe(false);
  });
  it("expires when idle deadline passed", () => {
    expect(isSessionExpired({ createdAt: created, expiresAt: at(30) }, at(30), 12)).toBe(true);
  });
  it("expires at the absolute limit even if the idle deadline keeps sliding", () => {
    const session = { createdAt: created, expiresAt: at(12 * 60 + 20) };
    expect(isSessionExpired(session, at(12 * 60 - 1), 12)).toBe(false);
    expect(isSessionExpired(session, at(12 * 60), 12)).toBe(true);
  });
});

describe("safeCallbackUrl", () => {
  it("keeps same-origin paths with query", () => {
    expect(safeCallbackUrl("/students?page=2")).toBe("/students?page=2");
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "",
    null,
    undefined,
    "/a\nb",
  ])("rejects %j", (value) => {
    expect(safeCallbackUrl(value)).toBe("/");
  });
});
