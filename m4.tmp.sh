#!/bin/bash
cd /c/Users/A/AppData/Local/Temp/claude/david || exit 1
cp server/stream-sessions.js /tmp/ss.good

las() {
  local sha; sha=$(git rev-parse --short HEAD); echo "commit: $sha"
  for i in $(seq 1 40); do
    local st; st=$(gh run list --branch feat/sandningsidentitet --limit 8 --json name,status,headSha,databaseId \
      -q ".[] | select(.name==\"Goal runtime · Postgres 18\") | select(.headSha|startswith(\"$sha\")) | .status+\" \"+(.databaseId|tostring)" | head -1)
    if echo "$st" | grep -q "^completed"; then
      local rid jid; rid=$(echo "$st" | awk '{print $2}'); jid=$(gh run view "$rid" --json jobs -q '.jobs[0].databaseId')
      gh run view "$rid" --log --job "$jid" 2>/dev/null > /tmp/m4.log
      grep "Sändningsidentitet" /tmp/m4.log | sed 's/^[^\t]*\t//' | grep -oE "(tests|pass|fail) [0-9]+" | head -3 | tr '\n' ' '; echo
      echo -n "roda i utkorgen: "
      grep "Sändningsidentitet" /tmp/m4.log | sed 's/^[^\t]*\t//' | grep -oE "✖ session: (G[0-9]|M1|T[0-9]+|U[0-9])" | sort -u | tr '\n' ' '; echo
      awk '/failing tests:/{f=1} f' /tmp/m4.log | sed 's/^[^\t]*\t//' \
        | grep -A 5 -E "✖ session: (G[0-9]|M1|T[0-9]+|U[0-9]) ·" \
        | grep -oE "AssertionError \[ERR_ASSERTION\]: .{0,72}" | sort -u | head -4
      return 0
    fi; sleep 40
  done; echo TIMEOUT
}

echo "===== UTGANGSLAGE ====="; las

for M in 1 2 3 4; do
  case $M in
    1) SKYDD="agarkontrollen pa fel/retry-vagen"; VANTAT="T10" ;;
    2) SKYDD="agarkontrollen pa kvittensen"; VANTAT="T5, G3, T9" ;;
    3) SKYDD="poison-gransen"; VANTAT="T7, M1" ;;
    4) SKYDD="lease-utgangen (lease_until > \$nu)"; VANTAT="U1, U2, U3" ;;
  esac
  echo ""; echo "############ MUTATION $M — $SKYDD ############"
  echo "vantat fall: $VANTAT"
  python mutera.tmp.py $M || exit 1
  git commit -aqm "MUTATION $M (tillfallig): $SKYDD bortmuterat" >/dev/null && git push -q
  echo -n "i den COMMITADE filen: "; git show HEAD:server/stream-sessions.js | grep -c "MUT$M"
  las
  cp /tmp/ss.good server/stream-sessions.js
  echo -n "aterstalld: "; grep -c "MUT1\|MUT2\|MUT3\|MUT4" server/stream-sessions.js
done

echo ""; echo "############ SLUTLIG ATERSTALLNING ############"
rm -f mutera.tmp.py
git add -A && git commit -qm "Aterstall efter lease-blockets fyra mutationsbevis

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" >/dev/null && git push -q
echo -n "mutationskod: "; git show HEAD:server/stream-sessions.js | grep -c "MUT1\|MUT2\|MUT3\|MUT4"
echo -n "arbetskopia: "; git status --porcelain | grep -v "m4.tmp.sh" | wc -l
las
rm -f /tmp/ss.good
