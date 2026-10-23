import { describe, expect, it } from "vitest";
import {
  canDeactivate,
  canResendActivation,
  canRevokeSysadmin,
  displayName,
  normalizeEmail,
  splitName,
} from "./rules";

const facts = {
  actorId: "a",
  targetId: "t",
  targetIsActiveSysadmin: false,
  activeSysadminCount: 2,
};

describe("canDeactivate (AC-7)", () => {
  it("allows deactivating someone else", () => {
    expect(canDeactivate(facts)).toEqual({ ok: true });
  });
  it("refuses deactivating yourself, even when other sysadmins exist", () => {
    expect(canDeactivate({ ...facts, targetId: "a", targetIsActiveSysadmin: true })).toEqual({
      ok: false,
      reason: "SELF_DEACTIVATION",
    });
  });
  it("refuses deactivating the last active sysadmin", () => {
    expect(
      canDeactivate({ ...facts, targetIsActiveSysadmin: true, activeSysadminCount: 1 }),
    ).toEqual({ ok: false, reason: "LAST_SYSADMIN" });
  });
  it("allows deactivating a sysadmin when another one remains", () => {
    expect(
      canDeactivate({ ...facts, targetIsActiveSysadmin: true, activeSysadminCount: 2 }),
    ).toEqual({ ok: true });
  });
  it("does not count a non-sysadmin target against the last-sysadmin rule", () => {
    expect(canDeactivate({ ...facts, activeSysadminCount: 1 })).toEqual({ ok: true });
  });
});

describe("canRevokeSysadmin (AC-7)", () => {
  it("refuses removing the role from the last active sysadmin", () => {
    expect(canRevokeSysadmin({ targetIsActiveSysadmin: true, activeSysadminCount: 1 })).toEqual({
      ok: false,
      reason: "LAST_SYSADMIN",
    });
  });
  it("allows it when others remain or the target was not an active sysadmin", () => {
    expect(canRevokeSysadmin({ targetIsActiveSysadmin: true, activeSysadminCount: 2 })).toEqual({
      ok: true,
    });
    expect(canRevokeSysadmin({ targetIsActiveSysadmin: false, activeSysadminCount: 1 })).toEqual({
      ok: true,
    });
  });
});

describe("helpers", () => {
  it("resends activation only to active users who never logged in (AC-10)", () => {
    expect(canResendActivation({ lastLoginAt: null, active: true })).toBe(true);
    expect(canResendActivation({ lastLoginAt: new Date(), active: true })).toBe(false);
    expect(canResendActivation({ lastLoginAt: null, active: false })).toBe(false);
  });
  it("builds and splits names, normalizes emails", () => {
    expect(displayName(" Ana ", "Hoxha ")).toBe("Ana Hoxha");
    expect(splitName("Ana Maria Hoxha")).toEqual({ firstName: "Ana", lastName: "Maria Hoxha" });
    expect(splitName("Ana")).toEqual({ firstName: "Ana", lastName: "" });
    expect(splitName("  ")).toEqual({ firstName: "", lastName: "" });
    expect(normalizeEmail("  Ana@Logos.EDU.al ")).toBe("ana@logos.edu.al");
  });
});
