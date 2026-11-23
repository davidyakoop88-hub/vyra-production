# Veckojobbet för nytt spelinnehåll

Hur Quiz och Ordjakten får nya frågor och ord varje vecka — utan att något når en sändning som ingen har läst.

```
schemalagd session (måndag)  →  förslag  →  scripts/spelinnehall-forslag.js  →  draft-PR  →  DU granskar  →  sammanslagning  →  deploy
```

Jobbet **föreslår** bara. Det slår aldrig ihop, godkänner aldrig och pushar aldrig till huvudgrenen. Allt det gör är att öppna en
draft-PR med en tabell över varje ny fråga, dess källa och källkontrollens utfall.

## Delarna

| Del | Vad den gör |
|---|---|
| `spelinnehall.js` | Innehållet: frågor och ord. Instruktionen för hur man lägger till står överst i filen. |
| `scripts/spelinnehall-forslag.js` | Kontrollerar form, dubbletter och källor; lägger till poster sist med nya id; höjer versionen; skriver granskarens rapport. Utan `--skriv` skrivs ingenting. |
| `tests/spelinnehall-forslag.test.js` | Vaktar verktyget — framför allt att det aldrig släpper igenom något som widgetarna avvisar. |
| Den schemalagda sessionen | Skriver förslagen och kör verktyget. Prompten finns nedan. |

## Kommandon du kan köra själv

```bash
node scripts/spelinnehall-forslag.js kontrollera            # formen på hela innehållet
node scripts/spelinnehall-forslag.js kontrollera --kallor   # hämtar varje källa (kräver nät)
node scripts/spelinnehall-forslag.js lagg-till forslag.json --kallor                 # provkörning, skriver inget
node scripts/spelinnehall-forslag.js lagg-till forslag.json --kallor --skriv --rapport rapport.md
```

`--kallor` mäter två saker: **FEL** (källan svarar inte) och **VARNING** (det rätta svaret hittas inte i sidans text). Varningen är en
tumregel, inte ett bevis — den fångar felpekande länkar men inte ett svar som står på sidan i fel sammanhang. Därför är granskningen
mänsklig. För en engelsk källa med svenskt svar anges `"belagg"` på källans språk (t.ex. `"nitrogen"` för svaret *Kväve*).

## Så granskar du en PR

1. Öppna tabellen i PR-texten. Läs varje rad mot sin källa. ✅ betyder att svaret står på sidan, inte att frågan är rätt.
2. ⚠️ och ❌ ska vara lösta innan du slår ihop.
3. Kolla att frågan inte är tidskänslig (inget "senaste" eller "flest just nu").
4. Slå ihop. Innehållet är en vanlig `.js`-fil, så det följer med nästa deploy; Caddy ger `*.js` `no-cache`, så ändringen syns direkt efter den.

## Prompten till den schemalagda sessionen

Kopiera hela blocket. Föreslagen tid: **måndagar 10:17 svensk tid** (`CRON_TZ=Europe/Stockholm 17 10 * * 1`). Minuten är medvetet inte 00 eller 30,
och 10:17 svensk tid ligger utanför de timmar då körningar kan fördröjas.

````text
Veckovis förslag på nytt spelinnehåll till VYRA (Quiz och Ordjakten). Repo: davidyakoop88-hub/vyra-production, domän: widgets. Du FÖRESLÅR bara — en människa granskar och slår ihop. Inget du skriver får nå en sändning av sig själv.

FÖRBEREDELSER
1. Läs CLAUDE.md, instruktionen överst i spelinnehall.js och huvudkommentaren i scripts/spelinnehall-forslag.js.
2. Om scripts/spelinnehall-forslag.js eller spelinnehall.js saknas på standardgrenen: avbryt, öppna ingen PR och rapportera att PR 833 inte är sammanslagen än.
3. Kör npm ci i repots rot om node_modules saknas.

UPPGIFT
4. Kör `node scripts/spelinnehall-forslag.js kontrollera --kallor`. Rader märkta FEL är trasiga källor: hitta en fungerande källa som FAKTISKT stödjer svaret (hämta sidan och läs den) och byt länken i spelinnehall.js, eller ta bort frågan. VARN-rader beror ofta på att källan är engelsk och svaret svenskt: belägg dem själv genom att läsa sidans text, eller låt bli att röra dem och nämn dem i PR-texten.
5. Skriv ett förslag med 12 nya svåra frågor och 12 nya ord. Fördela frågorna på de paket som har färst frågor. Spara förslaget som forslag.json UTANFÖR repot. Format: se huvudet i scripts/spelinnehall-forslag.js, med "belagg" på källans språk för varje fråga med engelsk källa.
   Frågorna: svåra men rättvisa; stabila fakta som inte ändras med tiden (inga "senaste", "flest just nu", aktuella rekord eller mästare utan årtal i frågan); inga omstridda eller tolkningsberoende fakta; ingen politik, religion eller våld — det ska fungera för alla åldrar i en TikTok LIVE; svenska; tre svar där exakt ett är rätt; varje källa ska vara en sida du faktiskt har hämtat och läst; samma ämne ska inte upprepas från befintliga frågor; variera vilket svar som är rätt (ratt 0, 1 och 2).
   Orden: 7–14 bokstäver, vardagliga svenska ord, ledtråd under 60 tecken som inte innehåller ordet, inga namn eller förkortningar.
6. Provkör: `node scripts/spelinnehall-forslag.js lagg-till <forslag.json> --kallor`. Läs rapporten. Ta bort eller ersätt varje post som får ❌ eller ⚠️ och som du inte själv kan belägga genom att läsa källsidans text. Avvisade poster ska rättas eller strykas — släpp aldrig igenom något du inte är säker på.
7. Kör med `--skriv --rapport <rapport.md>` (rapport.md också utanför repot).
8. Kör: node --test tests/spelinnehall.test.js tests/spelinnehall-forslag.test.js tests/quiz.test.js tests/ordjakten.test.js tests/domankarta.test.js tests/sprak-vakt.test.js. Allt ska vara grönt. Rör aldrig quiz.js, ordjakten.js, media.js, studio.js eller tests/visual.

LEVERANS
9. Skapa grenen innehall/ÅÅÅÅ-MM-DD från standardgrenen, committa (kort svenskt meddelande), pusha och öppna en UTKAST-PR (draft) mot standardgrenen med innehållet i rapport.md som beskrivning. Be granskaren läsa varje rad mot dess källa.
10. Slå ALDRIG ihop, godkänn aldrig, pusha aldrig till standardgrenen och kommentera inte på andra PR:er. Om nätet är nere eller tester är röda av något du inte orsakat: öppna ingen PR och rapportera vad som hände.
11. Avsluta med en kort sammanfattning: antal föreslagna och avvisade poster, trasiga källor hittade och rättade, och PR-länken.
````

## Vad som inte är löst

- **Det är fortfarande en deploy.** Innehållet följer med webbens vanliga utrullning. Frågor som ändras live utan deploy kräver ett API med databas och en adminvy, och är ett eget, större steg.
- **Två OBS-källor kan ha olika innehåll** om en av dem inte har laddats om efter en deploy. Panelen visar innehållsversionen (t.ex. "Innehåll 20261123-2") så att det syns.
- **Källkontrollen är en tumregel.** Den ersätter inte att någon läser.
