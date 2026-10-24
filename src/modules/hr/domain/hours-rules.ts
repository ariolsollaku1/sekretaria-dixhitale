// Pure rules of delivered hours (HR-04). No I/O.

export type SessionLite = {
  assignmentId: string;
  staffId: string;
  /** ISO day `YYYY-MM-DD` */
  date: string;
  hours: number;
  status: "PLANNED" | "HELD" | "CANCELLED";
};
export type AdjustmentLite = {
  assignmentId: string;
  staffId: string;
  month: string;
  hours: number;
};

/** One lecturer, one assignment (course), one month. */
export type HoursLine = {
  staffId: string;
  assignmentId: string;
  month: string;
  sessions: number;
  heldHours: number;
  adjustmentHours: number;
  total: number;
  /** Planned sessions dated today or earlier that nobody recorded yet. */
  pending: number;
};

/** One lecturer and month. */
export type MonthTotals = {
  staffId: string;
  month: string;
  sessions: number;
  heldHours: number;
  adjustmentHours: number;
  total: number;
  pending: number;
};

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (m: string) => MONTH.test(m);
/** AC-1: the month of an ISO day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** First and last ISO day of a `YYYY-MM`. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** AC-6: a month has ended once today (Europe/Tirane) is in a later month. */
export const monthEnded = (month: string, today: string) => month < monthOf(today);

/** Whether the month touches the span of an academic year (inclusive ISO days). */
export function monthInYear(month: string, start: string, end: string) {
  const b = monthBounds(month);
  return b.to >= start && b.from <= end;
}

const keyOf = (staffId: string, assignmentId: string, month: string) =>
  `${staffId}|${assignmentId}|${month}`;

/** AC-1: HELD sessions count their hours in the month of their date; adjustments are added. */
export function aggregateHours(
  sessions: readonly SessionLite[],
  adjustments: readonly AdjustmentLite[],
  today: string,
): HoursLine[] {
  const lines = new Map<string, HoursLine>();
  const line = (staffId: string, assignmentId: string, month: string) => {
    const key = keyOf(staffId, assignmentId, month);
    let l = lines.get(key);
    if (!l) {
      l = {
        staffId,
        assignmentId,
        month,
        sessions: 0,
        heldHours: 0,
        adjustmentHours: 0,
        total: 0,
        pending: 0,
      };
      lines.set(key, l);
    }
    return l;
  };
  for (const s of sessions) {
    // cancelled sessions and planned ones still to come count for nothing and make no line
    if (s.status === "CANCELLED" || (s.status === "PLANNED" && s.date > today)) continue;
    const l = line(s.staffId, s.assignmentId, monthOf(s.date));
    if (s.status === "HELD") {
      l.sessions += 1;
      l.heldHours += s.hours;
    } else if (s.date <= today) l.pending += 1;
  }
  for (const a of adjustments) line(a.staffId, a.assignmentId, a.month).adjustmentHours += a.hours;
  const out = [...lines.values()];
  for (const l of out) l.total = l.heldHours + l.adjustmentHours;
  return out.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.staffId.localeCompare(b.staffId) ||
      a.assignmentId.localeCompare(b.assignmentId),
  );
}

/** Lines of one lecturer summed per month. */
export function rollupByMonth(lines: readonly HoursLine[]): MonthTotals[] {
  const out = new Map<string, MonthTotals>();
  for (const l of lines) {
    const key = `${l.staffId}|${l.month}`;
    let m = out.get(key);
    if (!m) {
      m = {
        staffId: l.staffId,
        month: l.month,
        sessions: 0,
        heldHours: 0,
        adjustmentHours: 0,
        total: 0,
        pending: 0,
      };
      out.set(key, m);
    }
    m.sessions += l.sessions;
    m.heldHours += l.heldHours;
    m.adjustmentHours += l.adjustmentHours;
    m.total += l.total;
    m.pending += l.pending;
  }
  return [...out.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.staffId.localeCompare(b.staffId),
  );
}

export type ApprovalState = "PENDING" | "APPROVED" | "CHANGED" | "OPEN";
export type ApprovalLite = {
  status: "APPROVED" | "OPEN";
  heldHours: number;
  adjustmentHours: number;
};

/** AC-7: the state of a month's approval against the current figures. */
export function approvalState(
  approval: ApprovalLite | null | undefined,
  current: { heldHours: number; adjustmentHours: number },
): ApprovalState {
  if (!approval) return "PENDING";
  if (approval.status === "OPEN") return "OPEN";
  return approval.heldHours === current.heldHours &&
    approval.adjustmentHours === current.adjustmentHours
    ? "APPROVED"
    : "CHANGED";
}

/** AC-6: only an ended month that has hours or adjustments can be approved. */
export function mayApprove(
  month: string,
  today: string,
  current: { heldHours: number; adjustmentHours: number },
): { ok: true } | { ok: false; reason: "NOT_ENDED" | "EMPTY" } {
  if (!monthEnded(month, today)) return { ok: false, reason: "NOT_ENDED" };
  if (current.heldHours === 0 && current.adjustmentHours === 0)
    return { ok: false, reason: "EMPTY" };
  return { ok: true };
}

/** AC-10: adjustments are only taken while the month is not (or no longer) approved. */
export const adjustable = (state: ApprovalState) => state === "PENDING" || state === "OPEN";
