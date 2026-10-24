"use client";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { Flag } from "./flags";

/** Flag button in the top bar; the menu names each language so the flag is never the only cue. */
export function LocaleSwitcher() {
  const t = useTranslations("shell");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("language")}: ${t(`languages.${locale}`)}`}
        disabled={pending}
        className="rounded-control bg-card ring-border hover:bg-accent flex min-h-11 min-w-11 items-center justify-center shadow-sm ring-1 disabled:opacity-50"
      >
        <Flag locale={locale} className="h-5 w-7" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => startTransition(() => setLocaleAction(l))}
            aria-current={l === locale ? "true" : undefined}
          >
            <Flag locale={l} className="h-4 w-6" />
            <span className="flex-1">{t(`languages.${l}`)}</span>
            {l === locale && <Check className="size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
