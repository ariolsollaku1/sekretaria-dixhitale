# PLT-11 — Notifications (in-app + email)

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-06, PLT-12 |
| **Questions** | Q-20 (answered: Microsoft 365 / Exchange Online via Graph `sendMail` (preferred) or SMTP; in-app too; no SMS in v1). The Graph adapter cannot be exercised without the client's tenant credentials: it is contract-tested against a mocked Graph and must be verified once with real credentials |
| **Source** | SRC-037d ("a notification every time something arrives in the student's account"), SRC-086 (automatic reminders) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Many features need to tell a person that something needs them: a form arrived (SRC-037d), an
installment is due in two weeks (SRC-086), a grade was published. PLT-11 is the one place where
that happens: a `notify()` call writes an in-app notification and, where the type and the user
allow it, queues an e-mail. E-mails are sent by a background job (PLT-12) from an **outbox** that
is written in the same transaction as the business change, so a message is never lost and never
sent for a rolled-back change. Transport is pluggable (Q-20).

## 2. Requirements

### User stories

- As a **user**, I want a bell with my unread notifications, a list of all of them, and the ability
  to mark them read, so that I do not miss anything.
- As a **user**, I want to choose which optional kinds of notification also reach my e-mail, so that
  my inbox is not flooded; required notices must still reach me.
- As a **developer**, I want one `notify()` call and a type registry, so that every feature
  notifies the same way, in the user's language.
- As a **sysadmin**, I want to send myself a test message and see failures, so that I can verify the
  mail setup.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL let modules register notification types `{ type, mandatory?, channels? }` (`<module>.<event>`), whose texts live in the catalogs under `notifications.<type>.title|body` (in-app) and `mail.<type>.subject|body` (e-mail) in `sq` and `en`. |
| AC-2 | WHEN `notify({ userId, type, params, link? })` is called inside a transaction, THE SYSTEM SHALL create the `Notification` row and, if the e-mail channel applies, an `EmailOutbox` row in that same transaction; a rolled-back caller leaves neither. |
| AC-3 | THE SYSTEM SHALL decide the channels per recipient: in-app always; e-mail when the type allows it, the user is active, and — unless the type is `mandatory` — the user has not switched the e-mail channel off for that type. |
| AC-4 | THE SYSTEM SHALL render texts in the recipient's locale (`User.locale`, else `DEFAULT_LOCALE`) at creation time, escaping all parameter values in HTML and refusing unknown types and missing catalog keys. |
| AC-5 | WHEN an outbox row is committed, THE SYSTEM SHALL enqueue the job `plt.mail.send` (key `mail:<id>`) after commit; a cron job `plt.mail.flush` (every minute) SHALL enqueue any row still `QUEUED` and older than two minutes, so no message waits for a lost enqueue. |
| AC-6 | WHEN the job runs, THE SYSTEM SHALL send the message through the configured `MailTransport` (`MAIL_TRANSPORT=smtp|graph`), mark it `SENT` with the time, and on a transient failure retry with back-off up to 5 attempts, then mark it `FAILED`; permanent failures (rejected recipient) fail at once; the stored error is a code, never message text. |
| AC-7 | THE SYSTEM SHALL provide an SMTP adapter (host, port, optional user/password, TLS option; Mailpit in development) and a Microsoft Graph adapter (client-credentials token cached until expiry, `sendMail` from `MAIL_FROM`) behind the same interface, both covered by contract tests. |
| AC-8 | THE SYSTEM SHALL show a bell in the shell's notifications slot with the unread count (capped at "9+"), a menu with the latest 10, "mark all as read" and a link to the full list, and SHALL update the count when the page is refreshed or navigated. |
| AC-9 | THE SYSTEM SHALL provide `/notifications` (all of the signed-in user's notifications, newest first, server-side pagination, unread highlighted with text, not colour alone) where a user can mark one or all as read, and SHALL never expose another user's notifications. |
| AC-10 | WHEN a notification has a link, THE SYSTEM SHALL open it on click (relative paths only) and mark the notification read. |
| AC-11 | THE SYSTEM SHALL provide `/notifications/preferences` listing the optional types with an e-mail on/off switch per type; mandatory types are shown as "always sent". |
| AC-12 | WHEN a sysadmin presses "Send me a test message", THE SYSTEM SHALL notify that user with the `plt.test` type (in-app + e-mail), so the whole path can be verified; the outbox status of recent messages (queued/sent/failed counts) SHALL be visible on the jobs page. |
| AC-13 | THE SYSTEM SHALL keep recipients' e-mail addresses out of logs and job payloads (jobs carry the outbox id only). |

### Out of scope

Announcements and targeted messaging (NTF-01/03 build on this), SMS, push notifications, rich
templates editable in the UI, attachments, reply handling, digest e-mails, retention of old
notifications (PLT-14 with Q-16).

### Assumptions

- The sender is one mailbox (`MAIL_FROM`) of the client's tenant; Graph needs `Mail.Send`
  application permission restricted to that mailbox (client's IT sets this up).
- Notification texts are short; e-mail bodies are simple HTML with a text alternative.
- Retries use the job system's own retry for the *attempt*; the outbox `attempts` counter is
  informational and bounded by the job's `retryLimit` (4 retries = 5 attempts).

## 3. Design

### Data model

```prisma
// prisma/schema/notifications.prisma
enum EmailStatus { QUEUED SENT FAILED }

model Notification {
  id        String    @id @default(cuid(2))
  userId    String    @map("user_id")
  type      String
  title     String    // rendered in the recipient's locale at creation
  body      String
  link      String?   // relative path
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  readAt    DateTime? @map("read_at") @db.Timestamptz(3)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt])
  @@map("notifications")
}

model EmailOutbox {
  id             String      @id @default(cuid(2))
  userId         String?     @map("user_id")
  toAddress      String      @map("to_address")
  type           String
  subject        String
  html           String
  text           String
  status         EmailStatus @default(QUEUED)
  attempts       Int         @default(0)
  lastErrorCode  String?     @map("last_error_code")
  createdAt      DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  sentAt         DateTime?   @map("sent_at") @db.Timestamptz(3)
  @@index([status, createdAt])
  @@map("email_outbox")
}

model NotificationPreference {
  userId String  @map("user_id")
  type   String
  email  Boolean
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, type])
  @@map("notification_preferences")
}
```

`EmailOutbox` holds the recipient's address (personal data) like any business table; it is not
logged. Old rows are kept until PLT-14 defines retention.

### Permissions

None for own notifications (every signed-in user). `plt.settings.write` (sysadmin) gates the test message.

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/lib/notify/types.ts` | registry (`registerNotificationType`) |
| domain | `src/lib/notify/channels.ts` | pure: `decideChannels({ type, userActive, hasEmail, preference })` |
| domain | `src/lib/notify/render.ts` | pure: message rendering with escaping, locale fallback |
| service | `src/lib/notify/notify.ts` | `notify(ctx, input)` writing rows in the caller's transaction and scheduling the send |
| transport | `src/lib/mail/transport.ts`, `smtp.ts`, `graph.ts`, `index.ts` | `MailTransport`, adapters, `getMailTransport()` |
| jobs | `src/lib/notify/jobs.ts` | `plt.mail.send`, `plt.mail.flush` |
| queries/actions | `list`, `markRead`, `markAllRead`, `setPreference`, `sendTestMessage` |
| UI | bell component + `/notifications` + `/notifications/preferences` |

### Edge cases & errors

- A user without an e-mail address, or inactive, gets only the in-app notification.
- Two `notify` calls with the same `dedupeKey` (optional) inside 24 h create one notification
  (used by reminders); without a key every call creates a row.
- Mail transport unreachable → the job retries; after 5 attempts the row is `FAILED` and shows on
  the jobs page; a sysadmin can re-queue it (same retry button as jobs).
- A link that is not a relative path is dropped (open-redirect guard).

## 4. Tasks

- [x] **T1** — Models + migration; env (`MAIL_*`, `SMTP_*`, `MS_*`); nodemailer dependency. (AC-2, AC-7)
- [x] **T2** — Pure channel decision and rendering with unit tests; type registry. (AC-1, AC-3, AC-4)
- [x] **T3** — Mail transports (SMTP, Graph) with contract tests. (AC-7)
- [x] **T4** — `notify()` + outbox jobs (`send`, `flush`) with integration tests incl. rollback. (AC-2, AC-5, AC-6, AC-13)
- [x] **T5** — Bell, `/notifications`, mark read, link handling, i18n. (AC-8..AC-10)
- [x] **T6** — Preferences page, test message, outbox status on the jobs page. (AC-11, AC-12)
- [x] **T7** — E2E through Mailpit, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-4 | unit | catalogs contain keys for registered types in both locales; rendering escapes `<script>` in params; locale fallback; unknown type/missing key refused |
| AC-3 | unit | table: mandatory, opt-out, inactive, no address |
| AC-2 | integration | rows created with the caller's transaction; rollback leaves nothing |
| AC-5, AC-6 | integration | send marks SENT; transient failure retried then FAILED; permanent fails at once; flush enqueues stale rows once |
| AC-7 | integration + unit | SMTP against Mailpit when reachable; Graph request shape (token, URL, body) against a mocked fetch; token cached |
| AC-8..AC-10 | e2e | bell count, menu, mark read, link opens and marks read; no cross-user access |
| AC-11 | e2e | preference switch stops the e-mail for an optional type, mandatory type is sent anyway |
| AC-12 | e2e | test message appears in the bell and in Mailpit |
| AC-13 | integration | logs/job payload contain no address |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (deployment.md variables, domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
