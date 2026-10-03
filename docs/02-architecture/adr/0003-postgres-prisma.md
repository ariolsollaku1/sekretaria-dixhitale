# ADR-0003 — PostgreSQL with Prisma

- **Status:** Accepted (2026-10-03)

## Context

PostgreSQL was requested. We need typed data access, reliable migrations, and a schema that stays
readable as ~20 modules add tables.

## Decision

- **PostgreSQL** (current major) — one server instance in Docker with two databases: `sekretari`
  (app) and `keycloak`.
- **Prisma** as ORM and migration tool, using the **multi-file schema** (`prisma/schema/*.prisma`,
  one file per module plus `base.prisma`).
- Raw SQL (via Prisma `$queryRaw` / typed SQL) is allowed for reports and aggregations where the
  query builder is awkward; such queries live in the module's `server/*.queries.ts` with tests.
- Use database constraints (unique, FK, check) for invariants — not only application code.

## Consequences

- Strong typing end to end; migrations committed and reviewed.
- Prisma's query builder is less flexible for complex reports — acceptable with raw SQL escape hatch.

## Alternatives considered

- Drizzle ORM — lighter and closer to SQL; good choice too, but Prisma's migration workflow and
  wide familiarity (including for AI agents) tipped the balance.
- Kysely / raw SQL only — more boilerplate, weaker migrations story.
