# PLT-13 — Backups, restore & full data export

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-02, PLT-08 (built on PLT-12 jobs and PLT-07 audit) |
| **Questions** | Q-26 (answered: hosting is the client's concern); non-blocking Q-65 (export contents), Q-66 (frequency/retention), Q-67 (off-site, encryption, who runs `pg_dump`), Q-68 (alerts), Q-69 (who may export) |
| **Source** | SRC-150 (safe storage, backups in soft copy), SRC-151 (data convertible to standard programmes) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

The institution must be able to keep backups in soft copy and to leave with its data in open
formats. The host and its off-site copies are the client's concern (Q-26, Q-67). What the
application can do itself: produce a **complete, self-describing export** (CSV and JSON Lines per
table plus the original files) on a schedule and on demand, **verify** that what is stored is intact
(files against their SHA-256, retained exports against their recorded hash), and show all of it to
the sysadmin. For the database itself it ships a **backup and restore script pair plus a runbook**
that the operator runs from cron on the host.

## 2. Requirements

### User stories

- As a **sysadmin**, I want a nightly full export that I can download, so that the institution holds
  its data outside the application.
- As a **sysadmin**, I want to start an export now and see whether the last ones and the integrity
  checks succeeded.
- As an **operator**, I want a documented dump and restore procedure, so that a lost server can be
  rebuilt.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide the job `plt.backup.export`, scheduled nightly at 02:30 Europe/Tirane, that writes one ZIP containing, for every business table, `csv/<table>.csv` (UTF-8, header row, one row per record) and `jsonl/<table>.jsonl` (one JSON object per line), plus `files/` with every stored file that is not deleted, a `manifest.json` and a `README.txt`. |
| AC-2 | THE SYSTEM SHALL read all tables of one export inside a single read-only snapshot transaction, so the export is consistent. |
| AC-3 | THE SYSTEM SHALL leave out sessions, accounts, verification tokens, calendar feed tokens, rate-limit hits, the job-system schema and the run log, and SHALL never write secrets into the export. |
| AC-4 | THE SYSTEM SHALL record in `manifest.json` the generation time, app version, and per table the row count and SHA-256 of its CSV and JSONL, and per file its id, path, size and SHA-256; a file whose object is missing or does not match its recorded hash SHALL be listed as `missing` or `corrupt` and omitted from the ZIP. |
| AC-5 | THE SYSTEM SHALL keep a run log (`BackupRun`) with kind, status (`running`, `succeeded`, `failed`), trigger, requester, start and finish time, table, row and file counts, size and SHA-256 of the ZIP; on failure only a short code, never the error text. |
| AC-6 | WHEN an export finishes, THE SYSTEM SHALL keep the newest 7 successful exports on disk and delete older ZIPs, marking their runs as purged (rows are never deleted). |
| AC-7 | THE SYSTEM SHALL provide the job `plt.backup.integrity`, scheduled every Sunday 04:00 Europe/Tirane, that checks every non-deleted stored file (object present, SHA-256 equal to the recorded one) and every retained export (ZIP present, SHA-256 equal to the run's), and records counts of problems in a `BackupRun` of kind `integrity`; the run SHALL be `failed` when any problem is found. |
| AC-8 | WHEN a sysadmin opens `/admin/backups`, THE SYSTEM SHALL show the status of the latest export and integrity check (with a warning banner if the latest of either failed or none succeeded in the last 36 hours / 8 days), the retention, and the most recent 50 runs. |
| AC-9 | WHEN a sysadmin starts an export or integrity check from the page, THE SYSTEM SHALL enqueue the job (refusing a second one while one is waiting or running) and write an audit entry. |
| AC-10 | WHEN a sysadmin downloads a retained export, THE SYSTEM SHALL stream it with safe headers and write an audit entry; unknown, failed or purged runs answer 404. |
| AC-11 | THE SYSTEM SHALL restrict viewing to `plt.backup.read` and starting / downloading to `plt.backup.manage` (both sysadmin); every completed run is audited (`plt.backup.export`, `plt.backup.integrity`). |
| AC-12 | THE SYSTEM SHALL ship `scripts/backup.sh` (database dump in custom format plus an archive of the files volume, with retention 7 daily / 4 weekly / 12 monthly) and `scripts/restore.sh` (restore into an empty database and verify row counts), documented in a runbook with the assumptions of Q-67. |

### Out of scope

Off-site copy, disk encryption and monitoring of the host script (client, Q-67); e-mail alerts
(Q-68, PLT-11 later); a CI job that restores a dump into a fresh database (needs the Docker image
of the client's pipeline — the restore script is exercised by hand and its verification step is in
the runbook); point-in-time recovery; per-person export (PLT-14).

### Assumptions

- Business tables = every table of the `public` schema except the exclusions of AC-3 and Prisma's
  migration table (Q-65). A table added by a later feature is exported automatically.
- Retention 7 and the schedules are constants in one file (Q-66).
- Exports hold personal data: they are sysadmin-only, audited, and live on the `files` volume under
  `exports/`, which the host backup already covers (Q-67, Q-69).

## 3. Design

### Data model

```prisma
enum BackupRunKind { EXPORT INTEGRITY }
enum BackupRunStatus { RUNNING SUCCEEDED FAILED }

model BackupRun {
  id            String          @id @default(cuid(2))
  kind          BackupRunKind
  status        BackupRunStatus @default(RUNNING)
  requestedById String?         // null = scheduled
  startedAt     DateTime        @default(now())
  finishedAt    DateTime?
  tableCount    Int             @default(0)
  rowCount      Int             @default(0)
  fileCount     Int             @default(0)
  problemCount  Int             @default(0)
  sizeBytes     BigInt?
  sha256        String?
  fileName      String?         // exports/<fileName> on the files volume
  purgedAt      DateTime?
  errorCode     String?
  @@index([kind, startedAt])
}
```

Table `backup_runs`; a trigger is not needed (no personal data; runs are never deleted by code).
Update [domain-model.md](../../02-architecture/domain-model.md).

### Permissions

| Permission | Granted to |
|---|---|
| `plt.backup.read`, `plt.backup.manage` | sysadmin |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/lib/backup/manifest.ts`, `csv.ts` | pure: CSV encoding, manifest building, retention selection, table filter |
| service | `src/lib/backup/export.service.ts` | `runExport(run)`: snapshot read, streaming ZIP (fflate) to `exports/`, hash, retention |
| service | `src/lib/backup/integrity.service.ts` | `runIntegrity(run)` |
| jobs | `src/lib/backup/jobs.ts` | `plt.backup.export`, `plt.backup.integrity` |
| query | `src/lib/backup/queries.ts` | status summary, recent runs |
| action | `startExportAction`, `startIntegrityAction` | permission, enqueue, audit |
| route | `GET /api/admin/backups/[id]` | download, permission, audit |
| scripts | `scripts/backup.sh`, `scripts/restore.sh` | host-side dump and restore |

### UI

`/admin/backups` (sysadmin): status cards for the latest export and integrity check, warning banner,
buttons "Run export now" / "Run integrity check now", runs table with download link. Nav: System → "Backups".

### Edge cases & errors

- A job crash leaves a `RUNNING` run: the next run of the same kind marks older `RUNNING` runs
  failed (`INTERRUPTED`). A partial ZIP is removed.
- Empty tables still get a CSV with the header row.
- CSV: values are the Postgres text form; `null` is an empty field; fields with comma, quote,
  CR/LF are quoted. Cells starting with `=`, `+`, `-`, `@` are **not** altered (this is a data
  export, not a spreadsheet report), noted in the README.
- Disk full or storage error: run `failed`, code `STORAGE`.

**Implementation notes:**
- Tables are discovered from `information_schema` (public schema) and paged by `ctid`, so no key or
  sort column is needed; CSV values are the Postgres text form (session time zone UTC), JSONL rows
  come from `row_to_json`, so numbers keep their exact digits. The ZIP is streamed with fflate to
  `<FILES_DIR>/exports/export-<stamp>-<rand>.zip` (written as `.part`, renamed when complete).
- Jobs run with `retryLimit: 0` (a failed export is visible and can be started again); a manual
  start enqueues with the key `manual`, so a second click while one is waiting or running is refused.
  The run row is created by the job, so a manual run appears on the page once the worker picks it up.
- An integrity run with problems is `failed` (banner on the page) but the job itself completes.
- The shared test guard accepts database names like `sekretari_test_<id>` (`_test` followed by an
  optional suffix) so parallel worktrees can have their own test database.

## 4. Tasks

- [x] **T1** — Model + migration, permissions, nav, env/constants, domain helpers (CSV, manifest, retention, table filter) with unit tests. (AC-3, AC-4, AC-6, AC-11)
- [x] **T2** — Export service and job with integration tests (real Postgres, temp storage; unzip and verify content). (AC-1..AC-6)
- [x] **T3** — Integrity service and job with integration tests. (AC-7)
- [x] **T4** — Queries, actions, download route, `/admin/backups` page, i18n sq + en. (AC-8..AC-11)
- [x] **T5** — `scripts/backup.sh`, `scripts/restore.sh`, runbook, docs, e2e. (AC-12, all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-4 | integration | seed rows + a file; run export; unzip: CSV/JSONL per table, file bytes, manifest hashes match |
| AC-2 | integration | export runs in a repeatable-read transaction (rows inserted during the export are absent) |
| AC-3 | integration | no `sessions`, `accounts`, `verifications`, `backup_runs` in the ZIP; unit: table filter |
| AC-4 | integration | missing and corrupt file are listed in the manifest and omitted |
| AC-5 | integration | run log counts, size, hash; failure stores only a code |
| AC-6 | unit + integration | retention keeps newest 7, purges older ZIPs and marks runs |
| AC-7 | integration | integrity finds a missing/modified file and a tampered export; passes on a clean set |
| AC-8..AC-11 | integration + e2e | page lists runs, start enqueues and audits, second start refused, download streams and audits, secretary 403, purged 404 |
| AC-12 | manual | both scripts run against the dev Postgres container: backup set, restore into a new database, refusal to overwrite, verification failure on a corrupted file |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, deployment.md, runbook)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
