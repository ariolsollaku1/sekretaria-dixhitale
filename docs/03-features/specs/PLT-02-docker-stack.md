# PLT-02 — Docker Compose stack

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-01 |
| **Questions** | Q-26 (answered: hosting is the client's concern; stay host-agnostic) |
| **Source** | SRC-150 |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

The client asked for Docker-based deployment. Design: [deployment.md](../../02-architecture/deployment.md),
[ADR-0005](../../02-architecture/adr/0005-docker-compose.md). This feature provides the compose
stack for development and a production-shaped profile; Keycloak realm content comes in PLT-04,
backups in PLT-13.

## 2. Requirements

### User stories

- As a **developer**, I want one command to start all infrastructure, so that I can run the app
  locally exactly like production.
- As the **client's operator**, I want the whole system to run from a compose file and an `.env`,
  so that it can be deployed on any Docker host.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | WHEN `pnpm infra:up` (= `docker compose --profile dev up -d`) runs on a clean machine, THE SYSTEM SHALL start `db`, `keycloak`, `gotenberg`, `mailpit` and report them healthy. |
| AC-2 | WHEN the `db` volume is first initialized, THE SYSTEM SHALL create databases `sekretari` and `keycloak` with **separate** users/passwords taken from `.env`. |
| AC-3 | THE SYSTEM SHALL run Keycloak on the `keycloak` database, with the bootstrap admin from `.env`, and import any realm files in `infra/keycloak/` on start. |
| AC-4 | WHILE in the `dev` profile, THE SYSTEM SHALL expose: Postgres 5432, Keycloak 8080, Gotenberg 3001, Mailpit UI 8025 / SMTP 1025 — bound to `127.0.0.1` only. |
| AC-5 | WHEN `docker compose --profile dev --profile full up --build` runs, THE SYSTEM SHALL build the app image and serve the app on port 3000 with a passing `/api/health` healthcheck. |
| AC-6 | THE app image SHALL be a multi-stage build on Next.js standalone output, run as a non-root user, and contain no dev dependencies or secrets. |
| AC-7 | THE SYSTEM SHALL keep data in named volumes (`pgdata`, `files`) so that `down`/`up` preserves data, and `pnpm infra:reset` SHALL remove volumes after confirmation. |
| AC-8 | WHERE the `prod` profile is used, THE SYSTEM SHALL run Keycloak in production mode behind the `proxy` (Caddy, TLS), with no database or Gotenberg ports published. |
| AC-9 | THE SYSTEM SHALL set `TZ=Europe/Tirane` on all services. |

### Out of scope

Realm configuration (PLT-04), migrations on start (PLT-03 adds `prisma migrate deploy` to the app
entrypoint), backup service (PLT-13), server provisioning/hardening.

## 3. Design

```
docker-compose.yml          # all services, profiles: dev | full | prod
infra/
  postgres/init/01-databases.sh     # creates app + keycloak DB/users from env
  keycloak/                          # realm files (PLT-04); mounted read-only to /opt/keycloak/data/import
  docker/app.Dockerfile              # deps → build → runner (node:<lts>-alpine or -slim), USER node
  docker/app-entrypoint.sh           # (PLT-03 adds migrate deploy) then `node server.js`
  caddy/Caddyfile                    # prod: app.<domain> → app:3000, auth.<domain> → keycloak:8080
.env.example                         # every variable documented
```

| Service | Key settings |
|---|---|
| `db` | `postgres:<current major>`; healthcheck `pg_isready`; volume `pgdata`; init scripts mounted |
| `keycloak` | dev: `start-dev --import-realm`; prod: `start --import-realm` with `KC_HOSTNAME=https://auth.<domain>`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true` behind proxy; `KC_DB=postgres`, `KC_DB_URL=jdbc:postgresql://db:5432/keycloak`; `KC_HEALTH_ENABLED=true`; healthcheck on the management port `/health/ready`; `depends_on: db (healthy)` |
| `gotenberg` | `gotenberg/gotenberg:8` (or current major); dev port `127.0.0.1:3001:3000` |
| `mailpit` | profile `dev` only |
| `app` | profiles `full`, `prod`; build from `infra/docker/app.Dockerfile`; `env_file: .env`; volume `files:/data/files`; `depends_on` db + keycloak healthy; healthcheck `wget -qO- http://localhost:3000/api/health` |
| `proxy` | profile `prod`; `caddy:2`; ports 80/443; volume for certs |

`package.json` scripts: `infra:up`, `infra:down`, `infra:logs`, `infra:reset` (prompts), `stack:up`
(full profile).

Issuer-URL note for full-stack mode: see [auth.md](../../02-architecture/auth.md#development-note--issuer-url-inside-docker)
(`KC_HOSTNAME=http://localhost:8080` + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` in `full`).

## 4. Tasks

- [ ] **T1** — `infra/postgres/init/01-databases.sh` + `db` service with healthcheck. (AC-2)
- [ ] **T2** — `keycloak` service (dev mode) using its DB, import dir mounted, healthcheck. (AC-3)
- [ ] **T3** — `gotenberg`, `mailpit` services; localhost-only port bindings; `TZ`. (AC-4, AC-9)
- [ ] **T4** — `app.Dockerfile` (multi-stage, standalone, non-root) + entrypoint + `app` service
      with `full` profile. (AC-5, AC-6)
- [ ] **T5** — `prod` profile: Caddy proxy + Caddyfile template, Keycloak production settings. (AC-8)
- [ ] **T6** — `.env.example` complete; pnpm scripts; volumes; `infra:reset` with confirmation. (AC-1, AC-7)
- [ ] **T7** — `docs/02-architecture/deployment.md` updated with anything that changed; README
      "Run locally" section.

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-1, AC-3 | script | `scripts/infra-smoke.sh`: `up` → wait for all healthchecks → curl Keycloak `/realms/master` → exit 0 |
| AC-2 | script | `psql` connects as app user to `sekretari` and **cannot** connect to `keycloak` |
| AC-5 | CI (optional job) | build image, run `full` profile, curl `/api/health` |
| AC-6 | script | `docker run --rm app id -u` ≠ 0; image has no `.env` |

## 6. Definition of done

- [ ] Fresh clone → `cp .env.example .env` → `pnpm infra:up` works with no manual steps
- [ ] All tasks ticked; deployment.md accurate
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
