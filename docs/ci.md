# Vad CI faktiskt verifierar

Kort och exakt. Allt här är kört, inte planerat.

## Kommandon

| Script | Kör | Tid |
|---|---|---|
| `npm test` | hela klientsviten, `tests/*.test.js` | ~15 s |
| `npm run test:contract` | eventkontraktet, 7 tester | <1 s |
| `npm run test:fuzz` | 1000 seedade events, 5 tester | ~1 s |
| `npm run test:coverage` | hela sviten + coverage-rapport | ~16 s |
| `npm run test:ci` | kontrakt → fuzz → hela sviten, avbryter vid första rött | ~16 s |

`test:contract` och `test:fuzz` kör filer som **redan ligger i `tests/`** och därmed redan körs av
`npm test`. De finns för att ett brott ska ha ett *namn* i CI-vyn och för att den billiga
kontrollen ska falla innan den dyra körs — inte för att ge extra täckning.

## Vad som körs på varje PR

`ci.yml` har tre jobb. Klientjobbet kör, i ordning:

1. **Kontrakt** — brygga → moln → klient. Faller om en eventtyp tappar sin producent eller sin
   mottagare, eller om fältöversättningarna `profileUrl → profileImage` och `value → coins` bryts.
   Båda paren har brustit i produktion.
2. **Fuzz** — 1000 seedade events i slumpad ordning. Faller om ett värde går bakåt, om duplicerade
   events skapar duplicerade DOM-noder, eller om livevägen anropar `save()` eller `render()`.
3. **Hela sviten** — 556 tester.
4. **Coverage** — informativ, faller aldrig bygget.
5. **`npm audit --audit-level=high`**.

Serverjobbet kör dessutom migrationer mot en riktig Postgres, schemat två gånger, en
API-readiness-smoke och en backup/restore-runda. Bryggan har sin egen svit.

Mutationstestat: bryter man kontraktet ger `test:ci` exit 1 **och hoppar över hela sviten**. Bryter
man fuzzen ger den exit 1. Återställt ger 0.

## Vad CI **inte** verifierar

**Coverage-siffran täcker inte widgetfilerna.** Node instrumenterar bara moduler den själv laddar.
`media.js`, `cloud-sync.js`, `gift-event-images.js`, `live-client.js` och `last-x-alerts.js` laddas
som `<script>` i jsdom och syns **inte alls** i rapporten. Siffran ~83 % gäller en delmängd som
utesluter precis de filer där veckans buggar bodde. Läs den som "de moduler som `require`:as är
täckta", inget mer.

**Ingen riktig TikTok-LIVE.** CI har inget konto och ingen sändning. Mocken i
`tests/e2e/mock-live.js` har fältformen från `tiktok-bridge/normalizer.js`, men den bevisar bara att
*vår* kod hanterar *vår* uppfattning om formen. När `likeCount` blev `count` i protokollets v3 blev
251 av 251 likes noll i produktion medan varenda test var grönt.

**Ingen rendering.** jsdom löser CSS-kaskaden men ritar inga bildrutor. Last-X-kaskaden,
kröningsbilden på 55 % opacitet och streakens `<em>GOOD</em>` var alla osynliga för testsviten och
syntes först i en riktig webbläsare.

**Ingen OBS.** Widgetarna körs i OBS browser source, inte i Chromium. Transparens, komposition och
GPU-beteende skiljer sig.

**Ingen desktopinloggning.** Kedjan konto → premium-grind → sessionsbryggning → lokal Studio kräver
ett riktigt konto. Det var precis där `405`-buggen och den tysta pollningsslingan levde.

**Ingen Studio-mot-server-divergens.** Den uppstår över tid i verklig användning. CI startar alltid
från tomt och kan därför aldrig hamna i det läget.

## Varför Playwright och Electron inte ligger i första steget

Tre skäl, i den ordning de väger:

1. **Beroendet finns inte i repot.** `@playwright/test` plus en nedladdad Chromium. Ett obligatoriskt
   steg på ett oinstallerat paket gör varenda PR röd direkt.
2. **De har aldrig körts.** Ett gatande steg som aldrig varit grönt är ett hinder, inte en kontroll.
3. **Electron-lagret pekar mot en lokal statisk server**, eftersom CI saknar molnsession — så just
   inloggningen, där felen faktiskt bodde, täcks inte ändå.

Filerna finns kvar (`playwright.config.js`, `tests/e2e/`) och körs manuellt via workflowet
**VYRA verification (E2E — manuell)**. Ordningen för att göra dem obligatoriska står i den filen.
