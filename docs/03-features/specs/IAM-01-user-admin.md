# IAM-01 — User & role administration

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-06, PLT-07 |
| **Questions** | Q-18 (answered: multiple scoped roles, 2FA for sysadmin), Q-19 (answered: login = email, no self-registration) |
| **Source** | SRC-010 |
| **Brief** | [../modules/iam.md](../modules/iam.md) |

## 1. Context

SRC-010 asks for a users module managing user categories. Accounts are pre-created by the app and
mirrored to Keycloak ([auth.md](../../02-architecture/auth.md#account-provisioning-iam-01-iam-02));
roles and scopes live in the app (PLT-05). Automatic provisioning for students/staff is IAM-02.
This feature gives the sysadmin the screens and the Keycloak admin client, and the CLI to bootstrap
the first sysadmin in production.

## 2. Requirements

### User stories

- As a **sysadmin**, I want to create a user with roles and scopes and have them receive an email
  to set their password, so that onboarding needs no manual Keycloak work.
- As a **sysadmin**, I want to deactivate a user immediately, so that people who leave lose access.
- As an **operator**, I want a command to create the first sysadmin, so that a fresh production
  install can be administered.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | WHEN a sysadmin opens `/admin/users`, THE SYSTEM SHALL list users (name, email, roles summary, active, last login) with search by name/email and filters by role and status, paginated server-side. |
| AC-2 | WHEN a sysadmin creates a user (email, first name, last name, ≥1 role assignment), THE SYSTEM SHALL create the Keycloak user (enabled, email as username, required actions `UPDATE_PASSWORD` + `VERIFY_EMAIL`), then the app `User` and `UserRole`s in one transaction, and SHALL trigger Keycloak's "execute actions" email. |
| AC-3 | IF the email already exists in the app, THEN THE SYSTEM SHALL refuse with a field error. IF it exists only in Keycloak, THEN THE SYSTEM SHALL offer to **link** that Keycloak user instead of creating a new one. |
| AC-4 | IF creating the app rows fails after the Keycloak user was created by this request, THEN THE SYSTEM SHALL delete that Keycloak user (compensation) and report the error. |
| AC-5 | WHEN a sysadmin adds or removes a role assignment, THE SYSTEM SHALL validate it with PLT-05 (allowed scope types per role, scope exists) and record it in the audit log; the change applies on the user's next request. |
| AC-6 | WHEN a sysadmin deactivates a user, THE SYSTEM SHALL require a reason, set `active=false`, delete the user's app sessions, disable the Keycloak user and log out its Keycloak sessions. Reactivation reverses this. |
| AC-7 | IF the action would deactivate the acting sysadmin, or remove/deactivate the **last active sysadmin**, THEN THE SYSTEM SHALL refuse. |
| AC-8 | WHEN a sysadmin changes a user's email or name, THE SYSTEM SHALL update Keycloak too; an email change SHALL set `emailVerified=false` and re-send `VERIFY_EMAIL`. |
| AC-9 | WHEN a user is given the `sysadmin` role, THE SYSTEM SHALL add the Keycloak user to group `require-otp` (2FA mandatory); removing the role removes the group. |
| AC-10 | THE SYSTEM SHALL provide "Resend activation email" for users who never logged in. |
| AC-11 | THE SYSTEM SHALL show the user's change history (PLT-07 `EntityHistory`) on the user detail page. |
| AC-12 | WHEN an operator runs `pnpm iam:bootstrap-admin --email <e> --first <f> --last <l>`, THE SYSTEM SHALL create (or link) the Keycloak user and an app user with `sysadmin` (INSTITUTION), idempotently, and print the next step. |
| AC-13 | THE SYSTEM SHALL restrict all of the above to `iam.user.read` / `iam.user.write` (sysadmin). |

### Out of scope

Automatic accounts for students and staff (IAM-02); linking users to `Person` records (STU-01/HR-01
add the link); self-service profile editing beyond locale (later).

## 3. Design

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/modules/iam/server/keycloak-admin.ts` | interface `IdentityProviderAdmin` + Keycloak implementation: client-credentials token (cached until expiry), `findUserByEmail`, `createUser`, `updateUser`, `setEnabled`, `executeActionsEmail`, `logoutUser`, `addToGroup`, `removeFromGroup`, `deleteUser`. Tests use an in-memory fake. |
| service | `userService.create / update / deactivate / reactivate / assignRole / revokeRole / resendActivation` | orchestration + compensation + audit |
| domain | `iam/domain/rules.ts` | `canDeactivate(actor, target, sysadminCount)` etc. — pure |
| query | `userQueries.list(filters, page)`, `userQueries.detail(id)` | |
| actions | `userActions.*` | thin wrappers with permission + Zod + reason |
| script | `scripts/iam-bootstrap-admin.ts` (run via `tsx`) | AC-12 |

Keycloak Admin REST base: `${KEYCLOAK_INTERNAL_URL or issuer host}/admin/realms/logos`; client
`sekretari-admin` with `manage-users`, `view-users`, `query-groups` (realm-management) — added to the
realm file from PLT-04 if missing.

### UI

| Route | What |
|---|---|
| `/admin/users` | list (AC-1) + "New user" |
| `/admin/users/new` | form: email, names, role assignments editor (role select → allowed scope types → scope picker; only INSTITUTION/SELF available until ORG registers resolvers) |
| `/admin/users/[id]` | details, roles editor, activate/deactivate (reason dialog), resend activation, history |

Nav entry: group "System", permission `iam.user.read`.

### Edge cases & errors

- Keycloak down → actions fail cleanly with "Identity service unavailable"; nothing half-created.
- Keycloak user exists and is already linked to another app user → refuse.
- Concurrent edits → last write wins, but every change is audited; role assignment unique constraint
  prevents duplicates.

## 4. Tasks

- [ ] **T1** — `IdentityProviderAdmin` interface, Keycloak implementation, in-memory fake; contract
      tests run against the fake always and against real Keycloak in E2E. (AC-2, AC-6, AC-8, AC-9)
- [ ] **T2** — Domain rules + unit tests. (AC-7)
- [ ] **T3** — `userService` with transaction + compensation + audit. (AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-10)
- [ ] **T4** — Queries + list page with search/filters/pagination. (AC-1, AC-13)
- [ ] **T5** — Create/edit pages with role-assignment editor. (AC-2, AC-3, AC-5)
- [ ] **T6** — Detail page: deactivate/reactivate (reason), resend activation, history. (AC-6, AC-10, AC-11)
- [ ] **T7** — Bootstrap CLI + README "first install" section. (AC-12)
- [ ] **T8** — i18n keys (`iam.*`) in `sq` and `en`; nav entry.

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-2, AC-4 | integration (fake IdP) | create succeeds → rows + IdP user; DB failure → IdP user deleted |
| AC-3 | integration | duplicate app email refused; IdP-only email offers link |
| AC-6 | integration + e2e | deactivated user's next request is rejected; Keycloak user disabled |
| AC-7 | unit | last-sysadmin and self-deactivation rules |
| AC-9 | integration | sysadmin role toggles `require-otp` group on the fake |
| AC-12 | integration | bootstrap twice → one user, one role |
| AC-1, AC-5 | e2e | sysadmin creates a secretary, secretary logs in (Mailpit link) and sees only allowed nav |

## 6. Definition of done

- [ ] All tasks ticked, ACs covered; E2E with real Keycloak + Mailpit passes
- [ ] auth.md provisioning table still accurate
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
