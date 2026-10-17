#!/usr/bin/env bash
# Rebuilds a disposable PostgreSQL database with the Supabase shim + all migrations.
# Usage: DATABASE_URL=postgres://postgres@localhost:54329/edudigi_test scripts/db-test-setup.sh [--seed]
set -euo pipefail
DB_URL="${TEST_DATABASE_URL:-postgres://postgres@localhost:5432/edudigi_test}"
ADMIN_URL="${DB_URL%/*}/postgres"
DB_NAME="${DB_URL##*/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\" with (force)" -c "create database \"$DB_NAME\""
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/db/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
if [[ "${1:-}" == "--seed" ]]; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql"
fi
echo "Database $DB_NAME ready."
