#!/usr/bin/env bash
set -euo pipefail
test -f .deploy/previous-images || { echo "No previous image record" >&2; exit 1; }
source .deploy/previous-images
: "${VYRA_API_IMAGE:?Previous API image missing}"
: "${VYRA_WEB_IMAGE:?Previous web image missing}"
export VYRA_API_IMAGE VYRA_WEB_IMAGE
docker compose -f docker-compose.production.yml up -d --no-deps api web
printf 'rollback started with previous immutable images\n'
