"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

// AC-9: 500 inside the shell. Shows the digest so support can find the server log line; no details.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <ErrorState
      title={t("errors.server.title")}
      description={`${t("errors.server.body")}${error.digest ? ` (${t("errors.server.reference")}: ${error.digest})` : ""}`}
      action={<Button onClick={reset}>{t("common.retry")}</Button>}
    />
  );
}
