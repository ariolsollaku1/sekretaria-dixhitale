import { ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";

/** AC-9: what a page renders when `can()` is false; shown inside the shell. */
export async function ForbiddenView() {
  const t = await getTranslations("errors.forbidden");
  return <EmptyState as="h1" icon={ShieldOff} title={t("title")} description={t("body")} />;
}
