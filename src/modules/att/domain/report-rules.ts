// Pure attendance report rules (ATT-02). No I/O.

/** Q-91: 75 % (the Q-12 research finding), overridable with the setting `att.thresholdPercent`. */
export const DEFAULT_THRESHOLD = 75;

/** The setting `att.thresholdPercent`: a whole number 0..100, else the default (Q-91). */
export function resolveThreshold(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : DEFAULT_THRESHOLD;
}

export type MarkFact = {
  studentId: string;
  assignmentId: string;
  sessionId: string;
  hours: number;
  status: "PRESENT" | "ABSENT" | "EXCUSED";
};

export type Figures = {
  classes: number;
  heldHours: number;
  presentHours: number;
  absentHours: number;
  excusedHours: number;
  /** null when no hours were held */
  percent: number | null;
};

type Acc = Omit<Figures, "percent">;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Q-90: present hours / held hours, one decimal; null without held hours. */
export function percentOf(presentHours: number, heldHours: number): number | null {
  return heldHours > 0 ? round1((presentHours / heldHours) * 100) : null;
}

/** Q-91: strictly below the threshold; no percentage, no flag. */
export function isBelow(percent: number | null, threshold: number): boolean {
  return percent !== null && percent < threshold;
}

const empty = (): Acc => ({
  classes: 0,
  heldHours: 0,
  presentHours: 0,
  absentHours: 0,
  excusedHours: 0,
});
const finish = (f: Acc): Figures => ({ ...f, percent: percentOf(f.presentHours, f.heldHours) });
function add(f: Acc, m: { hours: number; status: MarkFact["status"] }) {
  f.classes += 1;
  f.heldHours += m.hours;
  if (m.status === "PRESENT") f.presentHours += m.hours;
  else if (m.status === "ABSENT") f.absentHours += m.hours;
  else f.excusedHours += m.hours; // Q-90: excused is not attended, reported on its own
}

/** AC-1: figures of one student's marks (all of them on held classes). */
export function summarize(marks: readonly Pick<MarkFact, "hours" | "status">[]): Figures {
  const f = empty();
  for (const m of marks) add(f, m);
  return finish(f);
}

export type StudentFigures = { studentId: string; assignmentId: string } & Figures;
export type AssignmentFigures = {
  assignmentId: string;
  /** distinct held classes and their hours */
  classes: number;
  heldHours: number;
  students: number;
  /** sum present hours / sum held hours of its students; null without hours */
  averagePercent: number | null;
  below: number;
};

/** AC-1/AC-4: per student and assignment, and per assignment, from the marks of held classes. */
export function aggregate(
  marks: readonly MarkFact[],
  threshold: number,
): { students: StudentFigures[]; assignments: AssignmentFigures[] } {
  const per = new Map<string, { studentId: string; assignmentId: string; f: Acc }>();
  const sessions = new Map<string, Map<string, number>>();
  for (const m of marks) {
    const key = `${m.assignmentId}|${m.studentId}`;
    let p = per.get(key);
    if (!p) {
      p = { studentId: m.studentId, assignmentId: m.assignmentId, f: empty() };
      per.set(key, p);
    }
    add(p.f, m);
    let s = sessions.get(m.assignmentId);
    if (!s) {
      s = new Map();
      sessions.set(m.assignmentId, s);
    }
    s.set(m.sessionId, m.hours);
  }
  const students: StudentFigures[] = [...per.values()].map((p) => ({
    studentId: p.studentId,
    assignmentId: p.assignmentId,
    ...finish(p.f),
  }));
  const assignments: AssignmentFigures[] = [...sessions.entries()].map(([assignmentId, s]) => {
    const rows = students.filter((r) => r.assignmentId === assignmentId);
    const held = rows.reduce((n, r) => n + r.heldHours, 0);
    const present = rows.reduce((n, r) => n + r.presentHours, 0);
    return {
      assignmentId,
      classes: s.size,
      heldHours: [...s.values()].reduce((n, h) => n + h, 0),
      students: rows.length,
      averagePercent: percentOf(present, held),
      below: rows.filter((r) => isBelow(r.percent, threshold)).length,
    };
  });
  return { students, assignments };
}
