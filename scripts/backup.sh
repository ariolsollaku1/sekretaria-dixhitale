#!/usr/bin/env bash
# PLT-13 AC-12: nightly backup of the databases and the files volume, run from cron on the host.
#
#   BACKUP_DIR=/srv/backups/logos scripts/backup.sh
#
# Writes <BACKUP_DIR>/daily/{db-<name>-<stamp>.dump, files-<stamp>.tar.gz, SHA256SUMS-<stamp>}
# and keeps 7 daily / 4 weekly (Sundays) / 12 monthly (1st of month) sets (docs/02-architecture/deployment.md).
# Copying the folder off-site (inside the EU) and encrypting it is the operator's job (Q-67).
# Exit code != 0 means the set is incomplete and was NOT kept: make cron alert on it.
#
# Overridable for other hosts and for tests:
#   DB_EXEC     how to run a command in the database (default: docker compose exec -T db)
#   FILES_CMD   command that writes a gzip tar of the folder "files" to stdout
#               (default: docker compose exec -T app tar -C /data -cz files)
#   DB_NAMES    databases to dump (default: APP_DB_NAME and KC_DB_NAME from .env)
set -euo pipefail
cd "$(dirname "$0")/.."
# Only the settings this script needs are read from .env, and the caller's environment wins.
if [ -f .env ]; then
  while IFS='=' read -r k v; do
    [ -n "${!k:-}" ] || export "$k=$v"
  done < <(grep -E '^(APP_DB_NAME|KC_DB_NAME|POSTGRES_USER)=' .env || true)
fi

: "${BACKUP_DIR:?set BACKUP_DIR to the folder that receives the backups}"
DB_EXEC=${DB_EXEC:-docker compose exec -T db}
FILES_CMD=${FILES_CMD:-docker compose exec -T app tar -C /data -cz files}
DB_NAMES=${DB_NAMES:-"${APP_DB_NAME:-sekretari} ${KC_DB_NAME:-keycloak}"}
PG_USER=${POSTGRES_USER:-postgres}
KEEP_DAILY=${KEEP_DAILY:-7}
KEEP_WEEKLY=${KEEP_WEEKLY:-4}
KEEP_MONTHLY=${KEEP_MONTHLY:-12}

STAMP=$(date -u +%Y%m%d-%H%M%S)
WORK="$BACKUP_DIR/.work-$STAMP"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly" "$WORK"
chmod 700 "$BACKUP_DIR" "$WORK"
trap 'rm -rf "$WORK"' EXIT

for name in $DB_NAMES; do
  echo "dumping $name"
  # custom format: compressed, restorable selectively with pg_restore
  # shellcheck disable=SC2086
  $DB_EXEC pg_dump -U "$PG_USER" -Fc "$name" > "$WORK/db-$name-$STAMP.dump"
  [ -s "$WORK/db-$name-$STAMP.dump" ] || { echo "empty dump of $name" >&2; exit 1; }
done

echo "archiving files"
# shellcheck disable=SC2086
$FILES_CMD > "$WORK/files-$STAMP.tar.gz"
tar -tzf "$WORK/files-$STAMP.tar.gz" >/dev/null

(cd "$WORK" && sha256sum -- *.dump *.tar.gz > "SHA256SUMS-$STAMP" 2>/dev/null || shasum -a 256 -- *.dump *.tar.gz > "SHA256SUMS-$STAMP")

# The set is complete: publish it in one step
SET="$BACKUP_DIR/daily/$STAMP"
mkdir -p "$SET"
mv "$WORK"/* "$SET"/
echo "backup set: $SET"

[ "$(date -u +%u)" = "7" ] && cp -R "$SET" "$BACKUP_DIR/weekly/$STAMP"
[ "$(date -u +%d)" = "01" ] && cp -R "$SET" "$BACKUP_DIR/monthly/$STAMP"

prune() { # prune <folder> <keep>: delete all but the newest <keep> sets
  # shellcheck disable=SC2012
  ls -1d "$1"/*/ 2>/dev/null | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do rm -rf "$old"; done || true
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"
echo "backup: OK"
