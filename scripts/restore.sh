#!/usr/bin/env bash
# PLT-13 AC-12: restore a backup set into a NEW, empty database and folder, then verify it.
#
#   scripts/restore.sh <backup-set-folder> <new-database-name> <empty-files-folder>
#
# It never overwrites anything: the database must not exist and the folder must be empty.
# To go live afterwards, point DATABASE_URL at the restored database and FILES_DIR (or the files
# volume) at the restored folder - see docs/02-architecture/backup-restore.md.
#
# Verification: the restored database answers, every non-deleted stored file exists in the restored
# folder with the SHA-256 recorded in `stored_files`, and the row counts are printed for comparison
# with /admin/backups. Exit code != 0 = the restore is not trustworthy.
#
# Overridable (same variables as backup.sh): DB_EXEC, DB_NAMES is not used.
set -euo pipefail
cd "$(dirname "$0")/.."
# Only the settings this script needs are read from .env, and the caller's environment wins.
if [ -f .env ]; then
  while IFS='=' read -r k v; do
    [ -n "${!k:-}" ] || export "$k=$v"
  done < <(grep -E '^(APP_DB_NAME|KC_DB_NAME|POSTGRES_USER)=' .env || true)
fi

SET=${1:?usage: restore.sh <backup-set-folder> <new-database-name> <empty-files-folder>}
TARGET_DB=${2:?usage: restore.sh <backup-set-folder> <new-database-name> <empty-files-folder>}
FILES_OUT=${3:?usage: restore.sh <backup-set-folder> <new-database-name> <empty-files-folder>}
DB_EXEC=${DB_EXEC:-docker compose exec -T db}
PG_USER=${POSTGRES_USER:-postgres}
APP_DB=${APP_DB_NAME:-sekretari}

[[ "$TARGET_DB" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || { echo "invalid database name" >&2; exit 2; }
DUMP=$(ls "$SET"/db-"$APP_DB"-*.dump 2>/dev/null | head -n1 || true)
ARCHIVE=$(ls "$SET"/files-*.tar.gz 2>/dev/null | head -n1 || true)
[ -n "$DUMP" ] && [ -n "$ARCHIVE" ] || { echo "no dump or files archive in $SET" >&2; exit 2; }
if [ -d "$FILES_OUT" ] && [ -n "$(ls -A "$FILES_OUT")" ]; then
  echo "files folder $FILES_OUT is not empty" >&2; exit 2
fi

echo "checking the set's checksums"
(cd "$SET" && { sha256sum -c -- SHA256SUMS-* 2>/dev/null || shasum -a 256 -c -- SHA256SUMS-*; } >/dev/null)

# shellcheck disable=SC2086
EXISTS=$($DB_EXEC psql -U "$PG_USER" -d postgres -Atc "select 1 from pg_database where datname='$TARGET_DB'")
[ -z "$EXISTS" ] || { echo "database $TARGET_DB already exists" >&2; exit 2; }

echo "restoring database into $TARGET_DB"
# shellcheck disable=SC2086
$DB_EXEC createdb -U "$PG_USER" "$TARGET_DB"
# --no-owner: objects belong to the restoring role; grant the app role afterwards (runbook)
# shellcheck disable=SC2086
$DB_EXEC pg_restore -U "$PG_USER" -d "$TARGET_DB" --no-owner --exit-on-error < "$DUMP"

echo "restoring files into $FILES_OUT"
mkdir -p "$FILES_OUT"
tar -xzf "$ARCHIVE" -C "$FILES_OUT" --strip-components=1

echo "verifying stored files against their recorded SHA-256"
BAD=0
COUNT=0
# shellcheck disable=SC2086
while read -r key sum; do
  [ -n "$key" ] || continue
  COUNT=$((COUNT + 1))
  file="$FILES_OUT/$key"
  if [ ! -f "$file" ]; then echo "missing: $key"; BAD=$((BAD + 1)); continue; fi
  actual=$( (sha256sum "$file" 2>/dev/null || shasum -a 256 "$file") | cut -d' ' -f1)
  [ "$actual" = "$sum" ] || { echo "mismatch: $key"; BAD=$((BAD + 1)); }
done < <($DB_EXEC psql -U "$PG_USER" -d "$TARGET_DB" -Atc \
  "select storage_key || ' ' || sha256 from stored_files where deleted_at is null")

echo "row counts (compare with the source system):"
# shellcheck disable=SC2086
$DB_EXEC psql -U "$PG_USER" -d "$TARGET_DB" -Atc \
  "select 'users ' || count(*) from users union all select 'students ' || count(*) from students union all select 'audit_logs ' || count(*) from audit_logs union all select 'stored_files ' || count(*) from stored_files"

echo "files checked: $COUNT, problems: $BAD"
[ "$BAD" -eq 0 ] || { echo "restore verification FAILED" >&2; exit 1; }
echo "restore: OK"
