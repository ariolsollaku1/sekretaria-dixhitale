// Pure event rules (NTF-02, no I/O).
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export type EventTiming = {
  status: EventStatus;
  startsAt: Date;
  registrationDeadline: Date | null;
  capacity: number | null;
};

/** Why (or whether) a reader can register right now. */
export type RegistrationState = "open" | "full" | "closed" | "started" | "cancelled" | "draft";

/** One reminder, sent when the event is within this window (Q-120). */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * AC-3/AC-4 (Q-119): registration is open for a published event until its deadline (default: the
 * start) while places remain. `registeredCount` counts only `REGISTERED` rows.
 */
export function registrationState(
  e: EventTiming,
  registeredCount: number,
  now: Date,
): RegistrationState {
  if (e.status === "DRAFT") return "draft";
  if (e.status === "CANCELLED") return "cancelled";
  if (now >= e.startsAt) return "started";
  if (e.registrationDeadline && now >= e.registrationDeadline) return "closed";
  if (e.capacity !== null && registeredCount >= e.capacity) return "full";
  return "open";
}

/** AC-6: a registered person may cancel until the event starts, whatever the deadline. */
export const mayUnregister = (e: Pick<EventTiming, "status" | "startsAt">, now: Date): boolean =>
  e.status === "PUBLISHED" && now < e.startsAt;

/** Places left, or null for unlimited. Never negative (the capacity may be lowered later). */
export const placesLeft = (capacity: number | null, registeredCount: number): number | null =>
  capacity === null ? null : Math.max(0, capacity - registeredCount);

/** AC-8: due for the reminder = published, not reminded, starting within the window and not started. */
export function reminderDue(
  e: Pick<EventTiming, "status" | "startsAt"> & { remindedAt: Date | null },
  now: Date,
): boolean {
  return (
    e.status === "PUBLISHED" &&
    !e.remindedAt &&
    e.startsAt > now &&
    e.startsAt.getTime() - now.getTime() <= REMINDER_WINDOW_MS
  );
}

/** Upcoming = not yet started; everything else is "past" in the list. */
export const isUpcoming = (startsAt: Date, endsAt: Date | null, now: Date): boolean =>
  (endsAt ?? startsAt) > now;
