import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DomainError } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { MessageForm, listTemplates, resolveRecipients } from "@/modules/ntf";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// NTF-03 AC-2/AC-3: compose for the people of a list; the list is named by `table` + its filters.
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/messages/new");
  if (!(await can(user, "ntf.message.send"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("msg"), searchParams]);
  const tableId = first(search.table) ?? "";
  const filters = Object.fromEntries(
    Object.entries(search)
      .filter(([k]) => k !== "table")
      .map(([k, v]) => [k, first(v) ?? ""]),
  );

  let resolved: Awaited<ReturnType<typeof resolveRecipients>> | "forbidden" | string;
  try {
    resolved = await resolveRecipients(user, tableId, filters);
  } catch (error) {
    if (error instanceof ForbiddenError) resolved = "forbidden";
    else if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    else if (error instanceof DomainError && error.fieldErrors?.recipients)
      resolved = error.fieldErrors.recipients[0]!;
    else throw error;
  }
  if (resolved === "forbidden") return <ForbiddenView />;

  const sourceKey = `source.${tableId.replace(".", "_")}`;
  const header = (
    <PageHeader
      title={t("compose.title")}
      breadcrumbs={[{ label: t("title"), href: "/messages" }, { label: t("compose.title") }]}
    />
  );
  if (typeof resolved === "string")
    return (
      <>
        {header}
        <EmptyState
          title={t(resolved === "tooMany" ? "errors.tooMany" : "errors.noRecipients")}
          description={t("compose.backHint")}
        />
      </>
    );

  const templates = await listTemplates();
  return (
    <>
      {header}
      <p className="mb-4 max-w-2xl text-sm" data-testid="recipient-summary">
        {t("compose.recipients", {
          count: resolved.personIds.length,
          list: t.has(sourceKey as never) ? t(sourceKey as never) : tableId,
        })}
      </p>
      <MessageForm
        tableId={tableId}
        filters={resolved.filters}
        recipientCount={resolved.personIds.length}
        templates={templates}
      />
    </>
  );
}
