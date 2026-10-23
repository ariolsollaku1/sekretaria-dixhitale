import { describe, expect, it } from "vitest";
import { programSchema, updateProgramSchema } from "./schemas";
import {
  DEFAULT_PROGRAM_CONFIG,
  hasProgramErrors,
  resolveProgramConfig,
  validateProgramCode,
  validateProgramShape,
  type ProgramConfig,
} from "./program-rules";

describe("validateProgramShape (AC-3)", () => {
  const cfg = DEFAULT_PROGRAM_CONFIG;
  it.each([
    ["Bachelor 3 years", { cycle: "FIRST", durationYears: 3 }, {}],
    [
      "Bachelor 2 years",
      { cycle: "FIRST", durationYears: 2 },
      { durationYears: ["durationNotAllowed"] },
    ],
    [
      "Bachelor 1 year",
      { cycle: "FIRST", durationYears: 1 },
      { durationYears: ["durationNotAllowed"] },
    ],
    ["Master 1 year", { cycle: "SECOND", durationYears: 1 }, {}],
    ["Master 2 years", { cycle: "SECOND", durationYears: 2 }, {}],
    [
      "Master 3 years",
      { cycle: "SECOND", durationYears: 3 },
      { durationYears: ["durationNotAllowed"] },
    ],
    [
      "Master with a known subtype",
      { cycle: "SECOND", durationYears: 2, subtype: "PROFESSIONAL" },
      {},
    ],
    [
      "Master with an unknown subtype",
      { cycle: "SECOND", durationYears: 2, subtype: "FUN" },
      { subtype: ["subtypeUnknown"] },
    ],
    [
      "Bachelor with a subtype",
      { cycle: "FIRST", durationYears: 3, subtype: "PROFESSIONAL" },
      { subtype: ["subtypeOnlyMaster"] },
    ],
    ["no subtype is fine", { cycle: "SECOND", durationYears: 2, subtype: null }, {}],
  ] as const)("%s", (_n, input, expected) => {
    expect(validateProgramShape(input as never, cfg)).toEqual(expected);
  });

  it("follows a custom configuration (configurable per the brief)", () => {
    const custom: ProgramConfig = {
      durations: { FIRST: [3, 4].filter((n) => n <= 3), SECOND: [1] },
      subtypes: ["RESEARCH"],
    };
    expect(validateProgramShape({ cycle: "SECOND", durationYears: 2 }, custom)).toEqual({
      durationYears: ["durationNotAllowed"],
    });
    expect(
      validateProgramShape({ cycle: "SECOND", durationYears: 1, subtype: "RESEARCH" }, custom),
    ).toEqual({});
    expect(
      validateProgramShape({ cycle: "SECOND", durationYears: 1, subtype: "PROFESSIONAL" }, custom),
    ).toEqual({ subtype: ["subtypeUnknown"] });
  });

  it("keeps an old subtype valid on edit even if it left the setting", () => {
    expect(
      validateProgramShape({ cycle: "SECOND", durationYears: 2, subtype: "OLD" }, cfg, "OLD"),
    ).toEqual({});
    expect(
      validateProgramShape({ cycle: "SECOND", durationYears: 2, subtype: "OLD" }, cfg, null),
    ).toEqual({ subtype: ["subtypeUnknown"] });
  });

  it("reports whether there are errors", () => {
    expect(hasProgramErrors({})).toBe(false);
    expect(hasProgramErrors({ subtype: ["x"] })).toBe(true);
  });
});

describe("resolveProgramConfig", () => {
  it("reads valid settings", () => {
    const cfg = resolveProgramConfig({ FIRST: [3], SECOND: [2] }, [
      { code: "RESEARCH", nameSq: "R", nameEn: "R" },
    ]);
    expect(cfg).toEqual({ durations: { FIRST: [3], SECOND: [2] }, subtypes: ["RESEARCH"] });
  });
  it.each([
    [undefined],
    [null],
    ["x"],
    [{ FIRST: [], SECOND: [1] }],
    [{ FIRST: [9], SECOND: [1] }],
  ])("falls back to the defaults for the malformed durations %j", (bad) => {
    expect(resolveProgramConfig(bad, undefined)).toEqual(DEFAULT_PROGRAM_CONFIG);
  });
  it("falls back for malformed subtypes", () => {
    expect(
      resolveProgramConfig(undefined, [{ code: "lowercase", nameSq: "", nameEn: "" }]).subtypes,
    ).toEqual(DEFAULT_PROGRAM_CONFIG.subtypes);
  });
});

describe("program codes (AC-4)", () => {
  it.each([
    ["bsc-eco", "BSC-ECO"],
    ["  ab ", "AB"],
    ["A".repeat(20), "A".repeat(20)],
  ])("accepts and normalises %j", (raw, code) => {
    expect(validateProgramCode(raw)).toEqual({ ok: true, code });
  });
  it.each(["", "A", "-AB", "A B", "A".repeat(21), "Ë1", "A/B"])("rejects %j", (raw) => {
    expect(validateProgramCode(raw)).toEqual({ ok: false, reason: "invalidProgramCode" });
  });
});

describe("schemas", () => {
  const ok = {
    departmentId: "d1",
    cycle: "FIRST",
    code: " bsc-1 ",
    name: " Ekonomi ",
    durationYears: "3",
    totalCredits: "180",
  };
  it("parses form strings into numbers and normalises", () => {
    expect(programSchema.parse(ok)).toEqual({
      departmentId: "d1",
      cycle: "FIRST",
      subtype: null,
      code: "BSC-1",
      name: "Ekonomi",
      nameEn: null,
      durationYears: 3,
      totalCredits: 180,
    });
  });
  it("reports credits outside 1..600 and bad cycles", () => {
    const r = programSchema.safeParse({ ...ok, totalCredits: "0", cycle: "THIRD" });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(["cycle", "totalCredits"]);
    expect(programSchema.safeParse({ ...ok, totalCredits: "601" }).success).toBe(false);
    expect(programSchema.safeParse({ ...ok, totalCredits: "12.5" }).success).toBe(false);
  });
  it("update has no department", () => {
    const { departmentId: _d, ...rest } = ok;
    expect(
      Object.keys(updateProgramSchema.parse({ ...rest, programId: "p1", departmentId: "x" })),
    ).not.toContain("departmentId");
  });
});
