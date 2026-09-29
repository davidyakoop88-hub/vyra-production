# TikFinity · Events — facit från 18 skärmbilder (2026-09-16)

Systerdokument till [tikfinity-actions-facit.md](tikfinity-actions-facit.md). Samma regel:
detta är **målbilden**, inte det vi har. Etiketterna står på engelska som i originalet;
VYRA-texten är svensk (Davids beslut 2026-09-16).

---

## 1. Listvyn (bild 1)

Rubrik: **Events**

Brödtext, en rad:
> Here you can define what will trigger your actions.

Kontrollrad: `+ Create new Event` till vänster, `Search existing events...` högerställt.
**Ingen `Enabled`-huvudbrytare här** — till skillnad från Actions. Aktiveringen sitter
i stället per rad.

Tabellkolumner:

1. **Radikoner** — bara **två**: ✏ redigera · 🗑 radera.
   Ingen ▶ och ingen ⧉, till skillnad från Actions. Ett event testas inte, det bara gäller.
2. **Active** — kryssruta i raden, ikryssad
3. **User**
4. **Trigger**
5. **Action(s)**

Uppmätt ur raderna:

| Active | User | Trigger | Action(s) |
|---|---|---|---|
| ✔ | www.nala05 | 🪙 Gift 30+ Coins | Nala |
| ✔ | matiiiish | 🪙 Gift 30+ Coins | batbutiii |
| ✔ | misseja68 | 🪙 Gift 30+ Coins | messia |
| ✔ | **Any** | 🪙 Gift 1+ Coins | thanks |
| ✔ | misseja68 | 🪙 Gift 49+ Coins | messaia |
| ✔ | salsa.jaha | 🪙 Gift 100+ Coins | Salsa |
| ✔ | dsvdvodv1 | 🪙 Gift 100+ Coins | Dvd |
| ✔ | leexiie666 | 🪙 Gift 100+ Coins | Lexi |
| ✔ | bar.pek | 🪙 Gift 100+ Coins | Baris |
| ✔ | melaamandis | 🪙 Gift 30+ Coins | mela |
| ✔ | nono.me1 | 🪙 Gift 30+ Coins | nono |
| ✔ | curito34 | 🪙 Gift 30+ Coins | curitoo |
| ✔ | elpindii | 🪙 Gift 90+ Coins | tang |

**Tre saker att bära härifrån:**

- `User` visar **`Any`** när alla får trigga, inte tom text. Skillnaden är viktig: tomt
  läses som "något saknas", `Any` läses som "avsiktligt öppet".
- `Trigger` är en **genererad mening med ikon** — `🪙 Gift 30+ Coins` — inte ett rått
  triggernamn. Tröskelvärdet står i texten.
- `Action(s)` är plural och listar namnen, eftersom ett event kan köra flera actions.

---

## 2. Dialogen "New Event" (bild 2–16)

Rubrik **New Event**, stängkryss uppe till höger. Rullbar, två radioknappsgrupper.

### 2.1 Vem får trigga

> Who is able to trigger the event?

Sex radioknappar, ett val:

| # | Etikett |
|---|---|
| 1 | Everyone *(standard)* |
| 2 | Any Follower |
| 3 | Any Subscriber |
| 4 | Any Moderator |
| 5 | Top Gifter |
| 6 | A specific User |

`A specific User` fäller ut en **sökbar rullgardin** med platshållaren `Enter Username ...`
(bild 3). Listan är riktiga användarnamn från sändningen — `jokero060`, `akbarrossi7`,
`jessicaterrado807`, `batboutiii`, `alielsoony`, `piiikabom`, `portocerv`, `umminya76`,
`rj_huanggie00`, `hrchaaa__`, `melindasipos5`, `real_zull`, `gilguerito8`, `dillagi472`,
`janerik78`. Alltså inte ett fritextfält: den matas av vilka som faktiskt setts.

### 2.2 Vad triggar

> By what will the event be triggered?

**Tretton radioknappar i denna ordning:**

| # | Etikett | Extrafält som fälls ut |
|---|---|---|
| 1 | Join *(standard)* | — |
| 2 | First user activity | — |
| 3 | Share | — |
| 4 | Follow | — |
| 5 | Subscribe | — |
| 6 | Sending likes (taps) | `Define a minimum likes amount` (15) |
| 7 | Chat (any comment) | — |
| 8 | Commenting a command | `What is the command?` + poängnivå |
| 9 | Sending a gift with min. coins value | `Define a minimum coins value` (1) |
| 10 | Sending a specific gift | `Choose a gift` — bildrullgardin |
| 11 | Sending a subscriber emote | `Choose a subscriber emote` — bildrullgardin |
| 12 | Sending a fan club sticker | `Choose a fan club sticker` — bildrullgardin |
| 13 | Purchasing a product from TikTok Shop | `Product name contains (optional)` |

### 2.3 Fälten längst ned

`Required TikTok team member level` — sifferfält, 0.
Hjälptext: *Enter 0 to allow users who not joined your team.*

> **Mätt, inte antaget:** fältet syns **inte** för alla triggrar. Det står med på `Join`
> (bild 2), `First user activity` (bild 5) och `Commenting a command` (bild 8), men saknas
> på `Sending likes` (bild 6), `Chat (any comment)` (bild 7), `Sending a gift with min.
> coins value` (bild 9) och `Sending a specific gift` (bild 10).

`Required TikFinity points system level` — sifferfält, 0. **Bara på `Commenting a command`.**
Hjälptext: *Enter 0 to allow any points system level.*

`Trigger all of these actions` — flervalsfält, platshållare `Select...`
`Trigger one of these actions (random)` — flervalsfält, platshållare `Select...`

Fot: `✔ Save` · `✘ Cancel`

---

## 3. De fyra extrafälten i detalj

### 3.1 Commenting a command (bild 8)
- `What is the command?` — textfält, platshållare `!command`
- Hjälptext: *Commands should start with ! or /*

### 3.2 Sending a specific gift (bild 10, 11)
Rullgardinen visar **gåvobild + namn + coin-värde** på tre rader per post:
Basketboll · Pop · Kör hårt! · Kaffe · Blink blink · Glasstrut · Sommarbiljett S ·
Ljusstav · Morgonblommor — alla `1 Coins`.

> Gåvonamnen är **översatta till svenska**. Katalogen följer TikToks språkinställning, inte
> engelska. Matchar vi på engelska gåvonamn matchar vi ingenting för en svensk streamer.

### 3.3 Sending a subscriber emote (bild 12, 13)
Platshållare `Select Subscriber Emote...`. Varje post: bild + **`#7467641918164503329`**
i kursiv + undertexten `Super Fan (Subscriber) Emote`. Alltså ett numeriskt id, inget namn.

### 3.4 Sending a fan club sticker (bild 14, 15)
Platshållare `Select Fan Club Sticker...`. Varje post: bild + **`#7747176548099968655`** +
undertexten `Fan Club Sticker`.

### 3.5 Purchasing a product from TikTok Shop (bild 16)
- `Product name contains (optional)` — textfält, platshållare `Product Name`
- Hjälptext: *Enter part of the product name to trigger the event for this product only.
  If you leave the field empty, the event will be triggered for all products.*

---

## 4. Overlay Screen Settings (bild 17)

Egen panel, inte en del av eventdialogen. Rubrik **Overlay Screen Settings**, tre rader text:

> To make your actions visible in OBS or Live Studio you need to include at least one overlay screen (widget).
> You can map your Actions (animations, alerts, videos, etc.) to different Overlay Screens. Each Overlay Screen has its own queue.
> Here you can copy the Overlay URLs and adjust the maximum queue size of each screen. After adding it, it will be displayed as "Ready".

Tabell: `Screen Name` · `Screen URL (widget for OBS or Live Studio)` · `Max. queue length` · `Status`

**Åtta skärmar**, Screen 1–8. URL-formen är
`https://tikfinity.zerody.one/widget/myactions?cid=1550357&screen=N`.
Max kölängd 4 på Screen 1, 5 på övriga. Status `Ready` i grönt eller `Offline` i rött.

> VYRA har **tio** scener med samma innebörd (`action-scenes.js`), egen länk och egen
> `maxQueue` per scen. Facits `Screen` är alltså vår `scene.number`. Inget nytt begrepp
> behöver byggas — men vår statustext heter `Online`/`Offline`, facit `Ready`/`Offline`.

---

## 5. Event Simulator (bild 18)

Rubrik **Event Simulator**, text *Here you can simulate events.*

Rad 1: `Simulate Follow` · `Simulate Share` · `Simulate Subscrib…` · `Simulate 15 Likes`
Rad 2: rullgardinen `Select gift...` + knappen `Simulate Gift`

VYRA har `action-simulator.js` med samma syfte.

---

## 6. Glappet mot VYRA idag

Eventsidan ligger **mycket** närmare facit än actionsidan gjorde. Mätt i
`action-event-advanced.js` och `action-event.js`.

**Vi har redan hela modellen (behåll):**

| Facit | Vår kod |
|---|---|
| Sex målgrupper, inkl. Top Gifter och specifik användare | `action-event-advanced.js:5` `audiences` |
| Användarväljare matad av sedda tittare | `wireUserPicker` |
| Required TikTok team member level | `teamLevel` (`allowed()` rad 56) |
| Required points system level | `minPointsLevel` |
| Trigger all of these actions | `allActionIds` |
| Trigger one of these actions (random) | `randomActionIds` |
| Minsta coin-värde / minsta likes | `giftCoins` / `likes` med `Number(...)`-jämförelse |
| Kommando med exakt matchning | `chatCommand` |
| Subscriber-emote, fan club-sticker, TikTok Shop | `subscriberEmote`, `fanSticker`, `shopPurchase` |
| Tio overlay-skärmar med egen kö | `action-scenes.js` |
| Event-simulator | `action-simulator.js` |

Vi har dessutom fyra triggrar facit saknar: `giftCombo`, `level`, `battle`, `member` — och
`excludeAnonymous`, som är vår egen.

**Vi saknar:**

| Sak | Var |
|---|---|
| Listvyn som tabell med kolumnerna Active / User / Trigger / Action(s) | §1 |
| `Any` som synligt värde i User-kolumnen | §1 |
| Genererad triggermening med ikon (`🪙 Gift 30+ Coins`) | §1 |
| Sökfält för events | §1 |
| Aktiv-kryssruta **i raden** (vi har en knapp som växlar Aktiv/Pausad) | §1 |
| Bildrullgardin för gåvor med coin-värde | §3.2 |
| Bildrullgardin för subscriber-emotes med `#id` | §3.3 |
| Bildrullgardin för fan club-stickers med `#id` | §3.4 |
| `Product name contains (optional)` för TikTok Shop | §3.5 |
| Att teamnivå-fältet **döljs** för de triggrar facit döljer det för | §2.3 |

**Ett fel att rätta samtidigt:**

`action-event-advanced.js:54` sparar med samma pollningsplåster som actionsidan hade —
den räknar events före klicket och läser sedan `localStorage` var 100:e ms i fyra sekunder
för att klistra sina fält på `state.events.at(-1)`. Det är det **fjärde** exemplaret av
mönstret; de tre andra (action-media, action-options, action-scenes) är borta sedan
2026-09-16 och ersatta av fältregistret i `action-event.js`. Eventsidan bör få samma
behandling: ett register, en skrivning, och redigering blir möjlig på köpet.

---

## 7. Byggt 2026-09-16

Hela eventsidan följer nu facit. 1768/1768 prov gröna i roten, 15/15 i bryggans emote-svit.

- **Listvyn som tabell** med facits kolumner, två radikoner (penna, papperskorg), Aktiv som
  kryssruta i raden och ett sökfält.
- **`Alla` som synligt värde** i Användare-kolumnen, aldrig tom text.
- **Genererad triggermening med ikon**: `💰 Gåva 30+ coins`, `❗ Kommando !hype`, `❤️ 15+ likes`.
- **Villkorade nivåfält**: teamnivån visas bara på Join, Första aktiviteten och Kommando;
  poängnivån bara på Kommando. Uppmätt bild för bild ur facit §2.3.
- **`Produktnamnet innehåller (valfritt)`** för TikTok Shop.
- **Redigering av event** — omöjligt tidigare, se nedan.
- **Två skilda bildväljare** för subscriber-emotes och Fan Club-stickers.

### Det fjärde pollningsplåstret är borta

`action-event-advanced.js` är nu en leverantör i `window.VyraEventFields` i stället för att
polla `localStorage` efter `state.events.at(-1)`. Därmed finns ingen kvar av de fyra.
Bevisat i Chrome: `!hype` → `!party` skrev till `e6`, och antalet events var fortfarande 9 —
alltså ingen dubblett, vilket den gamla vägen alltid skapade.

### FAN CLUB-TRIGGERN VAR DÖD KOD

Uppmätt: **ingenting** i hela kedjan emitterar typen `fanclubsticker` — varken
`normalizer.js`, `bridge.js` eller `electron-app/tiktok-service.js`. Raden i
`live-client.js:37` kunde alltså fysiskt aldrig fyra, och stickerväljaren visade
subscriber-emotes eftersom båda lästes ur samma nyckel.

Lösningen låg i TikToks egen datamodell: **en Fan Club-sticker ÄR en emote med
`emoteScene === 2` (FANS_CLUB)**. Båda kommer i samma `WebcastEmoteChatMessage`, och bryggan
skickade redan fram dem — men `emoteScene` följde inte med genom de två vitlistorna, så
klienten kunde inte skilja dem åt. Tre rader: fältet i `emoteFields`, fältet i den
normaliserade vitlistan, och delningen i `recordSeenEmote`. Vaktat av tre prov i
`tiktok-bridge/test/emote.test.js`, mutationsprovade.

⚠️ **Ännu inte sett i skarp sändning.** `normalizer.js` säger själv: "Vi har annu inte sett
ett enda skarpt EMOTE-event." `emoteScene` kommer ur bibliotekets proto-definition, inte ur
en mätning. Designen är rätt, men den behöver en live-verifiering innan den kan kallas klar.

## 8. Gåvoväljaren (facit §3.2) — byggd 2026-09-16

Väljaren visar nu **bild + namn + coin-värde**, som facit. Katalogen har två källor och de
inlärda vinner alltid:

1. **Inlärda gåvor** (`vyra-seen-gifts-v1`) — namn, bild, coin-värde och `giftId` fångas ur
   varje skarp gåva i `live-client.js`. De bär TikToks eget namn **på streamerns språk** och
   det verkliga coin-värdet, och märks ut i grönt.
2. **`assets/gifts/gifts-manifest.js`** som reserv — 1 148 poster, men bara **engelska** namn
   och **inget** coin-värde alls. Visas som `okänt värde`, aldrig som `0 coins`: noll är ett
   påstående om gåvan, "okänt" ett påstående om oss.

Varför inte serverns katalog? `gavokatalog` finns och är rik, men är **admin-only**
(`/api/admin/gavokatalog`) och kan inte nås från webbläsaren. Seedningen har dessutom en
uttrycklig spärr (se [[vyra_gavoregistret_seedning]]) som inte får passeras i förbifarten.
Fånga-när-den-används är samma slutsats som koden redan drog för emotes (`bridge.js:553`).

### ⛔ GÅVOVÄLJAREN HAR ALDRIG GÅTT ATT KLICKA PÅ

Uppmätt i Chrome: `.gift-picker-modal` låg på **z-index 5000**, `.ae-modal` på **9000**.
Väljaren ritades alltså under eventmodalens mörka lager, och `elementFromPoint` mitt i ett
gåvokort returnerade `ae-check` — ett element i modalen bakom. Knappen "Välj gåva" öppnade en
dialog som varken gick att se eller använda.

Felet var tyst i två avseenden: ingenting kastade, och det såg inte trasigt ut — dialogen
fanns i DOM:en med rätt innehåll, bara bakom ett lager. Ett prov som frågar "finns
gåvoväljaren?" hade varit grönt hela tiden. Vaktat av `tests/action-dialoglager.test.js`,
mutationsprovat. Måttet som avgör saken är **inte** z-index utan `elementFromPoint`.

## 9. Event Simulator och Overlay-skärmar — byggda 2026-09-16

**Simulatorn** följer nu facit §5: fyra knappar på rad ett, `Välj gåva…` plus `Simulera Gåva`
på rad två. Gåvan skickas med sitt **riktiga coin-värde** — utan det passerar den aldrig en
`giftCoins`-tröskel, och just den triggern är den vanligaste i en riktig uppsättning.

En tredje rad finns som **inte** står i facit: Simulera Subscriber-emote, Fan Club-sticker och
Kommando. Skälet är att de tre triggarna annars inte går att prova utan en riktig tittare som
gör precis den saken — en Fan Club-sticker kräver en fanklubbsmedlem. Att bygga en trigger
ingen kan verifiera är exakt mönstret som redan drabbat fem widgetar
(se [[vyra_widget_live_trigger_pattern]]). Raden är utmärkt i gränssnittet som vår egen.

### ⛔ SIMULERADE EVENT FÖRORENADE MINNET

Simulatorn skickar med flit sina event genom `ingest()` — hela poängen är att de ska gå samma
väg som ett riktigt event. Men `ingest()` anropar också inlärningen, och inlärningen är ett
**påstående om verkligheten**: en gåva märkt som inlärd säger "den här har skickats i din
sändning", och en användare i väljaren säger "den här personen har varit här".

Uppmätt: `TestFollower`, `TestSharer`, `TestSubscriber`, `TestLiker` och `TestGifter` låg
redan i användarväljaren hos alla som någonsin tryckt på en simuleringsknapp. Med den nya
gåvokatalogen hade samma hål gett en falsk `Rose / 1 coins` märkt som inlärd.

Varje simulerat event bär nu `__simulerad: true`, och `live-client.js` hoppar över
inlärningen — men kör triggrarna precis som förut. **Kontrollmätning gjord:** ett event utan
flaggan lärs fortfarande in (`Riktig Gava:7`, `EnRiktigTittare`), så vakten mäter rätt sak och
inte bara "ingenting lärs in någonsin".

**Overlay-skärmarna** har fått facits förklaringstext (§4) — den som säger *varför* en skärm
behövs innan panelen listar tio av dem.

## 10. Bakåtkompatibilitet — mätt 2026-09-16

Ombyggnaden ändrade sparformatet, eventmodellen och fyra filers spara-väg. Data som fanns
**före** den var aldrig mätt. En körning i Chrome med data i exakt gammal form (ingen
`actionsEnabled`, ingen `animationPath`, poängen som typer i `types`, event utan
`advancedTrigger` och med villkoret i `condition`) gav:

| Sak | Resultat |
|---|---|
| Listan renderar gamla actions | ✔ fyra rader, rätt beskrivning, `+50` i poängkolumnen |
| Huvudbrytaren saknas i gammal data | ✔ tolkas som PÅ, inte som avstängd |
| Gammalt event utan `advancedTrigger` | ✔ läses ur `trigger`/`condition` |
| Redigering av gammal action | ✔ namn, alerttext, poäng, scen, volym — allt tillbaka |
| Sparning utan ändring | ✔ inget tappat, ingen dubblett |
| Gamla events fyrar genom hela kedjan | ✔ båda körde sin action |
| Gammal animation utan `animationPath` | ✔ faller tillbaka på `runWidget` |

### ⛔ ETT FEL HITTADES: gamla event tappade sin action i modalen

Fram till ombyggnaden sparade den enkla eventmodalen EN action i `actionId`; listorna
`allActionIds`/`randomActionIds` fanns bara om man gått via den avancerade panelen. Den nya
modalen läste bara listorna — så ett gammalt event öppnades med **båda tomma**, och en
sparning stoppades av "Välj minst en Action". Ingen data försvann, men varje befintligt event
blev omöjligt att redigera utan att välja om en koppling som redan fungerade.

Fallbacken lyfter nu `actionId` in i "Kör alla dessa Actions". Vaktat av
`tests/event-bakatkompatibilitet.test.js` med fyra prov, inklusive kontrollen att en riktig
lista **inte** skrivs över och att ett event utan action inte får ett påhittat val.
Mutationsprovat: båda de bärande proven faller när fallbacken tas bort.

> Riggläxa: första versionen av provet rapporterade "kopplingen försvann i collect()" och
> skrev ut `[ 'gammal1' ]` som faktiskt värde. Arrayen skapas inne i jsdom-fönstret och
> tillhör jsdoms realm; `assert.deepEqual` i strict-läge jämför prototyper. Felet låg i
> riggen — Chrome-körningen hade redan visat att sparningen fungerade.

## 11. `fetchAvailableGifts()` — byggd 2026-09-16, utan att röra molnet

Vägen jag först bedömde som blockerad visade sig gå **helt utanför** molnet och seedningsspärren:

`electron-app/tiktok-service.js` håller redan anslutningsobjektet, och `local-server.js` serverar
Studion på 127.0.0.1 — alltså är `fetch('/api/gifts')` **samma origin**, precis som
`obs-client.js` redan gör för OBS. Ingen ny rättighet, ingen molnrutt, inget som skrivs.

- `hamtaGavor()` i tjänsten anropar `fetchAvailableGifts()` (ett **rumsanrop**, ingen inloggning).
- `GET /api/gifts` i den lokala servern. **503** när TikTok-delen saknas, inte 404: 503 säger
  "funktionen finns men inte här", 404 hade sagt att adressen inte finns.
- Klienten cachar i `vyra-gift-catalog-v1` och hämtar när Automatik-sidan ritas — inte vid
  filens laddning, så en anslutning som ännu inte finns hinner komma upp.

**Väljaren har nu tre källor i fallande förtroende**, och etiketten visar vilken som gäller:

| Källa | Bär | Märkning |
|---|---|---|
| Inlärda från sändning | rätt namn, rätt värde, rätt bild — och vi har **sett** gåvan | grön |
| Rummets katalog | rätt namn och värde, inte sedd än | blå |
| `gifts-manifest.js` | engelska namn, inget värde | grå, `okänt värde` |

Rummets katalog skrivs **aldrig** in i `vyra-seen-gifts-v1`. Den säger vad som *går* att skicka,
inte vad som *har* skickats — blandas de ihop ljuger den gröna märkningen.

> Provläxa: första versionen av `electron-app/test/gavokatalog-rutt.test.js` stubbade hela
> `hamtaGavor()` och provade därmed sin **egen kopia** av normaliseringen. Den låg inlåst i en
> closure över `activeConnection` och gick inte att nå utifrån. Den är nu en ren exporterad
> funktion, `normaliseraGavor()`, och provet når koden. Mutationsprovat: stryks `urlList`- och
> `icon`-varianterna faller provet.

## 12. Öppna beslut

1. **Auktoriserad TikTok-session.** TikFinity ber användaren godkänna med sitt TikTok-konto
   och får då emote-katalogen, fan club, vänlistan och moderatorerna direkt — utan att vänta
   på att något ska hända live. VYRA ansluter **anonymt** (`new TikTokLiveConnection(username,
   options)` utan session). Biblioteket stöder både cookie-session (`sessionid` +
   `tt-target-idc`) och OAuth-token.
   ⚠️ En `sessionid`-cookie är **full kontokontroll**, inte en avgränsad OAuth-rättighet. Att
   be kunder lämna den till VYRA är ett säkerhetsbeslut med juridiska följder, inte en
   kodfråga. OAuth-vägen är den rena men kräver godkännande från TikTok.
3. Ska vår statustext byta från `Online` till `Ready`, eller behåller vi vår?
