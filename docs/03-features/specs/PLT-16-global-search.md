# PLT-16 — Global search (menus & content)

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-06, PLT-10 |
| **Questions** | none |
| **Source** | none (usability feature; no business rule is introduced) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

Staff move between ~15 modules and thousands of records. The top bar gets one search box that
finds menu pages and records. It adds no access rule: every result comes from a query that already
applies the user's permission and scope (conventions: every list query applies the scope).

## 2. Requirements

### User stories

- As **any signed-in user**, I want to type a page name and jump to it, so that I do not hunt the sidebar.
- As **staff**, I want to type a name, reference, code or number and open the record, so that I do not open the list and filter it.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL show a search control in the top bar of every signed-in page, opened by click or Ctrl/⌘+K. |
| AC-2 | WHEN the user types, THE SYSTEM SHALL list matching menu pages (only entries the user may see), ignoring case and accents, using the active language's labels. |
| AC-3 | WHEN the query has at least 2 characters, THE SYSTEM SHALL list matching records grouped by type, at most 5 per group. |
| AC-4 | THE SYSTEM SHALL return a record only if the user holds the source's read permission and the record is inside the scope that the module's list applies. |
| AC-5 | IF a source fails or the user lacks its permission THEN THE SYSTEM SHALL omit that group and still return the others. |
| AC-6 | THE SYSTEM SHALL debounce typing, ignore stale responses, and rate-limit searches per user. |
| AC-7 | THE SYSTEM SHALL be fully keyboard-operable (arrows, Enter, Esc), announce the result count to screen readers, and work at 360 px. |
| AC-8 | THE SYSTEM SHALL NOT write the query text or any result text to logs. |
| AC-9 | THE SYSTEM SHALL have empty, loading, no-results, error and "type at least 2 characters" states, in `sq` and `en`. |

### Out of scope

- Full-text / fuzzy ranking, search inside file contents, recent searches, saved searches.
- Content of modules not listed in the design (added later by registering a source).

### Assumptions

- `ILIKE` through each module's existing `q`/name filter is enough at this scale; a `pg_trgm` index is the upgrade path.

## 3. Design

### Data model

None.

### Permissions

None new. Each source declares the read permission of its list.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/lib/search/menu.ts` | pure: `normalize`, `matchMenu(items, query)` |
| lib | `src/lib/search/registry.ts` | `registerSearchSource`, `runSearch(query, user, deps)` (permission, per-source isolation, limit) |
| lib | `src/lib/search/table-source.ts` | builds a source from a registered table: calls its `fetch` with one filter and `pageSize` 5 |
| lib | `src/lib/search/sources.ts` | v1 sources: students, applications, staff, programs, courses, issued documents, users |
| action | `searchAction` | signed-in user, Zod (2–80 chars), rate limit, `runSearch` |

### UI

`src/components/shell/global-search.tsx`: trigger in the top bar (field-like on `md+`, icon on
mobile) opening a dialog with a combobox/listbox: "Pages" group (client-side) then record groups.

### Edge cases & errors

- Query shorter than 2 characters: only menu results.
- Rate limit hit: inline "too many searches, wait a moment".

## 4. Tasks

- [x] T1 — Pure menu matcher + tests (AC-2)
- [x] T2 — Registry, `runSearch`, table-source + unit tests for permission/isolation/limit (AC-3..5, AC-8)
- [x] T3 — v1 sources (AC-3, AC-4)
- [x] T4 — `searchAction` with rate limit (AC-6)
- [x] T5 — Palette UI, top bar, i18n sq/en (AC-1, AC-7, AC-9)
- [x] T6 — e2e (open, find a page, find a record, forbidden group absent) and docs sync
