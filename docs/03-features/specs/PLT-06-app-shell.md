# PLT-06 — App shell, UI kit & i18n

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-05 |
| **Questions** | Q-17 (answered: Albanian `sq` default, English `en` second, user-switchable) |
| **Source** | — (enabler for every screen) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

Every logged-in page shares one layout: navigation filtered by permissions, an academic-year
selector ([ADR-0006](../../02-architecture/adr/0006-academic-year-scoping.md)), a language switcher
([ADR-0011](../../02-architecture/adr/0011-i18n.md)), and a common set of UI components
(shadcn/ui). Building this once keeps all modules visually and behaviorally consistent.

## 2. Requirements

### User stories

- As a **user**, I want a clear menu showing only what I can use, in my language, on desktop and
  phone.
- As a **developer**, I want ready components (page header, forms, dialogs, toasts, empty/error
  states) and a nav registry, so that new screens are consistent with no extra design work.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL render all `(app)` pages inside a shell with: sidebar navigation, top bar (academic-year selector, language switcher, notifications slot, user menu with profile and sign-out). |
| AC-2 | THE SYSTEM SHALL build navigation from a registry where modules add entries `{ id, labelKey, href, icon, permission, group, order }`, and SHALL show only entries whose permission the user holds. |
| AC-3 | WHILE the viewport is narrower than the `md` breakpoint, THE SYSTEM SHALL collapse the sidebar into a drawer, and every shell control SHALL remain usable at 360 px width. |
| AC-4 | THE SYSTEM SHALL use next-intl with catalogs `messages/sq.json` and `messages/en.json`; default locale from `DEFAULT_LOCALE` (default `sq`); the user's choice is stored on `User.locale` and in a cookie. |
| AC-5 | IF a message key is missing in a catalog, THEN `pnpm i18n:check` SHALL list it and CI SHALL fail when a key is missing in the default-locale catalog. |
| AC-6 | THE SYSTEM SHALL format dates, times and numbers with the active locale and the `Europe/Tirane` time zone through shared helpers. |
| AC-7 | THE SYSTEM SHALL provide an academic-year context (`getSelectedAcademicYear()` server-side, `useAcademicYear()` client-side) stored in a cookie; until ORG-01 exists the selector is hidden and the context returns `null`. |
| AC-8 | THE SYSTEM SHALL provide shared components: `PageHeader` (title, breadcrumbs, actions), `FormField` wrappers for React Hook Form + Zod, `ConfirmDialog`, toasts, `EmptyState`, `ErrorState`, loading skeletons, `StatusBadge`. |
| AC-9 | THE SYSTEM SHALL render styled 403, 404 and 500 pages inside the shell (or public layout when logged out). |
| AC-10 | THE SYSTEM SHALL show a dashboard at `/` with a welcome message and an empty "widgets" area that modules can register cards into (permission-filtered). |
| AC-11 | THE SYSTEM SHALL meet WCAG 2.1 AA basics in the shell: keyboard navigation with visible focus, skip-to-content link, labeled controls, contrast ≥ 4.5:1. |

### Out of scope

Data tables (PLT-10), notifications content (PLT-11), LOGOS brand colors/logo (use neutral theme
with a `--brand` token until assets are provided), dark mode (optional; tokens prepared).

## 3. Design

- **shadcn/ui** initialized with CSS variables; components copied into `src/components/ui/`.
  Icons: `lucide-react`. Toasts: `sonner`.
- **Layout:** `src/app/(app)/layout.tsx` calls `requireUser()`, loads permissions (PLT-05), nav
  entries, locale, selected academic year; renders `AppShell` (`src/components/shell/*`).
- **Nav registry:** `src/lib/nav/registry.ts` with `registerNav(entries)`; each module calls it from
  its `index.ts` (imported by `src/lib/nav/all.ts`). Groups: Students, Teaching, Exams, Finance,
  HR, Administration, Reports, System.
- **i18n:** next-intl **without locale in the URL** (internal app): locale resolved from user
  preference → cookie → `DEFAULT_LOCALE`. Namespaces by module (`shell.*`, `common.*`, `iam.*`, …).
  `common.*` holds shared words (Save, Cancel, statuses). `scripts/i18n-check.mjs` compares keys
  across catalogs.
- **Formatting helpers:** `src/lib/i18n/format.ts` (`formatDate`, `formatDateTime`, `formatMoney`
  (ALL), `formatNumber`, `formatGrade`).
- **Academic-year context:** `src/lib/academic-year/context.ts` — cookie `ay`; validated against
  DB once ORG-01 lands (registered provider, same registry pattern).
- **Dashboard widgets:** `registerWidget({ id, permission, component, order })`.

## 4. Tasks

- [ ] **T1** — shadcn/ui init, theme tokens, base components (AC-8) and error pages (AC-9).
- [ ] **T2** — next-intl setup, catalogs with `shell`/`common` keys in `sq` and `en`, locale
      switcher persisting to `User.locale` + cookie, `i18n:check` script in CI. (AC-4, AC-5)
- [ ] **T3** — Formatting helpers + unit tests (sq/en, Europe/Tirane). (AC-6)
- [ ] **T4** — Nav registry + permission filtering + AppShell (sidebar, top bar, user menu with
      sign-out from PLT-04), responsive drawer. (AC-1, AC-2, AC-3)
- [ ] **T5** — Academic-year context (null provider until ORG-01). (AC-7)
- [ ] **T6** — Dashboard with widget registry. (AC-10)
- [ ] **T7** — Accessibility pass (axe check in Playwright for shell pages). (AC-11)

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-2 | unit | registry filters entries by permission set |
| AC-3 | e2e | at 360×740 viewport the drawer opens and navigates |
| AC-4 | e2e | switch to `en` → labels change → reload keeps `en` |
| AC-5 | script | `i18n:check` fails when a key is missing in `sq` |
| AC-6 | unit | formatting in both locales |
| AC-11 | e2e | `@axe-core/playwright` reports no serious violations on `/` |

## 6. Definition of done

- [ ] All tasks ticked, ACs covered
- [ ] Screenshot of shell (desktop + mobile) attached to the PR
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
