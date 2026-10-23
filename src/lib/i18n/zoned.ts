// Pure: calendar-day bounds in a time zone as UTC instants (for "from/to" date filters).
import { TIME_ZONE } from "./config";

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Midnight at the start of `YYYY-MM-DD` in `timeZone`, as a UTC instant. */
export function startOfZonedDay(day: string, timeZone: string = TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  // Two passes settle the offset when the day contains a DST change.
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** Half-open range [start, end) covering that calendar day. */
export function zonedDayBounds(
  day: string,
  timeZone: string = TIME_ZONE,
): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return { start: startOfZonedDay(day, timeZone), end: startOfZonedDay(nextDay, timeZone) };
}

export const isIsoDay = (value: string | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
