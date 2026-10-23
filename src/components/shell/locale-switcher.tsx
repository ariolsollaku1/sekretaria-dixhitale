"use client";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALES } from "@/lib/i18n/config";

export function LocaleSwitcher() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="locale-select" className="sr-only">
        {t("language")}
      </label>
      <select
        id="locale-select"
        value={locale}
        disabled={pending}
        onChange={(e) => startTransition(() => setLocaleAction(e.target.value))}
        className="rounded-control border-input bg-card min-h-11 border px-2 text-sm"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
