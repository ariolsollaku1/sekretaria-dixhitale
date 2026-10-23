import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import type { NavSectionView } from "@/components/shell/nav-list";
import { requireUser } from "@/lib/auth";
import { PermissionsProvider } from "@/lib/authz/client";
import { permissionsFor } from "@/lib/authz/guard";
import { loadActorContext } from "@/lib/authz/load";
import { getSelectedAcademicYear, listAcademicYears } from "@/lib/academic-year/context";
import { allNavEntries, visibleNav } from "@/lib/nav/registry";
import "@/lib/nav/all";

// Every page below needs a signed-in user (AC-1). The shell shows navigation filtered by the
// user's permissions (AC-2); the server still checks every read and write.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const t = await getTranslations("shell");
  const tRoles = await getTranslations("roles");
  const permissions = await permissionsFor(user);

  const sections: NavSectionView[] = visibleNav(allNavEntries(), new Set(permissions)).map((s) => ({
    id: s.group ?? "main",
    heading: s.group ? t(`nav.groups.${s.group}`) : null,
    items: s.entries.map((e) => ({
      id: e.id,
      label: t(`nav.${e.labelKey}` as "nav.dashboard"),
      href: e.href,
      icon: e.icon,
    })),
  }));

  const years = await listAcademicYears();
  const academicYear = years.length
    ? { options: years, selected: await getSelectedAcademicYear() }
    : null;

  const ctx = await loadActorContext(user.id);
  const roles = [...new Set(ctx?.assignments.map((a) => a.role) ?? [])].map((r) => tRoles(r));

  return (
    <PermissionsProvider permissions={permissions}>
      <AppShell
        sections={sections}
        user={{ name: user.name, email: user.email, roles }}
        academicYear={academicYear}
      >
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}
