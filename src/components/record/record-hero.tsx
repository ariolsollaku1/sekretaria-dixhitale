import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Breadcrumb } from "@/components/ui/page-header";

/** Up to two letters for the avatar, from the display name. */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

async function RecordBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  const t = await getTranslations("common");
  return (
    <nav aria-label={t("breadcrumb")} className="text-muted-foreground mb-3 text-[13px]">
      <ol className="flex flex-wrap gap-x-2">
        {items.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex gap-2">
            {crumb.href ? (
              <Link href={crumb.href} className="underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
            {i < items.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Header of a record page (design-system.md, "Record page"): breadcrumbs, then a gradient banner
 * with the action buttons, an initials avatar, the name as the page's only `h1`, one line of
 * context, and status pills on the right.
 */
export async function RecordHero({
  name,
  subtitle,
  badges,
  actions,
  breadcrumbs,
  icon: Icon,
}: {
  name: string;
  /** One short line, e.g. "Dr. · Department of Law". */
  subtitle?: string;
  /** `StatusBadge`s: state first, then classification. */
  badges?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** For records that are not a person (course, program, event): shown instead of initials. */
  icon?: LucideIcon;
}) {
  return (
    <>
      {breadcrumbs && breadcrumbs.length > 0 && <RecordBreadcrumbs items={breadcrumbs} />}
      <section
        aria-label={name}
        className="rounded-card bg-card ring-border mb-6 overflow-hidden shadow-sm ring-1"
      >
        <div className="bg-brand-gradient flex h-24 items-start justify-end gap-2 p-4">
          {actions}
        </div>
        <div className="-mt-10 flex flex-wrap items-end gap-5 px-5 pb-5 md:px-6">
          <span
            aria-hidden
            className="bg-sidebar-gradient ring-card grid size-20 shrink-0 place-items-center rounded-2xl text-2xl font-semibold text-white shadow-lg ring-4"
          >
            {Icon ? <Icon className="size-9" aria-hidden /> : initialsOf(name)}
          </span>
          <div className="min-w-0 flex-1 pt-10">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight">{name}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {badges && <div className="flex flex-wrap items-center gap-2 pt-10">{badges}</div>}
        </div>
      </section>
    </>
  );
}
