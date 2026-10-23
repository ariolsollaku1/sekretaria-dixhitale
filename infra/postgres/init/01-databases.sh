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

# Dev only: Prisma needs a shadow database for `migrate dev`, and integration tests run against
# their own database (PLT-03). Owned by the app user so it never needs CREATEDB; never created in
# production, where CREATE_DEV_DATABASES is unset.
if [ "${CREATE_DEV_DATABASES:-false}" = "true" ]; then
  for extra in "${APP_DB_NAME}_shadow" "${APP_DB_NAME}_test"; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
      -v db="$extra" -v usr="$APP_DB_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'usr') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL
  done
fi
