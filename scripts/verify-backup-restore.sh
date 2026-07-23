#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${PGHOST:?PGHOST must be set}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
dump="$(mktemp --suffix=.dump)"
db="vyra_restore_${RANDOM}_${RANDOM}"
cleanup(){ dropdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --if-exists --force "$db" >/dev/null 2>&1 || true; rm -f "$dump"; }
trap cleanup EXIT
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$dump"
pg_restore --list "$dump" >/dev/null
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$db"
pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$db" --no-owner --no-acl "$dump"
expected="$(psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
actual="$(psql --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$db" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
test "$expected" -gt 0
test "$expected" = "$actual"
printf 'backup restore verified: %s tables\n' "$actual"
