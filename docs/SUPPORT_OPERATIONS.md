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
