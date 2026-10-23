# PLT-10 — Data tables, filters & export

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-06 |
| **Questions** | none blocking. Working assumptions below: export size cap, page sizes, "printable PDF" delivered as a print-optimised view until PLT-09 (server PDF) exists |
| **Source** | SRC-021 (lists/statistics filtered by cycle, program, year, residence, age, gender…), SRC-082 (reports combining attributes) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

The source asks for dozens of filtered lists (students by cycle/program/year, staff by type,
payments by status…) that can be exported. Building each list separately would produce dozens of
slightly different pagination, filter and export behaviours. PLT-10 provides **one table
definition → list page → export** pipeline: a module declares columns, filters and a query; the
framework gives URL-synced server-side pagination, sorting and filtering, a column chooser, saved
filters per user, and Excel / CSV / print exports that respect permissions and are audited. The
existing user list (IAM-01) and audit list (PLT-07) become the first two tables, which proves the
design and removes their duplicated code.

## 2. Requirements

### User stories

- As a **secretary**, I want to filter a list, sort it, choose the columns I need and export the
  result to Excel, so that I can work with the data outside the system.
- As a **user**, I want to save a filter I use every week and reopen it with one click.
- As a **developer**, I want to declare a table (columns, filters, query) once and get the page,
  the export and the URL handling, so that every list behaves the same.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL let a module register a table definition `{ id, permission, columns, filters, defaultSort, fetch }`, and SHALL render it with the shared `DataTable`. |
| AC-2 | WHEN a list is requested, THE SYSTEM SHALL read page, page size, sort, filters and visible columns from the URL, validate them against the definition (unknown columns, filters, select values, malformed dates and sizes are ignored or clamped), and pass only validated values to `fetch`. |
| AC-3 | THE SYSTEM SHALL paginate and sort on the server (page sizes 10, 25, 50, 100; default 25) and SHALL show the total count, current page, and previous/next links that keep all other parameters. |
| AC-4 | THE SYSTEM SHALL support filter types `text` (contains), `select` (fixed options) and `date` (calendar day in Europe/Tirane) through a GET form that works without JavaScript, with a visible "clear" action. |
| AC-5 | WHEN a user chooses columns, THE SYSTEM SHALL show only those (always-visible columns excepted) and SHALL keep the choice in the URL; WHEN none is given THE SYSTEM SHALL show the columns marked `defaultVisible`. |
| AC-6 | WHEN a user saves the current filters under a name, THE SYSTEM SHALL store them per user and table (max 20, unique name), list them above the table, and let the user apply or delete them; a user SHALL see and change only their own saved filters. |
| AC-7 | WHEN a user requests an export (`xlsx` or `csv`), THE SYSTEM SHALL run the table's `fetch` for **that user** (same permission and scope filters as the list) with the current filters and sort but no pagination, up to 50 000 rows, and stream the file with translated headers. |
| AC-8 | IF the user lacks the table's permission, THEN the page SHALL show the 403 view and the export SHALL answer 403 without running a query. IF the result exceeds 50 000 rows, THEN the export SHALL be refused with a message to narrow the filters. |
| AC-9 | THE SYSTEM SHALL write an audit entry for every export (`plt.export.run`: table id, format, filter summary, row count, no row data). |
| AC-10 | THE SYSTEM SHALL protect exports against spreadsheet formula injection (cell text starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` in CSV and written as a string in XLSX), and write CSV as UTF-8 with BOM, XLSX with real number and date cells. |
| AC-11 | THE SYSTEM SHALL offer a print view of the current page of results (browser print / "save as PDF") that hides navigation and controls; server-side PDF (Gotenberg) is added through PLT-09. |
| AC-12 | THE SYSTEM SHALL show designed empty, error and no-permission states, render usable tables at 360 px (horizontal scroll inside the table box), use `<th scope>` headers, and sort links that expose `aria-sort`. |
| AC-13 | THE SYSTEM SHALL convert the user list (`/admin/users`) and the audit list (`/admin/audit`) to this framework without changing their behaviour. |

### Out of scope

Row selection and bulk actions (NTF-03 adds "message these people" later), inline editing, pivot
tables and the combined report builder (RPT-01), scheduled exports (PLT-12 + RPT-01), server-side PDF
(PLT-09), column resizing/reordering, virtual scrolling (server pagination keeps pages small).

### Assumptions

- Export cap 50 000 rows and page sizes 10/25/50/100 are working values, constants in one file.
- "Printable PDF" (brief) is met by the print view now; the same table feeds PLT-09 later.
- Saved filters are personal; sharing them with a team is a later feature.

## 3. Design

### Data model

```prisma
// prisma/schema/platform.prisma
model SavedFilter {
  id        String   @id @default(cuid(2))
  userId    String   @map("user_id")
  tableId   String   @map("table_id")
  name      String
  /// URL query string of the filters (no page), e.g. "q=ana&status=active&sort=name:asc"
  query     String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, tableId, name])
  @@index([userId, tableId])
  @@map("saved_filters")
}
```

### Permissions

| Permission | Granted to |
|---|---|
| `plt.view.save` | every role (saving a personal filter is not sensitive) |
| (table permission) | per table, e.g. `iam.user.read` |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/lib/tables/params.ts` | pure: `parseTableParams(searchParams, def)`, `toQueryString`, `visibleColumns` |
| domain | `src/lib/tables/export.ts` | pure: `toCsv`, `toXlsx` (minimal OOXML writer on `fflate`), formula-injection guard, cell typing |
| lib | `src/lib/tables/define.ts` | `defineTable`, `registerTable`, `getTable` |
| lib | `src/lib/tables/run.ts` | `runTable(def, searchParams, user)` → rows, total, page info; `runExport` |
| route | `GET /api/tables/[id]/export?format=` | permission check → `fetch` with no pagination → file; audit |
| action | `saveFilterAction`, `deleteFilterAction` | wrapper-based, per-user |
| query | `listSavedFilters(user, tableId)` | |
| UI | `src/components/table/*` | `DataTable` (server), filter form, column chooser, saved filters, export menu, pagination, sort header cell, print button |

`fetch(params, ctx)` receives `{ page, pageSize, sort:{key,dir}, filters, all }` and the user and
returns `{ rows, total }`. It applies the user's scope filter itself (conventions) — the framework
never builds SQL.

### UI

Shared by all tables: filter bar (GET form) · saved filters row · column chooser (details/popover
with checkboxes, GET form) · export menu (links) · print button · result count · table in a
scrollable box · pagination. The shell and controls carry `print:hidden`.

### Edge cases & errors

- Unknown/malformed parameters never throw; they fall back to defaults.
- Page beyond the last page → clamps to the last page.
- `fetch` throws → error state with retry, logged by id.
- Export of 0 rows → a file with headers only.
- Very long text cells are not truncated in exports; on screen they wrap.
- Two saved filters with the same name → refused with a field error.

## 4. Tasks

- [x] **T1** — `SavedFilter` model + migration, `plt.view.save` granted to all roles, `fflate` (+ `exceljs` as dev dependency for verifying XLSX). (AC-6)
- [x] **T2** — Pure `params` module with unit tests. (AC-2, AC-3, AC-4, AC-5)
- [x] **T3** — Pure `export` module (CSV, XLSX, injection guard) with unit tests that re-read the XLSX. (AC-7, AC-10)
- [ ] **T4** — Table registry, `runTable`, export route with permission, row cap and audit; integration tests. (AC-1, AC-7, AC-8, AC-9)
- [ ] **T5** — `DataTable` components: filters, sort headers, pagination, column chooser, export menu, print, states, i18n (`table.*`). (AC-3, AC-4, AC-5, AC-11, AC-12)
- [ ] **T6** — Saved filters: actions, query, UI, integration tests. (AC-6)
- [ ] **T7** — Convert `/admin/users` and `/admin/audit`; e2e for filter/sort/page/columns/save/export/print; docs. (AC-13 and all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2 | unit | table-driven: valid, unknown sort/filter/column, bad dates, bad sizes, huge page numbers |
| AC-3 | integration + e2e | users table: second page, sort by name both ways, links keep parameters |
| AC-4 | e2e | text/select/date filters via the GET form; clear resets |
| AC-5 | unit + e2e | default vs chosen columns; chooser round trip in the URL |
| AC-6 | integration + e2e | save/apply/delete; duplicate name; limit 20; another user's filter is invisible and undeletable |
| AC-7 | integration | export honours filters, sort and the user's scope (fake table with a scope rule); unscoped user gets fewer rows |
| AC-8 | integration | 403 without permission and no `fetch` call; > 50 000 rows refused |
| AC-9 | integration | one audit row per export without row data |
| AC-10 | unit | `=cmd`, `+1`, `-1`, `@x`, tab, CR escaped in CSV; XLSX contains numbers/dates as typed cells and strings as strings; BOM present |
| AC-11 | e2e | print stylesheet hides shell and controls (emulated print media) |
| AC-12 | e2e + axe | 360 px no page-level horizontal scroll; `aria-sort` on the sorted header; no serious violations |
| AC-13 | e2e | existing users/audit tests keep passing |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied (scope in `fetch`, export audited, injection guard)
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (conventions "Tables", design-system list template, module brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
