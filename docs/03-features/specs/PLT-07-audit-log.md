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

## 4. Tasks

- [ ] **T1** — Model + migration + immutability trigger. (AC-1, AC-4)
- [ ] **T2** — `diffFields` with masking + unit tests. (AC-3)
- [ ] **T3** — Auditor + request context + integration with `withTransaction`/action wrapper,
      `requireReason`. (AC-2, AC-8)
- [ ] **T4** — Auth events wired from PLT-04. (AC-5)
- [ ] **T5** — `/admin/audit` page and `<EntityHistory>` component. (AC-6, AC-7)
- [ ] **T6** — Logging guideline + a lint/grep check in CI for obvious PII in log calls (e.g.
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

- [ ] All tasks ticked, ACs covered
- [ ] conventions.md "Audit" section still matches the API
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
