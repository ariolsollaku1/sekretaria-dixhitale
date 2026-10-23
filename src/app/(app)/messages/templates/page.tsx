import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TemplateArchive, TemplateForm, listTemplates } from "@/modules/ntf";

// NTF-03 AC-4: shared wordings for messages.
export default async function TemplatesPage() {
  const user = await requireUser("/messages/templates");
  if (!(await can(user, "ntf.message.send"))) return <ForbiddenView />;
  const [t, templates] = await Promise.all([getTranslations("msg"), listTemplates()]);
  return (
    <>
      <PageHeader
        title={t("templates.title")}
        breadcrumbs={[{ label: t("title"), href: "/messages" }, { label: t("templates.title") }]}
      />
      {templates.length === 0 ? (
        <p className="text-muted-foreground mb-6 text-sm">{t("templates.empty")}</p>
      ) : (
        <ul className="mb-8 flex max-w-2xl flex-col gap-2">
          {templates.map((x) => (
            <li
              key={x.id}
              className="border-border flex items-start justify-between gap-4 border-b py-2"
            >
              <div className="min-w-0">
                <p className="font-semibold">{x.name}</p>
                <p className="text-muted-foreground text-sm">{x.subject}</p>
              </div>
              <TemplateArchive templateId={x.id} name={x.name} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-3 text-lg font-semibold">{t("templates.new")}</h2>
      <TemplateForm />
    </>
  );
}
