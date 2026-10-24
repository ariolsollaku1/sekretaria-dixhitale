import { FileText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { localize } from "@/lib/forms/definition";
import { listPublicForms } from "@/lib/forms/queries";

export const dynamic = "force-dynamic";

// INT-06 AC-1/AC-2: the list of forms anyone may fill in without login; the website links here.
export default async function PublicFormsIndexPage() {
  const [t, locale, forms] = await Promise.all([getTranslations(), getLocale(), listPublicForms()]);
  const items = forms
    .map((f) => ({
      key: f.key,
      title: localize(f.definition.title, locale),
      description: f.definition.description ? localize(f.definition.description, locale) : null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, locale));
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 sm:p-8"
    >
      <header>
        <p className="text-muted-foreground text-sm">
          {t("shell.appName")} · {t("shell.institution")}
        </p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold">
          {t("forms.publicIndex.title")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("forms.publicIndex.intro")}</p>
      </header>
      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("forms.publicIndex.empty")}
          description={t("forms.publicIndex.emptyHint")}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((f) => (
            <li key={f.key} className="rounded-card border-border bg-card border p-4">
              <Link href={`/f/${f.key}`} className="text-lg font-semibold underline">
                {f.title}
              </Link>
              {f.description && (
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
                  {f.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
