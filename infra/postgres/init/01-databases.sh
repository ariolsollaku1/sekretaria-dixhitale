#!/bin/bash
# Runs once, when the pgdata volume is first initialized. Creates the app and Keycloak databases
# with separate owners so a compromised app credential cannot read Keycloak's data (AC-2).
set -euo pipefail

: "${APP_DB_NAME:?}" "${APP_DB_USER:?}" "${APP_DB_PASSWORD:?}"
: "${KC_DB_NAME:?}" "${KC_DB_USER:?}" "${KC_DB_PASSWORD:?}"

create_db() {
  local db="$1" user="$2" password="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v db="$db" -v usr="$user" -v pw="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'usr', :'pw') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'usr') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL
}

create_db "$APP_DB_NAME" "$APP_DB_USER" "$APP_DB_PASSWORD"
create_db "$KC_DB_NAME" "$KC_DB_USER" "$KC_DB_PASSWORD"
