import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// AC-9: 404 on the public layout (logged-out or outside the shell).
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
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
    </main>
  );
}
