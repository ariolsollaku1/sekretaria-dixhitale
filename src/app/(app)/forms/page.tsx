import { FileText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { localize } from "@/lib/forms/definition";
import { listAuthenticatedForms } from "@/lib/forms/queries";

export default async function FormsPage() {
  const user = await requireUser("/forms");
  const [t, locale, forms] = await Promise.all([
    getTranslations("forms"),
    getLocale(),
    listAuthenticatedForms(user.id),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/forms/mine" className={buttonVariants({ variant: "secondary" })}>
            {t("mine.nav")}
          </Link>
        }
      />
      {forms.length === 0 ? (
        <EmptyState icon={FileText} title={t("none")} description={t("noneHint")} />
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {forms.map((f) => (
            <li key={f.id} className="rounded-card border-border bg-card border p-4">
              <h2 className="text-lg font-semibold">
                <Link href={`/forms/${f.key}`} className="underline">
                  {localize(f.definition.title, locale)}
                </Link>
              </h2>
              {f.definition.description && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {localize(f.definition.description, locale)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
