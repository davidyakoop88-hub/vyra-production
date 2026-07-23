#!/usr/bin/env bash
set -euo pipefail
: "${VYRA_API_IMAGE:?Set immutable VYRA_API_IMAGE (prefer digest)}"
: "${VYRA_WEB_IMAGE:?Set immutable VYRA_WEB_IMAGE (prefer digest)}"
: "${VYRA_DOMAIN:?Set VYRA_DOMAIN}"
: "${DATABASE_URL:?Secret manager must inject DATABASE_URL}"
: "${BACKUP_DIR:?Set an encrypted, access-controlled BACKUP_DIR}"
case "$VYRA_API_IMAGE $VYRA_WEB_IMAGE" in *:latest*) echo "latest image tags are forbidden" >&2; exit 1;; esac
node scripts/production-preflight.js
mkdir -p .deploy
if [ -f .deploy/current-images ]; then cp .deploy/current-images .deploy/previous-images; fi
printf 'VYRA_API_IMAGE=%q\nVYRA_WEB_IMAGE=%q\n' "$VYRA_API_IMAGE" "$VYRA_WEB_IMAGE" > .deploy/current-images
backup="$(scripts/backup-postgres.sh "$BACKUP_DIR/vyra-predeploy-$(date -u +%Y%m%dT%H%M%SZ).dump")"
sha256sum "$backup" > "$backup.sha256"
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml run --rm migrate
docker compose -f docker-compose.production.yml up -d --no-deps api
docker compose -f docker-compose.production.yml up -d --no-deps web
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "https://${VYRA_DOMAIN}/health/ready" >/dev/null; then
    printf 'production deployment healthy\n'; exit 0
  fi
  sleep 2
done
echo "deployment health check failed; run scripts/rollback-production.sh" >&2
exit 1
