#!/usr/bin/env bash
# Post-deploy verification for a staging environment running PR #39's branch.
#
# Checks the mechanical half of the staging plan — the parts that do not need a live TikTok stream.
# Everything it asserts is something that has silently been wrong in this project before:
# a health check that reported green through an outage, a readiness path that did not exist, a
# capacity limit that two concurrent requests could both pass.
#
#   API_URL=https://vyra-staging.up.railway.app \
#   MANAGER_URL=https://vyra-manager-staging.up.railway.app \
#   ./scripts/verify-staging.sh
#
# Optional, for the checks that need a session:
#   SESSION_COOKIE='vyra_session=...' WORKSPACE_ID=... ./scripts/verify-staging.sh
#
# Exit code is non-zero if any check fails, so it can gate a promotion step.
set -uo pipefail

API_URL="${API_URL:?set API_URL}"
MANAGER_URL="${MANAGER_URL:?set MANAGER_URL}"
EXPECTED_MAX="${MAX_BRIDGES:-5}"

pass=0; fail=0
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

get()      { curl -sS -m 15 "$1"; }
status_of() { curl -sS -m 15 -o /dev/null -w '%{http_code}' "$1"; }

head "1. API health"
body=$(get "$API_URL/api/health")
echo "     $body"
[ "$(echo "$body" | grep -c '"postgres":true')" = 1 ] && ok "postgres up" || bad "postgres not up"
[ "$(echo "$body" | grep -c '"redis":true')" = 1 ]    && ok "redis up"    || bad "redis not up"
# The write probe is the whole point: SELECT 1 reported green through the login outage.
if echo "$body" | grep -q '"postgresWritable":true'; then
  ok "postgres is WRITABLE (probe wrote and rolled back)"
else
  bad "postgres not writable — this is the state that broke login; check /health/ready for the reason"
fi

head "2. API readiness — both spellings must answer"
for path in /health/ready /api/health/ready; do
  code=$(status_of "$API_URL$path")
  if [ "$code" = 200 ]; then ok "$path -> 200"
  else bad "$path -> $code   $(get "$API_URL$path")"; fi
done

head "3. Manager liveness (must be shallow, must survive a database blip)"
code=$(status_of "$MANAGER_URL/health")
[ "$code" = 200 ] && ok "/health -> 200" || bad "/health -> $code"

head "4. Manager capacity view"
st=$(get "$MANAGER_URL/status")
echo "     $st"
# Guard every field check on having actually received a status body. Parsing an empty response with
# ${var:-0} silently yields 0, which reported "nobody is queued" against a server that was not even
# reachable — a verification script that passes when the service is down is worse than none.
if ! echo "$st" | grep -q '"activeBridges"'; then
  bad "no parseable /status body — manager unreachable or not serving; skipping its field checks"
else
actual_max=$(echo "$st" | sed -n 's/.*"maxBridges":\([0-9]*\).*/\1/p')
if [ "$actual_max" = "$EXPECTED_MAX" ]; then
  ok "maxBridges=$actual_max matches the API's MAX_BRIDGES"
else
  bad "maxBridges=$actual_max but MAX_BRIDGES=$EXPECTED_MAX — the two services disagree, which is exactly what makes the limit unenforceable"
fi
if echo "$st" | grep -q '"lastSyncError":null'; then
  ok "manager is reaching Postgres"
else
  bad "manager cannot reach Postgres: $(echo "$st" | sed -n 's/.*"lastSyncError":"\([^"]*\)".*/\1/p')"
fi
waiting=$(echo "$st" | sed -n 's/.*"waitingCount":\([0-9]*\).*/\1/p')
active=$(echo "$st" | sed -n 's/.*"activeBridges":\([0-9]*\).*/\1/p')
restarts=$(echo "$st" | sed -n 's/.*"restarts":\([0-9]*\).*/\1/p')
echo "     aktiva=$active  väntande=$waiting  omstarter=$restarts"
[ "${waiting:-0}" = 0 ] && ok "nobody is queued" || bad "$waiting connection(s) refused — raise MAX_BRIDGES or the plan"
fi

head "5. Manager must NOT be reachable as a public API"
code=$(status_of "$MANAGER_URL/api/auth/login")
[ "$code" = 404 ] && ok "unknown path 404s cleanly" || bad "unexpected $code — is the manager exposing more than health/status?"

head "6. Capacity refusal (needs SESSION_COOKIE + WORKSPACE_ID)"
if [ -n "${SESSION_COOKIE:-}" ] && [ -n "${WORKSPACE_ID:-}" ]; then
  resp=$(curl -sS -m 15 -w '\n%{http_code}' -X PUT \
    -H 'content-type: application/json' -H "cookie: $SESSION_COOKIE" \
    -d '{"username":"capacity_probe_account"}' \
    "$API_URL/api/workspaces/$WORKSPACE_ID/tiktok-connection")
  code=$(echo "$resp" | tail -1); payload=$(echo "$resp" | head -n -1)
  echo "     $code $payload"
  case "$code" in
    200) ok "slot granted (fleet not full)";;
    503) echo "$payload" | grep -q 'live-platser' \
           && ok "refused WITH a readable message, not a silent queue" \
           || bad "503 but no user-facing message";;
    409) ok "duplicate account refused explicitly";;
    *)   bad "unexpected $code";;
  esac
else
  printf '     \033[33mHOPPAS ÖVER\033[0m — sätt SESSION_COOKIE och WORKSPACE_ID\n'
fi

head "Resultat"
printf '  %d godkända, %d underkända\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
