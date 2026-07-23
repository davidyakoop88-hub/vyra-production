# VYRA release gates

A production release is blocked unless every gate passes:

1. Unit, security and billing tests pass.
2. Every JavaScript file parses under the production Node version.
3. `npm audit --omit=dev --audit-level=high` reports no high or critical issue.
4. The schema applies twice to prove idempotency.
5. PostgreSQL and Redis readiness returns HTTP 200.
6. A fresh database backup restores into an empty database with the same table count.
7. The k6 smoke profile stays below 1% errors, 300 ms p95 and 800 ms p99 at 500 virtual users.
8. A staging Stripe Test Clock run covers trial, renewal, payment failure, cancellation and resume.
9. A human verifies OBS transparency, media playback and the primary TikTok event flow.
10. `node scripts/production-preflight.js` passes with secret-manager values.
11. The production web artifact contains `index.html`, `studio.html` and live assets but no
    `server/`, `scripts/`, `docs/`, `electron-app/`, `tiktok-bridge/` or test trees.
12. Deployment uses immutable images, creates a checksummed pre-deploy backup and has a tested
    previous-image rollback record.

## One-command release report

Run the complete local gate from the project root:

```powershell
node scripts/release-gate.js
```

The command writes `.deploy/release-gate-report.json`. Exit code `0` means every gate has
evidence and the release is ready. Exit code `1` means a local check failed. Exit code `2`
means the local build passed but the release is intentionally blocked until production,
Stripe, signed Windows and real OBS/TikTok LIVE evidence has been collected. A blocked
result must never be treated as a successful public release.

Run the load profile against staging, never the public production URL:

```powershell
docker run --rm -i -e VYRA_BASE_URL=https://staging.example.com grafana/k6 run - < tests/load/api-smoke.js
```

Backups are only considered valid after restore verification. Retain encrypted daily backups according to the hosting provider's retention policy and run a scheduled restore drill at least monthly.
