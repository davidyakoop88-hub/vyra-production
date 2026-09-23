# Gåvorörelsen — specifikation

Beslutet står i `docs/VYRA_PROJECT_STATE.md`, checkpoint 54: en **koreografi på Top Gift och Top
Streak**, byggd som nya arter på fasmotorns fabrik (`widget-fas.js`), runt den flipp `VyraFlip`
redan äger. Rörelse på plats, i de widgetar som finns — inte flygande ikoner över duken.

Det här dokumentet är det som saknades: vilka faser, vilka tider, vad som triggar, och vad som
händer när en ny gåva landar mitt i en pågående sekvens.

Allt som står som **uppmätt** är läst ur koden 2026-09-22. Allt som står som **öppet** är Davids.

---

## 1. Fabriken kan inte koppla sig själv här

Det här är specifikationens viktigaste fynd, och det ändrar formen på arbetet.

`widget-fas.js:koppla()` lindar sig runt en **global triggerfunktion** (`triggerFanLevelUp`,
`triggerGifterLevelUp`) och avgör vilka lådor som tändes genom att jämföra `box[timerFalt]` före och
efter. Det fungerar för Fan och Gifter därför att de är **alerts**: de tänds, de spelar, de släcks,
och triggern lämnar ett spår per tänd låda.

Top Gift och Top Streak är inte alerts. De är **permanenta widgetar** som ligger kvar hela
sändningen och uppdateras på plats. Uppmätt: det finns ingen `triggerTopGift`, ingen
`triggerTopStreak`, och inget timerfält på någon av lådorna.

| | Fan / Gifter | Top Gift / Top Streak |
|---|---|---|
| Form | alert som tänds och släcks | permanent widget |
| Trigger | global funktion | ingen |
| Spår per låda | `_fanTimer` / `_gifterTimer` | inget |
| Kopplingssätt | `koppla()` lindar triggern | **explicit anrop** |

**Följden:** arterna konfigureras utan `triggerNamn` och utan `timerFalt`, och `spela(box)` anropas
i stället rakt från de två skrivare som redan finns — på exakt den rad där `mark()` anropas i dag.

| Familj | Skrivare | Rad | Anropet ligger |
|---|---|---|---|
| Top Gift | `live-leaderboard.js` → `armFlip()` | 217–231 | efter patchen, efter rekordgrinden |
| Top Streak | `gift-event-images.js` → `arma()` | 235 | efter patchen, efter rekordgrinden |

Båda ligger redan rätt. Ingen ny inkoppling behöver uppfinnas — koreografin åker med där markeringen
redan åker med.

> **Fabriksändringen är gjord (2026-09-22).** `koppla()` returnerade redan `false` när
> `triggerNamn` var `null` — men bara för att `root['null']` råkade vara `undefined`, alltså rätt
> svar av fel skäl: en global som händelsevis hette `null` hade lindats. Nu står `if (!triggerNamn)
> return false;` först i funktionen, och ett prov lägger dit just en sådan global för att skilja de
> två formerna åt.

---

## 2. Triggern är rekordgrinden, inte gåvan

Både `armFlip()` och `arma()` anropas **bara när rekordet slagits**. `updateTopGift` returnerar
tidigt på `if (records && value < records.giftCoins) return;`, och streakens motsvarighet gör
detsamma i `flush()`.

Det är rätt grind, och den ska inte byggas om:

- Top Gift och Top Streak är **topplistor**, inte "senaste gåvan"-widgetar.
- En koreografi vid varje gåva vore en lögnaktig markering — den säger "nytt rekord" när ingenting
  hänt. Samma skäl som `tests/streak-markering.test.js` redan vaktar för `mark()`.

**Regel:** ett anrop till `spela()` är per definition ett nytt rekord.

---

## 3. Koreografin får aldrig röra flippens noder

`VyraFlip.PARTS` är uppmätt exakt:

```
.vyra-flip, .streak-flip,
.vyra-gift-face, .vyra-profile-face,
.streak-gift-face, .streak-profile-face
```

`offset()` skriver `animation-delay` på precis de noderna för att återuppta rotationen vid rätt
punkt i varvet. En fas-CSS som animerar någon av dem skulle skriva över just det värdet — och då är
hela `VyraFlip` verkningslös, vid varje gåva.

**Invariant (ska vaktas av ett prov):** ingen `<prefix><fas>`-regel får ha någon av de sex
selektorerna i sin nyckel. Faserna animerar ramen, plåten, namnet, talet, titeln, etiketten och
widgetlådan själv — allt utom flippen.

Det här är också varför en omstart av koreografin **inte** är samma sak som en omstart av flippen.
De rör olika noder. `spela()` kallar `avbryt()` först och startar om sin egen sekvens; rotationen
märker ingenting.

---

## 4. Modellaxeln — två arter, inte en

Fabriken läser modellen ur lådans egna klasser via `layoutPrefix`. Uppmätt vad renderarna faktiskt
skriver på `<div class="widget …">`:

| Familj | Med ram | Utan ram | Prefix |
|---|---|---|---|
| Top Gift | `topgift-framed` | `theme-<w.theme\|\|'royal'>` | — |
| Top Streak | `streak-framed` | `streak-<w.streakTheme\|\|'inferno'>` | `streak-` |

Top Streak har ett användbart gemensamt prefix: `streak-` fångar både `streak-framed` och
`streak-inferno`. Top Gift har två olika prefix för sina två grenar och inget gemensamt.

**Beslut:** två arter, `topgift-fas.js` och `streak-fas.js`, precis som Fan och Gifter är två arter
på samma fabrik. Streak konfigureras med `layoutPrefix: 'streak-'`. Top Gift får en
renderaränding — den oramade grenen skriver `topgift-theme-<tema>` bredvid sitt `theme-<tema>`
(som CSS:en fortfarande hänger på), så att prefixet `topgift-` fångar båda grenarna.

> Minsta möjliga alternativ vore att ge Top Gift `layoutPrefix: 'theme-'` och låta den ramade
> grenen sakna modell. Det hade fungerat i dag men tyst tappat hela ram-grenen, och en ram är just
> det en streamer väljer när hon bryr sig om utseendet. Den extra klassen är billigare än den luckan.

**Okänd modell spelar som förut.** Det är redan familjernas lag (F1–F3, G1–G3): en modell utan post
i registret får ingen fas alls. Det gäller här också — och det gör en sak gratis:
`approved-rankings.js:63` renderar `.vyra-streak approved-streak` **utan** temaklass, alltså
`layoutAv()` → `''` → `faser('')` → `null` → `spela()` returnerar `false`. Godkända rankingar rörs
inte. Det ska stå i ett prov, inte hoppas på.

---

## 5. Vilka modeller som byggs först

En i taget, med godkänd byggplan per modell — samma ordning som Gifter byggdes i. En halvfärdig fas
är sämre än ingen.

| Ordning | Modell | Varför just den |
|---|---|---|
| 1 | `streak-inferno` | `w.streakTheme \|\| 'inferno'` — entrén varje användare får som aldrig öppnar temaväljaren |
| 2 | `topgift-royal` | `w.theme \|\| 'royal'` — samma skäl, andra familjen |
| 3+ | resten | efter mätning, en i taget |

Samma motivering som `gifter-fas.js` gav sin `profile`-modell, och den håller av samma skäl.

---

## 6. Tidsbudgeten

Vad som redan spelar när `.hit` / `.play` sätts (uppmätt i `studio.css`):

| Familj | Engångsanimationer som redan äger tiden |
|---|---|
| Top Streak | `streakEnter 3.8s`, `streakHit 1.1s`, `streakNumber .8s`, `streakFire .8s` |
| Top Gift | `vyraAppear 3.6s`, `profileGlow 4.2s` |
| Båda | `giftPulse 2.1s` på `.record` — markeringen `mark()` sätter |

**`giftPulse` dupliceras inte — den ramas in.** Exakt samma val som `number`-modellen i
`gifter-fas.js` gjorde mot `gifterTransform`: mekaniken finns, koreografin möter den i tid i stället
för att göra om den.

**Total längd: 1000–1300 ms**, i tre faser, som Fan och Gifter. Skälet är inte estetiskt utan
systemiskt: två rörelser ur samma app ska kännas som samma app.

### `KORTASTE_VISNING` betyder något annat här

För Fan och Gifter är det hur kort en alert som kortast står kvar, och provet kräver
`total <= KORTASTE_VISNING` så att sekvensen aldrig huggs av när widgeten släcks.

Top Gift och Top Streak släcks aldrig. Här finns därför inget sådant tak — och sedan §7:s beslut
behövs det inget: en sekvens huggs aldrig av, vare sig av att widgeten försvinner eller av nästa
rekord. Taket är hur länge en streamer står ut med att vänta på nästa kvittens, och 1300 ms är kort
nog att frågan aldrig ställs.

---

## 7. En pågående koreografi spelar klart — BESLUTAT (David, 2026-09-22)

Ett nytt rekord som landar mitt i en sekvens **avbryter den inte**. Sekvensen spelar färdigt; nästa
rekord väntar. Underlaget stod som en öppen fråga i den första versionen av det här dokumentet och
besvarades samma dag.

`spela()` kallar `avbryt()` först. Fabrikens beteende är alltså **omstart**, och för Fan och Gifter
märks det aldrig: kopplingen hoppar över lådor vars timerspår är oförändrat, så en alert som redan
spelar triggas aldrig om mitt i.

Här kan den det. I en gåvostorm kan två rekord ligga några hundra millisekunder isär. Därför räcker
inte fabrikens förval, och alternativen vägdes mot varandra:

| | A · varje rekord startar om | B · en pågående sekvens spelar klart |
|---|---|---|
| I lugn takt | identiska | identiska |
| I en storm | bara fas 1 syns, om och om | sekvensen syns hel, nästa rekord väntar |
| Talet på skärmen | aktuellt (patchen kör före) | aktuellt (patchen kör före) |
| Rekordet syns ändå | `mark()`-pulsen spelar per rekord | `mark()`-pulsen spelar per rekord |
| Kostnad | ingen | fabriken måste veta att den spelar |
| **Valt** | | **✓** |

**Skälet:** A:s felläge är exakt det `VyraFlip` byggdes för att förhindra, en våning upp: en rörelse som spolas tillbaka innan den hunnit betyda något blir ett
hack, inte en koreografi. Och ingenting går förlorat — patchen har redan skrivit det nya talet innan
`spela()` anropas, så en sekvens som spelar klart visar aldrig ett gammalt värde, och `mark()`-pulsen
kvitterar varje enskilt rekord oavsett.

TikFinity kommer till samma svar: `Skip on next action` är **omarkerad** som förval.

**Vad beslutet kostade, och det är betalt (2026-09-22):** `box._fasTimers` fylldes i `spela()` men
tömdes bara i `avbryt()`, aldrig när sista fasen tagit slut. För en alert spelade det ingen roll —
lådan släcks ändå. För en permanent widget stod listan kvar full för alltid, och då gick det inte
att fråga om koreografin pågick. Sista fasens timer tömmer nu listan, och fabriken exponerar
`spelar(box)`.

`spelar()` är fabrikens **enda** bidrag till §7. Policyn ägs av anroparen, och det är med flit:
`spela()` vägrar inte själv spela om. Fan och Gifter bygger på att den alltid spelar, och deras
skydd mot omryckning är timerdiffen i `koppla()`, inte motorn. Att flytta upp regeln i fabriken
hade ändrat två fungerande familjer för en tredjes skull. Arterna som inte kopplas frågar
`spelar(box)` och avgör själva.

---

## 8. Vad som ska vaktas av prov

| Påstående | Varför det måste mätas |
|---|---|
| Ingen fas-regel rör någon av `VyraFlip.PARTS` sex selektorer | En träff gör hela `VyraFlip` verkningslös vid varje gåva |
| `spela()` anropas från `armFlip()` respektive `arma()`, **efter** patchen | Annars koreograferas den gamla bilden |
| En gåva som inte slår rekordet spelar ingen koreografi | Annars säger widgeten "nytt rekord" när inget hänt |
| `approved-streak` utan temaklass får ingen fas | Godkända rankingar får inte ändra utseende |
| En okänd modell får ingen fas alls | Familjens lag sedan F1/G1 |
| Varje sekvens ryms i sitt tak (§6) | Annars huggs den av |
| Fabriken kopplar sig inte när `triggerNamn` saknas | I dag håller det av en slump |
| En pågående sekvens startas inte om | §7:s beslut, och hela skälet till det |
| `spelar(box)` blir falskt när sista fasen tagit slut | Annars spelar widgeten aldrig igen efter första gången |

---

## 9. Vad som inte ingår

- **Inga flygande ikoner, inga partiklar, ingen bana över duken.** Det är tolkning B av det gamla
  beslutet och den är avfärdad i checkpoint 54, med skäl.
- **Ingen ändring i `VyraFlip`.** Flippen fungerar och äger sin widget. Koreografin lägger sig
  bredvid den.
- **Ingen ändring i rekordgrindarna.** De är rätt, och de är provade.
- **Ingen ändring i layout, dukstorlek eller OBS-mått.**
