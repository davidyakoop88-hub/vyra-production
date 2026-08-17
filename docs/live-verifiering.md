# Att läsa av under nästa riktiga sändning

Fyra saker i battle-kedjan går **inte** att avgöra utan en riktig TikTok LIVE-match. De är byggda
med tolerant kod och medvetna gissningar, och varje gissning står utskriven här tillsammans med
exakt vad man ska titta på för att stänga den.

Det här är inte en önskelista. Varje punkt är en plats där koden idag gör ett antagande som kan vara
fel, och där felet bara syns i sändning.

**Ta med:** en dator med bryggans logg synlig (`ANSLUT-TIKTOK-LIVE.cmd` skriver till konsolen) och
Studion öppen i en flik. Punkt 1 och 2 kan läsas efteråt; punkt 3 måste ses i stunden.

---

## 1. Tänder handsken vid rätt ögonblick?

**Antagandet:** bryggan skickar boost-eventet på `taskMessageType = START`, eftersom det är det enda
steget som bär `rewardConfig`. Men samma config innehåller `rewardStartTimestamp` — tiden då
fönstret *faktiskt* börjar. Kommer START märkbart tidigare tänds Glove Snipe innan multiplikatorn
gäller.

**Titta efter i bryggans logg:**

```
[bridge] boost-fonster x3 i match 7123... , 30s
```

**Jämför med:** när TikToks egen handske/multiplikator syns i appen. Är overlayn före med mer än
någon sekund ska sändningen fördröjas till `rewardStartTimestamp` i stället.

Koden: `tiktok-bridge/normalizer.js` → `battleTaskFields`, fältet `fonsterStart` finns redan uträknat
men används inte till timing än.

## 2. Vilka värden bär `battleStatus`?

**Antagandet:** `battle-mvp-session.js` klassar råa statusvärden som `aktiv`, `slut` eller `okänd`.
Klassificeringen är tolerant med flit — **inget riktigt värde är uppmätt.** Det enda värdet i hela
repot är `'active'`, och det är påhittat i ett servertest.

**Läs av i Studions konsol efter matchen:**

```js
VyraBattleMvp.seenStatuses      // varje rått värde, i den ordning det setts
VyraBattleMvp.aktiv()           // står en session fortfarande öppen?
```

Listan sparas i localStorage och överlever en omladdning. Känns slutvärdet inte igen stängs
sessionen aldrig, och MVP-overlayn tänds aldrig — då finns `VyraBattleMvp.avsluta()` som break-glass.

## 3. Vilken LINK_MIC-händelse bär matchens slut?

**Antagandet:** ingen. Bryggan har en sond som **bara loggar** fyra kandidater:
`LINK_MIC_BATTLE`, `LINK_MIC_ARMIES`, `LINK_MIC_BATTLE_PUNISH_FINISH`, `LINK_MIC_BATTLE_TASK`.

En hel sändning gick 2026-08-06 utan att ett enda battle-event nådde klienten, och taket på 40 rader
slog i innan slutet hann loggas. Taket är per match sedan dess.

**Titta efter i loggen:**

```
[bridge][battle-sond] LINK_MIC_ARMIES #3 <nycklar och skalärer>
```

**Det som behövs:** raderna från matchens sista sekunder. Vilken av de fyra som fyrar när matchen
tar slut, och vilket fält som skiljer den från raderna mitt i matchen.

## 4. Vad innehåller `LINK_MIC_ARMIES` per sida?

**Antagandet:** att `BattleUserArmy { userId, nickname, score, diamondScore }` finns per lag, enligt
`tiktok-live-proto/v3`. Ingen har sett formen i verkligheten.

Stämmer den blir MVP **exakt** i stället för uträknad: idag summerar `battle-mvp-session.js` coins
per användare själv mellan start och slut, medan TikTok redan skickar sin egen poängställning.
Samma data ger dessutom en armé-leaderboard per sida, vilket ingen konkurrent har.

**Läs samma sondrader som punkt 3** — `LINK_MIC_ARMIES` loggar sina nycklar och skalärer.

## 5. Delar OBS browser source samma `localStorage` som webbläsaren?

**Antagandet:** ingen — och det är hela poängen med punkten. `vyra-points-v1` är rå `localStorage`
och synkas aldrig till molnet, så poängekonomin är **per lagerrymd**. Vilken rymd OBS browser
source hamnar i går inte att avgöra ur koden: CEF kör med egen cachekatalog, men om streamern i
stället förhandsgranskar overlaylänken i samma webbläsare som Studion delar de rymd.

Det avgör vilken form problemet i §15a hade innan det lagades — och vilken form resten av 15b tar:

| Om lagret delas | Om det inte delas |
|---|---|
| En förare per maskin. Master-valet i `action-master.js` gör sitt jobb. | Varje rymd väljer sin **egen** förare och för sitt **eget** saldo för samma tittare. |
| Cooldown fungerar när Studion är öppen. | OBS-rymden har ingen skrivbar flik alls — cooldown verkningslös där (§15b). |

Divergerande saldon är inte mindre allvarligt än trippeldebitering; det är svårare att upptäcka.

**Läs av så här, med Studion och OBS igång samtidigt:**

1. Låt en känd tittare trigga ett event med `pointsCost` **en** gång.
2. I Studions konsol: `VyraPoints.get('<tittarnamn>')`
3. I OBS browser sources konsol (högerklick källan → Interact → F12, eller `--remote-debugging-port`):
   samma anrop, plus `localStorage.getItem('vyra-automation-master')`.

**Samma saldo och samma `tabId` i master-nyckeln** → rymden är delad, och allt i §15 gäller som mätt.
**Olika saldon, eller två olika `tabId`** → rymderna är skilda, och då är nästa arbete att bestämma
om poängen ska bo i molnet i stället för i `localStorage`.

Koden: `action-runtime.js` → `POINTS_KEY`, och `action-master.js` → `NYCKEL`.

---

## Efteråt

Skriv in det ni såg i den punkt det gäller, och stäng den. Ett antagande som visat sig stämma är
lika värdefullt att skriva ner som ett som visat sig fel — nästa person ska slippa gissa igen.

Ändras koden efter avläsningen: kör `node scripts/domaner.js test live` och
`node scripts/domaner.js test tiktok-bridge`.
