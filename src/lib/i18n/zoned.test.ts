import { describe, expect, it } from "vitest";
import { isIsoDay, startOfZonedDay, zonedDayBounds } from "./zoned";

describe("zoned day bounds (Europe/Tirane)", () => {
  it("starts the day at local midnight in winter (UTC+1) and summer (UTC+2)", () => {
    expect(startOfZonedDay("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(startOfZonedDay("2026-07-15").toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });
  it("handles the DST switch day (23 hours long, 29 March 2026)", () => {
    const { start, end } = zonedDayBounds("2026-03-29");
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
  it("covers a normal day with 24 hours and rolls over months", () => {
    const { start, end } = zonedDayBounds("2026-01-31");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(24);
    expect(end.toISOString()).toBe("2026-01-31T23:00:00.000Z");
  });
  it("works for another zone", () => {
    expect(startOfZonedDay("2026-01-15", "UTC").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
  it("validates ISO days", () => {
    expect(isIsoDay("2026-02-03")).toBe(true);
    expect(isIsoDay("03/02/2026")).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
  });
});
