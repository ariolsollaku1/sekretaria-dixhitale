import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { IssuedPackages, PackageStudents, recentIssued, searchStudents } from "@/modules/cur";

// AC-11: the secretariat finds a student, sees what a package would contain and issues it.
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("/cur/packages");
  if (!(await can(user, "cur.package.issue"))) return <ForbiddenView />;
  const [t, params] = await Promise.all([getTranslations("cur.packages"), searchParams]);
  const q = params.q?.trim() ?? "";
  const [students, issued] = await Promise.all([searchStudents(user, q), recentIssued(user)]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-prose text-sm">{t("intro")}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-q">{t("search")}</Label>
          <Input id="f-q" name="q" defaultValue={q} minLength={2} className="w-72" />
        </div>
        <Button type="submit" variant="secondary">
          {t("find")}
        </Button>
      </form>
      {q.length >= 2 &&
        (students.length === 0 ? (
          <p className="mb-6 text-sm">{t("noStudents")}</p>
        ) : (
          <div className="mb-8">
            <PackageStudents students={students} mode="staff" />
          </div>
        ))}
      <h2 className="mb-3 text-base font-semibold">{t("recent")}</h2>
      <IssuedPackages items={issued} showStudent />
    </>
  );
}
