# CAL-01 — Academic calendar

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-01 (ORG-03 for program audiences) |
| **Questions** | Q-29 (non-blocking): weeks run Monday–Sunday, week 1 contains the year's start date, copying shifts by whole weeks, six fixed event types |
| **Source** | SRC-025, SRC-034, SRC-036c |
| **Brief** | [../modules/cal.md](../modules/cal.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-025 asks for an academic calendar with the deadlines predefined for the year, organized by
weeks; SRC-034 and SRC-036c make it visible to everyone (students, lecturers, staff). ORG-01
provides academic years (the time axis, ADR-0006) and the "start a new year" checklist; ORG-03
provides programs and the study cycle. This feature adds dated, typed events per academic year, a
week-organized agenda, a month view, copying the previous year, and a personal read-only iCal feed.

## 2. Requirements

### User stories

- As a **secretary**, I want to enter the year's periods, holidays and deadlines once, so that
  everyone sees the same dates.
- As a **secretary**, I want to copy last year's calendar into the new year, so that I only adjust
  what changed.
- As a **student, lecturer or staff member**, I want to see the calendar by week and by month, and
  subscribe to it in my own calendar app.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store calendar events per academic year with `title`, `type` (`TEACHING_WEEK`, `HOLIDAY`, `DEADLINE`, `EXAM_PERIOD`, `REGISTRATION_PERIOD`, `EVENT`), `startDate`, `endDate` (inclusive; equal for one day), optional `description`, `audience` and `active`. |
| AC-2 | THE SYSTEM SHALL support the audiences `ALL`, `CYCLE` (first or second cycle) and `PROGRAM` (one program); an audience of `CYCLE` or `PROGRAM` without its cycle or program is refused. |
| AC-3 | IF an event's dates are unordered or fall outside its academic year, or its title is empty or longer than 200 characters, THEN THE SYSTEM SHALL refuse it with field errors. |
| AC-4 | WHILE an academic year is `CLOSED`, THE SYSTEM SHALL refuse to create, change, cancel or copy events into it. |
| AC-5 | WHEN a writer cancels an event, THE SYSTEM SHALL keep it with `active=false` (never delete it), hide it from readers without write access and show it struck through to writers; it SHALL be restorable. |
| AC-6 | THE SYSTEM SHALL number weeks Monday–Sunday with week 1 the week containing the academic year's start date, and show for each event the weeks it spans. |
| AC-7 | THE SYSTEM SHALL provide an agenda view grouped by week (week number, date range, events) and a month view showing each day's events, for the selected academic year; both default to the current period and are keyboard-navigable. |
| AC-8 | THE SYSTEM SHALL provide a PLT-10 list of events (title, type, dates, audience, status) with filters on type, audience and status, sorting and export. |
| AC-9 | WHILE a user has no staff role (student only), THE SYSTEM SHALL show only events whose audience is `ALL` or matches the user through a registered audience resolver (none registered until STU: only `ALL`); staff see every active event. |
| AC-10 | WHEN a writer copies a year's calendar into another year, THE SYSTEM SHALL create the events shifted by the whole number of weeks closest to the difference of the two years' start dates, skip events that would fall outside the target year (reporting how many), keep audiences, and write one audit entry. |
| AC-11 | IF the target year already has events, THEN THE SYSTEM SHALL refuse the copy with `NOT_EMPTY`. |
| AC-12 | THE SYSTEM SHALL let each user create, regenerate and revoke a personal feed link; the iCal feed (`/api/calendar/<token>.ics`) lists the user's visible active events of the current and planned years as all-day events, SHALL work without a session, and SHALL return 404 for unknown or revoked tokens. |
| AC-13 | THE SYSTEM SHALL store only a hash of the feed token and show the full link once, at creation. |
| AC-14 | THE SYSTEM SHALL restrict writes to `cal.event.write` (sysadmin, secretary) and reads to `cal.event.read` (all roles), audit every create/update/cancel/restore/copy, and register a "prepare the calendar" step in the new-year checklist. |

### Out of scope

Class timetables (CAL-02), exam sessions and schedule (CAL-03), times of day and recurrence, room
bookings, per-attendee invitations, CalDAV, calendar notifications/reminders.

### Assumptions

- All-day, date-only events; times belong to the timetable (CAL-02).
- Student audience matching needs enrollment data (STU); the resolver hook is shipped now and
  returns nothing until then.
- A feed token is a secret URL (the common approach for subscribed calendars); revoking and
  regenerating is the remedy for a leak.

## 3. Design

### Data model

```prisma
// prisma/schema/calendar.prisma
enum CalendarEventType { TEACHING_WEEK HOLIDAY DEADLINE EXAM_PERIOD REGISTRATION_PERIOD EVENT }
enum CalendarAudience { ALL CYCLE PROGRAM }

model CalendarEvent {
  id             String            @id @default(cuid(2))
  academicYearId String            @map("academic_year_id")
  title          String
  type           CalendarEventType
  startDate      DateTime          @map("start_date") @db.Date
  endDate        DateTime          @map("end_date") @db.Date
  description    String?
  audience       CalendarAudience  @default(ALL)
  cycle          StudyCycle?
  programId      String?           @map("program_id")
  active         Boolean           @default(true)
  createdAt/updatedAt/createdById/updatedById  // per conventions
  @@index([academicYearId, startDate])
  @@map("calendar_events")
}

model CalendarFeedToken {
  id        String   @id @default(cuid(2))
  userId    String   @unique @map("user_id")
  tokenHash String   @unique @map("token_hash")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@map("calendar_feed_tokens")
}
```

Migration adds `CHECK (start_date <= end_date)` and a check that audience/cycle/program agree.

### Permissions

| Permission | Granted to |
|---|---|
| `cal.event.read` | every role |
| `cal.event.write` | sysadmin, secretary |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/modules/cal/domain/week-rules.ts` | pure: week numbers, week ranges, shift weeks, month grid |
| domain | `src/modules/cal/domain/schemas.ts` | Zod + `validateEvent` |
| service | `event.service.ts` | create/update/cancel/restore/copy (+ audit) |
| service | `feed.service.ts` | token create/revoke, ICS rendering (pure `ics.ts`) |
| query | `event.queries.ts` | visible events with audience filter, agenda, month |
| registry | `audience.ts` | `registerAudienceResolver` for STU later |
| table | `event.table.tsx` | PLT-10 table `cal.events` |
| route | `src/app/api/calendar/[token]/route.ts` | ICS feed |

### UI

| Route | Who | What |
|---|---|---|
| `/calendar` | read | agenda by week (default) / month view / list, feed-link panel |
| `/calendar/events/new`, `/calendar/events/[id]` | write | form, cancel/restore |
| `/calendar/copy` | write | choose source year → copies into the selected year |

### Edge cases & errors

- Event spanning a month boundary appears on every day it covers.
- Year with no events: empty state with a hint (and copy button for writers).
- Copy shift moves an event past the target year's end → skipped and counted.
- Feed requested with a malformed token → 404 without touching the database.
- Dates are pure calendar dates; no time-zone arithmetic.

**Implementation notes:**
- `src/modules/cal` is the fourth module; routes `/calendar` (views `agenda`, `month`, `list`),
  `/calendar/events/new`, `/calendar/events/[id]`, `/calendar/copy`, and `/api/calendar/<token>.ics`.
- Week numbers are computed (Q-29 assumption) in `domain/week-rules.ts`; the list view uses the
  PLT-10 table `cal.events` on the year selected in the header.
- Feed token: 32 random bytes (base64url), SHA-256 stored; the route is outside the login proxy
  (`/api` is exempt) and answers 404 for anything invalid.
- The audience resolver (`registerAudienceResolver`) is the hook STU uses to give students their
  cycle and programs; until then a student-only user sees `ALL` events.
- The "start a new year" checklist (ORG-01) gets the step `cal.calendar` → `/calendar/copy`.

## 4. Tasks

- [x] **T1** — `calendar.prisma` + migration with checks; permissions and grants; shell nav. (AC-1, AC-14)
- [x] **T2** — Pure week/shift/month rules, ICS rendering and event validation with unit tests. (AC-2, AC-3, AC-6, AC-10, AC-12)
- [x] **T3** — Event service (create, update, cancel, restore, copy) and queries with audience resolver; integration tests. (AC-4, AC-5, AC-9..AC-11, AC-14)
- [x] **T4** — Feed tokens and the ICS route; integration tests. (AC-12, AC-13)
- [x] **T5** — Calendar page (agenda, month, list table), event form and detail. (AC-7, AC-8)
- [x] **T6** — Copy page, checklist step, feed panel, i18n, seed, e2e, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1..AC-3 | unit + integration | table-driven validation; audience/cycle/program combinations; DB checks |
| AC-4 | integration | closed year refuses create/update/cancel/copy |
| AC-5 | integration | cancel keeps the row, hidden to readers, restore |
| AC-6 | unit | week numbers across year start, week ranges, multi-week events |
| AC-7, AC-8 | e2e | agenda and month show a created event; table filter |
| AC-9 | integration | student-only user sees `ALL` only; resolver adds cycle/program |
| AC-10, AC-11 | unit + integration | shift by whole weeks; skipped count; `NOT_EMPTY` |
| AC-12, AC-13 | integration + e2e | feed returns ICS for a valid token, 404 after revoke; hash only in DB |
| AC-14 | integration + e2e | permissions; secretary writes, lecturer reads, no write controls; audit rows |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
