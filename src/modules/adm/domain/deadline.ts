// ADM-06 AC-5: pure helpers over calendar days ("YYYY-MM-DD", Europe/Tirane days computed by the caller).
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Whole days from `today` to `target`; negative once `target` has passed. */
export function daysUntil(target: string, today: string): number {
  return Math.round((ms(target) - ms(today)) / 86_400_000);
}

export type WindowState = "upcoming" | "running" | "ended";

/** Where `today` stands against an inclusive `from`..`to` window. */
export function windowState(from: string, to: string, today: string): WindowState {
  if (today < from) return "upcoming";
  if (today > to) return "ended";
  return "running";
}
