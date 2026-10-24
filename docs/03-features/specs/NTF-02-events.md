# NTF-02 — Events & extracurricular registration

| | |
|---|---|
| **Phase** | P7 |
| **Depends on** | NTF-01, PLT-15 (the forms engine is not used for registration, see Q-118) |
| **Questions** | Q-118 (non-blocking): signed-in registration, no external visitors; Q-119 (non-blocking): capacity is a hard limit, no waiting list, deadline defaults to the start; Q-120 (non-blocking): notices sent (confirmation, one reminder the day before, cancellation); Q-121 (non-blocking): who organises, who sees the attendee list |
| **Source** | SRC-035, SRC-037d |
| **Brief** | [../modules/ntf.md](../modules/ntf.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-035 lists open lectures, workshops and seminars among the notices; SRC-037d asks for a form
for extracurricular activities (conferences, workshops…) with a notification whenever something
arrives in the student's account. NTF-01 already publishes notices with audiences; this feature adds
the **event** itself (date, place, capacity, audience), optionally linked to an announcement, the
**registration** of students and staff, the **attendee list** for the organiser and **reminders**.
A certificate of attendance is deferred (it needs the document templates of Q-07).

## 2. Requirements

### User stories

- As an **office** (secretariat, student affairs, head of department…), I want to create an event
  with date, place, capacity and audience, and publish it, so that people can sign up.
- As a **student or staff member**, I want to see the events open to me, register and cancel my
  registration, and be reminded before the event.
- As an **organiser**, I want the list of registered people (exportable) and to cancel the event
  with everybody told.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store events with `title` (≤ 200), plain-text `description` (≤ 10 000), `location` (≤ 200), `startsAt`, optional `endsAt` after `startsAt`, optional `capacity` (≥ 1; blank = unlimited), optional `registrationDeadline` (not after `startsAt`), `status` (`DRAFT`, `PUBLISHED`, `CANCELLED`), `audience` (as NTF-01: `ALL`, `STAFF`, `STUDENTS`, `CYCLE`, `PROGRAM`) with its cycle / program, and an optional link to an announcement. |
| AC-2 | IF a required field is missing or too long, the audience lacks its cycle/program, the end is not after the start, the deadline is after the start, or the linked announcement does not exist, THEN THE SYSTEM SHALL refuse with field errors. |
| AC-3 | WHEN an organiser publishes a draft THE SYSTEM SHALL show the event to readers whose audience matches (same rules as NTF-01 AC-5); an event that has already started is listed under "past" and cannot be registered for. A draft is invisible to readers; a cancelled event stays visible with its status. |
| AC-4 | WHEN a reader registers for a visible, published event before its deadline (default: its start), THE SYSTEM SHALL record the registration once per person and event; IF the event is full, the deadline has passed, the event is not published, or the reader may not see it, THEN THE SYSTEM SHALL refuse (a non-visible event answers as if it did not exist). |
| AC-5 | WHILE concurrent registrations happen, THE SYSTEM SHALL never register more people than the capacity (the count is checked while the event row is locked). |
| AC-6 | WHEN a registered person cancels before the event starts, THE SYSTEM SHALL mark the registration `CANCELLED` (kept, never deleted) and free the place; a person who cancelled may register again if places remain. |
| AC-7 | WHEN a person registers, THE SYSTEM SHALL notify them in-app (optionally e-mail per their preferences) with the event title. |
| AC-8 | THE SYSTEM SHALL run an hourly job that, for each published event starting within the next 24 hours and not yet reminded, notifies every registered person once (dedupe key `event-reminder:<id>`) and records `remindedAt`. |
| AC-9 | WHEN an organiser cancels an event, THE SYSTEM SHALL set it `CANCELLED`, notify every registered person once (dedupe key `event-cancelled:<id>`), and keep the registrations. |
| AC-10 | THE SYSTEM SHALL let only holders of `ntf.event.write` create or change events: `PROGRAM` events only for programs inside their scope, other audiences only with an institution-wide grant; every write SHALL be audited with before/after, including registrations (`ntf.event.register`, `ntf.event.unregister`). |
| AC-11 | THE SYSTEM SHALL give organisers (within the scope of AC-10) a management list (PLT-10 table: title, start, place, status, audience, registered / capacity) and an attendee list (PLT-10 table: name, e-mail, registered at; filterable by event; exportable); readers SHALL NOT see who else registered. |
| AC-12 | THE SYSTEM SHALL restrict reading to `ntf.event.read` and registering to `ntf.event.register` (every role), and writing and attendee lists to `ntf.event.write` (the NTF-01 writer roles). |

### Out of scope

Registration of people without an account (external visitors, public form), waiting list, paid
events, check-in / attendance marking, certificate of attendance (needs Q-07), rich text, recurring
events, reminders on other schedules, a calendar feed (CAL-01 owns the academic calendar), custom
registration questions (a form per event).

### Assumptions

- Q-118..Q-121. All are changeable by a small change: the registration is a plain "register" action;
  if the client wants questions per event, PLT-15 can be put in front later without changing the
  stored registration.
- Times are entered in Europe/Tirane and stored in UTC.

## 3. Design

### Data model

```prisma
// prisma/schema/events.prisma
enum EventStatus { DRAFT PUBLISHED CANCELLED }
enum RegistrationStatus { REGISTERED CANCELLED }

model Event {
  id, title, description, location,
  startsAt, endsAt?, capacity Int?, registrationDeadline?,
  status EventStatus @default(DRAFT),
  audience AnnouncementAudience @default(ALL), cycle StudyCycle?, programId?,
  announcementId?,            // optional link to the announcement
  remindedAt?,                // reminder fan-out finished
  createdAt/updatedAt/createdById/updatedById
  @@index([status, startsAt])
}

model EventRegistration {
  id, eventId, userId, status RegistrationStatus @default(REGISTERED),
  registeredAt, cancelledAt?
  @@unique([eventId, userId])
}
```

Migration checks: audience/cycle/program agree; `ends_at > starts_at`; `capacity >= 1`;
`registration_deadline <= starts_at`.

### Permissions

`ntf.event.read` and `ntf.event.register` (every role); `ntf.event.write` (the NTF-01 writer roles, scope from the role assignment).

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/event-schemas.ts`, `domain/event-rules.ts` | Zod; pure `registrationState(event, registeredCount, now)` (open / full / closed / started / cancelled / draft) |
| service | `event.service.ts` | create, update, publish, cancel (+ audit, notify); register / unregister (row lock, audit, notify) |
| queries | `event.queries.ts` | list for a viewer (upcoming / past), detail with visibility and my registration, manage scope |
| job | `event-reminder.ts` | `ntf.event.remind` hourly |
| tables | `event.table.tsx` | `ntf.events` (manage) and `ntf.event-attendees` |
| notification types | `ntf.event-registered`, `ntf.event-reminder`, `ntf.event-cancelled` | texts in `notifications.ntf.*`, `mail.ntf.*` |

`mayTarget` of NTF-01 takes the write permission as a parameter so both features share the audience rules.

### UI

| Route | Who | What |
|---|---|---|
| `/events` | read | upcoming events for me (register state, places left), past ones below; "Manage" and "New" for writers |
| `/events/[id]` | read (if visible) | detail, register / cancel button, link to the announcement; organisers see status, actions, attendee count and link |
| `/events/manage` | write | PLT-10 table |
| `/events/attendees` | write | PLT-10 table of registrations (`?event=<id>`) |
| `/events/new`, `/events/[id]/edit` | write | form |

### Edge cases & errors

- Two people take the last place at once: the second gets "full" (AC-5).
- The capacity is lowered below the number registered: allowed, nobody is removed, new registrations are refused.
- Editing the start of a published event does not re-notify; the reminder uses the stored start (an event moved into the next 24 hours is reminded at the next run).
- Cancelling an already-cancelled or draft event is refused; a cancelled event cannot be republished.
- A registrant who can no longer see the event (audience changed) can still cancel their registration.
- Many simultaneous registrations: the transaction takes the row lock only after its audience check and then uses
  only its own connection, so waiting for the lock cannot starve the connection pool.

**Implementation notes:**
- `src/modules/ntf` (`domain/event-*.ts`, `server/event*.ts`, `ui/event-*.tsx`); routes under `src/app/(app)/events`.
- Organisers enter Europe/Tirane wall-clock times (`datetime-local`); `zonedDateTimeToInstant` /
  `instantToZonedDateTime` in `src/lib/i18n/zone.ts` convert them.
- `mayTarget` / `writableProgramIds` / `listProgramOptions` of NTF-01 take the write permission as a parameter.
- Reminder job `ntf.event.remind` runs at minute 5 of every hour; its dedupe key makes a rerun harmless.
- Dev seed: `prisma/seed/ntf-events.ts` (one open workshop, one draft).

## 4. Tasks

- [x] **T1** — `events.prisma` + migration with checks; permissions; nav; notification types + catalog texts. (AC-1, AC-12)
- [x] **T2** — Pure schemas and rules with unit tests. (AC-1..AC-4)
- [x] **T3** — Event service (create, update, publish, cancel) and queries with audience filter and scope; integration tests. (AC-2, AC-3, AC-9, AC-10)
- [x] **T4** — Register / unregister with row lock; concurrency and notification tests. (AC-4..AC-7)
- [x] **T5** — Reminder job; integration tests. (AC-8)
- [x] **T6** — Pages, form, tables, i18n, dev seed, e2e, docs. (AC-11 and all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-2 | unit + integration | schema table; DB checks |
| AC-3 | integration + unit | visibility per audience, draft hidden, started events not open |
| AC-4..AC-6 | integration | register, full, deadline, not visible, duplicate, cancel and re-register; 10 parallel registrations for 3 places give exactly 3 |
| AC-7, AC-9 | integration | notifications once per person; cancellation notifies registered only |
| AC-8 | integration | reminder window, exactly once across runs, cancelled/draft skipped |
| AC-10 | integration | program inside/outside scope; audit rows |
| AC-11, AC-12 | e2e | secretary creates and publishes; student registers and cancels; student cannot open the attendee list or the new form |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
