# Backup, restore and data export (PLT-13)

Answers SRC-150 (backups in soft copy, data kept safely) and SRC-151 (data convertible to standard
programmes). Hosting is the client's concern (Q-26); the split of work is in Q-65…Q-69.

| Layer | Who | What |
|---|---|---|
| Full export (ZIP: CSV + JSON Lines + files + manifest) | the application | nightly 02:30 Europe/Tirane, newest 7 kept, `/admin/backups` (sysadmin) |
| Integrity check (files vs. recorded SHA-256, retained exports vs. their hash) | the application | Sundays 04:00, `/admin/backups` |
| Database dump + files archive, retention 7 daily / 4 weekly / 12 monthly | the operator, from cron | `scripts/backup.sh` |
| Off-site copy (inside the EU) and encryption | the operator | not provided by the app (Q-67) |
| Restore | the operator | `scripts/restore.sh`, this runbook |

## What the application does

- **Full export** (`plt.backup.export`): one ZIP in `<FILES_DIR>/exports/`:
  `csv/<table>.csv`, `jsonl/<table>.jsonl` (one JSON object per line), `files/<id>-<name>`,
  `manifest.json` (row counts and SHA-256 of every entry, status of every file) and `README.txt`.
  All tables are read in one repeatable-read snapshot. Sessions, accounts, verification tokens,
  calendar feed tokens, rate-limit hits, job-system tables and the run log are left out. A new table
  is exported automatically. Dates are UTC.
- **Integrity check** (`plt.backup.integrity`): every non-deleted stored file must exist with the
  SHA-256 recorded at upload; every retained export must match the hash of its run. A problem makes
  the run `failed` and shows a banner on `/admin/backups`.
- A sysadmin can start both from `/admin/backups` and download a retained export (audited:
  `plt.backup.request`, `plt.backup.export`, `plt.backup.integrity`, `plt.backup.download`).
- The export contains **all personal data**. Treat the ZIP like the database: restrict access,
  encrypt the disk or the copy you keep, delete copies you no longer need.

## Host backup (operator)

```bash
BACKUP_DIR=/srv/backups/logos scripts/backup.sh      # from cron, e.g. daily 01:30
```

Requirements: Docker Compose stack running (`db` and `app` services), `.env` next to the compose file.
Result: `<BACKUP_DIR>/daily/<stamp>/{db-<name>-<stamp>.dump, files-<stamp>.tar.gz, SHA256SUMS-<stamp>}`,
copied to `weekly/` on Sundays and `monthly/` on the 1st; older sets are pruned. A non-zero exit
means the set is incomplete and was not kept: make cron e-mail or alert on it, and **copy the folder
off-site** (rsync/rclone to a second EU location) and check the copy now and then.

Tested overrides for other layouts: `DB_EXEC`, `FILES_CMD`, `DB_NAMES`, `KEEP_DAILY/WEEKLY/MONTHLY`
(see the header of the script).

## Restore (operator)

Restore never overwrites: it creates a new database and fills an empty folder, so the running system
stays intact until you switch.

```bash
scripts/restore.sh /srv/backups/logos/daily/20261024-013000 sekretari_restored /srv/restore/files
```

1. Checks `SHA256SUMS`, creates the database, `pg_restore`s the dump (`--no-owner`), extracts the
   files archive.
2. **Verifies** every non-deleted stored file against the SHA-256 in `stored_files` and prints row
   counts. Exit code 1 = do not go live with this set; try the previous one.
3. Go live: grant the app role on the restored database
   (`GRANT ALL ON ALL TABLES IN SCHEMA public TO <app role>;` and the same for sequences, and the
   `pgboss` schema if present), point `DATABASE_URL` at it and `FILES_DIR` / the `files` volume at the
   restored folder, start the app, open `/admin/backups` and run an **integrity check**.
4. Keycloak has its own database (`KC_DB_NAME`), dumped by the same script; restore it the same way
   (`pg_restore` into an empty database) when the identity provider was lost too.

Assumed recovery targets (Q-66): at most 24 hours of data lost, back in service within one working day.

## Restore drill

Do this after the first deployment and every quarter: run `scripts/restore.sh` on the newest set into
a scratch database, compare the printed counts with the production system, then drop the scratch
database. A backup that was never restored is not a backup.

## Open points for the client (non-blocking)

Q-65 export contents, Q-66 frequency and retention, Q-67 off-site/encryption/who runs the script,
Q-68 who is alerted, Q-69 who may export. A CI job that restores a dump into a fresh database is
not part of this feature (needs the client's pipeline).
