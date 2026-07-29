# VYRA production runtime

## Production-safe path

Use `docker-compose.production.yml`, not the local development compose file. Production requires
immutable API/web images, managed PostgreSQL, managed Redis over `rediss://`, external object
storage, malware scanning, live Stripe credentials and complete signed desktop-release metadata.

Copy `.env.production.example` into the hosting platform's secret manager. Do not commit the
filled file. `NODE_ENV=production` makes the API run `production-config.js` before it opens a
network port; any placeholder, weak/reused secret, HTTP endpoint, test Stripe key, disabled media
scanner or incomplete installer metadata blocks startup.

The production web image copies only browser assets. Server source, scripts, documentation,
Electron code, connector code, tests and repository metadata are absent from `/srv`.

Deployment order:

1. Run `node scripts/production-preflight.js`.
2. Create and checksum a PostgreSQL backup.
3. Pull immutable images and run the migration as a one-shot job.
4. Start at least two API instances, then the HTTPS web proxy.
5. Require `/health/ready` to pass within 60 seconds.
6. If health fails, run `scripts/rollback-production.sh` with the recorded previous images.

This checkpoint packages the web app, API and PostgreSQL database as separate
services. Caddy is the public entry point and distributes API traffic between
the API containers.

## Start locally

```powershell
$env:POSTGRES_PASSWORD = "replace-with-a-long-random-secret"
$env:APP_ORIGIN = "http://localhost:8088"
$env:TIKTOK_INGEST_TOKEN = "another-long-random-secret"
docker compose up --build
```

Open `http://localhost:8088`. The schema is installed before the API starts and
application data is retained in the `vyra_pgdata` volume.

## Health checks

- `GET /health/live` proves that the API process can answer HTTP requests.
- `GET /health/ready` proves that the API can also reach PostgreSQL.

The reverse proxy only sends traffic to ready API instances. A failed database
connection removes an instance from rotation instead of serving partial work.

## Production requirements

- Terminate TLS at Caddy or at the cloud load balancer.
- Keep `POSTGRES_PASSWORD` and `DATABASE_URL` in a secret manager, never Git.
- Use managed PostgreSQL with automated backups and point-in-time recovery.
- Set `DATABASE_SSL=require` when the provider supplies a trusted TLS chain.
- Put uploaded media in object storage and serve it through a CDN.
- Collect JSON logs and alert on readiness failures, 5xx rates and latency.
- Back up the database before schema deployments and rehearse restores.
- Set `BACKUP_DIR` to encrypted, access-controlled storage before using the deploy script.
- Never deploy `:latest`; use an immutable version tag or image digest.

## Scaling

The API contains no in-memory login state, so it can run in parallel. Sessions,
workspaces and overlays remain in PostgreSQL. If a Docker Compose implementation
does not honor `deploy.replicas`, scale explicitly:

```powershell
docker compose up --build --scale api=2
```

Before public launch, move rate limits to a shared store such as Redis so the
limit is enforced across every API instance. This checkpoint uses Redis for
that shared limit and retains a local fallback if Redis becomes unavailable.

## TikTok event delivery

Configure the bridge with `VYRA_CLOUD_URL`, `VYRA_WORKSPACE_ID` and
`VYRA_INGEST_TOKEN`. Each event is deduplicated, appended to a bounded Redis
stream and published to connected overlays. The authenticated browser endpoint
`/api/workspaces/:workspaceId/events/stream` uses Server-Sent Events, replays
missed events from `Last-Event-ID` (only when the client actually sends one — a fresh connection
starts live-only, it isn't handed the whole event history), and sends a heartbeat every 30 seconds.

## OBS overlay links

Create a dedicated link with **Säker OBS-länk** in Studio. Only a SHA-256 hash
of its 256-bit token is stored. Owners and administrators can assign an expiry,
inspect last use, and revoke a link. Revocation blocks new requests immediately
and closes an already connected event stream at the next 30-second heartbeat.
Tokens are redacted from structured HTTP logs and are shown only once when
created. Use a separate link for every streaming computer.

## Monitoring and recovery

`GET /api/internal/metrics` returns Prometheus text metrics and requires the
separate `METRICS_TOKEN` bearer token. It reports request volume, status codes,
latency, live-event throughput, SSE connections, process uptime and memory.
Runtime guards alert when memory or event-loop delay crosses configured limits.
Redis uses a circuit breaker and local rate-limit fallback during outages.
Unhandled failures are emitted as structured fatal logs, optionally sent to
`ALERT_WEBHOOK_URL`, and shut down cleanly so the container restarts the API.

## Media storage

Studio calculates SHA-256 in the browser and requests a ten-minute signed
upload URL. The browser uploads directly to S3-compatible object storage; API
memory and bandwidth are not used for the file body. Completion verifies size,
MIME type and checksum metadata before the asset can be read. Executable and
HTML types are rejected, filenames are normalized, objects are isolated under
the workspace id, downloads expire after five minutes, and stale pending
uploads are removed after one hour. Set `CDN_ORIGIN` for immutable CDN delivery.

For public production, set `MEDIA_SCAN_REQUIRED=true` and connect the object
provider's malware-scanning workflow. Assets remain quarantined until that
scanner promotes them to `ready`; never disable this requirement for untrusted
customer uploads.

## Billing

VYRA has one offer: **VYRA Premium for USD 15 per month with a three-day free
trial**. Create that recurring monthly Price in Stripe and set its id as
`STRIPE_PRICE_MONTHLY`. Checkout receives `trial_period_days: 3`; a database
lock ensures each workspace can consume the trial only once. Subscription
webhooks are verified against the untouched raw request body and processed in
an idempotent database transaction. Quotas are checked by the server, not by
hidden buttons in the browser. The customer portal handles cancellation and
payment-method changes.

The offer renews automatically every month unless the owner cancels it. Studio
shows this next to the price and provides a direct **Säg upp abonnemang** button.
Cancellation sets `cancel_at_period_end=true`, so access remains until the end
of the trial or paid month and no later monthly renewal is collected. The owner
can undo the cancellation before that date. Stripe Checkout also validates at
runtime that the configured Price is exactly USD 15 with a one-month interval.

Billing emails are written to a transactional outbox in the same database
transaction as each Stripe event. A background worker sends them through
Resend with an idempotency key and exponential retry. Messages cover trial
start/end, successful and failed payment, scheduled cancellation, resumed
renewal and final termination. Set `RESEND_API_KEY` and a verified `EMAIL_FROM`
domain before launch.
