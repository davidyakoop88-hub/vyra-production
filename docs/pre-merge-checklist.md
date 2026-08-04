# Checklista före merge till `main`

Kryssa allt. Punkterna längst ned kan **ingen maskin** göra åt dig — de finns här för att varenda
bugg som nått en sändning har passerat en grön CI först.

---

## Automatiskt (CI gör detta)

- [ ] **Lager 1** — `npm test` grön. Alla enhetstester, root + `electron-app` + `tiktok-bridge`.
- [ ] **Lager 2** — eventkontraktet grönt. Ingen eventtyp har tappat sin producent eller sin
      mottagare, och inget fältnamn har glidit isär mellan brygga, moln och klient.
- [ ] **Lager 3** — E2E i webbläsare grön: 100 gåvor räknas rätt, streak mäter combo och inte coins,
      kampanjsiffran sjunker aldrig, `localStorage` speglar staten, ingen endpoint svarar 405.
- [ ] **Lager 4** — Electron startar, inga oväntade `console.error`, ingen 405, inga CORS-fel, och
      appen tar emot ett event.
- [ ] **Lager 5** — 1000 slumpade events: inget värde går bakåt, inga duplicerade DOM-noder,
      noll `save()` och noll `render()` från livevägen.

## Manuellt före merge

- [ ] **Röda tester först.** Varje ny fix har ett test som var rött innan koden skrevs. Ett test som
      aldrig varit rött bevisar ingenting.
- [ ] **Mutationstestat.** Ta bort fixen — faller testet? Passerar det ändå testar det något annat än
      du tror. Det har hänt fyra gånger den här veckan.
- [ ] **Sett i en riktig webbläsare**, om ändringen syns. jsdom löser kaskaden men ritar inga
      bildrutor: Last-X-kaskaden, kröningsbilden på 55 % opacitet och streakens `<em>GOOD</em>` var
      alla osynliga för testsviten.
- [ ] **Båda ytorna.** Rör ändringen Studio gäller den både vyralive.app och appen — desktop hämtar
      samma filer live. Rör den `electron-app/` krävs en ny release.
- [ ] **Grenen är tagen från `main`.** Efter en squash-merge ger en gren från den mergade grenen en
      konflikt och **noll CI-körningar** — det ser ut som att inget kör, inte som ett fel.

---

## Vad som **inte** kan automatiseras — och varför

**Riktig TikTok-LIVE.** CI har inget konto och ingen sändning. En riktig ström går inte att be om
100 gåvor på kommando, den är inte reproducerbar, och den kan inte köras om vid ett fel. Mocken i
`tests/e2e/mock-live.js` har fältformen från `tiktok-bridge/normalizer.js`, men den bevisar bara att
*vår* kod hanterar *vår* uppfattning om formen. Ändrar TikTok sitt protokoll märks det först på en
sändning. **Det hände redan en gång:** `likeCount` blev `count` i v3, och 251 av 251 likes blev 0 i
produktion medan alla tester var gröna.

**Hur något känns.** Att en entré är 900 ms bevisas av ett test. Att den känns exklusiv i stället för
rastlös gör det inte. Battle MVP:s hållrörelse och Royal Coronations entré är verifierade som
korrekta men aldrig sedda av ett öga.

**Inloggning och behörighet i appen.** E2E-lagret pekar Electron mot en lokal server, för i CI finns
ingen molnsession. Hela kedjan konto → premium-grind → sessionsbryggning → lokal Studio kan bara
provas med ett riktigt konto. Det var precis där `405`-buggen och den tysta pollningsslingan levde.

**Att Studio och servern faktiskt visar samma layout.** Divergensen mellan lokal state och
`overlays.state` uppstår över tid i verklig användning. CI startar alltid från tomt och kan därför
aldrig hamna i det läget.

**OBS.** Widgetarna körs i OBS browser source, inte i Chromium via Playwright. Transparens,
komposition och GPU-beteende skiljer sig. En widget som ser rätt ut i E2E kan bli en svart ruta i OBS.

**Betald signering.** SignPath kan inte mockas meningsfullt — antingen är installeraren signerad
eller inte, och tjänsten har legat nere fyra gånger.

---

## Innan en testsändning

- [ ] Kör sammanslagningsskriptet i `docs/a5-a6-sync-plan.md` om lokal layout och server har glidit isär
- [ ] Lägg till varje widget du tänker använda och trigga den en gång i Studio
- [ ] Kontrollera samma widgets i **OBS**, inte bara i Studio — det är två olika renderingar
- [ ] Kör en kort sändning och titta på siffrorna, inte bara på att något rör sig
