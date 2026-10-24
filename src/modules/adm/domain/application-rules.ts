// Pure rules of the online application (ADM-02). No I/O: unit-tested.

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Q-97 working assumption: the private link lives 180 days. */
export const TOKEN_DAYS = 180;
/** Q-95: Albanian grade scale. */
export const GRADE_MIN = 5;
export const GRADE_MAX = 10;
/** AC-5, AC-9, AC-10: rate limits per IP address. */
export const SUBMIT_RATE = { limit: 5, windowMs: 10 * 60_000 };
export const UPLOAD_RATE = { limit: 30, windowMs: 10 * 60_000 };
export const LINK_RATE = { limit: 5, windowMs: 10 * 60_000 };
/** Statuses in which the candidate may still add documents (AC-9). */
export const UPLOAD_STATUSES = ["SUBMITTED", "IN_REVIEW"] as const;

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L: easy to read out loud

/** AC-3: `AP-` plus 8 characters, e.g. `AP-K7M29QXA`. */
export function makeReference(bytes: Uint8Array): string {
  return `AP-${Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** Today's date (yyyy-mm-dd) in Europe/Tirane (AC-2). */
export function todayInTirane(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** AC-2: active and `opensOn <= today <= closesOn` (all yyyy-mm-dd). */
export function isCycleOpen(
  cycle: { active: boolean; opensOn: string; closesOn: string },
  today: string,
): boolean {
  return cycle.active && cycle.opensOn <= today && today <= cycle.closesOn;
}

/** AC-7: the moment a link issued at `from` stops working. */
export const tokenExpiry = (from: Date): Date =>
  new Date(from.getTime() + TOKEN_DAYS * 24 * 3_600_000);

export const isTokenExpired = (expiresAt: Date, now = new Date()): boolean =>
  expiresAt.getTime() <= now.getTime();

export type CycleDocumentType = { key: string; required: boolean };

/** AC-8, AC-11: required document types without a live file. */
export function missingRequired(
  types: readonly CycleDocumentType[],
  uploadedKeys: ReadonlySet<string> | readonly string[],
): string[] {
  const have = new Set(uploadedKeys);
  return types.filter((d) => d.required && !have.has(d.key)).map((d) => d.key);
}

/** AC-9 */
export const mayUpload = (status: string): boolean =>
  (UPLOAD_STATUSES as readonly string[]).includes(status);

/** AC-4: a real day, not in the future, not before 1900; the applicant is at least 14. */
export function birthDateOk(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  return value >= "1900-01-01" && value <= today;
}

/** AC-4 */
export const gradeOk = (grade: number): boolean => grade >= GRADE_MIN && grade <= GRADE_MAX;

/** Duplicate rule key (Q-95): the e-mail in lower case. */
export const emailKey = (email: string): string => email.trim().toLowerCase();
