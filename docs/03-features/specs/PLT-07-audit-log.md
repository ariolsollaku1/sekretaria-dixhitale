# PLT-07 — Audit log

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-05 |
| **Questions** | Q-16 (open, not blocking here: retention of audit data is decided with PLT-14) |
| **Source** | SRC-043 (grade changes must be traceable), SRC-152 (data protection) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

Grades, enrollment status, payments and personal data are changed by many people; the source asks
for modifications "in case of error or improvement" (SRC-043) and for data-protection compliance
(SRC-152, Law 124/2024 — see Q-16 findings). Every business mutation must leave an immutable trace.

## 2. Requirements

### User stories

- As a **sysadmin**, I want to see who changed what and when, so that I can answer questions and
  investigate mistakes.
- As a **secretary**, I want to see the history of a student's record, so that I know why a value
  changed.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store audit entries with: time, actor (user id or `SYSTEM`/`PUBLIC`), action (`<module>.<resource>.<verb>`), entity type, entity id, changed fields `before`/`after`, optional reason, request id, IP, user agent. |
| AC-2 | WHEN a service mutates business data inside `withTransaction`, THE SYSTEM SHALL write the audit entry in the **same transaction** (`ctx.audit(...)`), so a rolled-back change leaves no entry and a committed change always has one. |
| AC-3 | THE SYSTEM SHALL record only the fields that changed, and SHALL replace values of fields marked sensitive (configurable list, e.g. `nationalId`) with a masked form in `before`/`after`. |
| AC-4 | IF anything attempts to UPDATE or DELETE an audit row, THEN THE SYSTEM SHALL reject it at the database level (trigger). |
| AC-5 | WHEN auth events occur (login success, login denied, logout), THE SYSTEM SHALL record them as audit entries (`auth.*`). |
| AC-6 | WHEN a sysadmin opens `/admin/audit`, THE SYSTEM SHALL list entries newest first, paginated server-side, filterable by actor, action, entity type, entity id and date range, with a detail view showing the field diff. |
| AC-7 | THE SYSTEM SHALL provide an `<EntityHistory entityType entityId permission />` component that modules embed in detail pages, showing that entity's entries to users holding the given permission. |
| AC-8 | THE SYSTEM SHALL let actions require a **reason** (`requireReason: true` in the action wrapper) and store it on the entry. |
| AC-9 | THE SYSTEM SHALL NOT write personal data into application logs; logs reference ids only. |

### Out of scope

Retention/anonymization of audit data (PLT-14, after Q-16), read-access logging of sensitive views
(PLT-14), export of audit data (PLT-10 export applies once the audit list moves to `DataTable`).

## 3. Design

### Data model

```prisma
enum AuditActorType { USER SYSTEM PUBLIC }

model AuditLog {
  id          String         @id @default(cuid(2))
  at          DateTime       @default(now())
  actorType   AuditActorType @map("actor_type")
  actorUserId String?        @map("actor_user_id")
  action      String
  entityType  String         @map("entity_type")
  entityId    String?        @map("entity_id")
  before      Json?
  after       Json?
  reason      String?
  requestId   String?        @map("request_id")
  ip          String?
  userAgent   String?        @map("user_agent")
  @@index([entityType, entityId, at])
  @@index([actorUserId, at])
  @@index([at])
  @@map("audit_logs")
}
```

Migration adds a trigger `audit_logs_immutable` raising an exception on `UPDATE`/`DELETE`.

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/lib/audit/audit.ts` | `createAuditor(tx, requestCtx)` → `audit({ action, entityType, entityId, before, after, reason })`; computes diff, masks sensitive fields |
| lib | `src/lib/audit/diff.ts` | pure `diffFields(before, after, { sensitive })` — unit tested |
| lib | `src/lib/audit/request-context.ts` | request id (generated per request), IP, user agent from headers |
| lib | action wrapper hook | `ctx.audit` injected into every action's transaction; `requireReason` option |
| query | `auditQueries.list(filters, page)`, `auditQueries.forEntity(type, id)` | permission `plt.audit.read` for the global list |
| auth | PLT-04 event hook → `audit` with `actorType` USER/PUBLIC | AC-5 |

### UI

| Route | Who | What |
|---|---|---|
| `/admin/audit` | sysadmin | filters + paginated table + detail drawer with diff |
| `<EntityHistory>` | per module permission | compact timeline on detail pages |

**Implementation notes:**
- The shared **action wrapper** (`src/lib/actions`, `action({ permission, input, requireReason,
  target, handler })`) was built here because audit and `requireReason` live in it; it also covers
  authentication, permission (+ scoped target check), Zod, the transaction and the typed result.
  Handlers get `ctx = { user, db: tx, audit, reason }`; they throw `DomainError` for expected
  failures. `createAction(deps)` takes its dependencies, so it is integration-tested without a session.
- `ctx.audit({ action, entityType, entityId, before, after, reason })` takes the full entity fields;
  only the changed ones are stored, sensitive keys (any depth, case-insensitive; extend with
  `registerSensitiveFields`) become `***`. An update that changes nothing writes no row.
- `audit_logs` has no FK to users and no UPDATE/DELETE (trigger `audit_logs_immutable`). TRUNCATE
  is not blocked on purpose, because `resetDatabase()` in tests needs it.
- Auth events (`auth.session.login|denied|logout`) are written outside a transaction and never block
  sign-in or sign-out; denied logins have actor PUBLIC and `{ reason }` in `after`.
- `/admin/audit` (permission `plt.audit.read`, nav group System) filters through GET parameters;
  dates are Europe/Tirane calendar days (`zonedDayBounds`). Detail is a page, not a drawer.
- `<EntityHistory entityType entityId permission />` (`src/components/audit/entity-history.tsx`)
  checks the permission itself and renders nothing without it.
- Logging: `src/lib/logger.ts` drops personal-data keys; ESLint `no-console` is an error in `src/`.
- Bug found by the e2e run and fixed (PLT-04): with `requireEmailVerification` the first, linking
  login failed with `email_not_verified` (stale user object); the flag is off, linking still needs
  Keycloak's `email_verified`. Regression test in `e2e/auth.spec.ts`.

## 4. Tasks

- [x] **T1** — Model + migration + immutability trigger. (AC-1, AC-4)
- [x] **T2** — `diffFields` with masking + unit tests. (AC-3)
- [x] **T3** — Auditor + request context + integration with `withTransaction`/action wrapper,
      `requireReason`. (AC-2, AC-8)
- [x] **T4** — Auth events wired from PLT-04. (AC-5)
- [x] **T5** — `/admin/audit` page and `<EntityHistory>` component. (AC-6, AC-7)
- [x] **T6** — Logging guideline + a lint/grep check in CI for obvious PII in log calls (e.g.
      `console.log` banned in `src/`; use `logger` with id-only fields). (AC-9)

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-2 | integration | failing transaction → zero audit rows; success → exactly one |
| AC-3 | unit | only changed keys stored; sensitive fields masked |
| AC-4 | integration | `UPDATE audit_logs …` raises |
| AC-6 | e2e | sysadmin filters by entity id and sees the change; secretary gets 403 |
| AC-8 | integration | action with `requireReason` and empty reason → validation error |

## 6. Definition of done

- [x] All tasks ticked, ACs covered
- [x] conventions.md "Audit" section still matches the API
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
