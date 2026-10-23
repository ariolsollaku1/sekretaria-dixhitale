// AC-11: modules add their own "start a new academic year" steps here (groups, fee schedules,
// calendar...). The checklist page shows those the user may use. Pure helpers + a registry.
export type ChecklistItem = {
  id: string;
  /** Catalog keys, e.g. "ntf.rollover.groups" */
  labelKey: string;
  descriptionKey?: string;
  href: string;
  permission?: string;
  order: number;
};

const items = new Map<string, ChecklistItem>();

export function registerYearChecklistItem(item: ChecklistItem): void {
  items.set(item.id, item); // re-registering replaces (dev hot reload)
}

export function allChecklistItems(): ChecklistItem[] {
  return [...items.values()];
}

export function resetChecklist(): void {
  items.clear();
}

export function visibleChecklist(
  list: readonly ChecklistItem[],
  permissions: ReadonlySet<string>,
): ChecklistItem[] {
  return list
    .filter((i) => !i.permission || permissions.has(i.permission))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
