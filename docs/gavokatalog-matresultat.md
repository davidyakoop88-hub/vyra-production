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
{ "gifts": [ ... ] }
```

Kräver `is_platform_admin`. Kroppen tas emot upp till 8 MB (783 gåvor är cirka 0,4 MB).

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
