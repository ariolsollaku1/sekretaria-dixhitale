import { describe, expect, it } from "vitest";
import {
  instantToZonedDateTime,
  zonedDateTimeToInstant,
  zonedDay,
  zonedDayStart,
  zonedNextDayStart,
} from "./zone";

describe("zoned date-times (Europe/Tirane)", () => {
  it("converts wall-clock times in winter and summer", () => {
    expect(zonedDateTimeToInstant("2026-12-10T18:30").toISOString()).toBe(
      "2026-12-10T17:30:00.000Z",
    );
    expect(zonedDateTimeToInstant("2026-07-10T18:30").toISOString()).toBe(
      "2026-07-10T16:30:00.000Z",
    );
  });
  it("round-trips", () => {
    for (const local of ["2026-12-10T00:00", "2026-07-10T23:59", "2026-03-30T09:15"])
      expect(instantToZonedDateTime(zonedDateTimeToInstant(local))).toBe(local);
  });
});

describe("zoned days (Europe/Tirane)", () => {
  it("starts a winter day at 23:00 UTC the evening before (UTC+1)", () => {
    expect(zonedDayStart("2026-12-10").toISOString()).toBe("2026-12-09T23:00:00.000Z");
  });
  it("starts a summer day at 22:00 UTC the evening before (UTC+2)", () => {
    expect(zonedDayStart("2026-07-10").toISOString()).toBe("2026-07-09T22:00:00.000Z");
  });
  it("handles the days around the clock change", () => {
    // 2026-03-29: clocks go forward at 02:00 local; the day starts in winter time
    expect(zonedDayStart("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedDayStart("2026-03-30").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(zonedNextDayStart("2026-03-29").toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
  it("reads the local day of an instant", () => {
    expect(zonedDay(new Date("2026-12-09T23:30:00Z"))).toBe("2026-12-10");
    expect(zonedDay(new Date("2026-12-10T22:59:00Z"))).toBe("2026-12-10");
  });
});
