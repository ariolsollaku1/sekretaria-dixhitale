// Pure timetable rules (CAL-02). Days are `YYYY-MM-DD`, times are minutes from midnight.
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** "08:30" -> 510; null when it is not a time of day (00:00–24:00). */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && minutes <= 1440 ? minutes : null;
}

export const formatTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type SlotErrors = Partial<
  Record<"weekday" | "startMinute" | "endMinute" | "validFrom" | "validTo" | "room", string>
>;

const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** AC-1 */
export function validateSlot(s: {
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validTo: string;
  room: string | null;
}): SlotErrors {
  const e: SlotErrors = {};
  if (!Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7) e.weekday = "weekdayRange";
  if (!Number.isInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= 1440)
    e.startMinute = "timeRange";
  if (!Number.isInteger(s.endMinute) || s.endMinute <= 0 || s.endMinute > 1440)
    e.endMinute = "timeRange";
  if (!e.startMinute && !e.endMinute && s.endMinute <= s.startMinute)
    e.endMinute = "endBeforeStart";
  if (!isDay(s.validFrom)) e.validFrom = "invalidDate";
  if (!isDay(s.validTo)) e.validTo = "invalidDate";
  if (!e.validFrom && !e.validTo && s.validTo < s.validFrom) e.validTo = "endBeforeStart";
  if (s.room !== null && s.room.length > 50) e.room = "tooLong";
  return e;
}

export type Slot = {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validTo: string;
  room: string | null;
  groupId: string;
  staffId: string;
  /** shown in clash messages, e.g. "DEMO101 · Leksione" */
  label: string;
};

export type Clash = { kind: "GROUP" | "LECTURER" | "ROOM"; other: Slot };

/** Times overlap when they share more than a boundary (08:00–09:00 and 09:00–10:00 do not clash). */
export const timesOverlap = (
  a: Pick<Slot, "startMinute" | "endMinute">,
  b: Pick<Slot, "startMinute" | "endMinute">,
) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

export const datesOverlap = (
  a: Pick<Slot, "validFrom" | "validTo">,
  b: Pick<Slot, "validFrom" | "validTo">,
) => a.validFrom <= b.validTo && b.validFrom <= a.validTo;

const sameRoom = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** AC-2: every clash of `slot` with `others` (an entry never clashes with itself). */
export function findClashes(slot: Slot, others: readonly Slot[]): Clash[] {
  const out: Clash[] = [];
  for (const o of others) {
    if (slot.id && o.id === slot.id) continue;
    if (o.weekday !== slot.weekday || !timesOverlap(slot, o) || !datesOverlap(slot, o)) continue;
    if (o.groupId === slot.groupId) out.push({ kind: "GROUP", other: o });
    if (o.staffId === slot.staffId) out.push({ kind: "LECTURER", other: o });
    if (sameRoom(o.room, slot.room)) out.push({ kind: "ROOM", other: o });
  }
  return out;
}

/** AC-5: entries per weekday in time order; `onDay` keeps only those valid that day. */
export function weekGrid<T extends Pick<Slot, "weekday" | "startMinute" | "validFrom" | "validTo">>(
  entries: readonly T[],
  onDay?: string,
): Map<number, T[]> {
  const grid = new Map<number, T[]>(WEEKDAYS.map((d) => [d, []]));
  for (const e of entries) {
    if (onDay && (onDay < e.validFrom || onDay > e.validTo)) continue;
    grid.get(e.weekday)?.push(e);
  }
  for (const list of grid.values()) list.sort((a, b) => a.startMinute - b.startMinute);
  return grid;
}
