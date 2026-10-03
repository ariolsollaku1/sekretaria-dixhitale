# ADR-0012 — Design system on Tailwind + shadcn/ui

- **Status:** Proposed

## Context

~15 modules used by staff on desktops and students on phones must look and behave consistently.
The team is new to design, so the system must be small, enforceable in code, and written down.

## Decision

- Tokens live in code (`globals.css`, shadcn variable names); rules live in
  [design-system.md](../design-system.md). Code is the source of truth.
- Look: calm and data-dense — navy primary, cool neutral ground, IBM Plex Sans/Mono (covers
  Albanian ë/ç). Palette is provisional until LOGOS brand colors are supplied.
- Status is always label + icon + color, via one shared `StatusChip`.
- No raw color/spacing values in module code; enforced by lint.
- WCAG 2.2 AA is the target (raises the WCAG 2.1 AA stated in conventions.md).
- Start small (tokens, ~8 components, page/list templates); add components only when a second
  module needs them.

## Consequences

- A rebrand is a change to one theme file.
- Albanian text length must be tested in every layout.
- A visual reference artifact exists but may lag; it is not authoritative.

## Alternatives

- Another component library (MUI, Mantine): rejected, conflicts with conventions.md.
- Figma/Storybook as source of truth: deferred; Storybook can be added later without changing this
  decision.
