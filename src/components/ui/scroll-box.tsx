import type { ReactNode } from "react";

/**
 * A horizontally scrolling region for a wide table inside a card. Keyboard users must be able to
 * focus and scroll it (axe: scrollable-region-focusable), so it is a labelled, focusable region.
 */
export function ScrollBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      {children}
    </div>
  );
}
