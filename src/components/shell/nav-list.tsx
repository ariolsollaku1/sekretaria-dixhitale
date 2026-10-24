"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavIcon } from "@/lib/nav/registry";
import { NAV_ICONS } from "./icons";

export type NavItemView = { id: string; label: string; href: string; icon: NavIcon };
export type NavSectionView = { id: string; heading: string | null; items: NavItemView[] };

export function NavList({
  sections,
  onNavigate,
}: {
  sections: NavSectionView[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.id}>
          {section.heading && (
            <p className="text-sidebar-foreground/80 px-3 pb-1 text-[13px] font-semibold tracking-wide uppercase">
              {section.heading}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-control flex min-h-11 items-center gap-3 px-3 text-[15px]",
                      active
                        ? "bg-card text-accent-foreground font-semibold shadow-lg"
                        : "text-sidebar-foreground hover:bg-white/10",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
