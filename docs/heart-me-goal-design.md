# Heart Me Goal · unika avsändare per sändning

**Status: design + röda prov. Ingen produktionskod skriven, inget mergat, inga flaggor rörda.**

## Produktkravet

`templateHeartGoal` ska räkna **unika personer som skickar gåvan Heart Me under aktuell LIVE**.

- Endast gåvan Heart Me räknas.
- Varje unik avsändare ger högst `+1` per `sessionId`, oavsett hur många Heart Me de skickar.
- Likes och alla andra gåvor ger `+0`.
- Samma person får räknas igen i nästa LIVE.
- Dedupen måste tåla processomstart och samtidiga event.
- Generella Like Goal-widgets (`templateSocialGoal`) får inte ändras.

Dagens beteende är fel mot kravet: `goal-metrics.js:29` mappar `templateHeartGoal` → `likes`, med kommentaren
*"a heart is a like; product decision"*. Uppmätt i test-LIVE 2: två unika Heart Me-avsändare, men widgeten
visade `48/50` och slutade på `progress = 433` — allt från TikTok-likes.

---

## Uppmätt payload

Fälten finns redan hela vägen. Ingenting behöver läggas till i transportlagret.

`cleanEvent` (`server/event-bus.js:13-27`) bär `userId` (160), `username` (120), `giftId` (160),
`giftName` (160), `count`, `value`.

### Gåvoidentitet — löses per rum mot TikToks egen katalog

**Produktbeslut 2026-08-26:** widgeten är låst till Heart Me. Ingen gåvoväljare, ingen ny
inställning i UI. Befintliga `templateHeartGoal`-widgets får den nya betydelsen automatiskt.

**Id:t hårdkodas inte.** Repots katalog (`assets/gifts/gifts-manifest.js`, 1148 poster) har bara
`name` och `file` — inget `giftId`. Filnamnsprefixen är en lokal löpnumrering (`0001_Rose`,
`0002_…`, `0036_Heart_Me`), inte TikToks id. Att låsa produkten vid `0036` vore ett obevisat
magiskt tal.

I stället löses `Heart Me` **mot det aktuella rummets auktoritativa gåvokatalog** vid anslutning:

- `TikTokLiveConnection.fetchAvailableGifts()` finns i installerad `tiktok-live-connector@2.4.0`
  (deklarerad `^2`), tillsammans med getter:n `availableGifts`. Bryggan instansierar just den
  klassen (`bridge.js:354`).
- Namnet `Heart Me` matchas **exakt**, skiftlägesokänsligt och trimmat. `Heart Me Flex` får inte
  matcha — katalogen innehåller båda.
- **Exakt en träff krävs.** Noll träffar, flera träffar, saknad katalog, 403 eller nätfel ⇒
  **fail closed**: Heart Me Goal räknar ingenting den sändningen. Hellre noll än fel siffra.
- Det lösta id:t **cachas endast för aktuell anslutning/session** och löses om vid nästa LIVE.
  Olika rum får ge olika id för samma gåva utan att räkningen blir fel — nyckeln är ändå
  `(session_id, widget_id, sender_key)`.
- **Eventmatchning sker därefter uteslutande mot det lösta `giftId`.** Aldrig mot eventets
  `giftName`, inte ens som reserv.

Konstanten är **ett enda namngivet ställe** — gåvans kanoniska namn, inte ett id:

```js
const HEART_ME_GIFT_NAME = 'Heart Me';   // löses mot rummets katalog vid varje anslutning
```

#### Tre obevisade punkter som måste mätas innan implementationen litar på katalogen

1. **Signering.** Biblioteket dokumenterar att `gift/list/`-anropet *"must be signed for TikTok to
   return data"*. Bryggan sätter **inget `signApiKey`** (default `undefined`) — om osignerade anrop
   returnerar data, tomt eller 403 är omätt.
2. **Svarets form är otypad.** `type RoomGiftInfo = any` och `type RoomGiftsResponse = any` i
   `dist/index-DunqMzGX.d.ts:246,966`. Fältnamnen för id och namn i varje post är inte kända ur
   typerna och måste observeras en gång.
3. **Katalogen är språkparameteriserad.** Euler-routen tar `webcastLanguage`
   (`fetch-room-gifts-euler.d.ts`), och den vägen beskrivs som *premium*. Regional variation är
   alltså strukturellt verklig, åtminstone för presentation.

Fail-closed-regeln gör alla tre ofarliga: kan katalogen inte läsas eller tolkas entydigt räknar
widgeten noll, och ingen felaktig siffra visas.

### Varför inte `giftName` — bevisat

`tiktok-bridge/normalizer.js:68`:

```js
giftId:   text(data?.giftId || data?.giftDetails?.giftId || data?.gift?.id, 160)
giftName: text(data?.giftDetails?.giftName || data?.giftName || data?.gift?.name || 'Gift', 160)
```

`giftName` faller tillbaka på strängen **`'Gift'`** när namnet saknas, och är dessutom språkberoende.
Att matcha på namn skulle räkna vilken namnlös gåva som helst som Heart Me. **`giftId` är den stabila
nyckeln** — och den löses per rum, aldrig ur namnet i eventet.

### Avsändarnyckel — kanoniserat användarnamn, serverägt

`normalizer.js:33` och `:135`:

```js
userId: text(user?.userId || user?.id || user?.secUid || user?.uniqueId, 160)   // bas
userId: text(fields.userId || fields.username, 160)                            // utgående
```

**`userId` faller tyst tillbaka på användarnamnet** när TikTok inte skickar något id. Samma person kan
därmed komma in som numeriskt id i ett event och som användarnamn i nästa — två nycklar, dubbelräkning.

Huset har redan en serverägd identitet, `identitet()` i `server/stream-stats.js:38-42`, som fyller
`gifter_totals.viewer_id`:

```js
// Samma person far inte bli tva rader for att TikTok skickar '@Anna' en gang och 'anna' nasta.
const raw = data.username || data.uniqueId || data.user || '';
const id = String(raw).replace(/^@/, '').trim().toLowerCase();
return id.length >= 1 && id.length <= 80 ? id : '';
```

**Beslut: Heart Me Goal använder samma kanoniserade nyckel.** Skäl: den är serverägd och normaliserad,
den är oberoende av bryggans `userId`-fallback, och den gör att målet och `gifter_totals` är överens om
vem som är samma person. Ett event utan användbart namn ger tom nyckel och räknas inte alls
(fail-closed).

**Känd avvägning:** byter någon användarnamn mitt i en sändning räknas de som två personer. Ett
numeriskt id vore stabilare i det fallet, men bara när det faktiskt finns — och fallbacken ovan gör att
det inte går att lita på. Avvägningen är medveten och bör omprövas om bryggan slutar falla tillbaka.

---

## Modellen

### Ny metrik `gift_senders` — Like Goal orörd

`templateSocialGoal` och dess `goalKind: likes` ändras **inte**. Enda mappningsändringen är
`templateHeartGoal` → `gift_senders`, i både `server/goal-metrics.js` och `widget-factory.js`.
`tests/goal-metric-parity.test.js` tvingar de två filerna att ändras i samma PR.

`goal_runtime.metric` har `CHECK (metric IN ('follows','likes','shares','gifts','diamonds'))` —
metriken kräver en **additiv** migrering som utökar villkoret.

### Dedupeliggare per session

Ny tabell, en rad per (sändning, widget, avsändare):

```
stream_gift_sender_apply(session_id, widget_id, sender_key, first_seen_at)
PRIMARY KEY (session_id, widget_id, sender_key)
FOREIGN KEY (session_id) REFERENCES stream_sessions(id) ON DELETE CASCADE
```

`session_id` som nyckeldel ger tre av kraven gratis:

- **Högst +1 per sessionId** — primärnyckeln är låset, inte koden.
- **Samma person räknas igen nästa LIVE** — ny session, ny nyckelrymd. Ingen nollställning behövs.
- **Tål processomstart** — liggaren bor i Postgres, inte i minnet.

Sessionen slås upp ur `stream_session_pointer` för workspacet, i **samma transaktion** som
måluppdateringen.

### Räknelogiken

Vid ett `gift`-event vars `giftId` matchar widgetens konfigurerade gåva:

```sql
INSERT INTO stream_gift_sender_apply (session_id, widget_id, sender_key)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING
RETURNING sender_key
```

Målet ökas med **exakt +1 endast när insert:en skapade en rad**. Samma mönster som
nollställningskvittona (`INSERT ... ON CONFLICT DO NOTHING RETURNING`) — ingen läsning följd av
skrivning, så två samtidiga gåvor från samma person kan inte båda räknas.

`like`-event bidrar aldrig. Gåvor med annat `giftId` bidrar aldrig.

### Fail-closed utan session

Finns ingen aktiv session (pekaren är `NULL`, eller flaggan `VYRA_SANDNINGSIDENTITET` är av) finns
ingen nyckelrymd att dedupa i. Då räknas **ingenting** — hellre noll än dubbelräkning. Det innebär att
Heart Me Goal är inaktiv medan sändningsidentiteten är dormant, vilket är ett medvetet val och måste
stå i widgetens hjälptext.

---

## Vad som INTE ingår

- Ingen ändring av `templateSocialGoal`, `goalKind`, eller like-vägen.
- Ingen ändring av `goal_event_apply` — den per-event-idempotensen står kvar oförändrad och är
  det som skyddar mot replay från utkorgen.
- Inga flaggändringar, ingen produktionsåtgärd.

## Beslutat — ingen öppen punkt kvar

Gåvan är **låst till Heart Me**. Ingen gåvoväljare, inget `heartGiftId`-fält, ingen ny inställning.
`templateHeartGoal` behåller `heartCurrent` och `heartTarget` precis som i dag, så användarens
`target = 50` och övrig målkonfiguration bevaras oförändrad och befintliga widgets får den nya
betydelsen utan omkonfiguration.
