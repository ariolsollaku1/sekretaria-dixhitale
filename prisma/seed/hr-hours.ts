import type { Seeder } from "./types";

const tirane = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

// Demo data for development (HR-04): three held classes of the dev lecturer's demo course in the
// calendar month before today, so the delivered-hours pages have something to approve. Skipped
// when that month lies outside the assignment's academic year. Idempotent by assignment, date and
// start time.
export const hrHoursSeeder: Seeder = {
  name: "hr-hours",
  envs: ["dev"],
  async run(db) {
    const person = await db.person.findUnique({
      where: { email: "lecturer@dev.logos.test" },
      include: { staff: true },
    });
    if (!person?.staff) return;
    const assignment = await db.teachingAssignment.findFirst({
      where: { staffId: person.staff.id, planCourse: { course: { code: "DEMO101" } } },
      include: { group: { include: { academicYear: true } } },
    });
    if (!assignment) return;
    const [y, m] = tirane(new Date()).split("-").map(Number) as [number, number];
    const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const month = `${prev.y}-${String(prev.m).padStart(2, "0")}`;
    const { startDate, endDate } = assignment.group.academicYear;
    for (const day of [5, 12, 19]) {
      const date = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00Z`);
      if (date < startDate || date > endDate) continue;
      await db.classSession.upsert({
        where: {
          assignmentId_date_startMinute: {
            assignmentId: assignment.id,
            date,
            startMinute: 540,
          },
        },
        create: {
          assignmentId: assignment.id,
          date,
          startMinute: 540,
          endMinute: 630,
          hours: 2,
          status: "HELD",
          topic: "Demo",
          heldAt: date,
        },
        update: {},
      });
    }
  },
};
