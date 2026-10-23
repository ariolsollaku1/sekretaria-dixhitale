import type { ReactNode } from "react";

// AC-10: modules register dashboard cards; the dashboard renders those the user may see.
export type Widget = {
  id: string;
  permission?: string;
  order: number;
  /** A server component (may be async) rendering the card's content. */
  component: () => ReactNode | Promise<ReactNode>;
};

const widgets = new Map<string, Widget>();

export function registerWidget(widget: Widget): void {
  if (widgets.has(widget.id)) throw new Error(`Duplicate widget "${widget.id}"`);
  widgets.set(widget.id, widget);
}

export function resetWidgets(): void {
  widgets.clear();
}

export function visibleWidgets(permissions: ReadonlySet<string>): Widget[] {
  return [...widgets.values()]
    .filter((w) => !w.permission || permissions.has(w.permission))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
