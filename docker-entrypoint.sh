#!/bin/bash
set -e

echo "[entrypoint] Waiting for database at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}..."
ATTEMPTS=0
until nc -z "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}"; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "[entrypoint] Database did not become reachable in time."
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] Database is reachable."

echo "[entrypoint] Applying migrations..."
npm run db:migrate

echo "[entrypoint] Starting application..."
exec npm run start
