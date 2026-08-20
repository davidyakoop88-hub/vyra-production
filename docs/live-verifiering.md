# Att läsa av under nästa riktiga sändning

Fyra saker i battle-kedjan går **inte** att avgöra utan en riktig TikTok LIVE-match, och sedan
2026-08-18 väntar Guardian Emblem (punkt 6) på samma sändning. De är byggda
med tolerant kod och medvetna gissningar, och varje gissning står utskriven här tillsammans med
exakt vad man ska titta på för att stänga den.

Det här är inte en önskelista. Varje punkt är en plats där koden idag gör ett antagande som kan vara
fel, och där felet bara syns i sändning.

**Ta med:** en dator med bryggans logg synlig (`ANSLUT-TIKTOK-LIVE.cmd` skriver till konsolen) och
Studion öppen i en flik. Punkt 1 och 2 kan läsas efteråt; punkt 3 måste ses i stunden.

## Starta med inspelning i stället

**Kör `SPELA-IN-TIKTOK.cmd` i stället för `ANSLUT-TIKTOK-LIVE.cmd`.** Då sparas de råa payloads
TikTok skickar till `tiktok-bridge/inspelningar/`, och punkterna nedan behöver inte läsas i stunden
— de kan läsas i lugn och ro efteråt, om och om igen.

```
tiktok-bridge\inspelningar\2026-08-17T2014-a3f2.jsonl
```

En rad per händelse, JSON Lines. Fyra saker att veta:

- **Filerna är maskerade.** Användar-id, smeknamn, avatar-länkar och kommentarer ersätts av hashar
  och platshållare. Hasharna är stabila, så samma tittare går att följa genom hela filen — det är
  det som gör en armé-lista läsbar i efterhand. **Tal, tidsstämplar och fältnamn är orörda**, och
  det är dem inspelningen finns för.
- **Både rått och normaliserat loggas.** En vidarebefordrad händelse ger två rader: `kalla:
  "vidarebefordrad"` med TikToks payload, och `_utgaende` med det bryggan faktiskt skickade. Diffen
  mellan dem pekar ut var ett fält tappas — vilket är precis vad fyra-listor-problemet kräver.
- **Inspelningen ser mer än bryggan skickar.** Default är battle-familjen, inklusive
  `LINK_MIC_ARMIES` som bryggan *inte* prenumererar på. Vill du ha allt:
  `set VYRA_INSPELNING_TYPER=alla` före start. En inspelad typ når aldrig molnet.
- **Den slutar skriva vid 50 MB** (`VYRA_INSPELNING_MAX_MB`) och stänger av sig själv om katalogen
  inte går att skapa. Sändningen påverkas inte i något av fallen.

Mappen är gitignorerad. Titta i filerna innan du delar dem vidare.

---

## Läs av med ett kommando

Sedan 2026-08-20 finns en analysator som svarar på punkt 1, 2, 3, 4 och 6 direkt ur inspelningen:

```
node tiktok-bridge/analysera-inspelning.js tiktok-bridge/inspelningar/<fil>.jsonl
```

Den skriver ut varje punkt med sitt svar, siffrorna den byggde svaret på och vad som bör göras.
Tre saker den gör med flit:

- **Den svarar `inget underlag` hellre än att gissa.** En punkt utan data i filen får inget svar —
  ett verktyg som gissar flyttar bara gissningen ett steg.
- **Den flaggar orimliga mätvärden.** Ett avstånd på minuter mellan START och `rewardStartTimestamp`
  är inte en timing-avvikelse utan trasig data (sekunder mot millisekunder, lokal tid mot UTC), och
  då säger den det i stället för att ge ett timing-råd.
- **Punkt 5 och 7 svarar `kräver OBS`.** Ingen fil kan avgöra vilken `localStorage`-rymd OBS hamnar
  i, eller om OBS spelar H.264. De två läses av för hand enligt sina avsnitt nedan.

Vaktat av `tests/analysera-inspelning.test.js`, som bland annat fäller varje version som svarar
något annat än `inget underlag` på en inspelning utan battle-händelser.

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

## 6. Vilket event bär Guardian-status?

**Widgeten är klar och väntar bara på ett event.** `templateGuardianEmblem` finns i katalogen i fyra
praktsteg, koreografin "Vapenskölden" spelar, texten finns på svenska och engelska, och
`window.triggerGuardianEmblem` är köad i `runtime-controls.js`. Det enda som saknas är kopplingen
till verkligheten.

**Praktsteget är INTE en fråga för sändningen.** Det är ett studioval: streamern väljer sin nivå i
panelen, och ett steg som kom utifrån hade tyst skrivit över den. Eventet behöver bara bära VEM som
kom in. Det är skillnaden mot Guardian Welcome, som också ville ha ett veckonummer — den frågan är
borta med den designen.

**Vad vi inte vet.** `tiktok-live-connector` 2.4.0 har 67 händelser; bryggan prenumererar på elva.
Ingen av dem är dokumenterad som "Guardian". Kandidaterna, lästa ur `tiktok-live-proto/v3`:

| Kandidat | Vad som skulle bära statusen |
|---|---|
| `MEMBER` | ett rollfält på användaren — `guardianType`, `userRole` eller en post i `badgeList` |
| `USER_NAVIGATION_EVENT` | en flagga som `isGuardian` |
| en typ vi inte prenumererar på | okänd — det är därför inspelningen ska köras med `alla` |

**Så här läser du av det.** Kör `SPELA-IN-TIKTOK.cmd` med `set VYRA_INSPELNING_TYPER=alla` före
start, så spelas varje WebcastEvent till fil även de bryggan inte skickar vidare. En inspelad typ
når aldrig molnet, så det är riskfritt.

När en Guardian går in: notera klockslaget. Leta sedan i `tiktok-bridge/inspelningar/<fil>.jsonl`
efter rader kring den tidpunkten och jämför `kalla:"vidarebefordrad"` (TikToks råa payload) med
`_utgaende` (det bryggan faktiskt skickade). **Fältnamn och tal är omaskerade** — det är precis dem
inspelningen finns för.

Två saker ska antecknas:

1. **Händelsetypen.** Vilken `WebcastEvent`-nyckel raden bär.
2. **Fältet som skiljer en Guardian från en vanlig medlem.** Jämför med en rad för någon som
   uppenbart inte är Guardian — utan den jämförelsen är varje fält en kandidat.

**Vad som händer sedan.** Fältet skrivs in i det förberedda blocket i `tiktok-bridge/bridge.js`
(sök `GUARDIAN — FORBEREDD`), och typen `guardian` läggs till i **alla fyra** listorna i samma
ändring: bryggans `TILL_MOLNET`, serverns `TIKTOK_INGEST_TYPES` och `TIKTOK_ROOM_TYPES`, och
event-bussens `ALLOWED`. Missas en tystnar typen någonstans på vägen; `tests/event-contract.test.js`
fångar det direkt.

Listorna rörs **inte** innan dess. En typ som står i kontraktet men som ingen kod någonsin skickar
är en död kontraktspost — samma sorts lögn som §3 kostade en hel ansats för.

## 7. Spelar Glove Snipes effektvideor i OBS?

**Ingen automat kan svara på det här.** Glove Snipes åtta katalogvarianter visar effekten som en
H.264-kodad MP4 (`pack-fx-video`). Uppmätt 2026-08-19: playwright-core:s Chromium — den webbläsare
CI och alla browserprov kör i — saknar stöd för den kodeken. Videon faller med
`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`, och `canPlayType('video/mp4; codecs="avc1.42E01E")` svarar med
tom sträng. Alla åtta varianter målar därför 0 % i provbrowsern, och den visuella regressionsvakten
undantar dem av det skälet.

Vanlig Chrome och OBS browser source har H.264 — så mätningen säger ingenting om huruvida de
faktiskt spelar där. Det är den enda widgetfamiljen i katalogen där ingen vakt kan uttala sig.

**Läs av så här, i OBS med scenens overlay-länk:**

1. Lägg in en Glove Snipe-widget och trigga den (Testa-knappen räcker).
2. Syns effekten? Notera vilken variant och vilket paket.
3. Öppna OBS browser source-loggen och sök efter `DEMUXER` eller `pack-fx-video`.
4. Skriv in svaret här: **spelar / spelar inte**, och i så fall vilken variant.

Spelar de inte heller i OBS är det en riktig bugg som ingen vakt hittat — och då är nästa steg att
byta kodek (VP9/WebM spelas av båda) i stället för att jaga den i provbrowsern.

## Efteråt

Skriv in det ni såg i den punkt det gäller, och stäng den. Ett antagande som visat sig stämma är
lika värdefullt att skriva ner som ett som visat sig fel — nästa person ska slippa gissa igen.

Ändras koden efter avläsningen: kör `node scripts/domaner.js test live` och
`node scripts/domaner.js test tiktok-bridge`.
