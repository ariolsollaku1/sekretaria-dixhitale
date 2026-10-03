# Design system

Rules for how the UI looks and behaves. Decision record: [ADR-0012](adr/0012-design-system.md).
Stack: Tailwind CSS + shadcn/ui ([conventions.md](conventions.md#ui)).

**Source of truth:** tokens live in code (`src/app/globals.css`) and components in
`src/components/ui`. This document holds the rules and the reasoning. If they disagree, the code
wins and this file gets fixed.

**Visual reference (may lag the code):** Claude Design artifact
<https://claude.ai/artifact/PCRx7iDEmpTeJAb72J4LNs> (private to the owner).

## Principles

1. **Data first, decoration never.** Dense lists, filters and statuses are the product. No
   illustration or gradient competes with a table.
2. **Official, so unambiguous.** Grades, balances and dates are legal records. Show the academic
   year on every screen (ADR-0006), format dates/money with the active locale, never truncate an
   identifier.
3. **Role-aware, not role-specific.** One component set for every role. Roles change what is
   shown, never how it looks. Hiding UI is convenience; the server is the security boundary.
4. **Safe by default.** Irreversible actions (finalize grades, issue a document) state what will
   happen and who is affected, and need a deliberate confirm. Prefer drafts and audit trails to
   warnings.

## Tokens

Colors (proposed palette — no brand colors were supplied; replace with LOGOS brand if provided):

| Token | Value | Use |
|---|---|---|
| `background` | `#F6F7F9` | App ground |
| `card` | `#FFFFFF` | Cards, tables |
| `foreground` | `#17202E` | Text (16:1) |
| `muted-foreground` | `#4A5668` | Secondary text (7:1) |
| `primary` | `#1F3A5F` | Primary action |
| `accent` | `#E4ECF7` | Selected row, hover |
| `border` / `input` | `#D5DBE4` / `#9AA6B8` | Dividers / control borders |
| `ring` | `#2E5A94` | Focus: 2px + 2px offset |
| `success` `warning` `danger` `info` | `#1B6B4A` `#7A4300` `#A32020` `#1D4F91` | Status text, each on its `-bg` tint |

Type: **IBM Plex Sans** for UI, **IBM Plex Mono** (tabular figures) for NIM, academic year,
reference numbers and amounts. Scale: page title 32/600, section 24/600, card title 18/600,
body 15/400, caption 13/400 (minimum size). Sentence case.

Spacing: 4 px base — 4, 8, 12, 16, 24, 32, 48. Radius: 4 chips, 8 controls, 12 cards.
Elevation: cards use a border; only menus and dialogs have a shadow.

## Rules

- **Tokens only.** No raw hex or arbitrary values (`bg-[#…]`) in module code. Need a new value?
  Add a token.
- **Status is never color alone.** Every status shows label + icon. Use the shared `StatusChip`
  (`success | warning | danger | info | neutral`).
- **Copy:** all strings via next-intl (ADR-0011). Albanian is the default and often 30–40% longer
  than English: never size a control to one label.
- **Dates/money:** only through the shared `Intl` helper (active locale, `Europe/Tirane`).
- **Accessibility (WCAG 2.2 AA target):** text 4.5:1, controls 3:1, visible focus ring, 44 px touch
  targets, full keyboard use, labels on every field (never placeholder-as-label), errors tied to
  their field.
- **Responsive:** every page works at 360 px. Wide tables scroll inside their own box.
- **States:** every list and form designs empty, loading, error and no-permission states.
- **Buttons:** one primary per view; name the outcome ("Finalize grades", not "OK"); destructive
  is red and always confirms.
- **Tabs:** switch views of the same record (Profile / Grades / Payments), never steps or module
  navigation. Active tab is in the URL.
- **Feedback:** toast for confirmation of a finished action; inline alert for anything the user
  must act on.
- **Library:** no component library besides shadcn/ui. Extend, don't add.

## Project-specific patterns (to specify when first built)

Academic-year switcher (fixed header slot) · role/scope indicator · irreversible-action confirm
dialog · page/list template (header, filter bar, `DataTable`, pagination, states) · multi-step form
(forms engine, ADR-0009) · document preview (Gotenberg output, ADR-0007).

## Adding to the system

1. Look for an existing shadcn/ui primitive or pattern first.
2. When a second module needs the same new thing, build it once with all states in
   `src/components/ui` and add its rule here.
3. Record non-obvious decisions as an ADR.
