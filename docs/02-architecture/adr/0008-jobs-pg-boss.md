# ADR-0008 — Background jobs with pg-boss

- **Status:** Accepted (2026-10-03)

## Context

We need scheduled and asynchronous work: payment reminders two weeks before installments
(SRC-086), contract-expiry lists (SRC-061), sending emails, generating bulk PDFs, nightly checks.

## Decision

- Use **pg-boss** (job queue + cron on PostgreSQL). No Redis.
- Workers run **inside the app container** as a separate process started alongside the Next.js
  server (same image, different command: `node worker.js`), so the web process is not blocked.
- Jobs are idempotent and keyed (e.g. `reminder:<installmentId>:<dueDate>`) so retries don't send
  duplicates.

## Consequences

- No extra infrastructure; jobs are transactional with business data if needed.
- Throughput is far beyond what one college needs.

## Alternatives considered

- BullMQ + Redis — extra service for no gain at this scale.
- OS cron calling API routes — no retries/visibility.

## Implementation notes (PLT-12)

- The worker runs **embedded** in the Next.js server process (started from `instrumentation.ts`) rather
  than as a separate `node worker.js`: bundling the TypeScript sources, Prisma client and path aliases
  into a second entry point would add build machinery for no benefit at this scale. `JOBS_WORKER=off`
  makes a process publisher-only, so a dedicated worker container can be introduced later without
  code changes (it would run the same app with the worker enabled and no traffic routed to it).
- Queues use the `exclusive` policy and every enqueue needs an idempotency key
  (`reminder:<installmentId>:<dueDate>` style), as this ADR asked.
- pg-boss 12 manages its own `pgboss` schema inside the application database.
