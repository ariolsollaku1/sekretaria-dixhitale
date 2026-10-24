"use client";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { signOutAction } from "@/lib/auth/actions";
import { AcademicYearProvider } from "@/lib/academic-year/client";
import { AcademicYearSelect, type AcademicYearView } from "./academic-year-select";
import { GlobalSearch } from "./global-search";
import { LocaleSwitcher } from "./locale-switcher";
import { NavList, type NavSectionView } from "./nav-list";
import { NotificationBell, type BellItem } from "@/components/notifications/notification-bell";
import { UserMenu } from "./user-menu";

const SIGN_OUT_FORM = "shell-signout";

function BrandMark({ appName, institution }: { appName: string; institution: string }) {
  return (
    <div className="flex items-center gap-3 p-5">
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-xl bg-white/15 text-lg font-bold text-white"
      >
        L
      </span>
      <div>
        <p className="font-semibold text-white">{appName}</p>
        <p className="text-sidebar-foreground text-[13px]">{institution}</p>
      </div>
    </div>
  );
}

export type ShellProps = {
  sections: NavSectionView[];
  user: { name: string; email: string; roles: string[] };
  academicYear: AcademicYearView | null;
  notifications: { unread: number; items: BellItem[] };
  children: ReactNode;
};

/** AC-1/AC-3: sidebar on md+, drawer below; top bar with year, language, notifications slot, user. */
export function AppShell({ sections, user, academicYear, notifications, children }: ShellProps) {
  const t = useTranslations("shell");
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <AcademicYearProvider value={academicYear?.selected ?? null}>
      <a
        href="#main-content"
        className="focus:rounded-control focus:bg-card sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-3 focus:font-semibold"
      >
        {t("skipToContent")}
      </a>
      <form id={SIGN_OUT_FORM} action={signOutAction} />
      <div className="flex min-h-screen">
        <aside className="bg-sidebar-gradient text-sidebar-foreground hidden w-64 shrink-0 md:block print:hidden">
          <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto">
            <BrandMark appName={t("appName")} institution={t("institution")} />
            <nav aria-label={t("navigation")} className="p-3">
              <NavList sections={sections} />
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-8 print:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t("openMenu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <p className="text-brand font-semibold md:hidden">{t("appName")}</p>
            <div className="min-w-0 flex-1 md:max-w-sm">
              <GlobalSearch sections={sections} />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {academicYear && <AcademicYearSelect {...academicYear} />}
              <LocaleSwitcher />
              <NotificationBell unread={notifications.unread} items={notifications.items} />
              <UserMenu {...user} signOutFormId={SIGN_OUT_FORM} />
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 p-4 md:px-8 md:pt-2 md:pb-10"
          >
            {children}
          </main>
        </div>
      </div>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent placement="drawer" closeLabel={t("closeMenu")} className="p-4">
          <DialogTitle className="mb-1 text-lg font-semibold text-white">
            {t("appName")}
          </DialogTitle>
          <DialogDescription className="text-sidebar-foreground mb-4 text-[13px]">
            {t("institution")}
          </DialogDescription>
          <nav aria-label={t("navigation")}>
            <NavList sections={sections} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </DialogContent>
      </Dialog>
    </AcademicYearProvider>
  );
}
