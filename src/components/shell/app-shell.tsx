"use client";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { signOutAction } from "@/lib/auth/actions";
import { AcademicYearProvider } from "@/lib/academic-year/client";
import { AcademicYearSelect, type AcademicYearView } from "./academic-year-select";
import { LocaleSwitcher } from "./locale-switcher";
import { NavList, type NavSectionView } from "./nav-list";
import { UserMenu } from "./user-menu";

const SIGN_OUT_FORM = "shell-signout";

export type ShellProps = {
  sections: NavSectionView[];
  user: { name: string; email: string; roles: string[] };
  academicYear: AcademicYearView | null;
  children: ReactNode;
};

/** AC-1/AC-3: sidebar on md+, drawer below; top bar with year, language, notifications slot, user. */
export function AppShell({ sections, user, academicYear, children }: ShellProps) {
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
        <aside className="border-border bg-card hidden w-64 shrink-0 border-r md:block">
          <div className="p-4">
            <p className="text-brand text-lg font-semibold">{t("appName")}</p>
            <p className="text-muted-foreground text-[13px]">{t("institution")}</p>
          </div>
          <nav aria-label={t("navigation")} className="p-2">
            <NavList sections={sections} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border bg-card flex flex-wrap items-center gap-2 border-b px-3 py-2 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t("openMenu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <p className="font-semibold md:hidden">{t("appName")}</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {academicYear && <AcademicYearSelect {...academicYear} />}
              <LocaleSwitcher />
              {/* Notifications slot: PLT-11 renders the bell here. */}
              <div data-slot="notifications" />
              <UserMenu {...user} signOutFormId={SIGN_OUT_FORM} />
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"
          >
            {children}
          </main>
        </div>
      </div>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent placement="drawer" closeLabel={t("closeMenu")} className="p-4">
          <DialogTitle className="text-brand text-lg font-semibold">{t("appName")}</DialogTitle>
          <DialogDescription className="text-muted-foreground mb-4 text-[13px]">
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
