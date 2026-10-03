# ADR-0005 — Docker Compose for every environment

- **Status:** Accepted (2026-10-03)

## Context

The client asked for Docker. Hosting location is the client's decision; the stack must be easy to
run on a single server and reproducible on a laptop.

## Decision

- One `docker-compose.yml` with **profiles**: `dev` (mailpit), `full` (containerized app for
  prod-like local runs), `prod` (app, proxy with TLS, backup service).
- Services: `app`, `db` (Postgres), `keycloak`, `gotenberg`, plus `mailpit` (dev), `proxy` and
  `backup` (prod). See [../deployment.md](../deployment.md).
- Local development runs infra in Docker and the app on the host (`pnpm dev`) for fast reloads.
- The app image is a multi-stage build using Next.js `output: "standalone"`; migrations run on
  container start (`prisma migrate deploy`).

## Consequences

- Single-server deployment is simple; scaling beyond one host would need Kubernetes or similar —
  not expected for one college.
- Everything (including Keycloak config) is reproducible from the repo + `.env`.

## Alternatives considered

- Kubernetes/Helm — unnecessary operational weight.
- Managed cloud services (managed Postgres/Auth) — conflicts with keeping personal data under the
  institution's control (SRC-150).
