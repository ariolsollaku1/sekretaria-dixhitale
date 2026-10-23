# Sekretari Dixhitale

The digital academic administration system for **Kolegji Universitar LOGOS**: Next.js +
PostgreSQL, Keycloak for authentication, deployed with Docker.

## Quickstart

Requires Node >= 22 (`.nvmrc`) and pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env     # APP_URL port must match the dev script (3100)
pnpm infra:up            # Postgres etc. (see "Run locally" below)
pnpm db:migrate          # apply/create migrations; pnpm db:seed for default settings
pnpm dev                 # http://localhost:3100 (health: /api/health)
pnpm lint && pnpm typecheck && pnpm test   # test = unit + integration (needs `pnpm infra:up`)
pnpm test:e2e            # first time: pnpm exec playwright install chromium
```

### Run locally

```bash
pnpm infra:up      # Postgres, Keycloak (8080), Gotenberg (3001), Mailpit (8025) on 127.0.0.1
pnpm infra:smoke   # optional: verify the stack
pnpm stack:up      # prod-like: also builds and runs the app image on :3000
pnpm infra:down    # stop (data kept)   |   pnpm infra:reset   # stop and DELETE data
```

Keycloak dev admin and database passwords are in `.env` (copied from `.env.example`; change the
host ports there if 5432/8080 are taken). Database commands: `pnpm db:migrate` (dev),
`db:deploy`, `db:seed`, `db:reset`, `db:studio`, `db:generate`. Integration tests use the separate
`sekretari_test` database (`pnpm test:int`).

### Dev logins

`pnpm infra:up` creates these users in Keycloak (realm `logos`) and `pnpm db:seed` the matching app
users. All share the password `Dev-Pass-12345`. Sign in at http://localhost:3100.

| Email                                                                                                                                                                                                            | Purpose                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `sysadmin@`, `secretary@`, `student-affairs@`, `lecturer@`, `finance@`, `hr@`, `quality@`, `library@`, `administration@`, `student@`, `head-of-department@`, `program-coordinator@`, `erasmus@` `dev.logos.test` | one per role (roles themselves are assigned from PLT-05) |
| `inactive@dev.logos.test`                                                                                                                                                                                        | app user with `active=false` → refused                   |
| `stranger@dev.logos.test`                                                                                                                                                                                        | Keycloak user without app user → `/no-access`            |

Keycloak admin console: http://localhost:8080 (admin credentials in `.env`). After changing
`infra/keycloak/realm-logos.json` run `pnpm infra:reset`, then `pnpm infra:up`, `pnpm db:deploy`,
`pnpm db:seed`.

## Documentation

The project is built spec-first. Start here:

- [docs/README.md](docs/README.md) — documentation map
- [docs/03-features/FEATURES.md](docs/03-features/FEATURES.md) — what will be built, what's ready, what's blocked
- [docs/04-open-questions.md](docs/04-open-questions.md) — what we still need from LOGOS
- [docs/05-roadmap.md](docs/05-roadmap.md) — build phases

Feature status at any time: `node scripts/features.mjs`.
