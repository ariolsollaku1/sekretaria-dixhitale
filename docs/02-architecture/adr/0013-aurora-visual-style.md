# ADR-0013 — Aurora visual style

- **Status:** Proposed
- **Amends:** [ADR-0012](0012-design-system.md) (look and palette only; every rule, the stack and the accessibility target stay)

## Context

ADR-0012 chose a calm navy look and flagged the palette as provisional (no LOGOS brand colors).
Four candidate designs of `/adm/applications` were compared; the owner picked **Aurora**: a modern
dashboard with lively color. The prototypes were throwaway pages on mock data and are not kept; the shell, tokens and shared
components in code are the record of the result.

## Decision

- Primary becomes indigo `#4F46E5` with a violet end `#7C3AED`; ground `#F4F5FB`; cards white with a
  soft ring; radii 8 chips, 12 controls, 16 cards.
- Gradients are allowed in exactly three places, as tokens/utilities in `globals.css`:
  `bg-brand-gradient` (primary button, avatar, active pagination), `bg-sidebar-gradient`
  (sidebar and mobile drawer), `shadow-brand`. No other gradients.
- Shell: gradient sidebar with a white active pill. The top bar is transparent and right-aligned:
  academic year, language (flag), notifications, user (initials avatar).
- Language switcher is a flag button with a menu naming each language. Flags are inline SVG
  (`components/shell/flags.tsx`) because flag emoji do not render on Windows.
- Statuses stay label + icon + color, now as full pills.
- A `violet` / `violet-bg` token pair is added for a fifth status tone (e.g. enrolled).

## Consequences

- Contrast is rechecked for the new tokens (text ≥ 4.5:1, controls ≥ 3:1); `--input` was darkened.
- All module pages inherit the style through tokens and shared components; no module code changes.
- KPI tiles, charts and avatars from the prototype are not built yet; they become shared
  components when a second page needs them (design-system.md, "Adding to the system").
