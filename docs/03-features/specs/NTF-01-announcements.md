# NTF-01 — Announcements

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-11 (also uses PLT-08 files, PLT-10 tables, PLT-12 jobs) |
| **Questions** | Q-30 (non-blocking): plain-text body, five audiences, publish rights by scope, no approval step, no public website feed |
| **Source** | SRC-033, SRC-035, SRC-036c |
| **Brief** | [../modules/ntf.md](../modules/ntf.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-033/035/036c: the institution posts notices (open lectures, workshops, registration
deadlines, other activities) that students and staff read in the portal. PLT-11 delivers
notifications and e-mail; PLT-08 stores attachments; PLT-12 runs timed jobs; CAL-01 introduced
audience resolution (cycle/program) which this feature reuses through `src/lib/audience`.

## 2. Requirements

### User stories

- As an **office** (secretariat, student affairs, finance, administration…), I want to write a
  notice, choose who sees it and when, so that the right people are informed.
- As a **student or staff member**, I want one place that lists current notices for me, newest
  and pinned first.
- As an **author**, I want to e-mail a notice to its audience too, so that nobody misses it.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store announcements with `title` (≤ 200), plain-text `body` (≤ 10 000), `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `audience` (`ALL`, `STAFF`, `STUDENTS`, `CYCLE`, `PROGRAM`) with its `cycle` / `programId`, `publishAt`, optional `expiresAt`, `pinned` and `emailPush`. |
| AC-2 | IF the title or body is empty or too long, the audience lacks its cycle/program, or `expiresAt` is not after `publishAt`, THEN THE SYSTEM SHALL refuse with field errors. |
| AC-3 | WHEN an author publishes a draft (or republishes an archived one) with a publish time (default now), THE SYSTEM SHALL set `PUBLISHED`; THE SYSTEM SHALL show it to readers only from `publishAt` until `expiresAt`. |
| AC-4 | THE SYSTEM SHALL let an author archive a published announcement (hidden from readers, kept) and SHALL never delete announcements. |
| AC-5 | THE SYSTEM SHALL show readers a feed of the announcements visible to them, pinned first then newest first, with paging, and a detail page; `STAFF` notices are invisible to students (staff see student notices too, as they author and teach them); `CYCLE`/`PROGRAM` audiences follow the audience resolvers (staff see all, a student-only user sees those the resolvers give them). |
| AC-6 | IF a user may not see an announcement, THEN THE SYSTEM SHALL answer as if it did not exist (404). |
| AC-7 | WHEN `emailPush` is set, THE SYSTEM SHALL, once `publishAt` has passed, notify every recipient (in-app + e-mail per their preferences) exactly once; recipients are all active users (`ALL`), users with a role other than student (`STAFF`) or with the student role (`STUDENTS`). `emailPush` is refused for `CYCLE` and `PROGRAM` (no reverse resolution yet). |
| AC-8 | THE SYSTEM SHALL run the push as a background job that survives restarts and cannot double-send (per-user dedupe key `announcement:<id>`), and SHALL record `pushedAt`. |
| AC-9 | THE SYSTEM SHALL let an author attach up to 5 files (PDF, JPEG, PNG, DOCX, XLSX, ≤ 10 MB) which readers who can see the announcement can download and which authors can remove. |
| AC-10 | THE SYSTEM SHALL let only holders of `ntf.announcement.write` create or change announcements: to `PROGRAM` only for programs inside their scope, to the other audiences only with an institution-wide grant. |
| AC-11 | THE SYSTEM SHALL give authors a management list (PLT-10 table: title, status, audience, publish, expiry, pinned) limited to what their scope allows, and writes SHALL be audited with before/after. |
| AC-12 | THE SYSTEM SHALL restrict reading to `ntf.announcement.read` (all roles) and writing to `ntf.announcement.write` (sysadmin, secretary, student affairs, finance, HR, quality, administration, head of department, program coordinator). |

### Out of scope

Rich text/HTML and images in the body, faculty/year/group audiences (need STU/groups), approval
workflow, the public website feed (needs a rate-limited public endpoint, Q-30), event registration
(NTF-02), per-reader read receipts.

### Assumptions

- Plain text keeps XSS out of the picture; line breaks and links stay as typed (links are not auto-linked).
- Scheduling is by `publishAt`; a cron job (every minute) pushes due announcements.
- Editing a published announcement does not re-notify.

## 3. Design

### Data model

```prisma
// prisma/schema/announcements.prisma
enum AnnouncementStatus { DRAFT PUBLISHED ARCHIVED }
enum AnnouncementAudience { ALL STAFF STUDENTS CYCLE PROGRAM }

model Announcement {
  id          String @id @default(cuid(2))
  title       String
  body        String
  status      AnnouncementStatus @default(DRAFT)
  audience    AnnouncementAudience @default(ALL)
  cycle       StudyCycle?
  programId   String? @map("program_id")
  publishAt   DateTime? @map("publish_at") @db.Timestamptz(3)
  expiresAt   DateTime? @map("expires_at") @db.Timestamptz(3)
  pinned      Boolean @default(false)
  emailPush   Boolean @default(false) @map("email_push")
  pushedAt    DateTime? @map("pushed_at") @db.Timestamptz(3)
  createdAt/updatedAt/createdById/updatedById
  @@index([status, publishAt])
  @@map("announcements")
}
```

Migration checks: audience/cycle/program agree (as CAL-01); `expires_at > publish_at`; `email_push`
false for CYCLE/PROGRAM. Attachments are `StoredFile` rows with `entityType = "Announcement"`.

### Permissions

`ntf.announcement.read` (every role); `ntf.announcement.write` (roles in AC-12; its scope comes from the role assignment).

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/schemas.ts`, `domain/visibility.ts` | Zod; pure `isLive(a, now)` and audience-match helpers |
| service | `announcement.service.ts` | create, update, publish, archive, attach/remove file (+ audit) |
| queries | `announcement.queries.ts` | feed for a viewer, detail with visibility, manage list |
| jobs | `push.ts` | `ntf.announcement.push` cron: fan out due announcements |
| purpose | `announcement-attachment` file purpose | read = can see the announcement or write permission |
| table | `announcement.table.tsx` | PLT-10 table `ntf.announcements` |
| notification type | `ntf.announcement` | texts `notifications.ntf.announcement.*`, `mail.ntf.announcement.*` |

### UI

| Route | Who | What |
|---|---|---|
| `/announcements` | read | feed; "Manage" and "New" for writers |
| `/announcements/[id]` | read (if visible) | detail with attachments; writers see status, actions |
| `/announcements/manage` | write | PLT-10 table |
| `/announcements/new`, `/announcements/[id]/edit` | write | form with attachments |

### Edge cases & errors

- Publishing in the past is allowed (visible immediately); a past `publishAt` with `emailPush` is pushed by the next job run.
- Archiving after the push does not recall notifications.
- Audience changes after publish apply to the feed immediately; the push (if already done) is not repeated.
- A removed attachment disappears from the page; the file row is soft-deleted (PLT-08).
- Recipient count is large: the push works in batches of 200 users, each batch in its own transaction; `pushedAt` is set after the last batch; a crash resumes safely thanks to dedupe keys.

## 4. Tasks

- [x] **T1** — `announcements.prisma` + migration with checks; permissions; nav; notification type + catalog texts. (AC-1, AC-12)
- [x] **T2** — Pure schemas and visibility helpers with unit tests. (AC-1, AC-2, AC-3, AC-5)
- [x] **T3** — Service (create, update, publish, archive), queries with audience filter, scope check; integration tests. (AC-3..AC-6, AC-10, AC-11)
- [x] **T4** — Push job (fan-out in batches, idempotent); integration tests. (AC-7, AC-8)
- [x] **T5** — Attachment purpose and attach/remove; download access; tests. (AC-9)
- [ ] **T6** — Feed, detail, form, manage table, i18n, e2e, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-2 | unit + integration | schema table; DB checks |
| AC-3, AC-4 | integration | publish/republish/archive transitions, live window, audit rows |
| AC-5, AC-6 | integration + e2e | feed ordering and paging; staff/student/audience visibility; 404 for invisible |
| AC-7, AC-8 | integration | recipients per audience; exactly once across repeated runs; scheduled in the future waits; refusal for CYCLE/PROGRAM |
| AC-9 | integration | attach, limit of 5, readers allowed/denied, remove |
| AC-10 | integration | program inside/outside scope; institution-wide needed for other audiences |
| AC-11, AC-12 | e2e | secretary publishes, lecturer reads, student forbidden to write; manage table |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
