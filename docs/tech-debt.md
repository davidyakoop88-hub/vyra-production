# Känd teknisk skuld

Sådant som är **uppmätt och verifierat**, inte misstänkt. Varje punkt har en plats i koden och ett
sätt att bevisa den. Ta bort en punkt när den är åtgärdad — inte när den känns åtgärdad.

Filen ersätter `docs/live-readiness-matrix.md` (PR #54, stängd 2026-08-06). Den matrisen var en
ögonblicksbild som hann bli inaktuell på ungefär halva sina rader innan den mergades, och en av dess
rader höll på att pensionera en fungerande widgetfamilj. Det här är i stället bara de påståenden som
fortfarande stämmer, och som ingen annanstans är nedskrivna.

Senast verifierad mot `main`: **2026-08-06**.

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

---

## Sådant som är löst, men värt att minnas

- **Ett event som `count`, `combo` eller `repeatcount`.** Combostorleken nådde en gång aldrig fram
  till fyrverkeriet eftersom `action-runtime.js` letade efter fältnamn eventet inte bar. Löst i
  PR #94 genom att skicka hela payloaden i stället för ett enda tal.
- **`cleanEvent` är den tystaste förlustpunkten i hela kedjan.** Chattexten, profilbilden,
  gåvovärdet, fan-nivån och gifter-nivån har alla i tur och ordning strukits där utan att något
  larmade. Lägg nya fält **efter `at:`** — ett kontraktstest läser bara 1600 tecken från
  `function cleanEvent`.
