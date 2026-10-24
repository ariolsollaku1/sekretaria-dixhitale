import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { IssuedPackages, PackageStudents, ownPackages } from "@/modules/cur";

// AC-7/AC-11: the student's own plan-and-syllabi package; nothing of anybody else.
export default async function MyPackagePage() {
  const user = await requireUser("/cur/my-package");
  if (!(await can(user, "cur.package.self"))) return <ForbiddenView />;
  const t = await getTranslations("cur.packages");
  const own = await ownPackages(user);
  return (
    <>
      <PageHeader title={t("mineTitle")} />
      {!own || own.enrollments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("noEnrollments")}
          description={t("noEnrollmentsHint")}
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-4 max-w-prose text-sm">{t("mineIntro")}</p>
          <div className="mb-8">
            <PackageStudents
              mode="self"
              students={[{ studentId: "own", name: "", number: "", enrollments: own.enrollments }]}
            />
          </div>
          <h2 className="mb-3 text-base font-semibold">{t("mine")}</h2>
          <IssuedPackages items={own.issued} showStudent={false} />
        </>
      )}
    </>
  );
}
