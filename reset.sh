#!/usr/bin/env bash
# Start over: an empty database (schema + the two coupons) and an empty Redis.
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T db psql -U quickplate -d quickplate -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T db psql -U quickplate -d quickplate -q -v ON_ERROR_STOP=1 < db/001_init.sql
docker compose exec -T redis redis-cli FLUSHALL >/dev/null
echo "Database and Redis are empty again."
