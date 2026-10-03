# <ID> — <Title>

| | |
|---|---|
| **Phase** | P? |
| **Depends on** | <IDs> |
| **Questions** | <Q-IDs, with the working assumption used> |
| **Source** | <SRC-IDs> |
| **Brief** | [../modules/<prefix>.md](../modules/<prefix>.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Why this feature exists, in 3–6 lines, citing SRC IDs. What already exists that it builds on.

## 2. Requirements

### User stories

- As a **<role>**, I want **<capability>**, so that **<benefit>**.

### Acceptance criteria (EARS)

Use EARS patterns — one testable behavior per line:
- Ubiquitous: `THE SYSTEM SHALL …`
- Event: `WHEN <trigger> THE SYSTEM SHALL …`
- State: `WHILE <state> THE SYSTEM SHALL …`
- Unwanted: `IF <condition> THEN THE SYSTEM SHALL …`
- Optional: `WHERE <feature is enabled> THE SYSTEM SHALL …`

| ID | Criterion |
|---|---|
| AC-1 | WHEN … THE SYSTEM SHALL … |

### Out of scope

- …

### Assumptions

- … (link the question it depends on)

## 3. Design

### Data model

```prisma
// prisma/schema/<module>.prisma
```

Update [domain-model.md](../../02-architecture/domain-model.md) if entities change.

### Permissions

| Permission | Granted to |
|---|---|

### Server

| Kind | Name | Purpose |
|---|---|---|
| action | `…Actions.create` | … |
| query | `…Queries.list` | … |
| domain | `…` | pure rule |

### UI

| Route | Who | What |
|---|---|---|

### Jobs, events, integrations

### Edge cases & errors

## 4. Tasks

Small, ordered, each independently verifiable. Reference the ACs each task satisfies.

- [ ] **T1** — … (AC-1)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | integration | … |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, ADRs if a decision changed, brief if scope changed)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
