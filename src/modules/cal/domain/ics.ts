// AC-12: minimal iCalendar (RFC 5545) rendering of all-day events. Pure.
import { addDays } from "./week-rules";

export type IcsEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  /** CAL-03: minutes from midnight; when both are set the event is timed (floating local time). */
  startMinute?: number;
  endMinute?: number;
  location?: string | null;
};

const compact = (day: string) => day.replaceAll("-", "");
const clock = (day: string, minute: number) =>
  `${compact(day)}T${String(Math.floor(minute / 60)).padStart(2, "0")}${String(minute % 60).padStart(2, "0")}00`;

/** Escapes TEXT values (backslash, semicolon, comma, newline). */
export const escapeText = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded with CRLF + space. */
export function fold(line: string): string {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function renderCalendar(events: readonly IcsEvent[], name: string, stamp: Date): string {
  const dtstamp = stamp
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LOGOS//Sekretari Dixhitale//SQ",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const e of events) {
    const timed = e.startMinute !== undefined && e.endMinute !== undefined;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@sekretari.logos`,
      `DTSTAMP:${dtstamp}`,
      timed
        ? `DTSTART:${clock(e.startDate, e.startMinute!)}`
        : `DTSTART;VALUE=DATE:${compact(e.startDate)}`,
      timed
        ? `DTEND:${clock(e.endDate, e.endMinute! === 1440 ? 1439 : e.endMinute!)}`
        : // all-day DTEND is exclusive
          `DTEND;VALUE=DATE:${compact(addDays(e.endDate, 1))}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
