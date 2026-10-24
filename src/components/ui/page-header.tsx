import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  title,
  breadcrumbs,
  actions,
  description,
}: {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  description?: string;
}) {
  const t = useTranslations("common");
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label={t("breadcrumb")} className="text-muted-foreground mb-1 text-[13px]">
            <ol className="flex flex-wrap gap-x-2">
              {breadcrumbs.map((crumb, i) => (
                <li key={`${crumb.label}-${i}`} className="flex gap-2">
                  {crumb.href ? (
                    <Link href={crumb.href} className="underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                  {i < breadcrumbs.length - 1 && <span aria-hidden>/</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
