# VYRA local security hardening

Updated: 2026-07-22

## Protections implemented

- The local server binds only to `127.0.0.1`/`localhost`.
- Mutating `/api/*` requests with a browser `Origin` are accepted only from the local VYRA origin.
- Connector requests without a browser Origin remain supported.
- Event bodies are limited to 64 KiB; state/backup bodies are limited to 5 MiB.
- API traffic is rate-limited per local client.
- Event types, names, counters, image URLs, source IDs, and deduplication keys are normalized and length-limited.
- Image fields accept only HTTP(S) or selected `data:image/*` formats; `javascript:` is rejected.
- Angle brackets and control characters are removed from live text before legacy widget renderers see it.
- Responses include `nosniff`, same-origin frame/resource policy, and no-referrer headers.
- State files and versions are written atomically.

## Verified negative tests

- A foreign website Origin receives HTTP 403.
- HTML-like live names are neutralized before storage.
- A `javascript:` image URL is removed.
- An event body larger than 64 KiB receives HTTP 413.

## Remaining boundary

This protects the current local desktop application. It is not a hosted multi-user authorization
system. Before a public hosted release, VYRA still needs server-side accounts, secure sessions,
workspace ownership checks, a database, per-user quotas, audit logs, secret management, TLS,
dependency scanning, and independent penetration testing.

Frontend code delivered to a browser cannot be made impossible to copy. Commercial protection
must combine private server-side logic, signed/licensed assets, access control, watermarking or
fingerprinting where appropriate, legal terms, and monitoring. Obfuscation alone is not security.

## Hosted account security

- New accounts receive a single-use email-verification link valid for 24 hours.
- Password-reset requests always return the same response, whether the account exists or not.
- Password-reset links expire after 30 minutes and are single-use.
- Password changes revoke every existing session and every remaining recovery token.
- Only token hashes are stored in `auth_tokens`; raw tokens never enter the database.
- Action URLs in `notification_outbox` are encrypted with AES-256-GCM and opened only by the email worker.
- Unverified accounts may sign in and resend verification, but cannot mutate cloud data, publish, or start billing.
- Sensitive authentication endpoints have a stricter IP rate limit than normal API traffic.

Generate `APP_ENCRYPTION_KEY` once per environment and keep it in the deployment secret manager:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Rotating this key invalidates queued verification and recovery links, so drain the notification outbox first.

## Two-step verification

- TOTP works with standard authenticator apps using a 30-second window and six-digit codes.
- MFA secrets are encrypted at rest with the application encryption key.
- Login creates a restricted session until the second factor succeeds; restricted sessions cannot read workspaces or mutate application data.
- Ten random recovery codes are shown once. Only their SHA-256 hashes are stored and each code is consumed atomically on use.
- Disabling MFA requires both the account password and a current TOTP or recovery code.
- New recovery codes require the account password and invalidate the previous set.
- The setup flow is available under **Inställningar → Tvåstegsverifiering** after email verification.

## Session and device control

- **Inställningar → Aktiva enheter** lists active sessions with a reduced browser/OS label, creation time, last activity and the current-device marker.
- A user can revoke one other session or every other session without exposing cookie values, token hashes or IP addresses.
- Session deletion always includes the authenticated user id, preventing cross-account revocation by guessed ids.
- New-login email is queued only after password authentication and, when enabled, a successful MFA challenge.
- The notification uses the session id as an idempotency key, so retries cannot create duplicate alerts.
- Pending MFA sessions cannot access the device list or any application data.
- Session revocations are written to the audit log.

## Automated attack protection

- Password verification runs against a precomputed dummy scrypt hash for unknown accounts, reducing timing-based account discovery.
- Known accounts receive progressive temporary lockouts after repeated failures: 30 seconds, 2 minutes, 5 minutes, then a 15-minute cap.
- The public error remains generic for bad credentials; a valid password receives a clear temporary-lock message only while its account is locked.
- Suspicious-login email is deduplicated to one warning per account per hour.
- Completed and failed logins plus session revocations appear in **Inställningar → Säkerhetshistorik**.
- Pending MFA sessions older than 30 minutes, expired sessions, stale one-time tokens and audit entries older than 180 days are removed by a scheduled cleanup job.

## Privacy lifecycle

- Account export streams portable JSON without password hashes, session/token hashes, encrypted MFA secrets, object-storage keys or Stripe identifiers.
- Account deletion requires the password and, when enabled, MFA. Active subscriptions are set to cancel before deletion is accepted.
- A 7-day grace period allows accidental deletion to be cancelled; cancelled subscriptions are never silently reactivated.
- At expiry, owned media objects are removed before database deletion. Owned workspaces cascade, shared uploads are detached from the deleted user, and account audit rows and queued email records are erased.
- Privacy, strictly necessary cookie usage, subscription renewal and cancellation are documented in `privacy.html` and `terms.html`.
- Before public launch, replace the policy placeholders with the registered company name, organization number and postal address, and have local counsel review the final text.
