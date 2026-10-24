# NTF-03 — Targeted messaging to lists

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-10 (tables), PLT-11 (notifications, mail), PLT-12 (jobs); first lists: STU-06, HR-05 |
| **Questions** | Q-20 (answered: e-mail + in-app, no SMS); Q-50…Q-54 (non-blocking, working assumptions below) |
| **Source** | SRC-057 |
| **Brief** | [../modules/ntf.md](../modules/ntf.md) |

## 1. Context

SRC-057: the Secretariat needs lists (e.g. backlog students) "so they can be contacted / messaged and
notified about sessions and academic and financial obligations". The lists already exist as PLT-10
tables (`stu.lists`, `hr.lecturers`); this feature adds a "Message these people" action on them,
a compose page, a background send through the PLT-11 notification path and a delivery log.
No reply handling in v1.

## 2. Requirements

### User stories

- As a **secretariat/finance/HR officer**, I want to send one message to everybody in the list I
  filtered, so that nobody needs to be written to by hand.
- As the **sender**, I want to see who was reached and whether the e-mail went out.
- As a **recipient**, I get an in-app notice and an e-mail (per my preference).

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | WHERE a table declares a `recipient` accessor (`stu.lists`, `hr.lecturers`), THE SYSTEM SHALL show holders of `ntf.message.send` a "Message these people" action that carries the table id and its current filters to the compose page. |
| AC-2 | WHEN the compose page opens, THE SYSTEM SHALL resolve the recipients with the table's own permission, scope and filters (never wider than the list the user sees), and show their count; IF the table is unknown, has no recipient accessor, the user lacks its read permission, or the list is empty or exceeds 2 000 people, THEN THE SYSTEM SHALL refuse (404 / 403 / field error). |
| AC-3 | THE SYSTEM SHALL let the sender write a subject (≤ 200) and a plain-text body (≤ 5 000) using only the placeholders `{firstName}`, `{lastName}`, `{fullName}`; IF another `{…}` placeholder appears, THEN THE SYSTEM SHALL refuse with a field error. |
| AC-4 | THE SYSTEM SHALL let senders save a message as a template (name, subject, body), pick a saved template on the compose page, and archive a template (never delete). |
| AC-5 | WHEN the sender confirms, THE SYSTEM SHALL in one transaction re-resolve the recipients, store the message (subject, body, source table, filters), one delivery row per person, and an audit entry; the sending itself is done by a background job. |
| AC-6 | THE SYSTEM SHALL, for each recipient with a portal account, create an in-app notification and (per the recipient's preference and account state) an e-mail, with the placeholders filled for that person, exactly once (dedupe key `message:<id>`); persons without an account are logged as `NO_ACCOUNT` and receive nothing. |
| AC-7 | THE SYSTEM SHALL process messages in batches of 200 recipients, resume safely after a crash without double-sending, and mark the message `SENT` with `completedAt` after the last batch. |
| AC-8 | THE SYSTEM SHALL show senders their sent messages (system administrators: all) with date, source list, recipient count and status, and a detail page with the delivery log per person: state (queued, delivered, no account) and e-mail state (none, queued, sent, failed); nothing in the log or in log lines contains an e-mail address. |
| AC-9 | THE SYSTEM SHALL allow sending only with `ntf.message.send` (sysadmin, secretary, student affairs, finance, HR, administration, head of department, program coordinator) in addition to the source list's own read permission; a user without it SHALL get 403 on all `/messages` pages and the actions. |
| AC-10 | THE SYSTEM SHALL audit send, template create and template archive (`ntf.message.send`, `ntf.template.create`, `ntf.template.archive`) and never hard-delete messages, deliveries or templates. |

### Out of scope

Replies, attachments, SMS, scheduled sending, rich text, approval workflow, messaging a hand-picked set of
people, the "backlog students" list itself (needs GRD), mandatory/unsubscribe rules (Q-50…Q-54).

### Assumptions

See Q-50 (roles, optional notification type), Q-51 (cap 2 000, batches of 200), Q-52 (templates shared,
three placeholders), Q-53 (portal users only), Q-54 (kept indefinitely).

## 3. Design

### Data model (`prisma/schema/messages.prisma`)

```prisma
enum MessageStatus  { PENDING SENT }
enum DeliveryState  { QUEUED DELIVERED NO_ACCOUNT }

model Message {            // table messages
  id, subject, body, sourceTable, filters Json, status, recipientCount, noAccountCount,
  createdById, createdAt, completedAt
}
model MessageRecipient {   // table message_recipients, unique (message_id, person_id)
  id, messageId, personId, userId?, state, notificationId?, emailOutboxId?, createdAt
}
model MessageTemplate {    // table message_templates
  id, name, subject, body, archivedAt?, createdById, createdAt
}
```

### Platform changes

- `TableDef.recipient?: (row) => string` (person id) — makes a table a message source. `stu.lists` and
  `hr.lecturers` rows carry `personId`.
- `notify()` accepts `raw: { title, body, subject }` (sender-written text instead of catalog texts) and returns
  `outboxId`.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/placeholders.ts`, `domain/schemas.ts` | pure placeholder check/fill; Zod |
| service | `message.service.ts` | `resolveRecipients`, `sendMessage`, templates (+ audit) |
| job | `message.job.ts` | `ntf.message.send` cron every minute, batches of 200 |
| queries | `message.queries.ts` | sent list (table `ntf.messages`), detail with delivery log, templates |
| notification type | `ntf.message` | label/title/body texts (fallback; real text is `raw`) |

### UI

| Route | Who | What |
|---|---|---|
| `/messages` | send | sent messages table; link to templates |
| `/messages/new?table=…&<filters>` | send | compose: recipient count, template picker, subject, body, placeholders hint |
| `/messages/[id]` | sender / sysadmin | message, counts, delivery log |
| `/messages/templates` | send | list, create, archive |

### Edge cases & errors

- Filters change between compose and confirm: recipients are re-resolved at confirm; the stored count is what was sent.
- A user disabled after the send is still logged `DELIVERED` (in-app row exists), e-mail is skipped by `notify`.
- Notification link is `/notifications`; no personal data in logs (ids and counts only).

**Implementation notes:**
- Routes `/messages`, `/messages/new`, `/messages/[id]`, `/messages/templates`; nav entry "Messages".
- `TableDef.recipient` is the only platform hook; `notify()` gained an optional `raw` text and returns `outboxId`.
- Recipients are the rows the list returns for the user (page size cap + 1), so scope and filters are the list's own.
- The job `ntf.message.send` runs every minute (like the announcement push); a message with nobody to reach is `SENT` at once.
- Visibility of a message: its sender, and holders of `plt.audit.read` (system administrators); others get 404.

## 4. Tasks

- [x] **T1** — `messages.prisma` + migration; permission, nav, notification type; `TableDef.recipient`, `notify` raw. (AC-1, AC-9)
- [x] **T2** — Pure placeholder/schemas with unit tests. (AC-3)
- [x] **T3** — Services (resolve, send, templates), job; integration tests. (AC-2, AC-4..AC-7, AC-10)
- [x] **T4** — Queries, pages, "Message these people" on STU/HR lists, i18n, e2e, docs. (AC-1, AC-8, AC-9)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3 | unit | placeholder detection/fill |
| AC-2, AC-5 | integration | scoped resolution, cap, unknown table, no-permission; message + rows + audit |
| AC-6, AC-7 | integration | notifications/outbox per recipient with filled text; no account; second run sends nothing; crash resume |
| AC-4, AC-10 | integration | template create/archive, audit |
| AC-1, AC-8, AC-9 | e2e | secretary filters stu.lists, composes, sends, sees the log; student gets 403 on `/messages` |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
