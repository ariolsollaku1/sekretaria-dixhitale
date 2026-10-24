# INT-06 — Website links to public forms

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-15 |
| **Questions** | Q-06 (answered: link only, no embedding); Q-95 (non-blocking): the index lives at `/f`, public notices are not built |
| **Source** | SRC-030, SRC-037, SRC-114, SRC-133 |
| **Brief** | [../modules/int.md](../modules/int.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Forms must be reachable from the LOGOS website (SRC-037, SRC-133) and the data of whoever fills
them in goes into the system (SRC-030). Q-06 answered: the website is a custom static site, so
there is no embedding; public forms stay on our domain at `/f/<key>` (PLT-15) and the website only
adds links. What is missing is a stable, discoverable list of those links: a public index page for
visitors and a hand-over page for whoever maintains the website.

## 2. Requirements

### User stories

- As a **visitor**, I want one page listing the forms I can fill in without an account, so that I
  can find the right one (interest, scholarship, Erasmus…).
- As a **website maintainer** (via the sysadmin), I want the full, copyable addresses of the index
  and of every public form, so that I can add the links to the website.
- As a **sysadmin**, I want a form to appear on the index as soon as I publish it and disappear when
  I take it out of service, with no other step.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL serve, without login, an index page at `/f` listing every form whose served (published) version has audience `PUBLIC`, each with its title and description in the visitor's language and a link to `/f/<key>`. |
| AC-2 | THE SYSTEM SHALL NOT list on the index forms that are draft-only, archived, authenticated-only, or whose stored definition no longer validates; WHEN there are none THE SYSTEM SHALL show an explanatory empty state. |
| AC-3 | THE SYSTEM SHALL keep the address of a public form stable: `/f/<key>` does not change across versions, and an unpublished key answers 404 as before. |
| AC-4 | THE SYSTEM SHALL let the proxy pass `/f` (and `/f/…`) through without a login redirect, and no other path. |
| AC-5 | THE SYSTEM SHALL show users with `plt.form.manage` a page `/admin/forms/links` with the absolute address (from `APP_URL`) of the index and of each public form, with its title and version, ready to be handed to the website maintainer; other users get the forbidden view. |
| AC-6 | THE SYSTEM SHALL build the addresses with a pure function that tolerates a trailing slash in the base URL and encodes the key. |
| AC-7 | THE SYSTEM SHALL ship a hand-over note ([docs/02-architecture/website-links.md](../../02-architecture/website-links.md)) describing the addresses, what the website must do (add links only), and that the data submitted lands in the Secretariat inbox. |

### Out of scope

Embedding or iframe, styling forms like the website, a public announcements page (Q-95), a
redirect from `/forms` (the signed-in area), changes to the website itself, per-form short URLs.

### Assumptions

- Index address `/f` (Q-95); `/forms` stays the signed-in area.
- Query only reads the already audited, already validated served definitions: no mutation, no audit event.

## 3. Design

### Data model

None. Reads `FormDefinition` (status `PUBLISHED`, audience `PUBLIC`).

### Permissions

No new permission. `/f` is public; `/admin/forms/links` requires the existing `plt.form.manage`.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/lib/forms/links.ts` | `formUrl(base, key)`, `indexUrl(base)` (pure) |
| query | `listPublicForms()` in `src/lib/forms/queries.ts` | published, public, valid forms ordered by title |

### UI

| Route | Who | What |
|---|---|---|
| `/f` | anyone | public index, outside the app shell |
| `/admin/forms/links` | manage | table of absolute addresses; linked from `/admin/forms` |

### Edge cases & errors

- No public form published: empty state on the index, empty table with a hint for the sysadmin.
- A form without an English title: the Albanian one is used (`localize` fallback).
- `APP_URL` with a trailing slash: no double slash.

## 4. Tasks

- [x] **T1** — Pure link builders with unit tests; `listPublicForms` query with integration test. (AC-1..AC-3, AC-6)
- [x] **T2** — Public index page, proxy matcher, i18n. (AC-1, AC-2, AC-4)
- [x] **T3** — Admin links page, link from the forms admin page, i18n. (AC-5)
- [x] **T4** — Hand-over note, e2e, docs (domain model unchanged, FEATURES.md). (AC-7, all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-6 | unit | trailing slash, encoding, index address |
| AC-1..AC-3 | integration | published public listed; draft, archived, authenticated and invalid not listed; new version replaces |
| AC-1, AC-2, AC-4, AC-5 | e2e | anonymous opens `/f` and sees a published public form and not an authenticated one, follows the link; student gets the forbidden view on `/admin/forms/links`; sysadmin sees addresses |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (hand-over note, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
