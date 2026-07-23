# VYRA Cloud API

Production-oriented authentication and workspace foundation. The existing desktop/local mode keeps
working without it. When `/api/auth/config` is served by this API, Studio activates the login gate.

## Local setup

1. Create PostgreSQL and apply `schema.sql`.
2. Copy `.env.example` to `.env` in your deployment platform and set real values.
3. Run `npm ci`, then `npm test`, then `npm start`.
4. Put the API behind HTTPS and serve the VYRA frontend from the exact `APP_ORIGIN`.

Do not expose a development database, commit `.env`, disable secure cookies, or change
`SameSite=Strict` without a reviewed cross-site authentication design.

## Current API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET/POST /api/workspaces/:workspaceId/overlays`
- `GET/PUT /api/workspaces/:workspaceId/overlays/:overlayId`

Sessions are random opaque tokens. Only their SHA-256 digests are stored. Passwords use salted
scrypt. Every workspace read/write checks membership on the server. Overlay updates use optimistic
version checks to prevent one open editor from silently overwriting another. Studio autosaves a
debounced cloud copy, keeps an offline queue, and requires an explicit choice before the first
local/online merge. HTTP 409 opens a conflict choice instead of overwriting data.

## Scaling path

- Run multiple stateless API instances behind a load balancer.
- Use managed PostgreSQL with connection pooling and point-in-time recovery.
- Put live-event ingestion on a separate service and queue (Redis Streams, NATS, or managed Kafka).
- Deliver overlay events through WebSocket/SSE gateways; do not poll PostgreSQL per viewer.
- Store uploaded media in object storage with signed URLs and CDN delivery.
- Add per-workspace quotas, audit retention, metrics, alerts, dependency scanning, and secret rotation.
- Run migration, integration, load, backup-restore, and penetration tests before public launch.

The container, PostgreSQL and reverse-proxy setup is documented in
`../docs/PRODUCTION_DEPLOYMENT.md`.
