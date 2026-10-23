import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { CategoryManager, listCategories } from "@/modules/cur";

export default async function CategoriesPage() {
  const user = await requireUser("/cur/categories");
  if (!(await can(user, "cur.course.read"))) return <ForbiddenView />;
  const [t, categories, canWrite] = await Promise.all([
    getTranslations("cur.category"),
    listCategories(),
    can(user, "cur.category.write"),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <CategoryManager categories={categories} canWrite={canWrite} />
    </>
  );
}
