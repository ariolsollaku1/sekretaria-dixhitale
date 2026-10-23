import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { LOCALE_COOKIE, TIME_ZONE, resolveLocale } from "@/lib/i18n/config";

// No locale in the URL (internal app): user preference -> cookie -> DEFAULT_LOCALE (AC-4).
export default getRequestConfig(async () => {
  const user = await getCurrentUser();
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = resolveLocale({ user: user?.locale, cookie, fallback: env.DEFAULT_LOCALE });
  return {
    locale,
    timeZone: TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
