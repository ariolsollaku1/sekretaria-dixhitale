import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<"iam">>;

/** Zod issue ids, domain codes and field-error keys all live under `iam.errors.*`. */
export function errorMessage(t: T, key: string | undefined): string {
  if (key && t.has(`errors.${key}` as never)) return t(`errors.${key}` as never);
  return t("errors.generic");
}
