# Känd teknisk skuld

Sådant som är **uppmätt och verifierat**, inte misstänkt. Varje punkt har en plats i koden och ett
sätt att bevisa den. Ta bort en punkt när den är åtgärdad — inte när den känns åtgärdad.

Filen ersätter `docs/live-readiness-matrix.md` (PR #54, stängd 2026-08-06). Den matrisen var en
ögonblicksbild som hann bli inaktuell på ungefär halva sina rader innan den mergades, och en av dess
rader höll på att pensionera en fungerande widgetfamilj. Det här är i stället bara de påståenden som
fortfarande stämmer, och som ingen annanstans är nedskrivna.

Senast verifierad mot `main`: **2026-08-08**.

---

## 1. Glove Snipe kan inte tändas av ett riktigt event

`media.js` `routeLiveBattleEvent()` tänder Glove Snipe på eventtyperna `tap`, `snipe`, `glove`,
`x2` och `x3`. **Ingen av dem är en ingest-typ.** Bryggan publicerar `gift`, `like`, `share`,
`subscribe`, `member`, `chat`, `viewer`, `battle` och `follow` — inget annat.

Widgeten kan alltså bara nås från battle-UI:t eller en Actions-regel. Den är preview-only i praktiken.

**Bevisa så här:**

```bash
git grep -c "'tap'\|'snipe'\|'glove'" -- tiktok-bridge/
```

Svarar den 0 finns ingen väg dit.

Det här är samma mönster som redan åtgärdats i tre widgetar — se
`battle-mvp-session.js`, `fan-level-session.js` och `gifter-level-session.js` för receptet.
Glove Snipe är den sista kända kvarvarande.

## 2. Gift Fireworks "Testa"-knappen kringgår alertkön

Testknappen i panelen anropar effekten direkt. Livevägen går genom `VyraAlertQueue`, som spelar en
alert i taget och håller nästa tillbaka i hela visningstiden.

Följden: **editorn känns snabbare än verkligheten.** Klickar man testknappen fem gånger ser man fem
fyrverkerier; fem riktiga gåvor spelas efter varandra med sekunder emellan.

Det är inte fel i sig — en testknapp ska vara omedelbar — men det är en fälla när någon justerar
timing i editorn och tror att det är vad tittarna ser.

## 3. Gift Fireworks skriver live-data till den sparade layouten

`gift-fireworks.js` `triggerGiftFireworks()` gör fortfarande:

```js
traffar.forEach(w=>{w.fwCombo=combo});save();render();
```

Tre problem i en rad: senaste gåvans combo hamnar permanent i den sparade layouten, hela canvasen
byggs om per gåva, och omritningen river ner den animation som just spelar.

**Gift Fireworks är den enda widgeten som fortfarande gör det.** Last-X, Fan Level Up och Gifter
Level Up patchar i stället DOM riktat och rör aldrig widgetobjektet.

Fixen fanns påbörjad i PR #53, som stängdes för att grenen var för gammal för att merga
(den byggde på en kodbas där `allCampaignGiftChoices` fortfarande fanns).

## 4. widget-defaults-migration-provet beror på en lokal baseline-gren

`tests/widget-defaults-migration.test.js` letar efter en gammal `media.js` med de
inline-katalogliteraler som fanns före widget-fabriken. Den söker i denna ordning:

```js
for (const rev of ['feature/event-deduplication:media.js', 'origin/main:media.js', 'main:media.js'])
```

Första posten är en **lokal grenreferens**. Efter Steg 0.5 (2026-08-08) raderades den grenen —
den var mergad och övergiven. Provet hoppar nu över hos utvecklare som städar sina lokala grenar.
Fjärrgrenen finns kvar på origin, så fixen är att låta provet peka på
`origin/feature/event-deduplication:media.js` i stället.

Uppmätt 2026-08-08 — bara den ena refen bär literalerna:

```
JA   origin/feature/event-deduplication:media.js
nej  origin/main:media.js
nej  main:media.js
```

Provet är redan byggt för att hoppa över graceful — se raderna 2 och 9–10 i filen, som förklarar
att detta är "local migration proof, not part of the permanent contract" och att CI:s grunda
checkout alltid skippar det. Ingenting i CI påverkas. Det är en utvecklarbekvämlighet, inte ett
kontraktsbrott.

**Bevisa så här:**

```bash
node --test tests/widget-defaults-migration.test.js
```

Efter Steg 0.5 utan fixen: 2 prov skippas, 0 fel. Efter att provet pekats om — eller efter lokal
återskapning med `git branch feature/event-deduplication origin/feature/event-deduplication` —
kör alla prov.

## 5. Synkkonflikt-banderollen kan tystas utan att lösa konflikten

`push()` (`cloud-sync.js:63`) returnerar `{ok:false,status:409}` **utan att kasta** när servern
svarar 409. "Den här datorn"-knappen i `showConflict()` (`cloud-sync.js:74`) kör
`await push();await apply(payload());bar.remove()` i ett try-block — kedjan fortsätter alltså
förbi den misslyckade pushen och tar bort banderollen ändå. Status stannar på `conflict`, kön
ligger kvar, men UI:t visar ingenting.

Dubbelfel: 409-vägen i `push()` försöker visa en ny banderoll, men `showConflict()` har vakten
`if(document.querySelector('.cs-conflict'))return` — och den gamla banderollen finns fortfarande
i DOM i det ögonblicket. Den nya undertrycks, den gamla tas bort strax därpå. Tyst permanent
konflikt.

Följden: användarens val når aldrig servern. Nästa lokala ändring skrivs till kön men synkas
inte; andra enheter (och OBS, som hämtar från servern) ser den gamla versionen. Ingen märker
något förrän layouten saknas på en annan enhet.

"Online"-knappen delar **inte** felet: dess `apply()` kastar vid ogiltigt svar, så catch-grenen
behåller banderollen.

Reproducerad i produktion 2026-08-09 under synkkonflikt-lösningen efter Etapp 2: efter klicket
hade servern fortfarande 4 widgets i stället för valda 5, `VyraCloudSync.status()` sa `conflict`
— utan banderoll. Räddad med ett manuellt `VyraCloudSync.push()`, som gav `{ok:true}` och tömde
kön.

**Bevisa så här** (i Studions konsol, direkt efter klicket på "Den här datorn"):

```js
VyraCloudSync.status()   // 'conflict' fast banderollen ar borta = tyst konflikt
const cur = VyraCloudSync.current();
const svar = await VyraAuth.api(`/api/workspaces/${cur.workspace.id}/overlays/${cur.overlay.id}`);
svar.overlay.state.widgets.length   // skiljer sig fran Studions antal = valet nadde aldrig servern
```

**Åtgärd:** kontrollera push-resultatet i knapphanteraren (`const r=await push(); if(!r.ok)return`
före `bar.remove()`), eller ta bort banderollen först när status faktiskt bytt till `synced`.
Provet ska verifiera både banderollens frånvaro OCH att servern tagit emot den valda versionen —
banderollens frånvaro ensam är exakt det som ljög här. Rött browser-prov som simulerar dubbel-409
först, enligt repo-praxis.

Verifierad: 2026-08-09.

---

## Sådant som är löst, men värt att minnas

- **Ett event som `count`, `combo` eller `repeatcount`.** Combostorleken nådde en gång aldrig fram
  till fyrverkeriet eftersom `action-runtime.js` letade efter fältnamn eventet inte bar. Löst i
  PR #94 genom att skicka hela payloaden i stället för ett enda tal.
- **`cleanEvent` är den tystaste förlustpunkten i hela kedjan.** Chattexten, profilbilden,
  gåvovärdet, fan-nivån och gifter-nivån har alla i tur och ordning strukits där utan att något
  larmade. Lägg nya fält **efter `at:`** — ett kontraktstest läser bara 1600 tecken från
  `function cleanEvent`.
