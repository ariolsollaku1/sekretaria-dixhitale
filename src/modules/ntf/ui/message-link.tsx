import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/authz/guard";
import type { TableDef } from "@/lib/tables/define";
import { parseTableParams } from "@/lib/tables/params";
import type { SearchParams } from "@/lib/tables/types";

/**
 * AC-1: "Message these people" for a list page. Shown to holders of `ntf.message.send` for tables
 * that declare a recipient accessor; carries the table id and the validated filters.
 */
export async function MessageThesePeople({
  def,
  search,
  user,
}: {
  def: Pick<TableDef<never>, "id" | "recipient" | "filters" | "columns" | "defaultSort">;
  search: SearchParams;
  user: { id: string };
}) {
  if (!def.recipient || !(await can(user, "ntf.message.send"))) return null;
  const { filters } = parseTableParams(search, def);
  const q = new URLSearchParams({ table: def.id, ...filters });
  const t = await getTranslations("msg");
  return (
    <Link
      href={`/messages/new?${q.toString()}`}
      className={buttonVariants({ variant: "secondary" })}
    >
      {t("action")}
    </Link>
  );
}
