import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FormRenderer } from "@/components/forms/form-renderer";
import { localize } from "@/lib/forms/definition";
import { getPublishedForm } from "@/lib/forms/queries";

export const dynamic = "force-dynamic";

// AC-4: a public form, no login. Anything else answers 404.
export default async function PublicFormPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const form = await getPublishedForm(key);
  if (!form || form.audience !== "PUBLIC") notFound();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
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
          {localize(form.definition.title, locale)}
        </h1>
        {form.definition.description && (
          <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
            {localize(form.definition.description, locale)}
          </p>
        )}
      </header>
      <FormRenderer formKey={form.key} definition={form.definition} locale={locale} mode="public" />
    </main>
  );
}
