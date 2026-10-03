# Deployment (Docker Compose)

Decision record: [ADR-0005](adr/0005-docker-compose.md). Hosting location is decided by the client;
the stack must run on any Docker host and keep **all data in one place we control** (SRC-150).

## Services

| Service | Image | Purpose | Exposed | Profiles |
|---|---|---|---|---|
| `app` | built from `infra/docker/app.Dockerfile` (Next.js standalone) | The web app | 3000 (behind proxy in prod) | `full`, `prod` |
| `db` | `postgres` (current major) | App DB **and** Keycloak DB (two databases, two users) | 5432 dev only | all |
| `keycloak` | `quay.io/keycloak/keycloak` | Identity provider | 8080 | all |
| `gotenberg` | `gotenberg/gotenberg` | HTML → PDF | internal only | all |
| `mailpit` | `axllent/mailpit` | Catches outgoing email in dev | 8025 (UI), 1025 (SMTP) | `dev` |
| `backup` | small image with `pg_dump` + cron | Scheduled DB + files backups (PLT-13) | internal only | `prod` |
| `proxy` | Caddy | TLS termination, routes `app` and `keycloak` | 80/443 | `prod` |

Volumes: `pgdata`, `files` (uploaded/generated documents, ADR-0010), `backups`, `keycloak-import`
(read-only realm file).

## Environments

| Env | How it runs | Notes |
|---|---|---|
| **Local dev** (default) | `docker compose --profile dev up -d` for infra; `pnpm dev` on host | Fast reload; no issuer mismatch (see auth.md). |
| **Local full stack** | `docker compose --profile dev --profile full up` | Prod-like check before release. |
| **Test (CI)** | Postgres service + `pnpm test`; Playwright against `full` | Fresh DB per run. |
| **Production** | `docker compose --profile prod up -d` on the client's server | Keycloak in `start` (optimized) mode, TLS via proxy, backups on. |

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
- `backup` service: nightly `pg_dump` (custom format) of both databases + tarball of `files`,
  retention 7 daily / 4 weekly / 12 monthly, plus a documented restore procedure tested in CI
  (PLT-13).
- Full **data export** in open formats (CSV per table + JSON + original files) is available to
  `sysadmin` (PLT-13, SRC-151).
