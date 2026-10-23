import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { studentListsTable } from "@/modules/stu";

export default async function StudentListsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/stu/lists");
  if (!(await can(user, "stu.student.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("stu.lists"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <nav aria-label={t("title")} className="mb-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {(["registered", "deregistered", "suspended"] as const).map((k) => (
            <li key={k}>
              <Link
                href={`/stu/lists?list=${k}`}
                className="underline"
                aria-current={(search.list ?? "registered") === k ? "page" : undefined}
              >
                {t(`kinds.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage def={studentListsTable} search={search} user={user} basePath="/stu/lists" />
    </>
  );
}
