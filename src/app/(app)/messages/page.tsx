import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { messagesTable } from "@/modules/ntf";

// NTF-03 AC-8/AC-9: the messages the user sent.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/messages");
  if (!(await can(user, "ntf.message.send"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("msg"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/messages/templates" className={buttonVariants({ variant: "secondary" })}>
            {t("templates.title")}
          </Link>
        }
      />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage def={messagesTable} search={search} user={user} basePath="/messages" />
    </>
  );
}
