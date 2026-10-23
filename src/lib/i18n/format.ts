// AC-6: the only place dates, times and numbers are formatted. Active locale + Europe/Tirane.
import { TIME_ZONE, type Locale } from "./config";

const TAGS: Record<Locale, string> = { sq: "sq-AL", en: "en-GB" };

type DateInput = Date | string | number;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

/** A calendar instant (stored UTC) shown as a date in Albanian local time. */
export function formatDate(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: "medium", timeZone: TIME_ZONE }).format(
    toDate(value),
  );
}

export function formatDateTime(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * Pure dates (`@db.Date`: birth date, due date) carry no time zone: format the calendar day as is,
 * never shifted by the zone. Accepts `YYYY-MM-DD` or a Date at UTC midnight.
 */
export function formatPlainDate(value: string | Date, locale: Locale): string {
  const iso = typeof value === "string" ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(TAGS[locale], options).format(value);
}

/** Money is Decimal(12,2) in the database, currency ALL unless stated (conventions.md). */
export function formatMoney(value: number | string, locale: Locale, currency = "ALL"): string {
  return new Intl.NumberFormat(TAGS[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/**
 * Display only: up to two decimals with the locale's separator. The grading scale itself is not
 * assumed here (open question); modules decide what a valid grade is.
 */
export function formatGrade(value: number, locale: Locale): string {
  return formatNumber(value, locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
