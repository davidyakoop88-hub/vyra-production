---
description: Mat en doman - storlek, tester, latens och last - mot en baslinje
---

Mat: $ARGUMENTS

1. **Baslinje.** `node scripts/domaner.js matt $ARGUMENTS --json` och spara utdata. Notera
   gren och commit (`git rev-parse --short HEAD`).
2. **Domanens egna matningar** (listas i utdatan under `egnaMatningar`) - kor dem.
3. **Generella matningar nar de ar relevanta:**
   ```
   node tests/load/api-smoke.js        # API-svarstider
   node tests/load/live-ingest.js      # handelser in per sekund
   node tests/load/overlay-stream.js   # overlayens strom under last
   ```
4. **Rapportera i en tabell**: matt, fore, efter, skillnad. Utan baslinje ar en siffra bara en
   siffra - sag i sa fall rakt ut att det ar en forsta matning.
5. Om nagot forsamrats: sag det, gissa inte pa orsak utan att kunna visa den.
