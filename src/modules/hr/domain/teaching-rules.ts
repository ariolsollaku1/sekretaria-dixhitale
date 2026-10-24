// Pure rules of the lecturer workspace (HR-07). Days are `YYYY-MM-DD`; no I/O.

type Entry = { weekday: number; startMinute: number; validFrom: string; validTo: string };

/** AC-4: the timetable entries that run on this day (weekday matches, day inside validity), by start time. */
export function classesOn<T extends Entry>(entries: T[], day: string, weekday: number): T[] {
  return entries
    .filter((e) => e.weekday === weekday && e.validFrom <= day && day <= e.validTo)
    .sort((a, b) => a.startMinute - b.startMinute);
}

type SessionLike = {
  date: string;
  status: "PLANNED" | "HELD" | "CANCELLED";
  counts: { absent: number };
};

export type Progress = { held: number; pending: number; upcoming: number; absences: number };

/**
 * AC-3: attendance progress of one assignment. `pending` are planned sessions dated today or
 * earlier (still to record); `upcoming` are planned sessions after today.
 */
export function progressOf(sessions: readonly SessionLike[], today: string): Progress {
  const p: Progress = { held: 0, pending: 0, upcoming: 0, absences: 0 };
  for (const s of sessions) {
    if (s.status === "HELD") {
      p.held += 1;
      p.absences += s.counts.absent;
    } else if (s.status === "PLANNED") {
      if (s.date <= today) p.pending += 1;
      else p.upcoming += 1;
    }
  }
  return p;
}

/** AC-2: rows grouped by semester (ascending), keeping the given order inside a semester. */
export function bySemester<T extends { semester: number }>(
  rows: readonly T[],
): { semester: number; rows: T[] }[] {
  const by = new Map<number, T[]>();
  for (const r of rows) by.set(r.semester, [...(by.get(r.semester) ?? []), r]);
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([semester, list]) => ({ semester, rows: list }));
}
