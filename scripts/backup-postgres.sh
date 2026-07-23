#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
output="${1:-./backups/vyra-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$output")"
tmp="${output}.partial"
trap 'rm -f "$tmp"' EXIT
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$tmp"
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$output"
trap - EXIT
printf '%s\n' "$output"

