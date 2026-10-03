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
