#!/usr/bin/env bash
# PLT-02 smoke test: brings the dev infra up, waits for healthchecks, checks Keycloak and the
# database isolation rules. Uses whatever .env is present. Exit code 0 = all good.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

docker compose --profile dev up -d --wait --wait-timeout 240

echo "• keycloak master realm"
curl -fsS "http://127.0.0.1:${KEYCLOAK_PORT:-8080}/realms/master" >/dev/null

echo "• app user reaches its own database"
docker compose exec -T -e PGPASSWORD="$APP_DB_PASSWORD" db \
  psql -h 127.0.0.1 -U "$APP_DB_USER" -d "$APP_DB_NAME" -tAc "select 1" >/dev/null

echo "• app user cannot reach the keycloak database"
if docker compose exec -T -e PGPASSWORD="$APP_DB_PASSWORD" db \
  psql -h 127.0.0.1 -U "$APP_DB_USER" -d "$KC_DB_NAME" -tAc "select 1" >/dev/null 2>&1; then
  echo "FAIL: app user can connect to the keycloak database" >&2
  exit 1
fi

echo "• TZ is Europe/Tirane on every service"
for svc in db keycloak gotenberg mailpit; do
  tz=$(docker compose exec -T "$svc" printenv TZ)
  [ "$tz" = "Europe/Tirane" ] || { echo "FAIL: $svc TZ=$tz" >&2; exit 1; }
done

echo "infra smoke: OK"
