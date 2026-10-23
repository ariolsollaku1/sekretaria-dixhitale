# PLT-03 — Database layer & migrations

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | PLT-02 |
| **Questions** | — |
| **Source** | — (enabler) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

Every module stores data in PostgreSQL through Prisma ([ADR-0003](../../02-architecture/adr/0003-postgres-prisma.md)).
This feature sets up the Prisma toolchain, conventions, the transaction helper, seeding, and an
integration-test database so later features only add models and services.

## 2. Requirements

### User stories

- As a **developer**, I want a ready Prisma setup with one schema file per module, migrations,
  seeds and a disposable test DB, so that I can add a module's tables and test them immediately.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL use Prisma with a multi-file schema in `prisma/schema/` (`base.prisma` for generator/datasource, one file per module). |
| AC-2 | THE SYSTEM SHALL expose a single Prisma client instance from `src/lib/db` that is reused across hot reloads in development and is server-only. |
| AC-3 | THE SYSTEM SHALL provide `db:migrate` (dev), `db:deploy`, `db:seed`, `db:reset`, `db:studio` scripts. |
| AC-4 | WHEN the app container starts, THE SYSTEM SHALL run `prisma migrate deploy` before serving. |
| AC-5 | THE SYSTEM SHALL provide `withTransaction(fn)` that runs `fn` in an interactive transaction and is the only way services start transactions. |
| AC-6 | WHEN `pnpm db:seed` runs twice, THE SYSTEM SHALL produce the same data (idempotent seeders). |
| AC-7 | THE SYSTEM SHALL run integration tests against a separate database (`sekretari_test`) that is migrated once per run and truncated between test files (except `_prisma_migrations`). |
| AC-8 | WHEN `/api/health` is called, THE SYSTEM SHALL include `db: "ok"` or return `503` with `db: "error"` if the database is unreachable. |
| AC-9 | THE SYSTEM SHALL include a `SystemSetting` model (key → JSON value, updatedBy/At) for runtime-configurable settings. |

### Out of scope

Business models (each feature adds its own), Better Auth tables (PLT-04), audit (PLT-07).

## 3. Design

### Data model

```prisma
// prisma/schema/base.prisma
generator client { provider = "prisma-client-js" }   // or the current recommended generator — check Prisma docs
datasource db    { provider = "postgresql"; url = env("DATABASE_URL") }

// prisma/schema/platform.prisma
model SystemSetting {
  key         String   @id
  value       Json
  updatedAt   DateTime @updatedAt @map("updated_at")
  updatedById String?  @map("updated_by_id")
  @@map("system_settings")
}
```

Conventions (from [conventions.md](../../02-architecture/conventions.md#data--database)):
`id String @id @default(cuid(2))`, `createdAt`/`updatedAt`, snake_case mapping, `Decimal(12,2)` money,
`@db.Date` for pure dates, no hard deletes of business data.

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/lib/db/client.ts` | Prisma singleton (`globalThis` cache in dev), `import "server-only"` |
| lib | `src/lib/db/transaction.ts` | `withTransaction<T>(fn: (tx) => Promise<T>, opts?)` — default isolation `ReadCommitted`, timeout 10s |
| lib | `src/lib/db/settings.ts` | `getSetting(key, schema)`, `setSetting(key, value, ctx)` with Zod validation |
| test | `src/lib/db/testing.ts` | `resetDatabase()` (TRUNCATE … RESTART IDENTITY CASCADE of all app tables), used in integration `beforeEach`/`beforeAll` |
| seed | `prisma/seed/index.ts` | runs seeders in order; each seeder uses `upsert` by natural key; `--env dev|demo` flag |

Vitest: add project `integration` (`**/*.int.test.ts`, `DATABASE_URL` → test DB, `fileParallelism:
false` or one schema per worker), global setup runs `prisma migrate deploy` on the test DB.
`pnpm test` runs unit + integration; `pnpm test:unit` / `pnpm test:int` individually.

Prisma 7+ notes: configuration may live in `prisma.config.ts`, and the client generator/output
path differs from older versions — follow the current Prisma docs, not memory.

## 4. Tasks

- [x] **T1** — Install Prisma; `prisma/schema/base.prisma` + `platform.prisma` (`SystemSetting`);
      first migration. (AC-1, AC-9)
- [x] **T2** — `src/lib/db/client.ts`, `transaction.ts`, `settings.ts` + unit tests where pure. (AC-2, AC-5)
- [x] **T3** — Scripts in package.json; entrypoint runs `migrate deploy`. (AC-3, AC-4)
- [x] **T4** — Seed runner + example idempotent seeder (default settings). (AC-6)
- [x] **T5** — Test DB: `sekretari_test` created by postgres init script (dev only), Vitest
      integration project, `resetDatabase()`; integration test for settings. (AC-7)
- [ ] **T6** — Health route DB check. (AC-8)
- [ ] **T7** — Document `db:*` commands in README and CLAUDE.md if they differ.

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-5 | integration | throwing inside `withTransaction` rolls back a `SystemSetting` write |
| AC-6 | integration | run seed twice → row counts equal |
| AC-7 | integration | data written in test file A is absent in test file B |
| AC-8 | integration | health returns 503 when the Prisma client can't connect (pointed to wrong port) |

## 6. Definition of done

- [ ] All tasks ticked; `pnpm test` runs unit + integration green locally and in CI (CI gets a
      Postgres service container)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
