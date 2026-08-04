#!/usr/bin/env bash
# Samples real RSS per bridge process so MAX_BRIDGES can be raised from a measurement instead of the
# 40-60 MB estimate it currently rests on. Run this INSIDE the manager container (Railway console),
# with real streams connected, for at least 60 minutes.
#
#   ./scripts/measure-bridge-memory.sh 60 > /tmp/bridge-memory.tsv
#
# Prints one tab-separated row per sample and a summary at the end. The number that matters is the
# PEAK per bridge, not the average — the OOM killer only cares about the peak.
set -uo pipefail

MINUTES="${1:-60}"
INTERVAL="${INTERVAL:-30}"
samples=$(( MINUTES * 60 / INTERVAL ))

printf 'sekund\tbridges\tmanager_mb\tbridge_total_mb\tbridge_max_mb\tbridge_avg_mb\n'

peak_each=0; peak_total=0; t=0
for _ in $(seq 1 "$samples"); do
  # RSS in kB from /proc — no external tooling, works in the alpine image.
  mgr_kb=0; tot_kb=0; max_kb=0; n=0
  for pid_dir in /proc/[0-9]*; do
    pid=${pid_dir#/proc/}
    [ -r "$pid_dir/cmdline" ] || continue
    cmd=$(tr '\0' ' ' < "$pid_dir/cmdline" 2>/dev/null)
    rss_kb=$(awk '/^VmRSS:/{print $2}' "$pid_dir/status" 2>/dev/null)
    [ -n "${rss_kb:-}" ] || continue
    case "$cmd" in
      *connection-manager.js*) mgr_kb=$rss_kb ;;
      *bridge.js*) tot_kb=$((tot_kb + rss_kb)); n=$((n+1))
                   [ "$rss_kb" -gt "$max_kb" ] && max_kb=$rss_kb ;;
    esac
  done

  avg_kb=0; [ "$n" -gt 0 ] && avg_kb=$((tot_kb / n))
  [ "$max_kb" -gt "$peak_each" ] && peak_each=$max_kb
  [ "$tot_kb" -gt "$peak_total" ] && peak_total=$tot_kb

  printf '%d\t%d\t%d\t%d\t%d\t%d\n' \
    "$t" "$n" $((mgr_kb/1024)) $((tot_kb/1024)) $((max_kb/1024)) $((avg_kb/1024))

  t=$((t + INTERVAL))
  sleep "$INTERVAL"
done

{
  printf '\n--- sammanfattning över %s minuter ---\n' "$MINUTES"
  printf 'högsta RSS för EN bridge : %d MB\n' $((peak_each/1024))
  printf 'högsta RSS för alla ihop : %d MB\n' $((peak_total/1024))
  printf '\nSätt MAX_BRIDGES så att (max_per_bridge * MAX_BRIDGES) + manager + marginal\n'
  printf 'ryms i tjänstens minnestak. Räkna på TOPPEN, inte snittet — OOM-dödaren\n'
  printf 'bryr sig inte om medelvärdet. Lämna minst 25%% marginal.\n'
} >&2
