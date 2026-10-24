import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { registerAllPurposes } from "@/lib/files/all";
import { getFilePurpose } from "@/lib/files/purposes";
import { currentRoles } from "@/lib/forms/access";
import { maySubmit } from "@/lib/forms/answers";
import { localize } from "@/lib/forms/definition";
import { getPublishedForm } from "@/lib/forms/queries";
import { FILE_PURPOSE } from "@/lib/forms/submission.service";

// AC-4: an authenticated form for signed-in users.
export default async function AuthenticatedFormPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const user = await requireUser(`/forms/${key}`);
  const form = await getPublishedForm(key);
  if (!form || form.audience !== "AUTHENTICATED") notFound();
  // OFF-01: a form limited to some roles does not exist for the others
  if (!maySubmit(form.definition, await currentRoles(user.id))) notFound();
  registerAllPurposes();
  const purpose = getFilePurpose(FILE_PURPOSE)!;
  const [t, locale] = await Promise.all([getTranslations("forms"), getLocale()]);
  const title = localize(form.definition.title, locale);
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/forms" }, { label: title }]}
      />
      {form.definition.description && (
        <p className="text-muted-foreground mb-6 max-w-xl text-sm whitespace-pre-line">
          {localize(form.definition.description, locale)}
        </p>
      )}
      <FormRenderer
        formKey={form.key}
        definition={form.definition}
        locale={locale}
        mode="authenticated"
        upload={{
          purpose: purpose.id,
          maxBytes: purpose.maxBytes,
          mimeTypes: purpose.mimeTypes,
          typeLabels: ["PDF", "JPEG", "PNG", "DOCX", "XLSX"],
        }}
      />
    </>
  );
}
