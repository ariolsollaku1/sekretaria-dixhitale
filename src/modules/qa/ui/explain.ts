"use client";
import { useTranslations } from "next-intl";

type Failure = { error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

/** A readable message for a failed QA action (field code, domain code, or generic). */
export function useExplain() {
  const t = useTranslations("qa.errors");
  return (r: Failure) => {
    if (r.error.code === "FORBIDDEN") return t("FORBIDDEN");
    const field = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : undefined;
    const code = field ?? r.error.message;
    return t.has(code as never) ? t(code as never) : t("generic");
  };
}
