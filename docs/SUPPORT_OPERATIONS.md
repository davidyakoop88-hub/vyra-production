# VYRA support and incident operations

## Bootstrap the first platform administrator

Workspace roles never grant platform administration. After the operator has registered, promote the exact verified account directly in the production database using a controlled, audited database session:

```sql
UPDATE users SET is_platform_admin=true
WHERE email='verified-operator@example.com' AND email_verified_at IS NOT NULL;
```

Require MFA on every platform administrator. Remove access with the same controlled process by setting the flag to `false`. Do not expose an endpoint that lets an administrator create another administrator.

## Daily workflow

- Open `/operations.html` and review urgent/high tickets first.
- Move tickets through `open`, `in_progress`, `waiting`, `resolved`, and `closed`.
- Staff replies are permanently marked as staff messages.
- Publish an incident only when customer impact is confirmed. Use plain factual language and never include user identifiers, infrastructure secrets, or speculative causes.
- Progress an incident through investigating, identified, monitoring, and resolved.
- Verify `/status.html` after every public update.

Client error reports are URL-scrubbed, bounded, deduplicated by user and fingerprint, and never contain cookies or authentication tokens by design. They are diagnostic signals, not a replacement for server logs or alerting.

## Reset two-step verification for a locked-out customer

Use this only when a customer has lost **both** their authenticator app and their recovery codes. There is no self-service path by design.

1. **Identity check (David's decision, 2026-11-22):** the request must come by email from the **exact** address on the account. If it comes from any other address, ask the customer to write from the account's address. Do not accept screenshots, names or payment details instead.
2. Open `/operations.html` → **Återställ tvåsteg åt en kund**. Enter the customer's email, a short reason (it is stored in `audit_log`), and a fresh code from **your own** authenticator app. Tick the confirmation box and submit.
3. The server (`POST /api/admin/mfa-aterstallning`) refuses unless you are a platform administrator with two-step verification enabled and verified in this session, the code is valid, a reason is given, and the target is not your own account.
4. On success the customer's TOTP secret and recovery codes are cleared, every session of theirs is signed out, an `mfa_aterstalld_av_admin` row is written to `audit_log` (actor, target, reason, number of signed-out sessions), and the security email "Tvåstegsverifieringen är avstängd" is queued to the account address.
5. Reply to the customer: they can now sign in with their password and should turn two-step verification on again under Settings. If they did **not** ask for this, they must change their password immediately.

Covered by `server/test/mfa-aterstallning-http.test.js` against a real Postgres.
