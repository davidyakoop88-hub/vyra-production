---
description: Laga nagot i ratt doman med ratt agent och ratt tester
---

Uppgift: $ARGUMENTS

Sa har gor du:

1. **Hitta agaren.** `node scripts/domaner.js lista`, och `node scripts/domaner.js agare <fil>`
   for de filer uppgiften ror. Ar det oklart vilken doman det ar - fraga innan du andrar.
2. **Delegera till domanens agent** (`.claude/agents/<agent>.md`) via Agent-verktyget. Ror
   uppgiften flera domaner: en agent per doman, och beskriv gransytan mellan dem explicit.
3. **En andring i taget.** Bevara befintliga funktioner. Inga sidoupprensningar.
4. **Kor domanens tester**: `node scripts/domaner.js test <doman>`.
5. **Rapportera**: vad som andrades, vilken doman, vilka tester som kordes och resultatet.
   Om nagot lamnades ogjort - sag vad och varfor.
