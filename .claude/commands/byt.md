---
description: Byt ut en del (widget, design, effekt, asset, integration) utan att sla sonder resten
---

Byt ut: $ARGUMENTS

Bytesordningen - folj den, den ar till for att det ska ga att angra:

1. **Kartlagg.** `node scripts/domaner.js agare <fil>` och lista allt som anropar delen:
   `grep -rn "<namn>" --include=*.js --include=*.css .`
2. **Mat fore.** `node scripts/domaner.js matt <doman>` och kor domanens tester sa att du vet
   att utgangslaget ar gront.
3. **Beskriv gransytan.** Vilken funktion, vilka faltnamn, vilka defaults maste den nya delen
   uppfylla for att ingen anropare ska behova andras? Ar gransytan otydlig - gor den tydlig
   forst, byt sedan.
4. **Byt.** Ny fil vid sidan av den gamla nar det gar, sedan flytta anroparna. Ta bort den
   gamla forst nar allt pekar ratt.
5. **Kor** `node scripts/domaner.js test <doman>` och `npm run karta` om det ror widgetar.
6. **Mat efter** och jamfor med steg 2.
7. **Uppdatera kartan** om filer tillkom eller forsvann: `.claude/domaner.json`, sedan
   `node scripts/domaner.js luckor`.
