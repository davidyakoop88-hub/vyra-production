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
