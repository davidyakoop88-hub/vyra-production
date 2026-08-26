# Gåvoidentitet · bekräftad inlärning och exakt giftId-matchning

**Status: design + röda prov. Ingen produktionskod, inget mergat, inga flaggor rörda.**

## Problemet

Regler som ska gälla **en bestämd gåva** — först Heart Me — behöver ett stabilt `giftId`. Två vägar
har provats och stängts:

1. **Repots katalog** (`assets/gifts/gifts-manifest.js`, 1148 poster) har bara `name` och `file`.
   Inget `giftId`. Filnamnsprefixen är en lokal löpnumrering, inte TikToks id.
2. **Rummets katalog** via `fetchAvailableGifts()` kräver signering, signeringen går genom Euler
   Stream, och den routen kräver en **betald Business-plan** — uppmätt i produktion 2026-08-26,
   se `docs/gavokatalog-matresultat.md`. Ingen `signApiKey` och ingen plan ska läggas till.

Kvar finns en väg som varken kostar pengar eller kräver signering: **gåvoeventen själva**.
`cleanEvent` (`server/event-bus.js:13-27`) bär både `giftId` och `giftName`, och `normalizer.js:68`
fyller båda från TikToks payload. Varje skickad gåva är alltså en observation av paret
(`giftId`, `giftName`).

## Vad det här ÄR och INTE är

**ÄR:** en lärande uppslagstabell från observerade gåvoevent, plus en matchningsregel som bara
använder bekräftade `giftId`.

**ÄR INTE:** en integration av `recognition-*.js` eller `premium-gift-widget.js`. De två befintliga
presentationssystemen rörs inte, kopplas inte ihop, och det dokumenterade beslutet i
`docs/PREMIUM_GIFT_WIDGET_SPEC.md` att **inte** routa gåvor genom `VyraRecognitionRuntime.push()`
står kvar oförändrat.

## Källan — den befintliga eventkedjan, oförändrad

Inlärningen hakar i på exakt samma ställe och med exakt samma mönster som statistiken redan
använder, i `ingestTikTokEvent` (`server/index.js:111-128`):

```js
if (!raw.duplicate) streamStats.record(workspaceId, raw.event).catch(() => {});
```

Det mönstret är medvetet valt och kommenterat i koden: **inte await:at**, sväljer sina egna fel,
körs **bara när eventet inte är en dubblett**, och har ändå ett `.catch()` eftersom en avvisad
promise utan hanterare fäller hela processen i Node.

Gåvoidentiteten får samma form. En inlärningsskrivning som strular får aldrig hindra eventet från
att nå overlayet — då slutar sändningen fungera för att en analysskrivning gick fel.

`!raw.duplicate` är dessutom nödvändigt för räkningen: en replay av samma event får inte se ut som
en andra oberoende observation.

## Modellen

### Tabellen

```
gift_identity(
  workspace_id, gift_id, gift_name,
  observationer, avsandare, forsta_sedd, senast_sedd, bekraftad_at
)
PRIMARY KEY (workspace_id, gift_id, gift_name)
```

Nyckeln bär **både** id och namn med flit: samma id som dyker upp med två namn, eller samma namn med
två id, är information vi vill se — inte något som ska skrivas över tyst.

`avsandare` är antalet **distinkta** avsändare som bidragit, räknat med husets serverägda
identitet — `identitet()` i `server/stream-stats.js:38-42` (strip `@`, trim, lowercase), samma
nyckel som `gifter_totals.viewer_id`. Att räkna råa användarnamn hade gjort en person till flera.

### Vad "bekräftad" betyder

En mappning blir bekräftad när **båda** villkoren är uppfyllda:

- **≥ 3 observationer**, och
- **≥ 2 distinkta avsändare.**

Skälet till det andra villkoret: en ensam person ska inte kunna lära systemet en mappning på egen
hand, oavsett hur många gåvor hen skickar. Tre gåvor från samma konto är en observation upprepad,
inte tre oberoende.

Trösklarna är konfigurerbara i modulen men har dessa värden som default, och de står i ett prov —
ändras de faller provet, vilket är meningen.

### Matchning — bara bekräftade id, aldrig namn

En regel lagrar ett **namn** (`Heart Me`), och slår upp det mot bekräftade mappningar:

- **Exakt ett bekräftat `giftId`** → regeln matchar det id:t, och bara det.
- **Noll bekräftade** → regeln matchar ingenting. Fail closed.
- **Flera bekräftade id för samma namn** → **tvetydigt**, regeln matchar ingenting och läget
  rapporteras. Det här är inte teoretiskt: gåvo-id kan skilja mellan regioner, och katalogroutens
  `webcastLanguage`-parameter visar att TikTok självt behandlar gåvor som språkberoende.

**Eventets `giftName` används aldrig för matchning.** Det finns två skäl, båda uppmätta:
`normalizer.js:68` defaultar `giftName` till strängen `'Gift'` när namnet saknas, och namnet är
språkberoende. Namnet är enbart det som *lärs in*, aldrig det som *matchar*.

### Fail-closed genomgående

- Event utan `giftId` → lär ingenting, matchar ingenting.
- Event utan användbar avsändarnyckel → räknas inte som en avsändare.
- Tom eller okänd tabell → regeln matchar ingenting.

Hellre noll än fel gåva.

## Vad som INTE ingår

- Ingen ändring av `recognition-*.js` eller `premium-gift-widget.js`.
- Ingen ändring av mållogiken, `goal_runtime` eller Like Goal.
- Ingen ny miljövariabel, ingen flaggändring, ingen produktionsåtgärd.
- Ingen regelmotor än — det här levererar **identiteten**, som regler sedan kan bygga på.

## Kopplingen till PR #275

Heart Me Goal blockerades av att `Heart Me` inte gick att identifiera. När den här mappningen är
bekräftad i ett workspace har #275 sitt `giftId` — utan betald plan och utan namnmatchning.

#275 rörs inte i den här PR:en och förblir draft.
