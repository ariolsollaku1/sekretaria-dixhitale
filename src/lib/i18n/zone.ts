// Calendar days in a time zone <-> UTC instants. Pure; used where a user picks a *day* but the
// database stores an instant (conventions: UTC stored, Europe/Tirane shown).
import { TIME_ZONE } from "./config";

const partsOf = (ms: number, timeZone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
};
const offsetMs = (ms: number, timeZone: string) =>
  partsOf(ms, timeZone) - Math.floor(ms / 1000) * 1000;

/** The UTC instant at which `day` (YYYY-MM-DD) starts in `timeZone`. */
export function zonedDayStart(day: string, timeZone: string = TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

/** The calendar day (YYYY-MM-DD) of an instant in `timeZone`. */
export function zonedDay(instant: Date, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The first instant of the day after `day` in `timeZone`. */
export function zonedNextDayStart(day: string, timeZone: string = TIME_ZONE): Date {
  const next = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1));
  return zonedDayStart(next.toISOString().slice(0, 10), timeZone);
}

/** The UTC instant of a wall-clock time `YYYY-MM-DDTHH:mm` in `timeZone` (NTF-02 event times). */
export function zonedDateTimeToInstant(local: string, timeZone: string = TIME_ZONE): Date {
  const [y, mo, d] = local.slice(0, 10).split("-").map(Number);
  const [h, mi] = local.slice(11, 16).split(":").map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

/** An instant as the wall-clock time `YYYY-MM-DDTHH:mm` in `timeZone` (the inverse of the above). */
export function instantToZonedDateTime(instant: Date, timeZone: string = TIME_ZONE): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
