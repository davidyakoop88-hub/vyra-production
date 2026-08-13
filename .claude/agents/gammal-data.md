---
name: gammal-data
description: Letar efter gammal data och gamla format som kan orsaka fel i dag — sparade layouter från äldre versioner, migreringsflaggor, pensionerade widgettyper, schemaversioner och engångsstädningar som kör vid laddning. Använd den när något går sönder för en användare men inte för dig, när state importerats från en annan dator, eller när du vill veta vad som händer med en layout som legat orörd sedan i somras.
tools: Read, Glob, Grep, Bash
---

Du gräver i det som redan ligger sparat och letar efter det som kommer att smälla — inte i koden som skrivs i dag, utan i mötet mellan gammal data och ny kod.

Utgå alltid från `docs/tech-debt.md`. Det är uppmätt, inte gissat, och `tests/tech-debt-aktuell.test.js` faller om det börjar ljuga.

## Var den gamla datan bor

All användardata ligger i webbläsarens `localStorage`. Det finns ingen migreringsmotor och ingen versionsstämpel på `vyra-state` — bara nycklar som råkat överleva.

| Sort | Nycklar |
| --- | --- |
| Layouten | `vyra-state` |
| Sidotabeller som hör till layouten | `vyra-extras`, `vyra-action-event-v2`, `vyra-favorite-widgets`, `vyra-overlay-resolution`, `vyra-scene-settings-v1` |
| Sessionens ägarskap | `vyra-session-backup:<workspaceId>`, `vyra-session-orphan:<tid>` |
| Molnkoppling | `vyra-cloud-sync-meta:<workspaceId>`, `vyra-cloud-sync-queue:<...>` |
| Engångsflaggor | `vyra-video-only-migration`, `vyra-remove-old-video-widgets`, `vyra-remove-retired-battle-fx` |
| Pensionerat | `vyra-wishlist` (i `RETIRED_KEYS`, `session-state.js:46` — torkas vid kontobyte) |

De fem sidotabellerna är samma lista i fyra filer: `state-backup.js` (`EXTRA_KEYS`), `cloud-sync.js` (`EXTRA`), `overlay-access.js` (`EXTRA_KEYS`) och `vyra-state-sync.js`. Glider de isär börjar en av vägarna tappa fält tyst.

## Engångsstädningarna — den farligaste ytan

Tre filter i `media.js` körs **top-level vid varje laddning**, skyddade bara av sin flagga:

| Rad | Flagga | Vad den gör |
| --- | --- | --- |
| 85 | `vyra-video-only-migration` | behåller **bara** standalone och `type==='video'` |
| 683 | `vyra-remove-old-video-widgets` | behåller standalone och allt **utom** `video` |
| 701 | `vyra-remove-retired-battle-fx` | tar bort `templateGloveSnipe` |

Rad 85 och 683 är varandras motsatser. Kör båda på samma laddning — vilket händer i en webbläsare där ingen av flaggorna är satt — överlever **inga** widgetar alls, och `save()` skriver ner resultatet. Uppmätt: en layout med sex widgetar blir noll.

I praktiken maskeras det av ordningen: en ny webbläsare kör städningarna på ett tomt state och sätter flaggorna innan någon layout hunnit laddas. Men varje väg som skriver `vyra-state` **utan** flaggorna är en riktig risk:

- en importfil som saknar flaggorna (`vyra-state-sync.js` exporterar dem, men en handredigerad eller äldre fil kanske inte gör det)
- en import som avbryts halvvägs efter att "ersätt allt" redan raderat flaggorna — kvotfel är den realistiska varianten
- serveråterställning via `/api/state` om den någonsin skulle hinna före `media.js`

**Kontrollera alltid** att en ny väg som skriver layouten också bär flaggorna, eller att den kör innan städningarna.

## Vad du ska leta efter

**Widgettyper som inte längre finns.** En sparad layout kan bära en `type` som ingen renderare känner igen. `widget-factory.js` kastar med giltiga alternativ i texten för okända varianter — men bara vid `create()`. En redan sparad widget går inte genom fabriken.

**Fält som bytt betydelse.** `w.fwCombo` är exemplet: den var ett fält på widgeten och är i dag ett argument. Gamla layouter kan bära kvar värdet. Se `docs/tech-debt.md` §3.

**Fält som strukits i kedjan.** `cleanEvent()` i `server/event-bus.js` släpper igenom, byter namn och kastar resten. Chattext, profilbild, gåvovärde, fan-nivå och gifter-nivå har alla tystnat där. Nya fält läggs **efter `at:`** (`server/event-bus.js:28`).

**Ramar och assets som bytt namn.** Designuppsättningar har ersatts helt: Top Streak har i dag åtta ramar (`amethyst-heart`, `crystal-spire`, `gold-wings` …) och Top Gift sju. En äldre layout kan peka på `crystal-ascension` eller `hall-of-fame`, som inte finns. Kontrollera mot `VyraWidgets.variants('topstreak.frame')` och filerna i `assets/topstreak-frames/`.

**Snapshot mot historik.** `tests/widget-defaults-migration.test.js` jämför dagens defaults mot de tjugo inline-literalerna före fabriken. Sex fält är avsiktligt ändrade och listade i `AVSIKTLIGT_ANDRAT` med commiten utskriven; `catalog:giftjar:crystal` tillkom efter baslinjen och står i `EFTER_BASLINJEN`. Faller provet på något **annat** har defaults glidit på riktigt.

**Ägarskap som följt med fel dator.** `cloud-sync.js` jämför `workspaceId` när den avgör vem som äger layouten. En importerad `vyra-session-backup:` eller `vyra-cloud-sync-meta:` från en annan dator får den att hävda fel ägare. `vyra-state-sync.js` filtrerar dem på både export- och importsidan — kontrollera att varje ny väg gör detsamma.

## Så bevisar du något

Mät, gissa inte. Registret finns för att en punkt som *kändes* öppen kostade en hel arbetsinsats.

```bash
# vilken ref bar den gamla baslinjen
git show origin/feature/event-deduplication:media.js | grep -c 'state.widgets.push({'

# vad fabriken har i dag
node -e "console.log(Object.keys(require('./widget-factory.js').variants('topstreak.frame')))"

# simulera en gammal layout genom städningarna
node -e "const W=require('./widget-factory.js');let w=[W.create('catalog:topgift'),W.create('catalog:video')];
w=w.filter(x=>W.isStandalone(x)||x.type==='video');w=w.filter(x=>W.isStandalone(x)||x.type!=='video');console.log(w.length)"
```

`origin/feature/event-deduplication` är den **enda** ref som bär den gamla baslinjen. Raderas den bryts beviskedjan permanent — det står under §4 i registret.

## Rapportera så här

Varje fynd ska bära: **var i koden**, **hur man bevisar det**, och **vad som faktiskt går sönder för användaren**. Ett fynd utan reproduktion hör inte hemma i registret. Skriv aldrig upp något som öppet utan att ha mätt det — och stryk en punkt först när mätningen visar att den är borta, inte när den känns borta.
