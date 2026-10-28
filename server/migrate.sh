#!/usr/bin/env bash
# Applies server/migrations/*.sql not yet recorded in schema_migrations, each in its own transaction.
set -euo pipefail
cd "$(dirname "$0")"
psql() { docker exec -i expense-postgres psql -v ON_ERROR_STOP=1 -q -At -U expense -d expense_management "$@"; }

psql -c "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
# 001/002 were applied by hand before this runner existed
if [ "$(psql -c "select to_regclass('public.users') is not null")" = t ]; then
  psql -c "insert into schema_migrations (name) values ('001_schema.sql'), ('002_perf_indexes.sql') on conflict do nothing"
fi

for f in migrations/*.sql; do
  name=$(basename "$f")
  [ "$(psql -c "select 1 from schema_migrations where name = '$name'")" = 1 ] && continue
  echo "applying $name"
  { cat "$f"; echo; echo "insert into schema_migrations (name) values ('$name');"; } | psql -1
done
echo "migrations up to date"
