import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// AC-9: 404 inside the shell (reached through the catch-all route below).
export default async function AppNotFound() {
  const t = await getTranslations("errors");
  return (
    <EmptyState
      as="h1"
      icon={FileQuestion}
      title={t("notFound.title")}
      description={t("notFound.body")}
      action={
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          {t("backHome")}
        </Link>
      }
    />
  );
}
