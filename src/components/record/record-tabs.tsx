import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Views of the same record (design-system.md: tabs). The active tab is in the URL (`?tab=`), so
 * it is linkable and works without JavaScript.
 */
export function RecordTabs({
  label,
  basePath,
  tabs,
  active,
}: {
  label: string;
  basePath: string;
  tabs: { key: string; label: string }[];
  active: string;
}) {
  return (
    <nav
      aria-label={label}
      className="bg-muted mb-6 flex w-fit max-w-full flex-wrap gap-1 rounded-2xl p-1 print:hidden"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}?tab=${tab.key}`}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "rounded-control flex min-h-11 items-center px-4 text-sm font-semibold",
            tab.key === active
              ? "bg-card text-brand shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
