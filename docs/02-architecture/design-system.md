# Design system

Rules for how the UI looks and behaves. Decision records: [ADR-0012](adr/0012-design-system.md); the current look is [ADR-0013](adr/0013-aurora-visual-style.md) (Aurora).
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

Colors (Aurora, ADR-0013; still no LOGOS brand colors — replace if provided):

| Token | Value | Use |
|---|---|---|
| `background` | `#F4F5FB` | App ground |
| `card` | `#FFFFFF` | Cards, tables (soft ring, no heavy border) |
| `foreground` | `#1A1D2E` | Text |
| `muted-foreground` | `#4B5272` | Secondary text |
| `primary` / `brand` → `brand-end` | `#4F46E5` → `#7C3AED` | Primary action (gradient via `bg-brand-gradient`) |
| `accent` | `#EEF0FF` | Selected row, hover |
| `border` / `input` | `#E0E3F0` / `#8C95B3` | Dividers / control borders |
| `ring` | `#4F46E5` | Focus: 2px + 2px offset |
| `success` `warning` `danger` `info` `violet` | `#166A4A` `#8A4A00` `#B0203A` `#1B5FA8` `#6D28D9` | Status text, each on its `-bg` tint |
| `sidebar-from/via/to`, `sidebar-foreground` | `#1E1B4B` `#312E81` `#4C1D95`, `#C7D2FE` | Sidebar and mobile drawer (`bg-sidebar-gradient`) |

Gradients exist only as `bg-brand-gradient`, `bg-sidebar-gradient` and `shadow-brand`.

Type: **IBM Plex Sans** for UI, **IBM Plex Mono** (tabular figures) for NIM, academic year,
reference numbers and amounts. Scale: page title 32/600, section 24/600, card title 18/600,
body 15/400, caption 13/400 (minimum size). Sentence case.

Spacing: 4 px base — 4, 8, 12, 16, 24, 32, 48. Radius: 8 chips, 12 controls, 16 cards.
Elevation: cards use a soft ring and `shadow-sm`; menus and dialogs have a larger shadow.

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

## Implemented (PLT-06)

Shell: gradient sidebar from `md` (768 px), drawer below; the transparent top bar is right-aligned and
holds the academic-year select (only when years exist), language flag menu, notifications, user menu
(initials avatar). The left of the top bar holds the global search / command palette (PLT-16, Ctrl/⌘+K): menu pages plus records from per-module search sources that reuse each list's permission and scope. Components in `src/components/ui`:
`Button` (primary/secondary/ghost/destructive, 44 px), `Input`, `Label`, `Dialog` (modal and
drawer), `DropdownMenu`, `StatusBadge`, `EmptyState`, `ErrorState`, `PageHeader`, `FormField`,
`ConfirmDialog`, `Skeleton`, `Toaster`. Registries: `registerNav` (`src/lib/nav`),
`registerWidget` (`src/lib/dashboard`), `registerAcademicYearProvider` (`src/lib/academic-year`).
Lists use `TablePage` / `DataTable` (`src/components/table`): filter bar, saved filters, column chooser, export and print buttons, scrollable table, pagination, empty/error/403 states.
The component is named `StatusBadge` in code (the rule above calls it StatusChip).

## Record page (Aurora)

The layout of every page that shows **one record** (a person, a course, a program, an event…).
Built from shared parts, so a new page is composition, not styling:
`RecordHero`, `RecordTabs` (`src/components/record/`), `Card`, `CardTitle`, `InfoList`
(`src/components/ui/card.tsx`), `StatusBadge`. Reference implementations:
`src/app/(app)/hr/staff-record.tsx` (single view) and `src/app/(app)/stu/students/[id]/page.tsx`
(with tabs). Decision: [ADR-0013](adr/0013-aurora-visual-style.md).

### Anatomy, top to bottom

1. **Breadcrumbs**: list → record name. The only navigation above the hero.
2. **Hero** (`RecordHero`): gradient banner with the page's **actions** at its top right; a
   gradient initials avatar (or an icon for a non-person record) overlapping the banner edge; the
   **name as the page's only `h1`**; one muted context line; **status pills** on the right.
3. **Tabs** (`RecordTabs`), only when the record has distinct views (Personal / Enrollments /
   History). Segmented control, active tab in the URL (`?tab=`), keyboard and no-JS friendly.
4. **Body**: a two-column grid, `2fr` main + `1fr` side from `lg`, one column below. Cards stack in
   each column and in the order below.
5. **History** (`EntityHistory`): full-width card at the bottom, only for users with the write
   permission.

### Rules

- **One `h1`**, the record's name, inside the hero. Don't also render a `PageHeader` title.
- **Actions live in the banner**, rendered as `secondary` buttons (white on the gradient). At most
  one primary action per page; destructive actions go through `ConfirmDialog`.
- **Hero subtitle is one line** of context separated by ` · ` (title · department, number ·
  program). It is never a sentence and never wraps data the user may not see.
- **Status pills**: state first (active/ended), then classification (kind, category). Tone follows
  meaning: `success` live, `neutral` ended, `info` classification, `warning` needs attention.
  Always label + icon (`StatusBadge`), never color alone. Max ~4 pills.
- **Main column = what the record is** (personal data, employment, program details). **Side
  column = what surrounds it**: dates/contract, contact, account, related items, in that order.
- **One card = one topic**, titled with `CardTitle` and a single icon tile. Titles are nouns
  ("Personal data", "Contract"), sentence case.
- **Field lists use `InfoList`**: label above value, two columns in the main column and one in the
  side column. **No icons on individual fields**, except in a card where *every* row has one
  (Contact). A card must be uniform: all fields with icons or none.
- **Hidden fields are absent**, not masked or "—". `InfoList` drops empty values; a field the
  viewer may not see is simply not passed (the server already removed it, AC-9 style).
- **Identifiers and numbers** (national ID, NIM, student number, reference) use `font-tabular`.
  Dates and money go through the shared `Intl` helpers.
- **Derived display values** (days left, progress) come from a pure function in the module's
  `domain/` with unit tests. They show a fact, never a verdict: no thresholds or colors that would
  be a business rule (those belong to a feature with an answered question).
- **Empty card state**: when every row of a card is empty, show one muted line ("No contact
  details."), never an empty card.
- **Tabs are views of the same record**, not steps or navigation (see Rules > Tabs). Each tab body
  uses the same card grid; tables inside a tab sit in their own scroll box.
- **States**: a record outside the user's scope is `notFound()` (does not exist); no permission is
  `ForbiddenView`; loading uses `Skeleton` cards of the same grid.
- **Mobile (360 px)**: hero wraps (avatar, then name, then pills), columns stack main first, tabs
  wrap, tables scroll inside their card.
- **Print**: tabs and actions carry `print:hidden`; cards print as flat blocks.

### Checklist for a new record page

1. Fetch with the user's scope (`getX(user, id)`); `notFound()` when `null`.
2. `RecordHero` with name, one-line subtitle, pills, breadcrumbs, actions.
3. Tabs only if there are real separate views.
4. Main cards, side cards (contract/dates, contact, account), then `EntityHistory`.
5. All strings via next-intl in `sq` and `en`; no raw colors.
6. e2e: the page renders for an allowed role, and a forbidden role gets `ForbiddenView`/404; query
   fields by role (`definition`), not loose text (a value may appear in the hero and a card).

### Variants

- **Person record** (staff, student, user, applicant, lead): initials avatar; subtitle is an
  identifier plus one fact (number · program, e-mail).
- **Entity record** (course, program, department, faculty, cohort, academic year, event, plan): pass
  `icon` to `RecordHero` instead of initials; name = the entity's name, subtitle = its code ·
  one parent (e.g. "CS101 · Computer science").
- **Workflow record** (application, scholarship decision, recognition request, evaluation
  campaign): the main column holds the work (documents, decision table, evaluations), the side
  column holds who/what it is about; a closed state is a neutral pill in the hero.
- **Admin forms inside a record** (edit course, edit program…) are a card titled with a pencil
  icon in the main column, below the read-only facts, only for users with the write permission;
  read-only users get the facts and a muted note, never a disabled form.

### More rules learned from applying it

- **The primary call-to-action of the page's audience** (e.g. "Register" on an event) is *not* in
  the banner: a gradient button on the gradient banner has no contrast. Put it in a side card
  with the state text (`role="status"`) above it. Banner actions are for managers.
- **Details card**: a side card titled "Details" holds code, English name and the parent link;
  facts the viewer scans (credits, dates, totals) get their own titled card.
- **`InfoList` is a real definition list**: `dl > div > dt + dd`, nothing in between (axe rule
  `definition-list`). A field icon goes inside the `dt`, never beside it.
- **Tables inside a card** scroll in their own `overflow-x-auto` box; the card supplies the
  surface, so the table has no border of its own.
- **Timelines** (history, lead events) use the left rule + gradient dot of `EntityHistory`.
- **Progress** (contract elapsed, evaluations submitted) is `role="progressbar"` with a label and
  `aria-valuenow`, and shows a fact, not a verdict.

### Where it is used

| Page | Variant |
|---|---|
| `/hr/staff/[id]`, `/hr/me`, `/stu/students/[id]` (tabs), `/admin/users/[id]` | person |
| `/adm/applications/[id]`, `/adm/leads/[id]` | person + workflow |
| `/cur/courses/[id]`, `/org/programs/[id]`, `/org/departments/[id]`, `/org/faculties/[id]`, `/org/cohorts/[id]`, `/org/years/[id]` | entity |
| `/events/[id]`, `/calendar/events/[id]`, `/cur/plans/[id]`, `/fin/plans/[id]` | entity |
| `/stu/requests/[id]`, `/fin/scholarships/applications/[id]`, `/hr/evaluations/[id]` | workflow |

Not record pages and not in scope: lists (`TablePage`), forms, audit entries, announcements and
messages (reading pages), QA result reports, the remaining one-off pages (document templates,
form definitions, hours, teaching assignment, exam sessions, attendance sessions, syllabi, QA
campaigns): restyle them with the same parts when they are next touched.

## Adding to the system

1. Look for an existing shadcn/ui primitive or pattern first.
2. When a second module needs the same new thing, build it once with all states in
   `src/components/ui` and add its rule here.
3. Record non-obvious decisions as an ADR.
