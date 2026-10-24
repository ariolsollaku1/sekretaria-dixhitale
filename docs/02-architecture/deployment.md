# Deployment (Docker Compose)

Decision record: [ADR-0005](adr/0005-docker-compose.md). Hosting location is decided by the client;
the stack must run on any Docker host and keep **all data in one place we control** (SRC-150).

## Services

| Service | Image | Purpose | Exposed | Profiles |
|---|---|---|---|---|
| `app` | built from `infra/docker/app.Dockerfile` (Next.js standalone) | The web app | 3000 (behind proxy in prod) | `full`, `prod` |
| `db` | `postgres:17-alpine` | App DB **and** Keycloak DB (two databases, two users) | 5432 dev only (127.0.0.1) | always |
| `keycloak` | `quay.io/keycloak/keycloak:26.4` | Identity provider | 8080 dev only (127.0.0.1); behind proxy in prod | always |
| `gotenberg` | `gotenberg/gotenberg:8` | HTML → PDF | 3001 dev only (127.0.0.1) | always |
| `mailpit` | `axllent/mailpit` | Catches outgoing email in dev | 8025 (UI), 1025 (SMTP) | `dev` |
| `backup` | small image with `pg_dump` + cron | Scheduled DB + files backups (PLT-13) | internal only | `prod` |
| `proxy` | Caddy | TLS termination, routes `app` and `keycloak` | 80/443 | `prod` |

Volumes: `pgdata`, `files` (uploaded/generated documents, ADR-0010), `backups`, `keycloak-import`
(read-only realm file).

## Environments

| Env | How it runs | Notes |
|---|---|---|
| **Local dev** (default) | `pnpm infra:up` (= `docker compose --profile dev up -d --wait`) for infra; `pnpm dev` on host | Fast reload; no issuer mismatch (see auth.md). Mailpit UI on http://localhost:8025. |
| **Local full stack** | `pnpm stack:up` (= `--profile dev --profile full up --build`) | Prod-like check before release; app on http://localhost:3000 (`APP_PORT`). |
| **Test (CI)** | Postgres service + `pnpm test`; Playwright against `full` | Fresh DB per run. |
| **Production** | `docker compose --profile prod up -d` on the client's server | Keycloak in `start` (optimized) mode, TLS via proxy, backups on. |

### Compose files

`docker-compose.yml` is production-shaped: nothing is published except the proxy's 80/443, and
Keycloak runs `start`. `docker-compose.dev.yml` adds `127.0.0.1` port bindings and `start-dev`. The
dev `.env` selects both via `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml`; on a
production host use `COMPOSE_FILE=docker-compose.yml` and `COMPOSE_PROFILES=prod`, set
`KC_HOSTNAME=https://auth.<domain>`, `DOMAIN` and `ACME_EMAIL`. Host ports are overridable
(`DB_PORT`, `KEYCLOAK_PORT`, `GOTENBERG_PORT`, `MAILPIT_*_PORT`, `APP_PORT`).

`pnpm infra:reset` deletes the volumes after a typed confirmation; `pnpm infra:smoke` checks the
stack (healthchecks, Keycloak master realm, database isolation, `TZ`).

## Configuration

All config through environment variables; `.env.example` lists every variable with a comment.
Secrets are never committed.

| Variable | Used by | Example |
|---|---|---|
| `APP_URL` | app | `http://localhost:3100` |
| `DATABASE_URL` | app | `postgresql://sekretari:…@db:5432/sekretari` |
| `BETTER_AUTH_SECRET` | app | random 32+ bytes |
| `KEYCLOAK_ISSUER` | app | `http://localhost:8080/realms/logos` |
| `KEYCLOAK_INTERNAL_URL` | app | `http://keycloak:8080` (full-stack Docker only) |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | app | `sekretari-web` / … |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET` | app | `sekretari-admin` / … |
| `POSTGRES_*`, `APP_DB_*`, `KC_DB_*`, `DB_PORT`/… , `DOMAIN`, `ACME_EMAIL` | db, proxy, compose | see `.env.example` |
| `KC_DB_*`, `KC_HOSTNAME`, `KC_HOSTNAME_BACKCHANNEL_DYNAMIC`, `KC_BOOTSTRAP_ADMIN_*` | keycloak | |
| `GOTENBERG_URL` | app | `http://gotenberg:3000` |
| `MAIL_TRANSPORT` | app | `smtp` (dev, Mailpit) or `graph` (Microsoft 365, prod — Q-20) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | app | Mailpit in dev |
| `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MAIL_FROM` | app | Graph `sendMail` from a LOGOS mailbox |
| `DEFAULT_LOCALE` | app | `sq` (Q-17) |
| `FILES_DIR` | app | `/data/files` |
| `TZ` | all | `Europe/Tirane` |

## Startup order & health

`db` (healthcheck `pg_isready`) → `keycloak` (healthcheck on `/health/ready`, management port) →
`app` (runs `prisma migrate deploy` on start, then serves; healthcheck `/api/health`).

## Data location & backups (SRC-150, SRC-151)

- All personal data live in the `db` and `files` volumes on the client's host — no third-party SaaS
  stores personal data. Email delivery is the only outbound flow with personal data (address,
  message), via the client's SMTP.
- Backups: `scripts/backup.sh` (run from cron on the host) takes a `pg_dump` (custom format) of both
  databases + a tarball of `files`, retention 7 daily / 4 weekly / 12 monthly; `scripts/restore.sh`
  restores into a new database and verifies it (PLT-13, [backup-restore.md](backup-restore.md)). A
  dedicated `backup` container and a CI restore test are left to the client's pipeline (Q-67).
- Full **data export** in open formats (CSV per table + JSON Lines + original files, one ZIP) is
  produced nightly by the app and available to `sysadmin` on `/admin/backups` (PLT-13, SRC-151).
  Procedures, scripts and the restore drill: [backup-restore.md](backup-restore.md).
