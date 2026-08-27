# Regelnycklar · vilken låda en inlärd gåva hamnar i

`gift_rule_identity` har `PRIMARY KEY (workspace_id, rule_key)`. Nyckeln är **enda** kopplingen
mellan *det Studio lärde in* och *det en regel senare slår upp*.

Väljs den fritt av webbläsaren kan Studio lära in Heart Me under en nyckel medan Goal frågar efter
en annan. Felet syns inte som ett fel — ingen felkod, inget larm, bara en widget som står på noll
trots att gåvan är inlärd. Det är därför nycklarna har fasta former och valideras på servern.

## Formerna

| Form | Används av |
|---|---|
| `heart_me` | Heart Me Goal. En enda, global, oföränderlig. |
| `gift_campaign:<widgetId>:<slot>` | En Gift Campaign-**slot**. |

### Varför kampanjnyckeln bär både widget och slot

En kampanjwidget har flera slots, och **varje slot väljer sin egen gåva och har sin egen räknare**
(`gift-event-images.js:238-252`, `widget['giftCurrent' + index]`). En nyckel per widget hade tvingat
alla slots att dela en enda gåva.

`<slot>` kanoniseras: `007` och `7` blir samma låda. Utan det vore de två lådor för samma
kampanjplats, och en av dem alltid tom.

## Servern äger nyckeln

`server/regelnycklar.js` är enda porten:

- **`validera(rule_key)`** → kanonisk nyckel, eller `null` om formen är okänd.
- **`giftCampaign(widgetId, slot)`** → bygger en kampanjnyckel, och **kastar** hellre än att
  returnera något halvgiltigt.

Rutten `/api/workspaces/<id>/gift-identity/<rule_key>` kör varje nyckel genom `validera()` och
svarar **400 Okänd regelnyckel** på allt annat. Ett vaktprov läser `index.js` och faller om den
kopplingen försvinner.

## Vad som INTE är samma låda

`heartme`, `heart-me`, `Heart_Me`, `heart_me_2` — alla nekas. Att acceptera dem hade varit värre än
att neka: två stavningar, två lådor, en av dem alltid tom.

## Kvar att göra

**Gift Campaign matchar i dag på `giftName`** (`gift-event-images.js:246-248`), inte på id. Det är
just det som inlärningsmotorn ersätter: när kampanjen kopplas till sin nyckel säger den bara "min
valda gåva", och motorn matchar på det bekräftade `giftId` i bakgrunden.

Heart Me Goal (PR #275) kopplas till `heart_me` i ett eget steg.
