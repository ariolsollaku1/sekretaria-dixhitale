import type { Seeder } from "./types";

// Demo data for development: the seeded lecture meets on Mondays 08:00–09:30 in room A1 for the
// first semester. Skipped when the assignment already has a slot.
export const calTimetableSeeder: Seeder = {
  name: "cal-timetable",
  envs: ["dev", "demo"],
  async run(db) {
    const assignment = await db.teachingAssignment.findFirst({
      where: {
        kind: "LECTURE",
        planCourse: { course: { code: "DEMO101" } },
        group: { name: "Grupi 1", cohort: { name: "2026" } },
      },
      include: { group: { include: { academicYear: { include: { semesters: true } } } } },
    });
    if (!assignment) return;
    if ((await db.timetableEntry.count({ where: { assignmentId: assignment.id } })) > 0) return;
    const sem = assignment.group.academicYear.semesters.find(
      (s) => s.number === assignment.semester,
    );
    if (!sem) return;
    await db.timetableEntry.create({
      data: {
        assignmentId: assignment.id,
        weekday: 1,
        startMinute: 480,
        endMinute: 570,
        room: "A1",
        validFrom: sem.startDate,
        validTo: sem.endDate,
      },
    });
  },
};
