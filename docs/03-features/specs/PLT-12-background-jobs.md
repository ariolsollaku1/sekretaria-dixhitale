# PLT-12 — Background jobs & scheduler

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-03 |
| **Questions** | none. Working decision (deviation from ADR-0008's wording, recorded there): the worker runs **inside the app process** by default and can be switched off with `JOBS_WORKER=off` so a dedicated worker process can be added later |
| **Source** | SRC-061 (contract-expiry list), SRC-086 (reminders two weeks before each installment) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Payment reminders, contract-expiry lists, e-mails, bulk PDFs and nightly clean-ups need work that
runs later or repeatedly ([ADR-0008](../../02-architecture/adr/0008-jobs-pg-boss.md): **pg-boss**
on PostgreSQL, no Redis). This feature provides the runtime: a registry where modules declare
jobs (handler, retries, optional cron), idempotent enqueueing, a worker that runs them, and a
sysadmin dashboard to see runs and retry failures. It also schedules PLT-08's orphan-file clean-up
as the first real job.

## 2. Requirements

### User stories

- As a **developer**, I want to declare a job and enqueue it with an idempotency key, so that
  retries never send a reminder twice.
- As a **developer**, I want to declare a cron job, so that nightly work needs no operator action.
- As a **sysadmin**, I want to see recent runs and failures and retry a failed job, so that I can
  keep the system healthy without database access.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL let modules declare jobs with `defineJob({ name, handler, retryLimit?, retryDelaySeconds?, retryBackoff?, expireInSeconds?, concurrency?, cron?, cronData? })`, where `name` is `<module>.<job>` and is unique. |
| AC-2 | WHEN the application starts with `JOBS_WORKER` not `off`, THE SYSTEM SHALL start pg-boss on the application database (schema `pgboss`), create each declared queue with its retry/expiry settings, start a worker per job, and register each cron schedule in the `Europe/Tirane` time zone. |
| AC-3 | THE SYSTEM SHALL provide `enqueue(name, data, { singletonKey?, startAfter? })` usable from server code, which creates the job and returns its id; WHEN the same `singletonKey` is enqueued again while the job is still pending or active, THE SYSTEM SHALL not create a second job. |
| AC-4 | WHEN a handler throws, THE SYSTEM SHALL retry the job up to `retryLimit` times with the configured delay and optional backoff, and mark it failed afterwards. |
| AC-5 | THE SYSTEM SHALL never persist or log the text of a handler's error (it may contain personal data): the stored failure output is the error's class name and a short code only, and logs contain job name, job id and attempt number. |
| AC-6 | WHERE `JOBS_WORKER=off`, THE SYSTEM SHALL still allow enqueueing (the publisher side) but SHALL NOT process jobs or register schedules. |
| AC-7 | WHEN a sysadmin opens `/admin/jobs`, THE SYSTEM SHALL show every declared queue with its counts (waiting, active, failed) and schedule, and the most recent 100 jobs (name, state, attempts, created, started, finished) with a filter by state and queue. |
| AC-8 | WHEN a sysadmin retries a failed job, THE SYSTEM SHALL requeue it and write an audit entry; retrying a job that is not failed SHALL be refused. |
| AC-9 | THE SYSTEM SHALL ship the job `plt.files.cleanup-orphans`, scheduled nightly at 03:00 Europe/Tirane, which runs PLT-08's `cleanupOrphans` and logs the number removed. |
| AC-10 | THE SYSTEM SHALL restrict the dashboard to `plt.jobs.read` and retrying to `plt.jobs.manage` (both sysadmin). |
| AC-11 | IF the database or pg-boss cannot start, THEN THE SYSTEM SHALL log it (no personal data) and keep serving web requests; enqueueing in that state SHALL fail with a typed error rather than silently dropping the job. |

### Out of scope

A separate worker container (the `JOBS_WORKER=off` switch prepares it), job priorities and
flows/dependencies, a UI to create ad-hoc jobs, e-mail sending (PLT-11), reminder jobs themselves
(FIN-04, HR-03 declare theirs), metrics export.

### Assumptions

- One application instance for now; pg-boss makes several safe (only one worker takes a job, one
  node schedules each cron tick).
- pg-boss creates and migrates its own schema (`pgboss`) inside the application database; the
  application user owns that database (PLT-02), so it may create the schema.
- Job payloads hold ids and codes only (the personal-data rule applies to payloads too).

## 3. Design

### Data model

No Prisma models: pg-boss owns the `pgboss` schema. The dashboard reads `pgboss.job` through a
single raw query and pg-boss's own API for queues and schedules.

### Permissions

| Permission | Granted to |
|---|---|
| `plt.jobs.read`, `plt.jobs.manage` | sysadmin |

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/lib/jobs/registry.ts` | `defineJob`, `listJobs`, name and option validation (pure) |
| lib | `src/lib/jobs/runtime.ts` | `createJobsRuntime({ boss options, enabled })`: `start`, `stop`, `enqueue`, queue/worker/schedule setup, error sanitising |
| lib | `src/lib/jobs/index.ts` | process-wide runtime (`startJobs`, `stopJobs`, `enqueue`) |
| lib | `src/lib/jobs/all.ts` | imports each module's job declarations (one import per module) |
| jobs | `src/lib/files/jobs.ts` | `plt.files.cleanup-orphans` |
| query | `src/lib/jobs/dashboard.ts` | queue overview, recent jobs |
| action | `retryJobAction` | wrapper-based, audited |
| bootstrap | `src/instrumentation.ts` | `startJobs()` in the Node runtime |

### UI

`/admin/jobs` (sysadmin): queue table (name, schedule, waiting / active / failed), recent-jobs table
with state filter, retry button on failed rows. Nav: System → "Jobs".

### Edge cases & errors

- Hot reload in development must not start a second runtime: the runtime is cached on `globalThis`.
- Several jobs enqueued before `start()` finished wait for it (the runtime serialises start-up).
- A cron schedule whose job was removed from the code is unscheduled on start.
- Shutdown (`SIGTERM`) stops fetching and waits briefly for active jobs.
- Time zone: cron expressions are interpreted in `Europe/Tirane`.

## 4. Tasks

- [x] **T1** — Dependency, permissions, `JOBS_WORKER` env, job registry with validation and unit tests. (AC-1, AC-10)
- [x] **T2** — Runtime: start/stop, queues, workers, schedules, enqueue, error sanitising; integration tests with a real pg-boss. (AC-2..AC-6, AC-11)
- [x] **T3** — Nightly file clean-up job; start from `instrumentation.ts`. (AC-9, AC-2)
- [ ] **T4** — Dashboard queries, page, retry action with audit; nav, i18n. (AC-7, AC-8)
- [ ] **T5** — E2E for the dashboard, docs (ADR-0008 note, README). (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | unit | invalid names, duplicates, bad cron, option ranges rejected |
| AC-2 | integration | declared job runs when enqueued; schedule registered with cron and time zone |
| AC-3 | integration | same `singletonKey` twice → one execution; different keys → two |
| AC-4 | integration | fails once then succeeds on retry; after the limit the job is failed |
| AC-5 | integration | handler throws an error containing an e-mail address → stored output and logs do not contain it |
| AC-6 | integration | disabled runtime enqueues but nothing runs, no schedules |
| AC-7, AC-8 | integration + e2e | dashboard query lists failed job; retry requeues it and audits; retrying a completed job is refused; secretary gets 403 |
| AC-9 | integration | the clean-up job is declared with the nightly cron and removes old pending files when run |
| AC-11 | unit | start failure is reported, enqueue then throws `JobsUnavailableError` |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (ADR-0008 implementation note, README)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
