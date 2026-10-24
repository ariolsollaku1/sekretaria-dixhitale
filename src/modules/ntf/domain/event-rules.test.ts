import { describe, expect, it } from "vitest";
import {
  isUpcoming,
  mayUnregister,
  placesLeft,
  registrationState,
  reminderDue,
  type EventTiming,
} from "./event-rules";
import { eventSchema } from "./event-schemas";

const now = new Date("2026-11-10T10:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3600_000);
const ev = (over: Partial<EventTiming> = {}): EventTiming => ({
  status: "PUBLISHED",
  startsAt: hours(48),
  registrationDeadline: null,
  capacity: null,
  ...over,
});

describe("registrationState (AC-3, AC-4)", () => {
  it("is open for a published upcoming event with places", () => {
    expect(registrationState(ev(), 0, now)).toBe("open");
    expect(registrationState(ev({ capacity: 3 }), 2, now)).toBe("open");
  });
  it("reports draft and cancelled first", () => {
    expect(registrationState(ev({ status: "DRAFT" }), 0, now)).toBe("draft");
    expect(registrationState(ev({ status: "CANCELLED", capacity: 1 }), 5, now)).toBe("cancelled");
  });
  it("is full at capacity and beyond", () => {
    expect(registrationState(ev({ capacity: 3 }), 3, now)).toBe("full");
    expect(registrationState(ev({ capacity: 3 }), 4, now)).toBe("full");
  });
  it("closes at the deadline and starts at the start", () => {
    expect(registrationState(ev({ registrationDeadline: hours(-1) }), 0, now)).toBe("closed");
    expect(registrationState(ev({ registrationDeadline: now }), 0, now)).toBe("closed");
    expect(registrationState(ev({ registrationDeadline: hours(1) }), 0, now)).toBe("open");
    expect(registrationState(ev({ startsAt: now }), 0, now)).toBe("started");
    expect(registrationState(ev({ startsAt: hours(-3) }), 0, now)).toBe("started");
  });
});

describe("other rules", () => {
  it("lets a person cancel only a published event that has not started", () => {
    expect(mayUnregister({ status: "PUBLISHED", startsAt: hours(1) }, now)).toBe(true);
    expect(mayUnregister({ status: "PUBLISHED", startsAt: now }, now)).toBe(false);
    expect(mayUnregister({ status: "CANCELLED", startsAt: hours(1) }, now)).toBe(false);
  });
  it("counts places left, never below zero", () => {
    expect(placesLeft(null, 4)).toBeNull();
    expect(placesLeft(10, 4)).toBe(6);
    expect(placesLeft(2, 4)).toBe(0);
  });
  it("reminds once, inside the 24 hour window only", () => {
    const base = { status: "PUBLISHED" as const, remindedAt: null };
    expect(reminderDue({ ...base, startsAt: hours(24) }, now)).toBe(true);
    expect(reminderDue({ ...base, startsAt: hours(2) }, now)).toBe(true);
    expect(reminderDue({ ...base, startsAt: hours(24.1) }, now)).toBe(false);
    expect(reminderDue({ ...base, startsAt: hours(-1) }, now)).toBe(false);
    expect(reminderDue({ ...base, startsAt: hours(5), remindedAt: now }, now)).toBe(false);
    expect(reminderDue({ ...base, status: "DRAFT", startsAt: hours(5) }, now)).toBe(false);
    expect(reminderDue({ ...base, status: "CANCELLED", startsAt: hours(5) }, now)).toBe(false);
  });
  it("lists an event as upcoming until it ends (or starts, without an end)", () => {
    expect(isUpcoming(hours(1), null, now)).toBe(true);
    expect(isUpcoming(hours(-1), null, now)).toBe(false);
    expect(isUpcoming(hours(-1), hours(1), now)).toBe(true);
  });
});

describe("eventSchema (AC-1, AC-2)", () => {
  const valid = {
    title: "Konferenca",
    description: "Përshkrim",
    location: "Salla 3",
    startsAt: "2026-12-10T18:30",
    audience: "ALL" as const,
  };
  it("accepts a minimal event and normalises the optional fields", () => {
    const r = eventSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ endsAt: null, capacity: null, registrationDeadline: null });
  });
  it("parses capacity from a string and refuses nonsense", () => {
    expect(eventSchema.parse({ ...valid, capacity: "25" }).capacity).toBe(25);
    expect(eventSchema.parse({ ...valid, capacity: "" }).capacity).toBeNull();
    for (const capacity of ["0", "-3", "2.5", "abc", 1_000_000])
      expect(eventSchema.safeParse({ ...valid, capacity }).success).toBe(false);
  });
  const issue = (over: Record<string, unknown>) => {
    const r = eventSchema.safeParse({ ...valid, ...over });
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
  };
  it("refuses missing and overlong texts", () => {
    expect(issue({ title: " " })).toContain("title:required");
    expect(issue({ location: "x".repeat(201) })).toContain("location:tooLong");
    expect(issue({ description: "" })).toContain("description:required");
  });
  it("refuses bad dates and orders", () => {
    expect(issue({ startsAt: "2026-02-30T10:00" })).toContain("startsAt:invalidDate");
    expect(issue({ startsAt: "" })).toContain("startsAt:required");
    expect(issue({ endsAt: "2026-12-10T18:30" })).toContain("endsAt:endBeforeStart");
    expect(issue({ endsAt: "2026-12-10T20:00" })).toEqual([]);
    expect(issue({ registrationDeadline: "2026-12-10T18:31" })).toContain(
      "registrationDeadline:deadlineAfterStart",
    );
    expect(issue({ registrationDeadline: "2026-12-10T18:30" })).toEqual([]);
  });
  it("requires the cycle or program of its audience and drops the others", () => {
    expect(issue({ audience: "CYCLE" })).toContain("cycle:cycleRequired");
    expect(issue({ audience: "PROGRAM" })).toContain("programId:programRequired");
    expect(
      eventSchema.parse({ ...valid, audience: "CYCLE", cycle: "FIRST", programId: "p" }),
    ).toMatchObject({
      cycle: "FIRST",
      programId: null,
    });
    expect(
      eventSchema.parse({ ...valid, audience: "ALL", cycle: "FIRST", programId: "p" }),
    ).toMatchObject({
      cycle: null,
      programId: null,
    });
  });
});
