// Pure locale rules (ADR-0011): sq is the default (Q-17), en the second.
export const LOCALES = ["sq", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const TIME_ZONE = "Europe/Tirane";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** AC-4: user preference, then cookie, then the configured default. */
export function resolveLocale(args: {
  user?: string | null;
  cookie?: string | null;
  fallback: Locale;
}): Locale {
  if (isLocale(args.user)) return args.user;
  if (isLocale(args.cookie)) return args.cookie;
  return args.fallback;
}
