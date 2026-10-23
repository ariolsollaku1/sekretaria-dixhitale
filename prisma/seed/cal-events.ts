import type { Seeder } from "./types";

// Demo data for development: a few illustrative events in the current demo year. The dates are an
// illustration, not LOGOS's real calendar. Only seeded while the year has no events at all.
const EVENTS = [
  ["Demo: javët e mësimit, semestri 1", "TEACHING_WEEK", "2026-09-28", "2027-01-15"],
  ["Demo: pushimet e dimrit", "HOLIDAY", "2026-12-24", "2027-01-04"],
  ["Demo: afati i regjistrimit", "DEADLINE", "2026-10-09", "2026-10-09"],
  ["Demo: sesioni dimëror i provimeve", "EXAM_PERIOD", "2027-01-18", "2027-02-05"],
] as const;

const d = (day: string) => new Date(`${day}T00:00:00Z`);

export const calEventsSeeder: Seeder = {
  name: "cal-events",
  envs: ["dev", "demo"],
  async run(db) {
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!year || (await db.calendarEvent.count({ where: { academicYearId: year.id } })) > 0) return;
    await db.calendarEvent.createMany({
      data: EVENTS.map(([title, type, start, end]) => ({
        academicYearId: year.id,
        title,
        type,
        startDate: d(start),
        endDate: d(end),
      })),
    });
  },
};
