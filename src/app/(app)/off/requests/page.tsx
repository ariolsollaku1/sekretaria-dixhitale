import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { localize } from "@/lib/forms/definition";
import { myRequests, RequestsTable, submittableForms } from "@/modules/off";

// OFF-01 AC-8: the staff request forms I can submit and the requests I made.
export default async function StaffRequestsPage() {
  const user = await requireUser("/off/requests");
  if (!(await can(user, "off.request.submit"))) return <ForbiddenView />;
  const [t, locale, forms, rows] = await Promise.all([
    getTranslations("off"),
    getLocale(),
    submittableForms(user.id),
    myRequests(user.id),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <section aria-labelledby="off-new" className="mb-8">
        <h2 id="off-new" className="mb-3 text-2xl font-semibold">
          {t("newRequest")}
        </h2>
        {forms.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noForms")}</p>
        ) : (
          <ul className="flex max-w-2xl flex-col gap-3">
            {forms.map((f) => (
              <li key={f.key} className="rounded-card border-border bg-card border p-4">
                <h3 className="text-lg font-semibold">
                  <Link href={`/forms/${f.key}`} className="underline">
                    {localize(f.title, locale)}
                  </Link>
                </h3>
                {f.description && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {localize(f.description, locale)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="off-mine">
        <h2 id="off-mine" className="mb-3 text-2xl font-semibold">
          {t("mine")}
        </h2>
        <RequestsTable rows={rows} />
      </section>
    </>
  );
}
