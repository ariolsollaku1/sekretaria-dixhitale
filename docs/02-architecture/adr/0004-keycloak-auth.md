# ADR-0004 — Keycloak for authentication, app-side authorization

- **Status:** Accepted (2026-10-03)

## Context

The client chose Keycloak for authentication. We need: login for staff and students, password
reset, 2FA for privileged users, no self-registration, role-based access with **scopes** (faculty,
department, program, own records), and immediate effect of role changes.

## Decision

- **Keycloak** (realm `logos`) is the identity provider: credentials, password policy, 2FA,
  brute-force protection, SSO, email verification. Realm configuration is kept as code in
  `infra/keycloak/`.
- The app is an **OIDC client** (authorization code + PKCE) using **Better Auth** with its generic
  OAuth/OIDC provider pointed at Keycloak, sessions stored in the app DB, implicit sign-up
  disabled. (Auth.js is in maintenance mode since Sept 2025 and its maintainers recommend Better Auth
  for new projects.) If Better Auth cannot meet a requirement in PLT-04, fall back to
  `openid-client` + an encrypted cookie session — the requirements in PLT-04 are library-neutral.
- **Authorization lives in the app**: roles + scopes in `UserRole`, permission map in code
  (`src/lib/authz`). Keycloak does not hold app roles.
- The app provisions/disables Keycloak users through the Admin REST API with a dedicated
  service-account client (`sekretari-admin`).

Details: [../auth.md](../auth.md).

## Consequences

- Role changes take effect on the next request; no token refresh games.
- Scopes can reference app entities (faculty/department/program) with FK integrity.
- Two places hold user state (Keycloak user, app `User`) — kept consistent by IAM-01/IAM-02 with
  compensating actions on failure.
- Future SSO with other systems (e.g. MS Teams/Entra ID, Q-04) can be added in Keycloak via identity
  brokering without touching the app.

## Alternatives considered

- Roles as Keycloak realm/client roles read from the token — stale until refresh, no FK to
  faculties/departments, two admin UIs.
- Auth.js v5 Keycloak provider — works, but maintenance-only.
