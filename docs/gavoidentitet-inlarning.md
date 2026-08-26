# Gåvoidentitet · manuellt lärläge för en vald regel

**Status: design + röda prov. Ingen produktionskod, inget mergat, inga flaggor rörda.**

## Vad det här är

Ett **riktat, manuellt lärläge**: du väljer en regel, trycker *Lär in nästa gåva*, skickar gåvan,
ser namn och bild, och bekräftar. Först då sparas `giftId` för just den regeln.

**Det är inte** en katalog, inte automatisk inlärning, och inte något som räknar observationer eller
avsändare. En tidigare version av den här designen hade trösklar på 3 observationer och 2 distinkta
avsändare — det var fel. Det gjorde Heart Me dyrt att lära in, samlade avsändardata i onödan, och
löste ett problem som inte finns när en människa bekräftar fångsten.

## Varför gåvoeventen är källan

Regler som ska gälla **en bestämd gåva** behöver ett stabilt `giftId`. Båda andra vägar är uppmätt
stängda:

| Väg | Utfall |
|---|---|
| Repots katalog (`gifts-manifest.js`, 1148 poster) | Bara `name` och `file` — **inget `giftId`** |
| Rummets katalog (`fetchAvailableGifts()`) | Kräver signering → Euler Stream → **betald Business-plan** (uppmätt i produktion 2026-08-26, `docs/gavokatalog-matresultat.md`) |

Gåvoeventen bär redan både `giftId`, `giftName` och `giftImage` genom `cleanEvent`
(`server/event-bus.js:13-27`). Ingen signering, ingen kostnad.

## Flödet

1. Du väljer en regel i Studio — först `Heart Me`.
2. Du trycker **Lär in nästa gåva**. Regeln armeras med en kort utgångstid.
3. **Nästa giltiga, icke-dubblerade gåvoevent fångas** — ett, inte fler.
4. Studio visar `giftName` och `giftImage` för kontroll.
5. Du väljer **Bekräfta** eller **Avbryt**.
6. **Först vid Bekräfta** sparas `giftId` för den regeln och det workspacet.
7. Fångade du fel gåva: **Avbryt** och armera om.

## Vad "giltig slutframe" betyder — och varför servern inte behöver göra något

En streak levererar många frames för samma gåva. Att fånga en mellanframe vore fel.

**Filtreringen sker redan i bryggan.** `tiktok-bridge/bridge.js:374`:

```js
if (N.isStreakable(data) && !N.isFinalFrame(data)) return;
```

`isFinalFrame` (`normalizer.js:60`) behandlar dessutom en gåva **utan** `repeatEnd` som komplett vid
ankomst — annars hade den tappats. Semantiken är fastnaglad mot verklig trafik i
`tiktok-bridge/test/gift-streak.test.js`, mätt på 14 frames från ett riktigt rum.

Alltså: **varje gåvoevent som når servern är redan en slutframe.** Serversidan behöver bara två
saker till för att uppfylla kravet:

- **`!raw.duplicate`** — en replay av samma event får inte räknas som fångsten.
- **`giftId` måste finnas** — utan id finns ingen identitet att spara.

Det här beroendet är en tyst invariant, och därför vaktat av ett eget prov: försvinner raden i
bryggan skulle lärläget börja fånga mellanframes utan att någon märkte det.

## Modellen

### Två tabeller, ingen avsändardata

```
gift_rule_identity(workspace_id, regel, gift_id, gift_name, gift_image, bekraftad_at)
PRIMARY KEY (workspace_id, regel)          -- EN rad per regel, inte en katalog

gift_learn_arm(workspace_id, regel, armerad_at, gar_ut_at,
               fangad_gift_id, fangad_gift_name, fangad_gift_image, fangad_at)
PRIMARY KEY (workspace_id, regel)          -- högst ett armerat läge per regel
```

**Ingenting om avsändaren lagras.** Inga användarnamn, inga id, inga räknare. Det är inte bara en
förenkling utan en avsiktlig begränsning: lärläget behöver veta *vilken gåva*, aldrig *vem*.

### Armering och utgångstid

Armeringen har en kort livstid — **default 120 sekunder**, konfigurerbar. Värdet står i ett prov, så
en ändring fäller provet med flit.

- **Utgången armering fångar ingenting.** Kommer gåvan för sent händer inget alls.
- **En utgången fångst går inte att bekräfta.** Hann du inte trycka Bekräfta måste du armera om.
- **Avbryt** rensar armeringen direkt, med eller utan fångst.

Kort livstid är ett medvetet val: ett lärläge som ligger armerat i timmar fångar förr eller senare
fel gåva.

### Fångsten är inte ett sparande

Fångsten skriver **bara** till `gift_learn_arm`. `gift_rule_identity` rörs inte förrän Bekräfta.
Det är hela poängen med steg 5–6: människan i mitten är bekräftelsen, inte en tröskel.

En andra gåva medan en fångst redan ligger och väntar **skriver inte över** den. Annars vore
"nästa gåva" i praktiken "senaste gåva", och du skulle bekräfta något annat än det du såg.

### Matchning

Efter Bekräfta är det **exakt det sparade `giftId`** som matchar, och ingenting annat.

`giftName` matchar aldrig — varken vid uppslag eller som reserv. Namnet sparas enbart för att
Studio ska kunna visa vad som är inlärt. Skälen är uppmätta: `normalizer.js:68` defaultar `giftName`
till strängen `'Gift'` när namnet saknas, och namnet är språkberoende.

### Fail-closed

- Ingen sparad identitet för regeln → regeln matchar ingenting.
- Event utan `giftId` → fångas inte.
- Ej armerad → gåvoevent ändrar ingenting.

## Källan — befintlig kedja, oförändrad

Fångsten hakar i på samma ställe och med samma mönster som statistiken redan använder i
`ingestTikTokEvent` (`server/index.js:111-128`):

```js
if (!raw.duplicate) streamStats.record(workspaceId, raw.event).catch(() => {});
```

Inte `await`:at, sväljer sina egna fel, körs bara på `!raw.duplicate`, och har ändå ett `.catch()`
— en avvisad promise utan hanterare fäller processen i Node. En fångstskrivning får aldrig hindra
eventet från att nå overlayet.

## Vad som INTE ingår

- Ingen ändring av `recognition-*.js` eller `premium-gift-widget.js`. De två presentationssystemen
  rörs inte och kopplas inte ihop; beslutet i `docs/PREMIUM_GIFT_WIDGET_SPEC.md` står kvar.
- Ingen ändring av mållogiken, `goal_runtime` eller Like Goal.
- Ingen regelmotor — det här levererar **identiteten**, som regler sedan bygger på.
- Ingen ny miljövariabel, ingen flaggändring, ingen produktionsåtgärd.

## Kopplingen till PR #275

Heart Me Goal blockerades av att `Heart Me` inte gick att identifiera. När du en gång lärt in och
bekräftat gåvan i ditt workspace har #275 sitt `giftId` — utan betald plan och utan namnmatchning.

#275 rörs inte här och förblir draft.
