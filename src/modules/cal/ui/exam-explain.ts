"use client";
import { useTranslations } from "next-intl";

type Failure = { error: { message: string; fieldErrors?: Record<string, string[]> } };

/** Turns an action failure into a readable message: clashes name each kind, other codes map to `errors.*`. */
export function useExplainExam() {
  const t = useTranslations("cal.exams");
  return (r: Failure) => {
    if (r.error.message.startsWith("CLASH:"))
      return t("clash", {
        clashes: r.error.message
          .slice(6)
          .split("; ")
          .map((c) => {
            const i = c.indexOf(":");
            return `${t(`clashKind.${c.slice(0, i)}` as never)}: ${c.slice(i + 1)}`;
          })
          .join("; "),
      });
    const code = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}
