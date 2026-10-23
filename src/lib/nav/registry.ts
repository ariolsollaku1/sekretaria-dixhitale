// AC-2: modules add entries here from their index.ts (imported by all.ts); the shell shows only
// the ones whose permission the user holds. Pure, so it is unit-tested.
export const NAV_GROUPS = [
  "students",
  "teaching",
  "exams",
  "finance",
  "hr",
  "administration",
  "reports",
  "system",
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/** Curated icon names (resolved to lucide components in the client shell). */
export type NavIcon =
  | "home"
  | "users"
  | "graduation"
  | "book"
  | "calendar"
  | "clipboard"
  | "wallet"
  | "briefcase"
  | "building"
  | "chart"
  | "settings"
  | "shield"
  | "file"
  | "bell";

export type NavEntry = {
  id: string;
  /** Key in the `shell.nav` namespace of the catalogs, e.g. "dashboard". */
  labelKey: string;
  href: string;
  icon: NavIcon;
  /** Entries without a permission are visible to every signed-in user. */
  permission?: string;
  group?: NavGroup;
  order: number;
};

const entries = new Map<string, NavEntry>();

export function registerNav(...list: NavEntry[]): void {
  for (const entry of list) {
    if (entries.has(entry.id)) throw new Error(`Duplicate nav entry "${entry.id}"`);
    entries.set(entry.id, entry);
  }
}

export function allNavEntries(): NavEntry[] {
  return [...entries.values()];
}

export function resetNav(): void {
  entries.clear();
}

export type NavSection = { group: NavGroup | null; entries: NavEntry[] };

/** Entries the permission set allows, ungrouped first, then groups in NAV_GROUPS order, by `order`. */
export function visibleNav(
  list: readonly NavEntry[],
  permissions: ReadonlySet<string>,
): NavSection[] {
  const allowed = list
    .filter((e) => !e.permission || permissions.has(e.permission))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const sections: NavSection[] = [];
  const ungrouped = allowed.filter((e) => !e.group);
  if (ungrouped.length) sections.push({ group: null, entries: ungrouped });
  for (const group of NAV_GROUPS) {
    const inGroup = allowed.filter((e) => e.group === group);
    if (inGroup.length) sections.push({ group, entries: inGroup });
  }
  return sections;
}
