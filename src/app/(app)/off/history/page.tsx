import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { requestingStaff, RequestsTable, staffHistory } from "@/modules/off";

// OFF-01 AC-9: the history of staff requests of one staff member (HR, administration).
export default async function StaffHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const user = await requireUser("/off/history");
  if (!(await can(user, "off.request.history"))) return <ForbiddenView />;
  const { user: chosen } = await searchParams;
  const [t, people] = await Promise.all([getTranslations("off"), requestingStaff()]);
  const person = people.find((p) => p.id === chosen);
  const rows = person ? await staffHistory(person.id) : [];
  return (
    <>
      <PageHeader title={t("history.title")} />
      <section aria-labelledby="off-who" className="mb-8">
        <h2 id="off-who" className="mb-3 text-2xl font-semibold">
          {t("history.pick")}
        </h2>
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("history.nobody")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/off/history?user=${p.id}`}
                  aria-current={p.id === person?.id ? "page" : undefined}
                  className="rounded-control border-border bg-card inline-block border px-3 py-2 text-sm underline aria-[current=page]:font-semibold"
                >
                  {p.name} ({p.count})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {person && (
        <section aria-labelledby="off-rows">
          <h2 id="off-rows" className="mb-3 text-2xl font-semibold">
            {t("history.of", { name: person.name })}
          </h2>
          <RequestsTable rows={rows} />
        </section>
      )}
    </>
  );
}
