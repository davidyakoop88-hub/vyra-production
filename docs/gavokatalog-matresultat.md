# Gåvokatalogen kräver betald plan — uppmätt 2026-08-26

Kort notat som bevarar resultatet av engångsobservationen i PR #276, nu när koden pensionerats.
**Läs det här innan någon föreslår att hämta rummets gåvokatalog igen.**

## Frågan

Inför Heart Me Goal (PR #275) behövde vi veta två saker som varken repot eller bibliotekets typer
kunde svara på:

1. Svarar `TikTokLiveConnection.fetchAvailableGifts()` med data när bryggan **inte** sätter något
   `signApiKey`?
2. Hur ser en katalogpost ut? `type RoomGiftInfo = any` i `tiktok-live-connector@2.4.0`.

## Svaret

**Nej — vägen är stängd utan betald plan.** Första verkliga anslutningen efter utrullningen,
2026-08-26 21:59:47:

```
[bridge] Anslutningsfel: {
  info: 'Failed to fetch room gifts.',
  exception: SignatureMissingTokensError: [Empty Payload]
             [fetchWebcastSignatureFromEulerRoute] Failed to sign a request:
             This endpoint requires a Business plan.
  reason: 'Empty Payload' }
[gavokatalog] {"ok":false,"orsak":"undantag","poster":0,"falt":[],"idTyper":{},"namnTyper":{},"heartMeTraffar":0}
```

`gift/list/` måste signeras, signeringen går genom Euler Stream, och **den routen kräver en betald
Business-plan**. Det är inte rate limiting, inte geoblock, inte ett transient fel — det är en
licensspärr, och den försvinner inte av sig själv.

Fråga 2 förblir därmed obesvarad: vi vet fortfarande inte vad fälten i en katalogpost heter.

## Vad observationen bevisade på vägen

Utöver svaret gav körningen ett skarpt integrationsbevis i produktion:

- Katalogfelet **påverkade inte livscykeln**. `[livscykel] start seq=3 accepterad` kom i samma
  sekund som felet. Anslutning, registrering och `live:start` gick igenom som vanligt.
- Ingen reconnect-loop, inga fatala exitkoder (86/65/78).
- Fail-closed och redigering höll: modulens egen rad bar bara kategorin `undantag` — inga värden,
  inga URL:er.

## Varför koden togs bort

Observationen var en **engångsdiagnostik**. När svaret väl fanns producerade den bara brus: en
misslyckad kataloghämtning per anslutning, plus bibliotekets egen råa felrad. Den pensionerades i
en egen cleanup-PR. Ingen `signApiKey` och ingen Business-plan lades till — det var ett uttryckligt
produktbeslut.

## Om Heart Me Goal återupptas

Tre vägar, ingen påbörjad:

1. **Betald Business-plan** hos Euler Stream → katalogen blir läsbar och designen i #275 fungerar
   som skriven.
2. **Observera `giftId` ur ett verkligt Heart Me-event** i stället. Gåvoeventen bär redan fältet
   (`tiktok-bridge/normalizer.js:68`) och kräver ingen signering. Ger ett id per observation, inte
   en katalog — och löser inte frågan om regional variation.
3. **Lämna widgeten vilande.**

Designen, de 23 röda proven och avvägningarna finns kvar i PR #275, som är stoppad men inte
förkastad.

---

# RÄTTELSE 2026-08-28: katalogen kräver INTE en betald plan

Mätningen ovan var korrekt men slutsatsen för bred. `fetchAvailableGifts()` föll på
**signeringstjänsten**, inte på gåvorutten.

`tiktok-live-connector` har **två** vägar till samma katalog:

| Rutt | Väg |
|---|---|
| `fetchRoomGiftsFromEulerRoute` | via Euler Stream — den betalda |
| `fetchRoomGiftsRoute` | direkt mot TikToks `webcast/gift/list/` |

`RouteConfig.fetchRoomGifts` pekar på den **direkta** rutten. Det som kostar är att *signera*
webcast-anrop, inte att fråga efter gåvor.

## Uppmätt från en inloggad session

Frågad från en inloggad TikTok-flik svarar `webcast/gift/list/?aid=1988` med `HTTP 200` och
**3,28 MB**:

| Mätning | Värde |
|---|---|
| Gåvor i `gifts` | **783** |
| Med både id och namn | 783 |
| Med bild | 783 |
| Unika namn | **734** — alltså **49 dubbletter** |
| `Heart Me` | 2 poster, **samma id** |

Ingen Euler Stream. Ingen Business-plan. Ingen signering.

**De 49 dubblettnamnen är det hårda beviset för `giftId`-regeln:** ett namn pekar inte ens i TikToks
egen katalog alltid ut en unik gåva.

## Men det finns ingen "hela katalogen"

Tre mätningar visar att listan är **kontextuell med flit**:

- `is_full_gift_data: false` — TikTok säger själv att svaret är ofullständigt
- sidan `Exclusive` är **tom** när man frågar utan rumskontext
- 783 mot repots 1 148 gåvonamn

Försök att tvinga fram mer med parametrar gav ingenting: `is_full_gift_data=1`, `gift_page_type=1`
och `need_all_gift=1` ändrade inte antalet, och `fetch_giftlist_from=1` **sänkte** det till 517.

## Följden för arkitekturen

Katalogen är en **vy per konto och rum**. Därför två källor i `gavokatalog`:

- `'katalog'` — bulkanrop per rum. Snabbt, men bara det rummet ser.
- `'handelse'` — passivt från riktiga gåvoevent. Täcker exklusiva gåvor ingen lista räknar upp, och
  håller sig aktuell när TikTok släpper nya.

**Unionen över alla anslutna rum blir större än vad något enskilt konto kan se.** Det är skillnaden
mot en statiskt skrapad lista, som är låst vid vad ett konto såg den dag den skrapades.

## Verifierat mot verkligheten

Heart Me-id:t i katalogen är **samma** som det VYRA lärde in från en riktig gåva under LIVE-provet
samma kväll. Jämförelsen gjordes med ett kort, icke-reversibelt fingeravtryck på båda sidor — inget
råt id passerade någonstans.

---

# Driftsteg efter merge — REGISTRET ÄR TOMT TILLS NÅGON SEEDAR DET

`npm run migrate` skapar `gavokatalog`, `gavoregel` och `gavoregel_kalla` **tomma**. Ingen kod i
repot postar till adminrutterna, och det är med flit: en människa avgör vilket `giftId` som får öka
ett mål. Men det betyder också att PR:n **inte ändrar något beteende alls** förrän stegen nedan är
körda — CI är grön hela vägen eftersom proven bygger sin egen data.

Tills dess faller `heart-me-goal.js` alltid ned i lärlägesreserven, precis som före PR:n.

## 1. Seeda katalogen

Från en **inloggad** TikTok-flik, hämta `webcast/gift/list/` och posta listan vidare:

```
POST /api/admin/gavokatalog
Cookie: vyra_session=<plattformsadministratörens session>
x-vyra-csrf: <token>
{
  "region": "SE",
  "forvantat": { "poster": 783, "unikaId": 779, "utanId": 0 },
  "gifts": [ ... ]
}
```

**`forvantat` kommer från preflighten, aldrig från listan.** Talen mäts genom att läsa
`webcast/gift/list/` och räkna — och skickas sedan in som ett påstående som seedningen måste möta.
Härleds de ur samma lista de ska bevisa komplett bevisar de ingenting: en trunkerad lista med 1 av
783 poster skrivs helt korrekt och skulle markeras `klar`.

| Utfall | Svar |
|---|---|
| Region eller kontrolltal ogiltiga | **400**, `ok:false` |
| Listan tom, felformad, eller stämmer inte med kontrolltalen | **422**, `ok:false` |
| Komplett seedning | **200**, `ok:true`, `status: "klar"` |

En avvikelse rullar tillbaka hela transaktionen: ingen katalograd, ingen observation, ingen
färdigmarkering. En avvisad seedning ska inte gå att förväxla med en delvis genomförd.

Kräver `is_platform_admin`. Kroppen tas emot upp till 8 MB (783 gåvor är cirka 0,4 MB).

**`region` är obligatorisk och gissas aldrig.** Den måste vara en verkligt tilldelad ISO 3166-1
alpha-2-kod i versaler — `^[A-Z]{2}$` räcker inte, det mönstret släpper igenom `ZZ`, `XX` och
`QM`–`QZ`, som är användartilldelade och betyder "ingen sa något". Utan giltig kod svarar rutten
400 och skriver ingenting.

## Datamodellen: kanonisk gåva, regional observation

Granskningen av #290 gav no-go, och hade rätt: regionen låg först som en kolumn på `gavokatalog`,
vars primärnyckel är `gift_id` ensam. `ON CONFLICT` skrev därför över fältet, och **en senare
US-seedning raderade SE-observationen**. Tre tabeller i stället:

| Tabell | Vad den svarar på |
|---|---|
| `gavokatalog` | Vad gåvan **är** — namn, bild, diamanter. En rad per `gift_id`. |
| `gavoobservation` | **Var och när** den setts, med regionens **egna** namn, bild och diamanter. PK `(gift_id, region)`. |
| `gavoseedning` | Om en region är **verkligt färdigseedad**, med antal och tidpunkt. |

`forsta_sedd` på observationen betyder därför "först sedd i **den här** regionen", inte "först sedd
någonstans". Ett gåvoevent bär ingen region alls och skriver därför **aldrig** i
`gavoobservation` — bara i den kanoniska tabellen.

## Bulken är atomisk

Hela seedningen kör i **en transaktion**, och färdigmarkeringen skrivs i samma transaktion. Utan
det hade ett databasfel vid post 400 av 783 lämnat 399 rader som ser exakt ut som en komplett
seedning — tyst, trovärdigt och omöjligt att upptäcka i efterhand.

`GET /api/admin/gavokatalog/status` svarar därför inte bara med radantal utan med
`seedningar: [{ region, klar, antal_poster, antal_unika, klar_at }]`. Frågan "är SE färdigseedad?"
besvaras av markeringen, inte av att någon räknar rader och gissar.

## Vad mätningen 2026-08-29 visade om regionen

`webcast/gift/list/` bär **inget regionfält alls**. Svarets `data` har tjugo nycklar — `gifts`,
`gift_configs`, `pages`, `tags` och så vidare — men ingen `region`, ingen `country`, ingen
`locale`, ingen `currency`. Regionen finns alltså inte i katalogen och kan inte läsas ur den.

Den kommer i stället från **kontexten som gjorde observationen**: sidans egen
`__UNIVERSAL_DATA_FOR_REHYDRATION__` → `webapp.app-context.region`. Uppmätt `SE`, språk `sv-SE`.

Det är därför en katalograd **inte är en global sanning utan en OBSERVATION**: den här gåvan sågs i
den här regionen, vid den här tidpunkten, av den här källan. Gåvo-id:t i sig är detsamma överallt —
det är mätt — men listan man får se är en vy per konto och rum.

Ett gåvoevent bär ingen region över huvud taget. Händelsevägen skriver därför aldrig fältet och
raderar aldrig en seedad rads proveniens; tomt betyder **okänd**, aldrig gissad.

## 783 poster blir 779 rader

TikToks egen lista bär samma id flera gånger: **783 poster, 779 distinkta id** — fyra id
förekommer två gånger. Svaret skiljer därför på `skrivna` (poster) och `unikaId` (rader), så att
fyra rader inte ser ut att ha försvunnit.

Samma mätning: **0 poster saknar id**, och **47 namn är dubbletter**. Namnet används aldrig för att
välja ett id — ett vaktprov faller om det någonsin görs.

## 2. Verifiera Heart Me

```
POST /api/admin/gavoregel/heart_me/verifiera
{ "giftId": "<id:t ur katalogen>" }
```

Id:t står **inte nedskrivet i repot** — det hämtas ur katalogen i steg 1 och jämförs mot det VYRA
lärde in under LIVE-provet 2026-08-28. Rutten vägrar ett id som inte finns i katalogen.

## 3. Kontrollmät

```
GET /api/admin/gavokatalog/status
```

Svarar med **antal**, aldrig med id:n eller namn. Förvänta `kalla: katalog` ≈ 783 och
`heart_me/verifierad: 1`.

Först därefter gäller "en verifiering räcker för alla workspaces".

## Vilande med flit: den automatiska befordran

`noteraKandidat()` — tre distinkta källor bekräftar ett id, sedan befordras det automatiskt till
`verifierad` — är **byggd, provad och ANROPAS INTE från någon produktionskod**. `gavoregel_kalla`
förblir tom och `bekraftelser` står kvar på 0 i drift; den enda skrivaren är den manuella
`verifiera()`.

Det är ett medvetet stopp, inte ett förbiseende: så länge ingen automatik kan befordra ett id kan
inget mål börja räkna en ny gåva utan att en människa sagt ja. Priset är att en regional variant av
Heart Me inte upptäcks av sig själv — den måste verifieras för hand.

**Att koppla in den är ett produktbeslut, inte en kodändring.** Vägen in är ett anrop i
ingest-kedjan; tröskeln (`KRAV_BEKRAFTELSER = 3`) och hela maskineriet finns redan.


## Är namn, bild och diamanter globala? Nej — mätt

`webcast/gift/list/` bär ett fält `is_global_gift` på varje gåva. Uppmätt 2026-08-29 i SE:

| `is_global_gift` | Antal |
|---|---|
| `true` | 517 |
| **`false`** | **266** |
| saknas | 0 |

**TikTok säger alltså själv att en tredjedel av katalogen inte är global.** Namn, bild och diamanter
är därmed inte bevisat globala, och lagras därför också på observationen — per region. Den
kanoniska raden behålls som "senast sett någonstans" för uppslag som inte bryr sig om region.

`is_global_gift` sparas som `gavoobservation.ar_global`. `NULL` betyder att uppgiften saknades.

Sidofynd: **`name_en` finns inte** i svaret. En reserv som läste det fältet var död kod.
