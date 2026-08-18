# VYRA Project State

## Checkpoint 38 — Guardian Emblem byggd om mot referensbilderna (2026-08-18)

Checkpoint 37:s emblem var **tekniskt rätt och visuellt fel**: en sköld med en hjort i, när
referensen är en **rund avatarram med en hjort över**. 1300 gröna prov, 18 mutationer och åtta
foton — och ingen av dem kunde se att det var fel widget.

### Varför det blev fel

Referensbilderna kom som bilagor i chatten. Innan bygget började tog sessionen slut på kontext och
samtalet sammanfattades: **text överlever en sammanfattning, bilagor gör det inte.** Kvar fanns en
ordlista över vilka delar som skulle finnas — hjort, lövverk, voluter, smaragder, banderoll — och
den listan byggde jag efter. Delarna stämde. Kompositionen var en annan widget.

**Felet var inte att bygga ur texten. Felet var att inte säga att jag byggde blint.** Ett
meddelande hade kostat mindre än en hel designomgång.

Åtgärden är `docs/referens/guardian-emblem.md`: bilderna kan inte sparas i repot, men beskrivningen
kan — komposition uppifrån och ner, vad varje praktsteg visar, paletten, och de regler som följer av
bilderna. **Läs den innan du rör `guardian-emblem.css`.**

### Vad som ändrades

| | Före | Efter |
|---|---|---|
| Centrum | sköld med hjort i | **rund guldram** med grön innerring och avatar |
| Hjorten | liten, inuti skölden | **ovanför ramen**, gevir som breder ut sig över hela bredden |
| Sidorna | smala lagerkvistar | guldplymer som spretar som flammor, mörkgröna blad bakom |
| Nedtill | rak sockel | voluter som rullar ut i spiraler + stor bottendiamant |
| Sköldar | ingen | **två sidosköldar** med guldhjorthuvud, plus en kronsköld i steg 2 |
| Praktsteg | inget märke | **diamantbricka med siffran** överst |
| Rubriken | `BESKYDDAREN HAR ANLÄNT` | utgår — banderollen är emblemets namnskylt |
| Delar | 6/9/12/15 | 10/12/16/21 |
| Mått | 260–440 | 330–585 |

### Tre fel som bara fotot kunde se

1. **Hjorten blev en mus.** Rund skalle, stora runda öron, ingen mule. Skillnaden mot en hjort är
   avsmalningen — ett långt ansikte från hög panna till mörk nos.
2. **Kronspetsen låg över mulen.** Hjortens negativa undermarginal är en **mätning**, inte en smak.
3. **Bottendiamanten kunde inte nå över banderollen.** Den låg inuti ramen, och **en absolut
   placerad del inuti en förälder med eget `z-index` kan aldrig nå över en granne till föräldern**,
   hur högt dess eget `z-index` än är. Diamanten ligger nu i flödet.

### Vad vaktnätet gjorde och inte gjorde

Alla tolv vakter höll genom hela ombyggnaden och behövde inte mjukas upp en enda gång. Registret
byttes ut, fjorton delar bytte namn, koreografin skrevs om — och `G1`, `G-SLUT` och
`G-STEG-PROGRESSION` fångade varje glapp direkt: fyra föräldralösa CSS-regler (`rubrik`, `krona`,
`skold`, `sockel`) hittades i samma sekund de blev döda.

Men **inget prov kunde se att det var fel widget.** Vaktnätet svarar på *hänger delarna ihop*, inte
på *ser det ut som referensen*. Det är inte en brist i näten — det är gränsen för vad ett prov kan
veta, och därför finns referensfilen.

### Sviter

Node 1302/1302 gröna. Browser: emblemets fyra gröna; svitens enda röda är `ovre handtag strackar
lodratt` i `widget-handtag.browser.test.js`, grön i isolering och orörd av den här ändringen.

## Checkpoint 37 — Guardian Emblem: familjen skrotad, byggd om, och vaktnätet slöt sig (2026-08-18)

Guardian Welcome revs helt (1943 rader) och ersattes av **`templateGuardianEmblem`** — ett
heraldiskt vapen i fyra praktsteg. 56 prov skrivna före en rad implementation, röd baslinje
committad och pushad, sedan kod tills allt var grönt. 18 mutationsprov, 8 foton.

### Vad som finns nu

| | |
|---|---|
| Typ | `templateGuardianEmblem`, katalognyckel `catalog:guardianemblem:1–4` |
| Format | **400 px brett i varje steg** — höjden är det praktnivån betalar med (260/320/380/440) |
| Koreografi | "Vapenskölden": `ljus` 600 → `oppna` 1200 → `hyllning` 3500 → `upplosning` 800 = 6100 ms |
| Delar | 6 → 9 → 12 → 15, strikt kumulativa (steg N bär steg N−1 som **prefix**) |
| Filer | `guardian-emblem-fas.js`, `guardian-emblem.css` + tre provfiler |
| Kö | `triggerGuardianEmblem:[8000,5]` i `runtime-controls.js` |
| Brygga | förberedd men **inte aktiverad** — se `docs/live-verifiering.md` punkt 6 |

### Vaktnätet: tolv vakter, och varför de är slutna

`G1` kräver att varje registrerat steg och varje registrerad DEL har CSS. `G-SLUT` kräver det
omvända: att varje steg som går att **skapa** finns i registret — och den jämför **fyra** källor,
inte två (fabriken, panelväljaren, katalogsektionen, registret). `G-STEG-PROGRESSION` kräver
prefixlikhet mellan stegen, och `G-STEG-HÖJD` mäter i en riktig webbläsare att det syns.

De fyra frånvarovakterna (`G-PREFIX-ISOLATION`, `G-IMPORTANT`, `G-DÖD-CSS`, `G-VILOLAGER`) bär
`kravCss()` **inne i sin egen kropp**. Det är §7 i sin skarpaste form och kom direkt ur PR #222:s
fas 0, där tre vakter var gröna mot en fil som inte fanns. Ett grönt prov säger ingenting om vad
grannen mätte.

### Fem lärdomar

**1. En cachebust-sträng får inte namnge det den bustar.** `20260818-guardian` överlevde sin egen
familj. Strängen ska svara på NÄR filen byttes, inte på VAD som låg i den — annars blir den ett
arkeologiskt spår efter kod som inte finns, och nästa läsare söker på namnet, hittar en
versionsträng och ingen implementation. Nu vaktat, med en svartlista över familjenamn i stället för
en generisk ordregel: ett datum är precis vad vi vill ha. Strängen här heter `20260818-2`. Vakten
hittade direkt en ärvd överträdelse (`20260807-topgift`) som står i en uttryckligen **krympande**
lista — att döpa om den nu vore en bump utan ändring.

**2. Ett prov som jämför tomma listor är grönt av frånvaro.** `G-STEG-HÖJD` skulle ha varit grön vid
den röda baslinjen: fyra steg som inte renderas ger fyra tomma mätningar som jämför lika. Varje
mätning börjar därför med `assert.ok(!fel)` som bär renderingsfelet i texten.

**3. Ett prov får inte bevisa sin egen fixtur.** Fabriken bestämmer höjden per steg. Att mäta den i
webbläsaren hade läst tillbaka en siffra jsdom redan vaktar. Alla fyra sidorna sätter därför **samma
lådhöjd**, och det som mäts är delarnas gemensamma omfång — bara delar med yta och ärvd opacitet
över noll räknas. Mutation M17 visade varför det behövs tre prov och inte ett: när steg 4:s tre nya
delar doldes fortsatte omfånget att växa (skalan växer också), men *antalet målade delar* och *varje
ny del vid namn* föll direkt. **En enskild geometrisk mätning är inte ett semantiskt bevis.**

**4. En egenskap som en animation skriver över måste animationen bära med sig.** Diamanten är en
kvadrat roterad 45°. Entréanimationen skrev `transform` och rotationen försvann — den var en grön
**kvadrat** under hela `oppna`. Samma lärdom som `--gw-spacing`, en nivå djupare: det gäller varje
egenskap i samma `transform`-sträng, inte bara de som råkar vara inställningar. **Inget prov i
vaktnätet kunde se det** — delen fanns, var målad, hade yta. Ögat är mätinstrumentet för form.

**5. Registrets ordning är inte placeringen.** `STEG[n].delar` är sorterad efter NÄR delarna
tillkom — det är den ordningen `G-STEG-PROGRESSION` kräver prefixlikhet i. Renderaren följer
registret rakt av, så utan `order` i CSS blev DOM-ordningen också den visuella: kronan hamnade
**under** skölden. JS bestämmer VAD och NÄR, CSS bestämmer VAR och HUR.

### Oväntade fynd, rapporterade och lagade

- **`docs/katalogkarta.md` hade systematiskt fel proveniens.** Datum- och PR-kolumnerna kommer ur
  `git log` per fil, och kartan hade genererats i en **shallow clone** — 20 sektioner stod som
  ändrade 2026-08-18 i PR #221 när de inte rörts sedan 5 augusti och PR #92. Kartan är omgenererad
  på full historik, och generatorn varnar nu när `.git/shallow` finns.
- **`G1`:s delcensus var blind för versaler.** `.ge-kronaX` lästes som `krona`, så en felstavning
  med versal hade varit osynlig för **båda** halvorna av G1. Upptäckt av mutation M1, som inte föll.
  Teckenklassen är nu `[A-Za-z0-9-]`.
- **Censusen i `catalog-rewiring` gick till 23 i stället för 22.** Det andra `VyraWidgets.create(`
  var ingen katalogplats utan en panel som skapade en kastad widget bara för att läsa dess mått.
  Uppslagningen går nu genom `VyraWidgets.variants('guardianemblem.matt')`. **Vakten gjorde rätt:**
  en måttläsning som smyger in bland katalogställena gör siffran obegriplig för nästa läsare.
- **`G-KLOCKA`:s urklippning matchade inte den kod den skulle undanta.** Mönstret var skrivet mot en
  form jag ännu inte författat. Regionidentifieringen lagades — inte källan — och vakten fick en
  egen kontroll som kräver att urklippningen både hittar blocket och tar bort **mindre än 400
  tecken**: ett girigt mönster som svalde halva filen hade annars gjort provet grönt av tomhet.

### Invarianter som inte får brytas

- `klocka` i `guardian-emblem-fas.js` **måste vara flerradig** och sluta med `};` på egen rad —
  `G-KLOCKA` lyfter bort just det blocket innan den letar direktanrop till `setTimeout`. Det är en
  formkoppling, inte en beteendekoppling: bryts den blir provet **rött**, aldrig tyst grönt.
- Praktsteget är ett **studioval**. Bryggan ska aldrig skicka något steg — ett steg utifrån hade
  tyst skrivit över streamerns val.
- Varje `ge-`-klass måste vara en registrerad DEL. Grafik inuti SVG:erna använder därför utskrivna
  färgattribut, inte klasser.

### Nästa steg

1. **Visuell finjustering** (fas 11) om fotona motiverar det — avatarens medaljong är tom utan bild,
   och steg 1 har gott om luft.
2. **Live-verifiering punkt 6** — vilket TikTok-event bär Guardian-status. Widgeten är klar och
   väntar bara på ett fältnamn.
3. `20260807-topgift` byts nästa gång `gift-event-images.js` eller `live-leaderboard.js` ändras.

## Checkpoint 36 — Guardian Welcome, en ny familj byggd bakifrån (2026-08-18)

Första familjen i repot där **varenda rad prov skrevs innan en rad implementation**. 53 prov, röd
baslinje fotograferad, sedan kod tills allt var grönt.

### Vad som byggdes

`templateGuardianWelcome` — en egen widgetfamilj för TikToks Guardians. Inte en variant av Fan
Level Up: samma mönster, inga delade data.

| Fil | Roll |
|---|---|
| `guardian-fas.js` | koreografin "Beskyddet", registret `FASER`/`STORLEKAR`, och `sprak()` |
| `guardian-welcome.css` | temat och koreografins VAD |
| `tests/guardian-fas.test.js` | 35 prov — vaktnätet, tiderna, språket, kön, markupen |
| `tests/browser/guardian-welcome.browser.test.js` | 18 prov — vad tittaren faktiskt ser |
| `tests/helpers/guardian-fas-register.js` | registret utan en hel sida |

Ändrat: `widget-factory.js` (familjen + måtten på ett ställe), `media.js` (renderare, panel,
katalogsektion, trigger), `runtime-controls.js` (kön), `studio.html`, `tiktok-bridge/bridge.js`
(förberedd trigger), tre fixtures och tre dokument.

### Koreografin "Beskyddet"

| Fas | ms | Vad |
|---|---|---|
| `ljus` | 500 | auroran tonar in på **tom scen** — inget annat syns |
| `oppna` | 900 | skölden glider in från vänster, rubriken stämplas fram (teckenavstånd .5em → .15em), namn +200 ms, underrubrik +400 ms |
| `hyllning` | 1200/1600/2000 | sköldens glöd pulserar, auroran andas, inget annat rör sig |
| `upplosning` | 600 | omvänd ordning, **auroran sist** |

Bara hyllningen varierar med storleken. Tre storlekar: banner 270×180, kort 300×280, full 400×300.

### Vaktnätet, matematiskt slutet

`G1` kräver att varje storlek i `FASER` har CSS och att varje fas har en regel. `G-SLUT` vänder på
beroendet och kräver att fabriken, panelväljaren och `FASER` är **exakt samma mängd**. Utan båda
hållen kan en fjärde storlek läggas till utan koreografi — det var precis så `card` levde i Fan
Level Ups CSS ett helt repo-liv utan att finnas i fabriken.

Dessutom `G-IMPORTANT` (ingen `!important` på transform/opacity/clip-path), `G-DÖD-CSS` (ingen
döljning som en senare regel med samma specificitet motsäger) och `G-VILOLAGER` (ingen `infinite`
på en fas som tas bort).

**Mutationsprovat: 9 av 9 dödade av rätt vakt**, körda om mot koden MED ramen inbyggd — en
visuell omgång kan flytta det en vakt tittar på, och ett gammalt mutationsresultat är inget bevis
om koden hunnit ändras sedan dess.

| Mutation | Vakt som föll |
|---|---|
| fjärde storlek utan koreografi | `G-SLUT` |
| `!important` på transform | `G-IMPORTANT` |
| `infinite` flyttad till öppnandet | `G-VILOLAGER` |
| död `display:none` | `G-DÖD-CSS` |
| testknappen tänder DOM direkt | båda köproven |
| Guardian ur `configs` | köprovet |
| omkastad fasordning | tre fasprov |
| symmetrisk språkfallback | språkprovet |
| reservtexten glider från syskonfilen | reservtextprovet (ny i ramomgången) |

### Kön är mätt i beteende, inte bara i källkod

Källvakten läser text: står `triggerGuardianWelcome` i `configs`, och anropar knappen det globala
namnet? Det är en stavningskontroll. Den kan inte se om kön FAKTISKT håller tillbaka, och det är
det enda som gör §2:s lärdom sann. Uppmätt i Chromium, tre klick i följd:

| | vantande | spelar | `gw-active` |
|---|---|---|---|
| före klick | 0 | false | false |
| ett klick | 0 | **true** | true (fas `gw-fas-ljus`) |
| tre klick | **2** | true | — |

De två extra hölls alltså i kön i stället för att spela ovanpå den första. Provet bär också
kontrollmätningen: utan att klicket bevisligen startade något vore "kön höll tillbaka" trivialt
sant för en knapp som inte gör någonting alls.

### Tre fynd som kostade något

**1. §7-fällan, fångad medan den byggdes.** Första körningen av den röda baslinjen gav fem gröna,
inte två. `G-IMPORTANT`, `G-DÖD-CSS` och `G-VILOLAGER` var alla gröna — **mot en fil som inte
fanns**. Matcharna fungerade (deras positiva kontroller bevisade det), men de kördes mot en tom
sträng: *"ingen `!important` i CSS:en"* är trivialt sant om det inte finns någon CSS. Att luta sig
mot att `G0` fångar det räcker inte — G0 är ett **annat** prov, och ett grönt prov säger ingenting
om vad grannen mätte. Kontrollmätningen `kravCss()` ligger nu inne i varje frånvaroprov.

**2. En pausad animation överlever att dess CSS-regel slutar gälla.** Browsersviten pinnar varje
fas med Web Animations API. Efter att öppnandet pinnats och klassen bytts mot upplösningen bar
rubriken **båda** — `gwFadeOut@0` och `gwStamp@0` — och `gwStamp` med fill-mode `both` höll den på
opacity 0. Mätningen sa alltså att upplösningen började från en släckt rubrik, och hade fått mig
att "laga" en design som fungerade. En körande CSS-animation tas bort när regeln försvinner; en
pausad gör det inte, för pausningen ger den en hold-time och den räknas inte längre som idle.

`cancel()` löste det men lämnade animationen detachad — nästa klassbyte återuppväckte den inte.
`play()` före klassbytet gav i stället **dubbletter**: tre `gwStamp` på samma element. Slutsatsen
är enklare än alla tre: **en mätning som muterar sitt eget mätobjekt behöver ett nytt mätobjekt
varje gång.** `render()` bygger en ny nod utan en enda animation.

**3. En kommentar som citerar kod fäller en källkodsvakt — tredje gången i repot.** Det förberedda
bryggblocket innehåller en utkommenterad `sendEvent('guardian', …)`. `battle-probe.test.js` skannar
**rå** källkod från `battle-sond ---` till `STREAM_END` och förbjuder `sendEvent(` där. Blocket
flyttades utanför regionen i stället för att vakten gjordes blindare.

### Vad som medvetet INTE gjordes

**Bryggans fyra listor rörs inte.** `docs/live-verifiering.md` punkt 6 beskriver vad som ska läsas
av under en riktig sändning: vilken `WebcastEvent` som bär Guardian-status, vilket fält som skiljer
en Guardian från en vanlig medlem, och om payloaden bär TikToks egen veckosiffra. Att namnge typen
`guardian` i kontraktet innan någon kod skickar den vore en död kontraktspost — samma sorts lögn
som §3 kostade en hel ansats för.

### Nästa steg

1. **Testa via panelens knapp** — "Testa Guardian-välkomnande" spelar samma väg som en riktig
   Guardian, genom kön, inte snabbare.
2. **Kör en sändning med inspelaren på** (`set VYRA_INSPELNING_TYPER=alla`) och vänta på att en
   Guardian går in. Skicka payload-loggen tillbaka.
3. Då aktiveras triggern och de fyra listorna i samma ändring.

Oförändrat sedan checkpoint 34–35: §5 väntar på en deploy, battle-kedjan på samma sändning, och
`VYRA_MASTER_ROADMAP.md` har fortfarande driftat från verkligheten.


## Checkpoint 35 — panelens live-väg, ett tecken av åtta (2026-08-18)

Rapporterat av David: *"när man skriver text måste man klicka hela tiden på rutan."* Mätt visade
det sig vara värre än så.

### Felet, uppmätt

`render()` i `studio.js` är `viewRoot.innerHTML = m[view]()` — den river hela vyn, inklusive
egenskapspanelen. Två panelfiler anropade den från en `oninput`-handler, alltså vid **varje
tangenttryck**. Uppmätt i riktig Chrome, åtta tecken skrivna i följd utan att klicka om:

| panel | fält | tecken fram | fokus kvar | samma nod |
|---|---|---|---|---|
| `custom-widgets.js` | `#ctwText` | **1/8** | nej | nej |
| `gift-fireworks.js` | `#followName` | **1/8** | nej | nej |
| `gift-fireworks.js` | `#followMessage` | **1/8** | nej | nej |
| `media.js` (advancedPropertyBind) | `#propWidth` | 5/5 | ja | ja | ← kontroll |

Efter första tecknet blev `document.activeElement` **`BODY`**. Kontrollen står i *samma panel* som
`#ctwText` men ägs av den delade live-vägen och klarar sig helt — det är den raden som gör
mätningen till ett mått på panelen och inte på webbläsaren.

### Vakten fanns redan. Den tittade bara åt fel håll.

`tests/panel-live-path.test.js` bar regeln sedan tidigare — *render() får inte anropas från en
oninput-handler* — men listade **sex filnamn skrivna för hand**. `custom-widgets.js` och
`gift-fireworks.js` tillkom efteråt och stod inte med.

Listan härleds nu ur klientens egen monkey-patch-konvention: en fil som binder egenskapskontroller
skriver `props=function` eller `bind=function`. Det ger 15 filer i stället för 6, och en nionde
panelfil ärver regeln utan att någon behöver komma ihåg den. Samma princip som `F1`/`23g` i
fan-fas-provet, där uppräkningen byttes mot ett register.

### Lagningen

Alla tre lades på den mall `giftFieldBind` i `media.js` redan följer:

```js
el.oninput  = e => vyraLivePatch(w, el, key, las(e));          // live, rör aldrig panelen
el.onchange = e => { w[key] = las(e); save(); vyraRenderKeepingPanel() };   // commit
```

`gift-fireworks.js` behåller sina billigare stilputtar för `x`/`y`/`width` (de rör inte ens
canvasnoden) och byter bara ut `else render()`. Efter lagningen: **8/8 tecken, fokus kvar, samma
nod** för alla tre.

### Vakterna

| Vakt | Var | Vad |
|---|---|---|
| statisk | `tests/panel-live-path.test.js` | härledd fillista + golv på 12 filer, så en trasig härledning inte kan skanna noll |
| `fältet finns och tar emot fokus` | `tests/browser/panel-controls.browser.test.js` | positiv kontroll |
| `hela meningen kommer fram` | samma fil | alla tecken måste nå fram |
| `elementet byts inte ut` | samma fil | nodidentitet och fokus genom hela skrivandet |

Röd baslinje: den statiska vakten namngav tre brott; browserproven föll 6 av 12 för de tre trasiga
fälten medan kontrollen och den positiva kontrollen stod gröna. Mutationsprovat åt båda hållen —
med koden återställd faller exakt samma sex.

### Ett prov ströks, med flit

Ett fjärde browserprov skulle mäta att panelens `scrollTop` överlever skrivandet. Det föll fint —
men på `el.focus()`, som själv drar in elementet i en scrollbar behållare, inte på omrenderingen.
Med baslinjen tagen efter fokus blev det grönt i **båda** tillstånden. **Ett prov som inte kan falla
på felet det påstår sig vakta är en lögnare**, så det togs bort i stället för att behållas som
utfyllnad. Panelens scroll under en *dragning* mäts fortfarande av fallen längre upp i filen.

### Vad som inte gick att mäta här

Commit-vägen anropar samma `save()` som varje annat panelfält, i samma ögonblick (`change`). Om
skrivningen verkligen når disk går **inte** att avgöra i riggen: utan en inloggad, skrivägande
session svarar `save()` `{ok:false, reason:"not-writable"}`. Det gäller alla fält, inte bara dessa
— en pre-existerande egenskap hos riggen, inte något den här ändringen infört.

### Nästa steg

Oförändrat sedan checkpoint 34: §5 väntar på en deploy, battle-kedjan på en inspelad sändning, och
`VYRA_MASTER_ROADMAP.md` har driftat från verkligheten (fas 6–9 står som `not-started` fast Top
Gifter, Battle MVP och Like Fountain finns byggda och testade).


## Checkpoint 34 — loyaltys uttoning, den sista designskulden (2026-08-18)

En ändring, en rad CSS. Arbetsordningen densamma: **mät först → röd vakt → implementera →
mutationsprova → fotografera**.

### Felet, uppmätt

`studio.css` lät loyaltys uttoning ligga på **ankaret** i stället för på **behållaren**:

```css
.fan-layout-loyalty.fan-exit .fan-profile img{animation:fbProfilePop var(--fed) ease-in reverse both}
```

`.fan-profile` bär `linear-gradient(145deg,var(--fan-light),var(--fan))` och
`box-shadow:0 0 13px var(--fan)` — en glödande orange skiva på 80×80 px. Krymper man bara ankaret
släcks ansiktet medan skivan står kvar. Effektiv (ärvd) opacitet i Chromium, `--fed` = 500 ms:

| ms | behållare | ankare | ring |
|---|---|---|---|
| 0 | 1.00 s1.00 | 1.00 s1.00 | 1.00 |
| 125 | **1.00 s1.00** | 0.62 s0.85 | 0.62 |
| 250 | **1.00 s1.00** | 0.32 s0.73 | 0.32 |
| 480 | **1.00 s1.00** | 0.00 s0.60 | 0.00 |

Fotograferat vid 490 ms: en tom lysande orange skiva över texten. En halv sekund, i varje alert.

Det är **samma fälla som fas 1 hade, spegelvänd** (#212, "Inringningen"). Regeln är densamma åt
båda hållen: **rör behållaren, aldrig ankaret. Ankaret rider med.**

### Lagningen

Selektorn flyttad från `.fan-profile img` till `.fan-profile`. Efteråt, samma mätning:

| ms | behållare | ankare (ärver) | ring |
|---|---|---|---|
| 0 | 1.00 s1.00 | 1.00 | 1.00 |
| 250 | 0.32 s0.73 | 0.32 | 0.32 |
| 480 | 0.00 s0.60 | 0.00 | 0.00 |

Loyalty gör nu som `stack`, `heartbeat`, `badgereveal`, `ribbon` och `duo` redan gjorde.
Cachebust: bara `studio.css` (`20260818-fan-loyalty-uttoning`). `media.js`, `widget-factory.js`,
`fan-fas.js` och premium-bundlens version är orörda och behåller sina strängar — andra gången
strängarna går isär, av samma skäl som första.

### Vakterna

| Vakt | Var | Vad |
|---|---|---|
| `19h` | `tests/fan-fas.test.js` | snabb grind: exit-regelns selektor måste sluta på `.fan-profile`, och ingen exit-regel får nämna `.fan-profile img` |
| `U1` | `tests/browser/fan-fas-loyalty.browser.test.js` | positiv kontroll — sockeln är fullt målad när uttoningen börjar |
| `U2`–`U3` | samma fil | behållaren måste nå ≤ 0.15 opacitet och < 0.9 skala vid 96 % av `--fed` |
| `U4` | samma fil | **sockelvakten**: behållaren får aldrig vara mer målad än ankaret den bär |
| `U5` | samma fil | uttoningen går bara nedåt |
| `U6` | samma fil | samma krav på alla sex modeller vars profilbehållare tonar ut |

Röd baslinje före lagningen: `19h` föll, och 4 av 11 browserprov föll. `U1` och `U5` var gröna,
alltså kalibrerade — och `U6` var grön för alla fem grannarna. Måttet är därför bevisat rätt av
fem modeller som redan gjorde rätt, och rött bara för den som inte gjorde det.

### Mutationsprov

| Mutation | `19h` | Browser |
|---|---|---|
| tillbaka till `.fan-profile img` | faller | 4 faller |
| `.fan-profile>img` (barnkombinator) | faller | 4 faller |
| `reverse` borttaget (tonar in i stället) | **grön** | 5 faller, inkl. `U1` och `U5` |
| regeln helt borttagen | faller | 3 faller |

Den tredje raden är hela poängen med att ha båda: `19h` mäter stavning, browserprovet mäter
rörelse. Ingen av dem räcker ensam.

### Invarianten som tillkom

**Ett prov som mäter ett elements EGNA opacitet mäter inte vad som är målat.** Efter lagningen
läser `.fan-profile img` `opacity: 1` — ankaret har ingen egen animation längre, det ärver
behållarens. Ett prov som krävt att *ankaret* tonar ut hade alltså varit grönt före lagningen och
rött efter: det hade vaktat buggen. Samma fälla som `hearts`-provet gick i (lärdom 1, checkpoint
33). Måttet som bär är **produkten av `opacity` och transformskalan hela vägen upp till
widgetlådan** — den effektiva, ärvda synligheten. Den bryr sig inte om vilket element som råkar
bära animationen.

### Två modeller står med flit utanför familjevakten

`hearts` döljer profilbilden helt (`display:none`), och `hero` har **ingen uttoningskoreografi
alls** — där tonar hela lådan ut samlat via rotens transition. Det är symmetriskt, alltså inte
samma fel, och därför beskrivet i stället för lagat. `U6` räknar upp exakt vilka modeller som
omfattas, så en nionde modell kan inte glida in i undantaget utan att någon skriver ut den.

### Nästa steg

**Bordet är rent på designsidan.** Kvar står bara det som inte går att avgöra härifrån:

1. **§5** — synkkonflikt-banderollen. Lagad i koden, vaktad av fyra browser-prov, kräver en deploy.
2. **§1:s sista fråga** — vilket steg i `LINK_MIC_BATTLE_TASK` som ska tända overlayn.
3. **Battle MVP och det inspelade TikTok-materialet.** `tiktok-bridge/inspelare.js` (#206) finns och
   är av som default. `docs/live-verifiering.md` listar de fyra ställena i battle-kedjan där koden
   gissar, med exakt vad som ska läsas av i loggen och i konsolen. Läs den före sändningen, fyll i
   den efteråt.


## Checkpoint 33 — Fan Level Up stängd, skuldregistret nollat (2026-08-17, kväll)

Fortsättningen på checkpoint 32, samma dag. Elva PR:er till, samma arbetsordning varje gång:
**mät först → lägg fram planen → bygg den röda testkartan → implementera → fotografera →
mutationsprova → PR**. Ingen koreografi byggdes innan modellen var uppmätt.

### Fan Level Up: alla åtta modeller har en klocka

`fan-fas.js` är förarens hela idé: **JS bestämmer NÄR, CSS bestämmer VAD.** Drivrutinen sätter
fasklasser (`fan-fas-<namn>`) i tur och ordning och tar bort dem sist. Klockan är utbytbar
(`VyraFanFas.klocka`), så fasproven är exakta och omedelbara i stället för att sova.

| Modell | Dramaturgi | Faser (ms) | PR | Merge |
|---|---|---|---|---|
| `hero` | Samlingen | hjarta 420 · samling 560 · vila 270 | #208 | `6bd462b` |
| `stack` | Mottagandet | fall 300 · pop 260 · stigning 340 | #210 | `172fcc3` |
| `ribbon` | Välkomnandet | pop 320 · utrullning 420 · text 340 | #211 | `9d5de2b` |
| `loyalty` | Inringningen | pop 320 · ring 440 · stampel 340 | #212 | `cac5e35` |
| `badgereveal` | Uppenbarelsen | vingar 340 · avtackning 360 · hyllning 340 | #213 | `7d920a7` |
| `hearts` | Uppstigningen | nedslag 300 · uppstigning 320 · hyllning 340 | #214 | `0256cf3` |
| `heartbeat` | Pulsslaget | sidorna 340 · pulsen 320 · avlasning 340 | #215 | `8a370bd` |
| `duo` | Mötet | parterna 340 · linjen 320 · avlasning 340 | #216 | `1ff1656` |

**Vaktnätet är matematiskt slutet.** `F1` kräver att varje registrerad modell finns i CSS:en;
`23g` (SLUTVAKTEN) kräver att varje modell i modellregistret finns i `FASER`. En nionde layout
kan därför inte läggas till utan klocka — provet faller innan någon hinner se den snäppa fram.
70 prov i `tests/fan-fas.test.js`, från 0.

### Skuldregistret: allt lokalt lösbart är stängt

| § | Vad | PR | Merge |
|---|---|---|---|
| 2 | Testknappen för fyrverkerier kringgick alertkön | #217 | `f4013b0` |
| 6 | Sex laddningsgrindar hängde på en UI-sträng | #218 | `74160e7` |
| 14 (rest) | Tre fristående ljudkällor duckade inte för rösten | #218 | `74160e7` |
| — | `BroadcastChannel('vyra-action-run')` utan prenumerant | #218 | `74160e7` |

**Kvar i registret, och inget av det går att lösa här:**

- **§5** — synkkonflikt-banderollen. Koden är lagad och vaktad av fyra browser-prov. Bara en riktig
  deploy kan stänga den.
- **§1:s sista fråga** — vilket steg i `LINK_MIC_BATTLE_TASK` som ska tända overlayn. Kräver en
  riktig TikTok LIVE. Står i `docs/live-verifiering.md` med de andra tre gissningarna i battle-kedjan.
- **§7–§11** är regler, inte skuld. De uppstår på nytt varje gång någon skriver ett prov.

### Den enda öppna designskulden

**Loyaltys asymmetriska uttoning.** `studio.css:716` lyder:

```css
.fan-layout-loyalty.fan-exit .fan-profile img{animation:fbProfilePop var(--fed) ease-in reverse both}
```

Regeln träffar `.fan-profile img` — **ankaret** — inte behållaren. Bilden krymper alltså bort medan
den orangea sockeln står kvar i full styrka tills rotens transition tonar ut hela widgeten. Grannarna
`ribbon` (rad 726) och `badgereveal` (rad 711) animerar `.fan-profile` direkt och har inte problemet.
Medvetet sparad till en egen omgång. Ingen krasch — en halv sekund med sockel utan ansikte, per alert.

Badgereveals geometri (−70/+256 i en 260 px-box) är också uppmätt och medvetet lämnad.

### Invarianter som tillkom (utöver checkpoint 32:s)

- **`!important` i en vanlig regel slår en CSS-animation.** Tre separata döda animationer hade samma
  rot: loyaltys sockel, badgereveals transform, hearts opacitet. Ser fullkomligt harmlöst ut i källan.
- **`display:none` i ett grid kollapsar spåret.** Faser måste dölja med `opacity`, aldrig `display`.
  Vaktat av gridvakten `22g` över både `heartbeat` och `duo`.
- **Ett vilolager kan varken bo på en fasklass eller på `.fan-active`.** Fasklassen tas bort när
  sekvensen slutar; `.fan-active` bryter mot `F4`. Det hänger på modellklassen.
- **Badgereveals vänstra vinge ska förbli ospeglad.** Att ta bort dess `!important` väcker en död
  `.fan-wing.left{transform:scaleX(-1)}` och bryter omfamningen. Fotograferat åt båda håll.
- **Cachebust-strängar följer filerna, inte varandra.** #218 är första gången de går isär: sex filer
  bumpades, `studio.css`/`widget-factory.js`/`fan-fas.js` behöll sina.

### Fem lärdomar som kostade något

1. **Ett referensprov kan skydda buggen det tror sig vakta.** `hearts`-provet krävde att alla tre
   hjärtan lyste samtidigt — sant *bara för att* `opacity:1!important` dödat uttoningen. Provet var
   grönt på grund av felet. Omskrivet till att mäta över ett tidsfönster: 26 prov över 2,6 s, där
   varje hjärta måste nå full styrka **och** gå under 0.2.
2. **Ett frånvaroprov utan positiv kontroll är grönt innan koden finns.** §6:s avbrottsprov blockerade
   modulen och krävde att markören uteblev — lika sant för ett attribut som inte finns i koden alls.
   Det *kändes* som en kontrollmätning. Nu öppnar det en oblockerad sida i samma kropp.
3. **Ett prov som mäter markup mäter inte beteende.** Mutationen "markören flyttad först + sista
   IIFE:n kastar" gav fyra gröna prov, eftersom `[data-alltime]`-noden renderas av `home()`, inte av
   IIFE:n. Bara siffran i raden kommer därifrån.
4. **Leta efter vakten innan du skriver en.** Tre gånger på en dag fanns ägaren redan:
   `tech-debt-aktuell.test.js` för §6, `duckaMedan` i `action-runtime.js` för §14, och båda gångerna
   var jag på väg att lägga en andra bredvid. Registret ljög dessutom om `media.js` — noll `new Audio`,
   varje videoelement `muted`. Samma sorts fel som §3 kostade en hel ansats för 2026-08-10.
5. **Ett fotobevis kan ljuga på tre sätt.** Summerade `waitForTimeout` ignorerar att en skärmdump
   kostar 100–300 ms; `locator.screenshot()` väntar på att elementet står stilla och fångar därför
   den färdiga widgeten; och att trigga om mellan bilderna köar i stället för att spela. Lösningen är
   Web Animations API — pinna varje animation till **sin egen** origo, inte till fasens.

### Nästa steg

Bordet är rent. Två saker väntar, och den andra är den som styr:

1. **Loyaltys uttoning** — den enda kvarvarande designskulden, uppmätt och beskriven ovan.
2. **Battle MVP och det inspelade TikTok-materialet.** `tiktok-bridge/inspelare.js` (#206) finns och
   är av som default. `docs/live-verifiering.md` listar de fyra ställena i battle-kedjan där koden
   gissar, med exakt vad som ska läsas av i loggen och i konsolen. Läs den före sändningen, fyll i
   den efteråt.


## Checkpoint 32 — poängekonomin, talutrymmet, inspelaren och Fan Level Up (2026-08-17)

En hel dags arbete i sju steg, varje steg en egen PR mot `main`. Alla mätta före och efter.
Skrivet på svenska till skillnad från checkpoint 26–31 — det är språket resten av dagens
dokumentation och kod-kommentarer håller.

### Vad som stängdes

| § | Felet | Lagningen | PR | Merge |
|---|---|---|---|---|
| 13 | Poäng drogs innan något visste om actionen skulle spela. Fem försök under cooldown kostade 500 i stället för 100. | Check-Then-Act: `kanKora(action, payload)` svarar `{ok, skal, scen, kvar}` **utan att skriva**. `runAction` frågar först. | #202 | `602fcf3` |
| 15a | Varje öppen flik drog sin egen kostnad och spelade sin egen kopia. | `action-master.js` — tvånivåval av en förare per lagerrymd. | #202 | `602fcf3` |
| 15b | Cooldown-stämplarna låg i en nyckel bara en skrivbar flik kunde spara, så cooldown var verkningslös i overlayn. | Egen nyckel `vyra-action-cooldowns` + `EPHEMERAL_KEYS` i `session-state.js` (används, torkas, synkas aldrig). | #203 | `04c0875` |
| 15c | En full scenkö tog betalt för uppspelningar som aldrig hände. | Återbetalningsväg: `VyraPoints.refund`, spegelvänd returbrygga, kvitto per köp. | #204 | `b7d095d` |
| 14 | Actions och TTS-chatt var två skilda talsystem, och tre flikar läste samma chattrad högt. | `vyra-tal.js` (delad kö + duckning) och `VyraRostMaster` (omvänt val: overlay är nivå 1, studion nivå 2). | #205 | `bc9aea5` |
| — | `LINK_MIC_ARMIES` gick bara att studera live, mitt i ett femminuters battle. | `tiktok-bridge/inspelare.js` — maskerade råa payloads till fil. Av som default, stänger av sig själv vid fel. | #206 | `bfd3e38` |
| — | `card` fanns i CSS men i inget register; `hero` renderades hela tiden men fanns i inget register. | `card` raderad, `hero` formellt registrerad som modell 8. | #207 | `26b04b4` |

**I luften:** PR #208 — `fan-fas.js`, vakterna F1–F3 och hero-koreografin "Samlingen".

### Invarianter som inte får brytas

- **Poäng dras aldrig före ett `kanKora`-svar.** Kontrollen skriver inte, och får aldrig börja göra det.
- **Vem som betalar och vem som låter är två olika frågor.** Automationsmastern avgör *om* en rad ska
  läsas och drar kostnaden — en gång. Röstmastern talar. Actions TTS gateas **inte** på röstmastern:
  `allowed()` routar dem redan till rätt scens overlay, och en grind ovanpå hade tystat scen 1:s
  action så fort scen 2:s overlay råkade hålla röstplatsen.
- **`strypt(runId)` har ingen master-grind.** Kvittot är grinden. En grind där hade tystat en flik som
  hunnit betala och sedan förlorat sätet.
- **Röstmastern är nivå 1 i overlayn, inte i studion.** En streamer fångar ljudet via browser source i
  OBS; en röst som bara talar i Studion försvinner ur sändningen.
- **En inspelad typ når aldrig molnet.** Inspelaren prenumererar bredare än bryggan skickar. Vaktat av
  `tiktok-bridge/test/inspelare.test.js` prov 6, som läser prenumerationsblocket ur källan.
- **Ny CSS hör inte hemma sist i `studio.css`.** Filen har en obalanserad klammer (issue #126) och allt
  efter rad 787 hamnar i ett oavslutat block — reglerna ser korrekta ut och biter aldrig.
- **Koreografins koppling måste sitta innanför alertkön.** `runtime-controls.js` byter 500 ms efter
  start ut triggern mot en köad variant. Lägger sig något utanför den startar rörelsen när alerten
  *köas* i stället för när den *spelas*.

### Tre lärdomar som kostade något att lära sig

1. **Mutationsprovet, inte testkörningen, avslöjar ett värdelöst prov.** Fem gånger under dagen var en
   svit grön medan ett av proven inte kunde falla: poängprov 5 låg i en oskrivbar flik, returprov 7
   läste `earned` före återbetalningen, returprov 4b behövde en *sen* dubblett, talutrymmesprov 8 lät
   actionkön göra jobbet, och F2 i fan-fas fångade bara om-kopplingen efter att en mutation lagts till.
2. **Bevisa varför kod ska raderas, inte bara att den kan raderas.** `card` antogs vara trasigt skräp.
   Uppmätt renderade den en sammanhängande ruta på 280×295 px med varje del synlig — men med 12 skilda
   egenskaper mot 15 identiska mot `hero`. Den föll på `PREMIUM_WIDGET_SPEC` ("inga omfärgade
   rektanglar"), inte på att vara trasig. Det ger en starkare `git blame` om ett år.
3. **Inget arbete får ligga lokalt utan en PR som ankarplats.** Ett tidigare Fan Level Up-arbete gick
   förlorat med sin container. Git-forensik visade att de fyra påstådda commitarna aldrig funnits i
   det här repot och att reflogen är oavbruten från containerstart. Oåterkalleligt.

### Nästa steg: `stack` · "Mottagandet"

Koreografi nummer två, byggd på `fan-fas.js` som redan finns. Formen: **fall → pop → stigning**.
Byt ut klockan, behåll de befintliga keyframesen — `stack` har redan 13 egna `fan-layout-stack`-regler
i `studio.css` som rörelsen ska hänga på, och basens `fanLevelPop`/`fanRing` ska inte startas om.

Arbetsgången som fungerat hela dagen: plan först, godkännande, bygg, mät, mutationsprova, PR.

## Checkpoint 31 — full bug and duplicate cleanup (2026-07-23)

The browser entry points now have automated resource coverage and the Electron local server is
tested against the landing page, Studio, overlay redirect, gift manifest, widget fallbacks,
missing assets, traversal attempts and a complete test LIVE event round trip. The broken
gift-manifest path and missing default-profile references were repaired. Missing optional gift
art now degrades to a branded transparent-safe placeholder rather than a broken image icon.
Exact duplicate root frame images, Blender autosaves and obsolete one-off review/extraction
files with broken or machine-specific paths were removed after checkpoint 30 was backed up.

## Checkpoint 30 — final release gate (2026-07-23)

VYRA now has one fail-closed release command, `node scripts/release-gate.js`, which validates
JavaScript syntax, server, desktop and TikTok normalization tests, the server dependency audit
and the public web artifact contract. It writes a machine-readable evidence report and clearly
separates failed checks from external checks that cannot be approved without staging, Stripe,
a signed Windows build and a real OBS/TikTok LIVE session. The release cannot be marked ready
while any external evidence remains blocked or pending.
Current dry run: 6 local gates passed, 0 failed and 5 external gates were correctly blocked.
The machine-readable result is stored in `.deploy/release-gate-report.json`.

## Checkpoint 29 — production deployment safety (2026-07-23)

Production startup is fail-closed through `production-config.js`; it requires HTTPS, external
TLS PostgreSQL/Redis, independent strong secrets, malware scanning, live Stripe/Resend settings,
complete desktop metadata and an alert destination. The web image now contains only 226 public
assets and excludes every internal source tree. Production compose runs read-only, drops
capabilities, uses immutable images and starts two API replicas. Deployment includes preflight,
checksummed database backup, migrations, readiness gate and previous-image rollback. Verification:
45/45 server tests pass, shell scripts parse, dependency audit is clean, and the locally simulated
public artifact contains no internal trees. Docker image execution remains a hosting/CI check
because Docker is unavailable in this workspace.

## Checkpoint 28 — signed desktop delivery and updates (2026-07-23)

The Windows delivery path is complete in code: the website only exposes a release with complete
HTTPS/version/SHA-256/size metadata; the packaged desktop app checks semantic versions, asks before
download, enforces a 500 MB ceiling, verifies exact length and SHA-256, asks again before opening
the installer, and leaves no executable after a failed verification. Tagged CI releases now require
an Authenticode certificate and verify the final signature. Verification: 42/42 server tests and
6/6 updater tests pass; server and desktop dependency audits report zero known vulnerabilities.
Producing the final EXE requires the production update origin and signing certificate in CI.

## Checkpoint 27 — TikTok LIVE integration (2026-07-23)

The complete live chain is wired: connector control events now use the correct `ControlEvent`
contract; gift images, user identity, subscriptions, viewer counts and battle fields survive
local/cloud transport; the browser adapter drives the Premium Gift Widget and gift-owner
replacement; Top Likes expires inactive users after ten minutes. Verification: 42/42 server
tests plus 3/3 connector tests pass, event contracts match connector 2.4.0, and both dependency
audits report zero known vulnerabilities. A real broadcast remains the final external test.

## Checkpoint 26 — capacity and load (2026-07-23)

Production capacity work is complete: protected capacity snapshots, database-pool and queue
gauges, periodic pressure alerts, query indexes for high-traffic paths, k6 load profiles for
public API/live ingest/overlay reads, and a Kubernetes autoscaling policy for 2–20 API
instances. Server verification: 37/37 tests pass and production dependency audit reports
zero known vulnerabilities. See `CAPACITY_AND_LOAD.md`.

Last updated: 2026-07-22 (Phase 5 — Premium Gift Widget).

**2026-07-22 re-prioritization**: the user redirected the roadmap's Phase 4 onward away from
TikTok/overlay-runtime/SaaS work toward the premium live overlay widget system (see
`VYRA_MASTER_ROADMAP.md`'s reprioritization note and "Deferred" section). Phases 0-3 below are
unaffected. The commit `e670003` (Phase 3) is the last commit under the old ordering; every
commit after it follows the new Phase 4-12 sequence.

## Current branch

`main`. Arbetet går i en gren per steg (`claude/<vad-det-gäller>`), som mergas till `main` via
en egen PR så fort dess sviter är gröna. Öppet just nu: `claude/fan-hero-koreografi` (PR #208).

Sektionerna nedan om `feature/vyra-vfx-engine` och Phase 0–12 hör till en äldre roadmap och
beskriver inte dagens arbetsordning. De står kvar som historik — se checkpoint 32 överst för
var arbetet faktiskt står.

## Latest verified commit

`26b04b4` — Fan Level Up: raderade döda `card` och registrerade `hero` som åttonde modellen
(PR #207). Alla sviter gröna vid mergen: `npm test` 1156/0 fel, `test:contract` + `test:fuzz`
16/16, `domaner test widgets` 647/0, `domaner test studio-core` 81/0, referensprovet i webbläsare
30/30, `domaner luckor` 233/233 med exakt en ägare.

Tidigare verifierade merges den här dagen: `bfd3e38` (#206 inspelaren), `bc9aea5` (#205
talutrymmet), `b7d095d` (#204 återbetalningen), `04c0875` (#203 cooldown-lagret), `602fcf3`
(#202 §13 + §15a).

## Completed systems

- **Widget/theme catalog** (12 widget families, multiple themes/skins each) — shipped prior
  to this roadmap, verified end-to-end in browser this session's predecessor work.
- **Design system migration** (`design-tokens.css`, `design-system.css`, semantic classes
  across all studio.js pages) — shipped prior to this roadmap.
- **VFX Engine M1 + M2 + M2 hardening + M2 visual QA** — particle/fountain system built on
  vendored PixiJS + GSAP, one owning ticker, hardened lifecycle, visually QA'd across
  resolutions/quality levels/reduced-motion. Loaded only behind `?vfxdemo=1`/`?vfxdemo=2`,
  not yet wired to real semantic events (that's Phase 8 of this roadmap).
- **Recognition Engine, Steg 1-8** (Types, Rules, Normalizer, Merge, Queue, Controller, Card
  Mapper, Card UI) — commits `a6d451c`, `c5f5af0`, `0e213f1`, `4ee4f4c`, `17f659b`, `6ec8327`.
- **Recognition Engine, Steg 9 = this roadmap's Phase 1 (Standalone Recognition Runtime)** —
  commit `540eaac`. `recognition-runtime.js` composes Merge → Queue → Controller → Card
  Mapper → Card behind `window.VyraRecognitionRuntime = {mount, start, stop, pause, resume,
  push, tick, flush, clear, destroy, getState, getStats, subscribe}`. Dev demo
  `recognition-runtime-demo.html` covers every required button (Join/Like/Like burst/Share/
  Follow/Small-Medium-Large Gift/Mixed/Stress, plus lifecycle + time-advance controls).
  **Verified this session**: 242/242 automated cases pass (Node + browser), plus a full
  manual demo pass — join→tick, tick-to-presentation-end, 50-event stress (no crash/no
  console errors), Like-burst-10 aggregation (`mergedCount:10` confirmed), Mixed-10 priority
  ordering (large gift sorts to the front of the queue), pause blocks new presentations while
  ticking, resume restores progression, stop/clear/destroy all behave and destroy is
  idempotent with safe rejected results after.

## Partially completed / not yet started (per this roadmap)

- **Phase 0 — Repository audit**: done this pass (see Baseline findings below).
- **Phase 2 — Runtime hardening**: done. Full checklist reviewed (see
  `docs/recognition-runtime-report.md`); 4 new stress/lifecycle test cases added
  (`Hardening 1-4`: 500 mixed events, repeated start/stop cycles, repeated mount/clear
  cycles, duplicate-subscription check) — 246/246 passing in Node and browser, zero console
  errors. No Runtime defects found; `?recognitiondebug=1` diagnostics mode already existed
  from earlier steps and was confirmed inert-by-default and correctly wired into every
  caught-error path.
- **Phase 3 — Generic adapter contract**: done. `recognition-adapter-types.js` +
  `recognition-adapter.js` implement a provider-agnostic, FACTORY-style contract (unlike
  every other Recognition Engine file, `create()` returns a fresh, independent instance each
  call — no shared singleton). Public API: `window.VyraRecognitionAdapter = {create,
  registerProvider, getProviders}`; each instance exposes `{connect, disconnect, isConnected,
  getState, getStats, subscribe, destroy}`. Zero TikTok-specific logic anywhere in either
  file — confirmed by construction (payload is always treated as opaque). Bounded, cancellable
  reconnect backoff is opt-in per instance (`options.reconnect = {enabled, baseDelayMs,
  maxDelayMs, maxAttempts}`, disabled by default), implemented with a single stored
  `setTimeout` handle cleared on `disconnect()`/`destroy()` — the one legitimate timer in this
  module, unlike the Runtime pipeline which has none at all.
  `recognition-adapter-demo.html` registers ONE generic "demo-fake-provider" (zero
  platform-specific logic — the only provider-specific code lives in the demo page's own
  script, not in `recognition-adapter.js`) and demonstrates the intended Phase 4 integration
  pattern: raw provider event → adapter envelope → demo-only translation into a
  NormalizedEvent → `window.VyraRecognitionRuntime.push(...)`. **Verified this session**:
  16 new automated cases (`Adapter 1-16`) — connection lifecycle, duplicate connect/
  disconnect, malformed provider events, subscriber error isolation, bounded reconnect with
  successful re-connection, cancellable reconnect, async provider connect failure, synchronous
  provider connect() that throws, destroy idempotency/permanence, and a structural boundary
  check proving a raw adapter envelope is never itself acceptable as a NormalizedEvent (a
  caller must always normalize it first). 262/262 total cases pass (Node + browser), zero
  console errors. Manual demo pass confirmed: connect → emit join → normalize → Runtime push
  (`queued`) → tick → presentation starts → Card renders ("David Yakoop joined the live") →
  tick-to-end → clean completion; malformed event rejected without crash; unexpected
  disconnect handled cleanly with no auto-reconnect (demo's reconnect policy left disabled).
- **Phase 4 — Premium Widget Design System (re-prioritized, this pass)**: done. Built
  `premium-widget-core.js` (lifecycle: mount/show/hide/update/preview/setPerformanceMode/
  destroy/getState/subscribe), `premium-widget-tokens.css` (shared tokens + all 4
  family/tier CSS blocks), `premium-widget-assets.js` (image sanitization, initials,
  hand-authored inline SVG glyphs), `premium-widget-demo.html`, and
  `docs/PREMIUM_WIDGET_SPEC.md` (written before the implementation, per the user's
  instruction — every constant in the CSS/JS traces back to a value named in the spec). Four
  visually distinct families built: Crystal Halo, Royal Crown, Legendary Portal, Elite
  Minimal — verified genuinely different silhouettes (not recolored rectangles) by direct
  bounding-box measurement, not just class names. Separate, additive system from
  `recognition-card.js`/`recognition-card.css` — zero dependency either direction, different
  root z-index band (999998 vs. Recognition Card's 999999). See `VYRA_ARCHITECTURE.md` §10
  for the full architectural writeup.
  **Verified this session** (see "Manual visual verification" below for the full breakdown):
  mount/show/hide/replay lifecycle across all 4 families and all 3 tiers; missing-avatar and
  missing-gift-image fallback (initials / SVG glyph, never a broken `<img>`); long name
  ellipsis truncation; emoji and non-Latin (Japanese/Arabic) name rendering; 4 families shown
  simultaneously side-by-side (flex-wrap layout, no extra code needed); low-performance mode
  (particles/glow hidden); forced reduced-motion (all transitions collapse to 1ms); a 100x
  rapid-replay stress test leaving zero leaked DOM nodes/instances afterward; zero console
  errors throughout. Geometry-verified at exactly 1080×1920 (portrait), 1920×1080 (landscape),
  and 1080×1080 (square) via `getBoundingClientRect()`: every family stayed within the
  viewport and within the documented safe zone at every resolution, every avatar frame
  computed `border-radius: 50%` (circular), and bounding-box dimensions differed meaningfully
  per family (e.g. at 1080×1920 legendary tier: Crystal Halo 313×105, Royal Crown 359×132,
  Legendary Portal 313×233 — the tallest, ~12% of viewport height as the spec predicted —
  Elite Minimal 276×63 — the slimmest), confirming distinct silhouettes, not just distinct
  colors.
  **Verification gap, disclosed**: automated pixel screenshots
  (`computer{action:"screenshot"}`/`zoom`) timed out consistently in this session's
  environment regardless of viewport size — a known recurring tool issue in this session, not
  specific to this feature. Geometry/computed-style inspection substituted for pixel review
  (see above); a genuine pixel-level visual pass is still recommended once screenshot tooling
  is available, flagged in `VYRA_ARCHITECTURE.md` §10.

- **Phase 4 refinement pass (2026-07-22, same day)**: the initial 4 families shared generic
  enter/exit transitions (only Legendary Portal had a distinct animation). Per stricter review,
  `premium-widget-tokens.css` was extended with a genuinely distinct animation LANGUAGE per
  family (different CSS mechanisms, not the same keyframes retimed) — see
  `docs/PREMIUM_WIDGET_SPEC.md` → "Per-family animation language" for the full breakdown:
  Crystal Halo (blur-scale materialize + particle-based "crystal segments" assembling in/
  dispersing out + breathing glow hold), Royal Crown (rise-and-lock frame + weighted crown
  "thud" landing + one-shot gold sweep hold + clean vertical retract exit), Legendary Portal
  (3-stage layered entrance: rings→avatar→text, each independently delayed + energy-mote/
  ring-pulse hold + portal-closes-after-composition exit), Elite Minimal (`clip-path` wipe
  entrance — a fundamentally different mechanism from the other three, zero transform/blur/
  keyframes — deliberately static hold, compact slide exit). `premium-widget-core.js` was
  **not** modified — every family difference is pure CSS reacting to the same 4 phase classes
  the JS already toggled. Reduced-motion overrides were extended to cover the new per-family
  anticipation-phase states (added at end of stylesheet to win the cascade over the
  lower-specificity generic reset).
  **Verified**: zero console errors across ~400 total show/hide cycles (100 per family, direct
  API); each family's immediate (synchronous, throttle-immune) anticipation-phase state
  confirmed distinct (Crystal Halo: `scale(1.08) blur(10px)`; Royal Crown: `translateY(46px)`,
  no blur; Legendary Portal: `scale(.92) translateY(9.2px) blur(4px)`; Elite Minimal:
  `clip-path: inset(0 100% 0 0 round 999px)`, no transform/blur — four distinct starting
  states, confirming genuinely different mechanisms); one full real-time lifecycle (Crystal
  Halo, sampled every ~400ms over 20 real seconds) confirmed opacity correctly reaches and
  holds at 1 through reveal→settled, phases transition correctly, DOM is cleanly removed after
  exit; destroy()/mount() re-cycle confirmed safe; long-name (46-char + emoji) confirmed to
  render its full text via `textContent` with `text-overflow:ellipsis` while the widget's own
  bounding-box width stayed fixed at its family's silhouette width (260px for Elite Minimal) —
  "long names must not change the widget silhouette" confirmed, not just assumed; missing
  avatar/gift fallback re-confirmed unaffected by the animation changes across all 4 families;
  root background confirmed `rgba(0,0,0,0)` (transparent, browser-source-ready).
  **Verification methodology note**: this session's browser environment exhibits significant,
  variable (~2×-10×) `setTimeout` throttling on the automation tab, discovered mid-verification
  when early multi-step polling checks showed implausible results (opacity apparently stuck at
  0 well past a widget's `enterMs`) — root-caused via a continuous single-script timeline
  (avoids inter-call round-trip gaps) proving the CSS was correct all along and the earlier
  readings were a measurement artifact, not a defect. Documented in
  `docs/PREMIUM_WIDGET_SPEC.md` so a future session doesn't waste time rediscovering this.
  **Screenshots**: retried (per explicit instruction) at the exact filenames requested — still
  timed out consistently, confirmed unrelated to this pass's CSS changes (the tool already
  failed identically before these changes existed). No screenshot files were created —
  fabricating placeholder images was rejected as dishonest; this gap remains disclosed rather
  than papered over.
  Committed separately from the Phase 4 foundation commit, per instruction — see commit list.
- **Phase 5 — Premium Gift Widget**: done. Built `premium-gift-widget.js`
  (`window.VyraPremiumGiftWidget = {mount, show, hide, update, complete, skip, clear, destroy,
  getState, getStats, subscribe}`), `premium-gift-widget-demo.html`, and
  `docs/PREMIUM_GIFT_WIDGET_SPEC.md`. No new CSS file — reuses `premium-widget-tokens.css`
  entirely (no gift-specific styling was needed). This module never renders DOM itself; it
  owns a priority queue (small=10/medium=20/large=30/legendary=40 ordinal, capped at 20,
  replace-lowest-if-better when full) and calls `window.VyraPremiumWidget.show/hide/update`
  (Phase 4) to render whichever presentation is active. **Documented integration decision**:
  gift events do NOT flow through `window.VyraRecognitionRuntime.push()` — reasoning fully
  written up in `docs/PREMIUM_GIFT_WIDGET_SPEC.md` "Integration decision" (short version:
  avoids any risk to the already-passing 262/262 Recognition Engine suite; gift-streak merge
  semantics don't fit Recognition Merge's generic mechanism anyway). `recognition-runtime.js`
  and `recognition-card.js` were **not modified** — join/follow/share/like recognition is
  completely unaffected.
  **Verified this session** (browser, `premium-gift-widget-demo.html`): tier→family mapping
  confirmed correct via isolated checks (small→Elite Minimal, medium→Crystal Halo,
  large→Royal Crown at legendary size — 390px width, legendary→Legendary Portal); full
  priority-preemption lifecycle confirmed end-to-end (medium shown → small queued → legendary
  preempts medium (medium marked skipped) → legendary auto-completes on timeout → queued small
  automatically becomes active → small auto-completes → state cleanly drains to
  `active:null, queueLength:0`); streak update confirmed to update the **same** underlying
  widget instance in place (`repeatCount` 1→5, badge text `"×5 · 2,500 coins"`) without any
  phase-class change (proving no re-entry animation); malformed model (`tier:
  'not-a-real-tier'`) rejected with a clear reason, no throw; missing-avatar and
  missing-gift-image fallbacks confirmed present via `.vyra-pw-avatar-fallback`/
  `.vyra-pw-gift-fallback` classes (an initial check briefly hit a stale-element query
  artifact — same category of issue as Phase 4's throttling findings, resolved by re-testing
  in isolation); long name (46-char + emoji) confirmed `text-overflow:ellipsis` with the
  family's fixed width preserved; 500-event mixed-tier stress test processed in **2ms**
  synchronously with zero page freeze, zero console errors, `dropped:454` (queue-cap policy
  correctly enforced), and the system fully drained to a clean idle state within seconds after
  (`active:null, queueLength:0, widgetDomCount:0`); subscriber error isolation confirmed (a
  throwing subscriber does not stop `show()` or block a second, working subscriber);
  `destroy()` confirmed idempotent (called twice, no throw) and non-permanent
  (`mount()`/`show()` work immediately after). Node load-check: `premium-gift-widget.js`
  loads cleanly alongside `premium-widget-assets.js`/`premium-widget-core.js` with the exact
  11-method API surface.
- **Phase 6 — Top Gifter Widget**: not started.
- **Phase 7 — MVP Reveal Widget**: not started.
- **Phase 8 — Natural Like Fountain**: not started.
- **Phase 9 — Match Widgets (X2/X3/Glove/Booster)**: not started.
- **Phase 10 — Premium Widget Overlay Integration**: not started.
- **Phase 11 — TikTok LIVE Adapter** (formerly Phase 4 before re-prioritization): not
  started. The **transport** already exists and works (`tiktok-bridge/bridge.js` →
  `tiktok-live-connector` → `server.ps1` → `live-client.js`); the Phase 3 generic adapter
  contract is ready for a `tiktok-live-adapter.js` provider registration to build on whenever
  this phase starts.
- **Phase 12 — OBS and TikTok LIVE Studio Validation**: not started.
- Billing/analytics/campaigns/AI/account/workspace/general-SaaS-expansion phases: explicitly
  **deferred** per the user's 2026-07-22 instruction, not started, not currently in scope —
  see `VYRA_MASTER_ROADMAP.md`'s "Deferred" section for their preserved acceptance criteria.

## Failing tests

None. `recognition-verify.js` (Recognition Engine only — the Premium Widget system has no
automated test harness yet, see "Known gaps" below) still reports 262/262 in both Node and
browser, unchanged by this pass since no `recognition-*.js` file was touched. One
test-authoring bug was found and fixed during Phase 3 (not an adapter defect, see prior
entries in git history) — not relevant to this pass.

## Known gaps for the Premium Widget system

- **No automated test harness yet** (unlike the Recognition Engine's 262-case
  `recognition-verify.js`). Everything verified this pass was manual (DOM/console/geometry
  inspection in the browser). Adding a Node+browser test harness for
  `premium-widget-core.js` (mirroring the Recognition Engine's `runCase`/thunk pattern) is a
  reasonable candidate for early in Phase 5, once there's real event-driven usage to test
  against, rather than adding tests against the foundation in isolation.
- **No pixel-level screenshot verification** — see the disclosed gap above.

## Baseline audit findings (Phase 0 — recorded, not fixed, per audit rule "record first")

Found via targeted `grep` across the repository (not an exhaustive line-by-line read of every
file — flagged as a methodology limit):

| Finding | Where | Note |
|---|---|---|
| `setInterval` usage | `media.js`, `app.js`, `action-options.js`, `state-backup.js`, `live-leaderboard.js`, `action-event-advanced.js`, `action-scenes.js` | Legacy widget/UI polling timers — pre-existing, out of scope for the Recognition/VFX rules (those explicitly forbid *their own* hidden timers, not the whole app). Not yet individually audited for cleanup-on-teardown. |
| `requestAnimationFrame` usage | `media.js`, `vfx-ticker.js`, `vfx-fountain-demo.js`, `action-options.js`, `chatbot-overlay.js`, `action-runtime.js`, vendored `gsap.min.js`/`pixi.min.js` | `vfx-ticker.js` is the one confirmed, intentional single owner for the VFX system (hardened in M2 pass). The others are legacy UI code, not yet individually audited. |
| `recognition-*.js` mentions of `setInterval`/`requestAnimationFrame` | `recognition-runtime.js`, `recognition-controller.js`, `recognition-queue.js` | **False positives** — confirmed by direct read: these are code *comments* documenting the "no hidden timers" rule, not actual timer calls. Recognition pipeline is clean. |
| Raw `.innerHTML =` assignment | 22 files, incl. `media.js`, `extras.js`, `action-event.js`, `studio.js`, most widget/feature files | Established, repo-wide rendering convention (template-literal HTML strings). Several of these interpolate user-influenced strings (usernames, gift names, chat text) without escaping — a real latent XSS surface in the **legacy widget layer**. Contrast: `recognition-card.js` (the new pipeline) uses `textContent` exclusively for untrusted text and a dedicated `sanitizeImageUrl()` for all external images — already meets the roadmap's security bar. Full remediation of the legacy layer is out of scope for Phase 0 and should be scheduled explicitly (candidate: Phase 19 security review, or sooner if a specific widget is touched). |
| `TODO`/`FIXME`/`XXX` comments | `wishlist.js`, `gifts-manifest.js` | Only 2 files, low volume — not investigated further this pass; low priority. |
| `addEventListener`/`removeEventListener` balance | 38 `addEventListener` occurrences across 18 files vs. only 5 `removeEventListener` occurrences across 3 files (2 of which are vendored `pixi.min.js`/`gsap.min.js`) | Imbalance is expected for one-time, page-lifetime listeners (e.g. top-level nav bindings that live as long as the SPA does) but is a real risk for anything bound/unbound per-widget-instance or per-modal-open. Not yet audited per-file for actual leaks — flagged for the Phase 18 performance audit (DOM node accumulation / event subscription cleanup checks) rather than guessed at here. |
| No root `package.json` | repository root | Confirmed: this is a build-free static app. `electron-app/` and `tiktok-bridge/` are the only two real Node projects, each self-contained with their own `package.json`. Any future lint/test tooling (Phase 22's "run lint" step) needs a real decision on where that config lives — none exists today. |
| No auth on any `/api/*` endpoint in `server.ps1` | `server.ps1` | By design for a local single-user dev server; a real gap relative to the SaaS/multi-tenant vision in later roadmap phases — see the architecture conflict note in `VYRA_ARCHITECTURE.md` §9. |
| `overlay.html` is a bare redirect | `overlay.html` | `location.replace('studio.html?overlay=1')` — no overlay ID, no access token, no signed public token exists yet. Phase 7 (browser-source delivery) starts from zero here, not from a partial implementation. |
| TikTok connection method already exists | `tiktok-bridge/bridge.js` + `server.ps1` + `live-client.js` | Uses the unofficial `tiktok-live-connector` npm package in a separate local Node process, forwarding into the same `/api/events` endpoint the in-app demo button uses. Phase 4 must build on this transport, not invent a new one (per working rule #2/#18) — recorded here so it is not rediscovered/reinvented later. |

No blocking correctness bugs were found in the Recognition Engine or VFX Engine during this
audit pass — both were already hardened/verified in prior session work referenced above.

## Current blockers

None for Phases 4-12 (all buildable within the current local-first architecture, and none
require the deferred billing/analytics/account/SaaS work). The local-first-vs-SaaS product
decision (see `VYRA_ARCHITECTURE.md` §9) remains open but is now irrelevant to the near-term
roadmap entirely (Account/Workspace is in the explicitly deferred section).

## Exact next action

**Bygg `stack` · "Mottagandet"** — koreografi nummer två på `fan-fas.js`. Se checkpoint 32 överst
för formen (fall → pop → stigning), vilka keyframes som ska återanvändas och varför klockan byts
ut i stället för att skrivas om. Vänta tills PR #208 är mergad; `fan-fas.js` och vakterna F1–F3
kommer därifrån.

Avsnittet nedan tillhör den äldre roadmapen och är inte nästa steg.

### (historik) Phase 6 — Top Gifter Widget: session-based gift ranking display (configurable time
window, total coins, total gifts, streak info, profile+gift imagery as one composition, no
requirement to show the gift name), built on the Phase 4 visual families, with its own
ranking engine **separate from Card Mapper** (per the original roadmap prompt). Consider
whether it should also be separate from `premium-gift-widget.js`'s presentation queue (likely
yes — Top Gifter is a **persistent** display, not a transient preempt-able presentation like
Phase 5's gifts) or share only the underlying `window.VyraPremiumWidget` render layer. Does
not touch `recognition-card.js`/`media.js`/`premium-gift-widget.js`. Commit as
`feat(widgets): add top gifter widget`.
