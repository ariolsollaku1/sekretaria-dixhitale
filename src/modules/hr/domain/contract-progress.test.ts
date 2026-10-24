import { describe, expect, it } from "vitest";
import { contractProgress } from "./contract-progress";

const at = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe("contractProgress", () => {
  it("is open-ended without an end date", () => {
    expect(contractProgress("2026-01-01", null, at("2026-06-01"))).toEqual({
      percent: null,
      daysLeft: null,
    });
  });
  it("reports the elapsed share and the days left", () => {
    expect(contractProgress("2026-01-01", "2026-01-11", at("2026-01-06"))).toEqual({
      percent: 50,
      daysLeft: 5,
    });
  });
  it("clamps before the start and after the end", () => {
    expect(contractProgress("2026-01-01", "2026-01-11", at("2025-12-01")).percent).toBe(0);
    expect(contractProgress("2026-01-01", "2026-01-11", at("2026-02-01"))).toMatchObject({
      percent: 100,
      daysLeft: -21,
    });
  });
});
