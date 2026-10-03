# PLT-05 — Authorization: roles, permissions, scopes

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-04 |
| **Questions** | Q-18 (answered: multiple roles per user, scoped roles, derived roles exist) |
| **Source** | SRC-010 |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

SRC-010 defines user categories; [roles.md](../../01-product/roles.md) turns them into roles with
scopes; [auth.md](../../02-architecture/auth.md#authorization-model) defines the model. This
feature implements the permission engine every module uses. Scopes that point to faculties,
departments and programs only become usable once ORG-02/ORG-03 exist; the engine must support them
through a registry so ORG can plug in without changing PLT-05.

## 2. Requirements

### User stories

- As a **developer**, I want one call to check "may this user do X (on Y)?", so that every action
  is protected the same way.
- As a **secretary scoped to one faculty**, I want to see only that faculty's records, so that
  data of other faculties stays private.
- As a **sysadmin**, I want role changes to apply immediately, so that removing access is effective.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL define roles as a fixed enum: `sysadmin, secretary, student_affairs, lecturer, finance, hr, quality, library, administration, student, head_of_department, program_coordinator, erasmus`. |
| AC-2 | THE SYSTEM SHALL store role assignments in `UserRole` (user, role, scopeType, scopeId, validFrom, validTo) and allow several assignments per user. |
| AC-3 | THE SYSTEM SHALL define permissions as typed strings `<module>.<resource>.<action>` and a role → permissions map in code; modules contribute their own permissions and grants through a registry. |
| AC-4 | WHEN `can(user, permission)` is called, THE SYSTEM SHALL return true only if an **active** assignment (now within validFrom/validTo, user active) grants the permission. |
| AC-5 | WHEN `can(user, permission, target)` is called with a target, THE SYSTEM SHALL return true only if a granting assignment's scope contains the target (INSTITUTION ⊃ FACULTY ⊃ DEPARTMENT ⊃ PROGRAM; SELF = target owned by the user), using scope resolvers registered by modules. |
| AC-6 | THE SYSTEM SHALL provide `requirePermission(permission, target?)` that throws `ForbiddenError`; pages render a 403 view and server actions return `{ ok:false, error:{ code:"FORBIDDEN" } }`. |
| AC-7 | THE SYSTEM SHALL provide `grantScopes(user, permission)` returning `{ institution, facultyIds, departmentIds, programIds, self }` so list queries can build their `where` clause. |
| AC-8 | WHEN a user's role assignments change, THE SYSTEM SHALL apply the change on the user's next request (no cross-request caching of assignments). |
| AC-9 | IF an assignment uses a scope type with no registered resolver, or a scopeId that doesn't exist, THEN THE SYSTEM SHALL reject saving it. |
| AC-10 | THE SYSTEM SHALL expose to the client only a flattened list of the user's permission strings (for hiding UI), never the assignment details. |
| AC-11 | THE SYSTEM SHALL ship the platform permissions: `iam.user.read`, `iam.user.write`, `plt.audit.read`, `plt.settings.write`, granted to `sysadmin`. |

### Out of scope

UI to assign roles (IAM-01); module-specific permissions (added by each module's feature); scope
resolvers for faculty/department/program (ORG-02, ORG-03 register them).

## 3. Design

### Data model

```prisma
// prisma/schema/platform.prisma
enum Role { sysadmin secretary student_affairs lecturer finance hr quality library administration student head_of_department program_coordinator erasmus }
enum ScopeType { INSTITUTION FACULTY DEPARTMENT PROGRAM SELF }

model UserRole {
  id          String    @id @default(cuid(2))
  userId      String    @map("user_id")
  role        Role
  scopeType   ScopeType @map("scope_type")
  scopeId     String?   @map("scope_id")        // null for INSTITUTION and SELF
  validFrom   DateTime  @default(now()) @map("valid_from")
  validTo     DateTime? @map("valid_to")
  createdAt   DateTime  @default(now()) @map("created_at")
  createdById String?   @map("created_by_id")
  user        User      @relation(fields: [userId], references: [id])
  @@unique([userId, role, scopeType, scopeId])
  @@index([userId])
  @@map("user_roles")
}
```

### Code structure

| File | Content |
|---|---|
| `src/lib/authz/roles.ts` | Role enum re-export, labels (i18n keys), allowed scope types per role (e.g. `student` → SELF only; `head_of_department` → DEPARTMENT only) |
| `src/lib/authz/registry.ts` | `registerPermissions(module, { permissions, grants })`, `registerScopeResolver(scopeType, { exists(id), ancestors(id) })`, `registerTargetResolver(kind, (id) => TargetScope)` |
| `src/lib/authz/permissions.ts` | aggregated catalog + platform permissions (AC-11); type `Permission` = union of all registered strings |
| `src/lib/authz/check.ts` | `can`, `requirePermission`, `grantScopes`, `ForbiddenError` |
| `src/lib/authz/load.ts` | `loadAssignments(userId)` wrapped in React `cache()` (per request only) |
| `src/lib/authz/client.ts` | `PermissionsProvider` + `useCan(permission)` for UI hiding |

**Target resolution:** a target is `{ kind: "student" | "program" | …, id }`. Modules register a
target resolver returning the target's scope chain, e.g. a student enrollment →
`{ programId, departmentId, facultyId, ownerUserId }`. `can` compares the chain with the
assignment scope. Without a target, a scoped assignment still grants the permission (lists are then
restricted with `grantScopes`).

**Lecturer "own assignments"** is modeled as scope `SELF` + target resolvers that return
`ownerUserIds` (e.g. all lecturers assigned to a teaching assignment) — no special case in the engine.

## 4. Tasks

- [ ] **T1** — Prisma enums + `UserRole` + migration. (AC-1, AC-2)
- [ ] **T2** — Registry for permissions, scope resolvers, target resolvers; platform permissions. (AC-3, AC-11)
- [ ] **T3** — `can` / `requirePermission` / `grantScopes` with per-request loading. (AC-4, AC-5, AC-7, AC-8)
- [ ] **T4** — `ForbiddenError` handling: 403 page component + action wrapper integration
      (wrapper itself lands with the first module, but the error mapping lives here). (AC-6)
- [ ] **T5** — Assignment validation service (`assignRole`, `revokeRole`) enforcing allowed scope
      types per role and resolver existence (used by IAM-01). (AC-9)
- [ ] **T6** — Client `PermissionsProvider` / `useCan`. (AC-10)
- [ ] **T7** — Seed: dev users get roles (one per role; secretary with INSTITUTION scope).

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-4 | unit | table-driven: role × permission × validity window × user.active |
| AC-5 | unit | fake resolvers: faculty-scoped secretary allowed on program in faculty A, denied in B; SELF allowed only on own target |
| AC-7 | unit | multiple assignments merge into the right sets |
| AC-8 | integration | revoke role → next `can` in a new request is false |
| AC-9 | integration | assigning DEPARTMENT scope without resolver fails; with unknown id fails |
| AC-6 | integration | action returns FORBIDDEN error shape |

## 6. Definition of done

- [ ] All tasks ticked; 100 % branch coverage on `check.ts`
- [ ] auth.md and roles.md still accurate
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
