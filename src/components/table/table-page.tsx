import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { can } from "@/lib/authz/guard";
import { ForbiddenError } from "@/lib/authz/check";
import { logger } from "@/lib/logger";
import type { TableDef } from "@/lib/tables/define";
import { runTable } from "@/lib/tables/run";
import { listSavedFilters } from "@/lib/tables/saved";
import type { SearchParams } from "@/lib/tables/types";
import { DataTable } from "./data-table";

/** AC-8/AC-12: runs the table for the user and renders the list, the 403 view or an error state. */
export async function TablePage<Row>({
  def,
  search,
  user,
  basePath,
}: {
  def: TableDef<Row>;
  search: SearchParams;
  user: { id: string };
  basePath: string;
}) {
  // Data is loaded in the try block; JSX is built outside it (react-hooks/error-boundaries).
  let loaded:
    | {
        result: Awaited<ReturnType<typeof runTable<Row>>>;
        saved: Awaited<ReturnType<typeof listSavedFilters>>;
        canSave: boolean;
      }
    | "forbidden"
    | "failed";
  try {
    const [result, saved, canSave] = await Promise.all([
      runTable(def, search, user),
      listSavedFilters(user.id, def.id),
      can(user, "plt.view.save"),
    ]);
    loaded = { result, saved, canSave };
  } catch (error) {
    if (error instanceof ForbiddenError) loaded = "forbidden";
    else {
      logger.error("table failed", { table: def.id, error: (error as Error).name });
      loaded = "failed";
    }
  }

  if (loaded === "forbidden") return <ForbiddenView />;
  if (loaded === "failed") {
    const t = await getTranslations("table");
    return (
      <ErrorState
        title={t("error")}
        description={t("errorHint")}
        action={
          <Button asChild>
            <Link href={basePath}>{t("retry")}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <DataTable
      def={def}
      result={loaded.result}
      basePath={basePath}
      saved={loaded.saved}
      canSave={loaded.canSave}
    />
  );
}
