import Link from "next/link";
import { getTranslations } from "next-intl/server";

const TABS = [
  { key: "deadlines", href: "/fin/lists/deadlines" },
  { key: "clearance", href: "/fin/lists/clearance" },
  { key: "debtors", href: "/fin/lists/clearance?result=NOT_CLEARED" },
] as const;

/** FIN-05: switch between the shared payment lists (debtors = clearance list, not cleared). */
export async function ListTabs({ active }: { active: "deadlines" | "clearance" | "debtors" }) {
  const t = await getTranslations("fin.lists");
  return (
    <nav aria-label={t("title")} className="mb-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              className="underline"
              aria-current={tab.key === active ? "page" : undefined}
            >
              {t(`tabs.${tab.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
