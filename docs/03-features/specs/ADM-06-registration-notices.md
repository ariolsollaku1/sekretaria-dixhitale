# ADM-06 — Registration campaign notices

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | NTF-01 (reads FIN-01 fee data, no hard dependency) |
| **Questions** | Q-24 (open, non-blocking, fees come live from FIN-01), Q-98 (notice shape, audience, public surfaces), Q-99 (required documents list and contract excerpt) — working assumptions, none blocks |
| **Source** | SRC-033 |
| **Brief** | [../modules/adm.md](../modules/adm.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-033: the college publishes notices about registration deadlines and preferential fees on
certain days, with the documents needed, the tuition fees and parts of the student contract. NTF-01
already provides announcements (publish window, pinning, attachments, e-mail push, audit). This
feature adds a **registration notice**: an announcement that carries structured campaign data. The
fees and preferential-fee days are **not retyped**: they are read live from FIN-01
(`FeeScheduleItem`, `FeeDiscount`) for the notice's academic year, so the notice cannot disagree
with the fee schedule. The application page (ADM-02) and the interest-form leads (ADM-01) do not
exist yet; this feature exposes a query they will call (see Out of scope).

## 2. Requirements

### User stories

- As **student affairs / the secretariat**, I want to publish a registration notice with its
  deadline, the required documents, the fees and preferential days, and an excerpt of the contract,
  so that applicants and students are informed in one place.
- As a **reader**, I want the notice in the announcements feed, showing the deadline, the documents
  checklist, the current fees with the days a preferential fee applies, and the contract excerpt.
- As a **future application page**, I want the list of live registration notices without signing in.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store a registration notice as an announcement (NTF-01) plus structured data: `academicYearId`, optional `programId`, `registrationDeadline` (a day), a checklist of required documents (0..20 items, each ≤ 200 characters), an optional `contractExcerpt` (plain text ≤ 5 000) and `showFees`. |
| AC-2 | IF the title, body, academic year or deadline is missing or invalid, a document item is empty or too long, or the program or year does not exist, THEN THE SYSTEM SHALL refuse with field errors. |
| AC-3 | WHEN the author saves, THE SYSTEM SHALL create/update the announcement and the notice in one transaction as a draft; publishing, archiving, pinning, publish window and e-mail push SHALL be the NTF-01 behaviour (audience `ALL`). |
| AC-4 | WHILE the notice is visible to a reader (NTF-01 rules, 404 otherwise), THE SYSTEM SHALL show on its detail page the deadline, the document checklist, the contract excerpt and, when `showFees`, the active fees of the notice's year for its program (all active programs with fees when no program is chosen), each with its amount and its preferential windows (label, percent or amount, from-to days) read from FIN-01. |
| AC-5 | THE SYSTEM SHALL mark a preferential window as "running now" when today (Europe/Tirane) lies in it, and SHALL show the days remaining to the deadline, or "deadline passed". |
| AC-6 | THE SYSTEM SHALL let only holders of `adm.notice.write` (sysadmin, secretary, student affairs, administration) create or change registration notices; the NTF-01 institution-wide scope check for audience `ALL` also applies. A user without it SHALL get 403 on the pages and the actions. |
| AC-7 | THE SYSTEM SHALL list registration notices for writers (title, year, program, deadline, status) with links to edit and to the NTF-01 detail page (publish/archive there). |
| AC-8 | THE SYSTEM SHALL provide `liveRegistrationNotices(now)` returning, without a user, the published, currently visible, audience-`ALL` notices with their structured data and fee summary, for the public application page (ADM-02) and lead mailings (ADM-01). |
| AC-9 | THE SYSTEM SHALL audit creating and updating the notice data (before/after) in addition to the announcement audit. |

### Out of scope

The public application page and the mailing to leads (ADM-01/ADM-02 are not built; AC-8 is the
hook). Registration-type-specific notices (transfer, second program), per-notice fee overrides,
SMS, rich text, attachments on the notice form (the NTF-01 edit page still takes them).

### Assumptions

- Q-98: a registration notice is an ordinary announcement for everyone (`ALL`); the program only
  narrows which fees are shown. Program-scoped authors are not writers of this feature.
- Q-99: the document checklist and the contract excerpt are typed by the author per campaign (no
  central list or contract template exists, Q-10 is open); the fee amounts are never typed.

## 3. Design

### Data model

```prisma
// prisma/schema/admissions.prisma
model RegistrationNotice {
  id                   String   @id @default(cuid(2))
  announcementId       String   @unique @map("announcement_id")
  academicYearId       String   @map("academic_year_id")
  programId            String?  @map("program_id")
  registrationDeadline DateTime @map("registration_deadline") @db.Date
  documents            String[]
  contractExcerpt      String   @default("") @map("contract_excerpt")
  showFees             Boolean  @default(true) @map("show_fees")
  createdAt/updatedAt/createdById/updatedById
  @@map("registration_notices")
}
```

Check: `cardinality(documents) <= 20`. The announcement is never deleted, so neither is the notice.

### Permissions

`adm.notice.write` (sysadmin, secretary, student_affairs, administration). Reading is
`ntf.announcement.read` through the announcement.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/schemas.ts`, `domain/deadline.ts` | Zod; pure `daysUntil`, `windowState` |
| service | `notice.service.ts` | create/update (calls NTF-01 service, same transaction) + audit |
| queries | `notice.queries.ts` | by announcement, manage list, `liveRegistrationNotices`, fee summary via FIN-01 `feeSummary` |
| fin export | `feeSummary(yearId, programId?)` | active fees with amount and discounts, no user scope (public data of a published notice) |

### UI

| Route | Who | What |
|---|---|---|
| `/adm/notices` | adm.notice.write | list |
| `/adm/notices/new`, `/adm/notices/[id]/edit` | adm.notice.write | form |
| `/announcements/[id]` | reader | extra "Registration" section when the announcement is a notice; the Edit button goes to the notice form |

**Implementation notes:**
- `src/modules/adm`; routes `/adm/notices`, `/adm/notices/new`, `/adm/notices/[id]/edit`; the NTF-01
  detail page `/announcements/[id]` renders `RegistrationSection` for a notice.
- NTF-01 now exports `createAnnouncement`, `updateAnnouncement`, `publishAnnouncement` and
  `announcementSchema`; FIN-01 exports `feeSummary(yearId, programId?)`.
- The form lists years through the academic-year provider and programs the author may address.
- Dev seed: one published "Demo:" notice (no fees; the notice reads the fee schedule).

### Edge cases & errors

- A year/program without fee items: the fee block says "No fees published yet".
- Discount windows already past are shown as ended; a deadline in the past is allowed (history).
- Editing through the NTF-01 form only changes the announcement text, never the notice data.

## 4. Tasks

- [x] **T1** — `admissions.prisma` + migration; permission; nav; i18n skeleton. (AC-1, AC-6)
- [x] **T2** — Pure schemas and deadline/window helpers with unit tests. (AC-2, AC-5)
- [x] **T3** — FIN-01 `feeSummary`; notice service and queries incl. `liveRegistrationNotices`; integration tests. (AC-1..AC-4, AC-6, AC-8, AC-9)
- [x] **T4** — Pages (list, form), detail section, i18n sq/en, seed, e2e. (AC-4..AC-7)
- [x] **T5** — Docs: domain model, brief, questions, FEATURES.md.

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2, AC-5 | unit | schema table; window state and days left |
| AC-1, AC-3, AC-9 | integration | create + update in one transaction, announcement is a draft, audit rows, rollback on bad program |
| AC-4, AC-8 | integration | fee summary with discount windows; live list shows published ALL notices only |
| AC-6 | integration + e2e | lecturer/student denied; secretary allowed |
| AC-4, AC-7 | e2e | secretary creates, publishes, a student reads deadline, documents and fee windows; lecturer gets forbidden on `/adm/notices` |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
