import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { lecturersTable } from "@/modules/hr";

const PRESETS = [
  { key: "byDepartment", query: "status=active" },
  { key: "pae", query: "category=PAE&status=active" },
  { key: "pak", query: "category=PAK&status=active" },
  { key: "externalEmployer", query: "category=PAK&status=active" },
  { key: "retiredExternal", query: "category=PAK&retired=yes" },
  { key: "volunteers", query: "category=VOLUNTEER&status=active" },
] as const;

// HR-05 AC-5: the standard lists as ready-made filters.
export default async function HrListsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/lists");
  if (!(await can(user, "hr.staff.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("hr.lists"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <nav aria-label={t("presets")} className="mb-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {PRESETS.map((p) => (
            <li key={p.key}>
              <Link href={`/hr/lists?${p.query}`} className="underline">
                {t(`preset.${p.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <TablePage def={lecturersTable} search={search} user={user} basePath="/hr/lists" />
    </>
  );
}
