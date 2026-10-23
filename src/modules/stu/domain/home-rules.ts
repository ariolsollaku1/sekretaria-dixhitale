// Pure rules of the student portal home (STU-03). Days are `YYYY-MM-DD`; no I/O.

export const OPEN_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

/** AC-2: an enrollment is open while it is ACTIVE or SUSPENDED. */
export const isOpen = (status: string): boolean =>
  (OPEN_STATUSES as readonly string[]).includes(status);

/** Today's calendar day and ISO weekday (1 = Monday … 7 = Sunday) in the given time zone. */
export function today(now: Date, timeZone = "Europe/Tirane"): { day: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const day = parts; // en-CA gives YYYY-MM-DD
  const js = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return { day, weekday: js === 0 ? 7 : js };
}

export const formatMinutes = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Entry = { weekday: number; startMinute: number; validFrom: string; validTo: string };

/** AC-4: the entries that run on this day (weekday matches, day inside the validity), by start time. */
export function classesOn<T extends Entry>(entries: T[], day: string, weekday: number): T[] {
  return entries
    .filter((e) => e.weekday === weekday && e.validFrom <= day && day <= e.validTo)
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** AC-5: events that end today or later, soonest first, at most `limit`. */
export function upcoming<T extends { startDate: string; endDate: string }>(
  events: T[],
  day: string,
  limit: number,
): T[] {
  return events
    .filter((e) => e.endDate >= day)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
    .slice(0, limit);
}

/** AC-3: plan courses of one year of study, grouped by semester (ascending), courses by name. */
export function coursesByYear<
  T extends { yearOfStudy: number; semester: number; course: { code: string } },
>(courses: T[], yearOfStudy: number): { semester: number; courses: T[] }[] {
  const by = new Map<number, T[]>();
  for (const c of courses) {
    if (c.yearOfStudy !== yearOfStudy) continue;
    by.set(c.semester, [...(by.get(c.semester) ?? []), c]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([semester, list]) => ({
      semester,
      courses: list.sort((a, b) => a.course.code.localeCompare(b.course.code)),
    }));
}

export const totalCredits = (courses: { credits: number }[]): number =>
  courses.reduce((n, c) => n + c.credits, 0);
