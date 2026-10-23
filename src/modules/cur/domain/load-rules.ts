// Pure teaching-load aggregation (CUR-05). No I/O.
export type LoadInput = {
  staffId: string;
  planCourseId: string;
  semester: number;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  plannedHours: number;
};

export type LoadRow = {
  staffId: string;
  courses: number;
  sem1: number;
  sem2: number;
  lecture: number;
  seminar: number;
  lab: number;
  total: number;
};

/** AC-1/AC-3: per lecturer; `semester` limits the rows counted. */
export function aggregateLoad(rows: readonly LoadInput[], semester?: 1 | 2): LoadRow[] {
  const byStaff = new Map<string, LoadRow & { set: Set<string> }>();
  for (const r of rows) {
    if (semester && r.semester !== semester) continue;
    let a = byStaff.get(r.staffId);
    if (!a)
      byStaff.set(
        r.staffId,
        (a = {
          staffId: r.staffId,
          courses: 0,
          sem1: 0,
          sem2: 0,
          lecture: 0,
          seminar: 0,
          lab: 0,
          total: 0,
          set: new Set(),
        }),
      );
    a.set.add(r.planCourseId);
    if (r.semester === 1) a.sem1 += r.plannedHours;
    else a.sem2 += r.plannedHours;
    if (r.kind === "LECTURE") a.lecture += r.plannedHours;
    else if (r.kind === "SEMINAR") a.seminar += r.plannedHours;
    else a.lab += r.plannedHours;
    a.total += r.plannedHours;
  }
  return [...byStaff.values()].map(({ set, ...rest }) => ({ ...rest, courses: set.size }));
}
