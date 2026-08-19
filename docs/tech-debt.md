# Känd teknisk skuld

Sådant som är **uppmätt och verifierat**, inte misstänkt. Varje punkt har en plats i koden och ett
sätt att bevisa den. Ta bort en punkt när den är åtgärdad — inte när den känns åtgärdad.

Filen ersätter `docs/live-readiness-matrix.md` (PR #54, stängd 2026-08-06). Den matrisen var en
ögonblicksbild som hann bli inaktuell på ungefär halva sina rader innan den mergades, och en av dess
rader höll på att pensionera en fungerande widgetfamilj. Det här är i stället bara de påståenden som
fortfarande stämmer, och som ingen annanstans är nedskrivna.

Senast verifierad mot `main`: **2026-08-18**.

**Ingen numrerad skuld är öppen längre som går att lösa här.** Kvar står §5, som är åtgärdad i koden
och vaktad av fyra browser-prov men som bara en riktig deploy kan stänga. §1:s sista fråga — vilket
steg i multiplikatoruppgiften som ska tända overlayn — kräver en riktig TikTok LIVE och står i
`docs/live-verifiering.md` tillsammans med de andra tre ställena i battle-kedjan där koden gissar.

---

## ~~1. Glove Snipe kan inte tändas av ett riktigt event~~ — LÖST

Punkten löd: `routeLiveBattleEvent()` tänder Glove Snipe på `tap`, `snipe`, `glove`, `x2` och `x3`,
och **ingen av dem är en ingest-typ** — bryggan publicerade bara gift, like, share, subscribe,
member, chat, viewer, battle och follow. Widgeten kunde alltså bara nås från battle-UI:t eller en
Actions-regel.

**Vad som saknades var källan, inte vägen.** Klientsidan var redan komplett, `cleanEvent` bar redan
fältet `multiplier` (0–100), och `battleFields` letade redan efter `battle.multiplier ??
battle.boostMultiplier`. Problemet var att `LINK_MIC_BATTLE` inte bär någon multiplikator.

Hittad 2026-08-14 i `tiktok-live-proto/v3`: den ligger i **`LINK_MIC_BATTLE_TASK`**, på
`start.config.rewardConfig` → `RewardPeriodConfig { rewardMultiple, rewardStartTimestamp, duration }`.
Det är TikToks Boosting Glove — ett tidsfönster där gåvor ger multiplicerade poäng.

Bryggan prenumererar nu på den händelsen och skickar typen `glove` med multiplikatorn. Typen är med
flit inte `battle`: `battle-mvp-session.js` öppnar och stänger sin session på allt vars typ
innehåller "battle", och ett boost-event mitt i en match hade tänt MVP-overlayn i fel ögonblick.

Fyra listor måste namnge en typ för att den ska nå en widget — bryggans `TILL_MOLNET`,
`TIKTOK_INGEST_TYPES`, `TIKTOK_ROOM_TYPES` och event-bussens `ALLOWED`. Jag missade den fjärde, och
`tests/event-contract.test.js` fångade det direkt: *"bryggan skickar typer molnet kastar: glove"*.

Vaktat av 13 prov: åtta i `tiktok-bridge/test/battle-task.test.js` (fältläsning, att TASK_UPDATE
aldrig skickas, att 5× passerar) och fem i `tests/glove-live-wiring.test.js` (hela vägen genom
`routeLiveBattleEvent`, aldrig via triggern direkt). Mutationsprovat i tre lager: tas fältläsningen,
molnets vitlista eller klientens gren bort faller proven.

**Kvar att verifiera live:** vilket steg i uppgiften som ska tända overlayen. Vi skickar på START,
som är det enda steget som bär konfigurationen. `rewardStartTimestamp` säger när fönstret faktiskt
börjar — visar det sig att START kommer märkbart före, ska sändningen fördröjas dit.

Verifierad löst: 2026-08-14.

## ~~2. Gift Fireworks "Testa"-knappen kringgår alertkön~~ — LÖST

Testknappen anropade effekten direkt: den byggde raketerna och satte `.play` på DOM-noden. Livevägen
går genom `VyraAlertQueue`, som spelar en alert i taget och håller nästa tillbaka i hela
visningstiden. Editorn kändes därför snabbare än verkligheten, och den som justerade timing i
panelen såg något tittarna aldrig får se.

**Det fanns TVÅ genvägar, inte en.** En capture-lyssnare på `document` och — två rader bort — en
`t.onclick` satt i `bind()`. Båda tände `.play` rakt av. Den första källvakten läste bara den ena
och blev grön medan den andra satt kvar; provet mätte en rad och intygade en fil. Vakten kräver nu
att `.play` tänds på **exakt ett** ställe i `gift-fireworks.js`, och att det stället är `fwSpela()`
— den funktion både en riktig gåva och testknappen går genom.

Knappen skickar `__test: true`, som hoppar över `fwMin` och anonymfiltret men **behåller kön och
dubblettspärren**. Utan undantaget hade knappen tystnat så fort streamern höjer sin gräns: man
trycker, och ingenting händer. Samma mönster som `triggerFanLevelUp` redan använder. En riktig gåva
under `fwMin` tänder fortfarande ingenting — vaktat.

Combon läses ur fältet och skickas som argument; den skrivs inte längre till widgeten av klicket.
Det gör fältets egen `onchange`, vilket är samma regel som punkt 3 ovan drev igenom för livevägen.

Prov: `tests/alert-queue.test.js` (kön + källvakten) och `tests/gift-fireworks-panel.test.js`
(klicket går genom triggern, bär `__test`, och rör inte layouten). Mutationsprovat åt sju håll,
alla dödade — inklusive den som återinför den andra genvägen.

## ~~3. Gift Fireworks skriver live-data till den sparade layouten~~ — LÖST

Punkten stod kvar som öppen efter att koden lagats. Den kostade en hel ansats: 2026-08-10 valdes
den som "den farligaste kvarvarande skulden" och arbetet påbörjades innan mätningen visade att
det inte fanns något att laga. **Ett skuldregister som ljuger kostar mer än skulden det beskriver.**

Skrivningen `traffar.forEach(w=>{w.fwCombo=combo});save();render();` är borta ur
`triggerGiftFireworks()`. Combon är ett argument, aldrig ett fält på widgeten. Se kommentaren på
platsen i `gift-fireworks.js`, som hänvisar hit.

Vaktat av tre prov i `tests/gift-fireworks-live-path.test.js`:

- `combon skrivs inte pa widgetobjektet`
- `livevagen gor inga writes i kallan heller`
- `render() river inte ner noden som just spelar`

Verifierad löst: 2026-08-10.

## 5. Synkkonflikt-banderollen kan tystas utan att lösa konflikten

`push()` (`cloud-sync.js:63`) returnerar `{ok:false,status:409}` **utan att kasta** när servern
svarar 409. "Den här datorn"-knappen i `showConflict()` (`cloud-sync.js:74`) kör
`await push();await apply(payload());bar.remove()` i ett try-block — kedjan fortsätter alltså
förbi den misslyckade pushen och tar bort banderollen ändå. Status stannar på `conflict`, kön
ligger kvar, men UI:t visar ingenting.

Dubbelfel: 409-vägen i `push()` försöker visa en ny banderoll, men `showConflict()` har vakten
`if(document.querySelector('.cs-conflict'))return` — och den gamla banderollen finns fortfarande
i DOM i det ögonblicket. Den nya undertrycks, den gamla tas bort strax därpå. Tyst permanent
konflikt.

Följden: användarens val når aldrig servern. Nästa lokala ändring skrivs till kön men synkas
inte; andra enheter (och OBS, som hämtar från servern) ser den gamla versionen. Ingen märker
något förrän layouten saknas på en annan enhet.

"Online"-knappen delar **inte** felet: dess `apply()` kastar vid ogiltigt svar, så catch-grenen
behåller banderollen.

Reproducerad i produktion 2026-08-09 under synkkonflikt-lösningen efter Etapp 2: efter klicket
hade servern fortfarande 4 widgets i stället för valda 5, `VyraCloudSync.status()` sa `conflict`
— utan banderoll. Räddad med ett manuellt `VyraCloudSync.push()`, som gav `{ok:true}` och tömde
kön.

**Bevisa så här** (i Studions konsol, direkt efter klicket på "Den här datorn"):

```js
VyraCloudSync.status()   // 'conflict' fast banderollen ar borta = tyst konflikt
const cur = VyraCloudSync.current();
const svar = await VyraAuth.api(`/api/workspaces/${cur.workspace.id}/overlays/${cur.overlay.id}`);
svar.overlay.state.widgets.length   // skiljer sig fran Studions antal = valet nadde aldrig servern
```

**Åtgärd:** kontrollera push-resultatet i knapphanteraren (`const r=await push(); if(!r.ok)return`
före `bar.remove()`), eller ta bort banderollen först när status faktiskt bytt till `synced`.
Provet ska verifiera både banderollens frånvaro OCH att servern tagit emot den valda versionen —
banderollens frånvaro ensam är exakt det som ljög här. Rött browser-prov som simulerar dubbel-409
först, enligt repo-praxis.

Verifierad: 2026-08-09.

**ÅTGÄRDAD 2026-08-09:** `if(!r.ok)return` i `[data-cs-local]`-hanteraren — banderollen tas bara
bort när skrivningen bevisligen lyckats; står den kvar kan användaren välja igen, så vaktens
undertryckning av 409-vägens nya banderoll blir ofarlig. Fyra prov i
`tests/browser/cloud-sync-conflict.browser.test.js` (äkta cloud-sync.js i riktig Chrome): dubbel-409,
409-sedan-ok (bevisar att servern tagit emot den valda versionen), rak lyckad push och
Online-kedjan som vakter. Röda före fixen, mutationsprovade (`if(false)return` fäller prov 1–2).
Kvarstår att verifiera i produktion efter deploy.

## ~~6. Laddningsgrindar i browser-prov pekar på UI-kopia~~ — LÖST

**Löst 2026-08-17.** `overview-premium.js` sätter `document.documentElement.dataset.ccReady = '1'`
och de sex grindarna läser det attributet. Noll träffar på mönstret, som registret krävde.

**Raden ligger sist i filen, och det är ett val.** Grinden mäter *laddning*, inte rendering — vid
dess tidpunkt är ingenting renderat än, proven tvingar fram sin render efteråt. Registrets förslag
"ett data-attribut som premium-vyn redan **renderar**" hade därför inte fungerat. Sist i filen
betyder markören dessutom "hela modulen är installerad", inte bara att `home` bytts: kastar någon
av de två IIFE:erna som bygger livekorten och historikraden sätts den aldrig.

**Det påståendet var först obevakat, och en mutation överlevde på det.** Markören flyttad överst i
filen samtidigt som den sista IIFE:n kastar gav fyra gröna prov. 6c krävde då bara att noden
`[data-alltime]` fanns efter render — men den **markupen kommer från `home()`**, inte från IIFE:n.
Bara siffran i raden gör det. 6c stubbar därför API:t och kräver att historikraden faktiskt fylls.
Ett prov som mäter markup i stället för beteende är §7 en gång till: det ser ut att mäta modulen och
mäter mallen.

**Frånvaron räckte inte som bevis.** Första versionen av avbrottsprovet blockerade
`overview-premium.js` och krävde att markören uteblev — och var **grön redan innan markören fanns**,
eftersom ett attribut som inte finns i koden alls också uteblir. Provet har nu en positiv kontroll i
samma kropp: en oblockerad sida i samma körning måste tända markören. Det är §7:s regel om
kontrollmätning, i en variant som är lätt att gå på.

Vaktat av fyra browser-prov i `tests/browser/command-center-grind.browser.test.js` (6a–6d) och två
källvakter i `tests/browser-rigg.test.js`. 6d är det som mäter själva skulden: den serverar en
`overview-premium.js` där kopiatexten bytts ut och kräver att **den gamla grinden slocknar medan
markören står kvar** — exakt det som hände i #154. Källvakten läser alla browsertester, inte bara de
sex; mönstret uppstår på nytt varje gång någon behöver vänta på en modul och tar det som ligger
närmast.

Ursprungsbeskrivningen står kvar nedan.

---

Sex command-center-prov väntade på att premium-vyn ersatt basvyn genom att läsa **kopiatexten** ur
funktionskällan:

```js
() => typeof home === 'function' && home.toString().includes('KOMMANDOCENTRAL')
```

Mönstret brister vid varje språk- eller kopieändring. Bevisat i PR #154: när eyebrown byttes från
"VYRA LIVE COMMAND CENTER" till "VYRA LIVE-KOMMANDOCENTRAL" stod grindarna evigt falska och
**43 prov dog i 20-sekunderstimeouts** — inte för att något var trasigt, utan för att grindens
signal var själva texten som byttes. Lagningen i #154 bytte bara strängen; skulden är mönstret.

Filerna (grindraden i respektive fil):
`command-center-alltime` :83 · `-diamonds` :73 · `-gifts` :73 · `-likes` :73 · `-pulse` :67 ·
`-viewers` :76 — alla i `tests/browser/`.

**Bevisa så här:**

```bash
git grep -nE "toString\(\)\.includes\('[A-ZÅÄÖ]" -- tests/
```

Sex träffar = skulden kvarstår. Noll = konverterad. **Noll sedan 2026-08-17**, och vaktat så att det
förblir noll.

**Åtgärd:** grinda på en strukturell markör i stället — ett stabilt klassnamn eller
data-attribut som premium-vyn redan renderar (t.ex. att `.eyebrow`-elementet finns i `#view`),
eller ett explicit `data-cc-ready`-attribut som `overview-premium.js` sätter. Egen städ-PR;
uppmätt 2026-08-09 att inga ANDRA prov i sviten delar mönstret, så konverteringen är avgränsad
till de sex filerna.

Verifierad: 2026-08-09.

## ~~13. Poäng dras även när actionen aldrig spelar~~ — LÖST

**Löst 2026-08-17.** `action-event.js` har nu `kanKora(action, payload)` — samma fyra grindar, utan
en enda skrivning — och `runAction` **anropar** den i stället för att upprepa villkoren. Därmed
finns en implementation av grindarna, inte två som kan glida isär (det var invändningen mot väg 1
nedan). Toast och scroll ligger kvar i `runAction`: de är svaret på ett nej, inte en del av frågan.
`action-event-advanced.js` frågar först och drar bara när minst en action faktiskt kommer att spela.

Samma mätning som nedan, efter fixen:

```
  forsok 1: 1 korningar totalt | poang 1000 -> 900
  forsok 2: 1 korningar totalt | poang  900 -> 900
  forsok 3: 1 korningar totalt | poang  900 -> 900
  forsok 4: 1 korningar totalt | poang  900 -> 900
  forsok 5: 1 korningar totalt | poang  900 -> 900
  RESULTAT: 1 korning, 100 poang spenderade
```

Vaktat av `tests/action-event-poang.test.js` (12 prov). Mutationsprovat åt tre håll: utan
`if(!korbara.length)return` faller B1-B4, utan `bypassCooldown` i checken faller combo-provet, och
en `lastRun`-skrivning inne i checken faller på A1.

**Två rester som fixen inte täcker står i §15** — de mättes när den här punkten stängdes och är
en annan sorts fel: de handlar om vem som drar poängen, inte om när.

Ursprungsbeskrivningen står kvar nedan, för mätningen och för resonemanget.

---

`action-event-advanced.js` drog kostnaden i `handleEvent`:

```js
if (e.pointsCost && window.VyraPoints && !window.VyraPoints.spend(payload.username, e.pointsCost)) return;
ids.forEach(id => window.VyraActionEvent?.runAction(...));
```

Avdraget sker alltså **innan** något är känt om huruvida actionen kommer att köras. `runAction`
och runtimens `allowed()` kan säga nej av fyra skäl efteråt, och poängen är redan borta:

| Skäl | Var |
|---|---|
| Cooldown | `action-event.js` — `stored.cooldown` |
| Cooldown per användare | `action-event.js` — `stored.userCooldown` |
| Actionen finns inte (raderad, eventet kvar) | `action-event.js` — `state.actions.find` ger undefined |
| Fel scen | `action-runtime.js:54` — `allowed()` |

**Uppmätt 2026-08-14** i jsdom med de riktiga filerna, cooldown 30 s och kostnad 100:

```
  forsok 1: 1 korningar totalt | poang 1000 -> 900
  forsok 2: 1 korningar totalt | poang  900 -> 800
  forsok 3: 1 korningar totalt | poang  800 -> 700
  forsok 4: 1 korningar totalt | poang  700 -> 600
  forsok 5: 1 korningar totalt | poang  600 -> 500
  RESULTAT: 1 korning, 500 poang spenderade
```

En tittare som spammar sitt kommando under cooldown betalar varje gång och får en uppspelning.
Samma sak vid fel scen och vid raderad action: 0 körningar, 100 poäng borta.

Det syns inte i något prov eftersom inget prov gick hela vägen från regel till spelad widget —
`tests/action-event-kedjan.test.js` gör det nu, men mäter avsiktligt inte den här punkten: att
låsa fast dagens beteende hade gjort det till ett kontrakt.

**Åtgärd, två vägar:**

1. *Kolla före avdraget.* Flytta cooldown- och scenkontrollen till en fråga `runAction` kan svara
   på utan att köra (`window.VyraActionEvent.kanKora(action, payload)`), och dra bara när svaret är
   ja. Renast, men två ställen måste hållas i takt.
2. *Betala tillbaka.* Låt `runAction` returnera varför den sa nej och återför poängen vid
   avslag. Enklare, men ett kort ögonblick står saldot fel — och två flikar som båda kör
   `handleEvent` gör fönstret större.

Väg 1 är att föredra för att den aldrig visar ett saldo som inte stämmer.

Verifierad: 2026-08-14. Åtgärdad via väg 1 den 2026-08-17.

## ~~15. Poängen dras en gång per öppen flik, och cooldown gäller bara i studion~~ — LÖST

Två fel som hittades när §13 stängdes. De ligger **utanför** §13:s fix: den avgör *när* avdraget
sker, de här handlar om *vem* som drar det och *var* cooldownen finns.

**Hela §15 är löst 2026-08-17** — 15a av en förare för automationen, 15b av ett eget lager för
körningstidsstämplarna, 15c av en återbetalning från overlayn. `action-master.js` väljer
en förare för automationen; `handleEvent` i båda vägarna frågar `VyraAutomationMaster.farKora()`
innan något dras eller körs. Vaktat av `tests/action-event-flikar.test.js` (9 prov) på en rigg som
ger flera jsdom-fönster **ett** delat lager och korsflik-`storage`-event
(`tests/helpers/flikar.js`).

Samma mätning som i 15a, efter fixen:

```
  studio          utskick: 0   spelningar: 0
  overlay scen 1  utskick: 0   spelningar: 1
  overlay scen 2  utskick: 0   spelningar: 0

  avdrag for EN gava: 1        (var 3)
  koer direkt efter gavan: overlay scen 1: 1     (var 3)
```

Valet har två nivåer, och den andra är inte en artighet: en streamer som startar OBS före Studion
förväntar sig att tittarnas effekter fungerar. **Nivå 1** — en flik i `studio-committed` — tar
platsen alltid, även från en levande nivå 2. **Nivå 2** — vilken flik som helst — tar en ledig eller
inaktuell plats. Nyckeln `vyra-automation-master` förnyas var 2:e sekund och räknas som inaktuell
efter 6 s, samma fönster som `sceneOnline()`. Anspråket sker under `navigator.locks`, som finns i
varje flik — det är `mode`, inte låshanteraren, som saknas i en overlay.

Slavarna tiger om *avdraget*, inte om *uppspelningen*: den når dem via
`localStorage['vyra-action-run']` som `action-runtime.js:74` redan lyssnar på. Den bryggan bar
trafiken redan före fixen — det var just därför spelningarna blev tre.

**Kvarvarande lucka, medvetet vald:** `farKora()` är synkron och kan inte vänta på låset, så två
flikar som behandlar samma event i exakt det ögonblick en master dör kan båda se en tom plats och
båda köra. Kostnaden är ett extra avdrag för ett event, högst en gång per 6-sekundersfönster. Att i
stället tiga tills låset svarat hade kostat en tappad uppspelning, vilket är dyrare.

`BroadcastChannel('vyra-action-run')` i `action-event.js:7` postades till men hade **ingen
prenumerant** någonstans i repot. **Raderad 2026-08-17.** `action-runtime.js` lyssnar på
document-eventet `vyra:action` och på localStorage-nyckeln med samma namn — aldrig på kanalen, som
alltså var skrivbar död kod sedan den skrevs. Nyckeln lever kvar och bär hela trafiken. Behövs
kanalen igen dedupar `execute()` på `runId`, så den kan kopplas in utan risk för dubbel uppspelning.

### ~~15a. Varje öppen flik drar sin egen kostnad för samma gåva~~ — LÖST

`live-client.js:131` anropar `handleEvent` utan någon overlay-spärr, och `studio.html?overlay=1` är
samma sida — alltså laddar varje scenlänk i OBS sin egen kopia. Dedupe-grinden (`gateFor().accept`)
är per flik, och `VyraPoints` ligger i `localStorage`, som alla flikar delar.

**Uppmätt 2026-08-17** med två fönster mot ett gemensamt lager, en enda gåva, kostnad 100:

```
  delat saldo:        1000 -> 800
  avdrag for EN gava: 2 st a 100 poang
```

En streamer med studion plus tre scenlänkar uppe tar alltså fyra gånger betalt. Fixen är inte att
flytta avdraget igen utan att bestämma **vilken flik som äger poängekonomin** — rimligen den
skrivbara studiofliken, med overlayflikarna som rena mottagare.

**Mätt igen 2026-08-17 med tre flikar och en riktig korsflik-rigg**, och det var värre än så: gåvan
betalades tre gånger **och spelades tre gånger**. Kön dolde det — med `duration: 6` ser tre köade
uppspelningar ut som en om man mäter direkt efter gåvan.

```
  studio          utskick: 0   spelningar: 0
  overlay scen 1  utskick: 1   spelningar: 3
  overlay scen 2  utskick: 1   spelningar: 0

  avdrag for EN gava: 3
  koer direkt efter gavan: overlay scen 1: 3
```

Åtgärdad via en förare — se toppen av §15.

### ~~15b. Cooldown fungerar inte i en flik utan skrivrätt~~ — LÖST

`runAction` sparar `lastRun` med `VyraSessionState.writeActive`, som kräver `studio-committed`
eller `local-committed` (`session-state.js:138` och `:284`). En overlayflik står i
`overlay-token-readonly` och kan aldrig skriva. Då fastnar inget `lastRun`, och cooldownen —
både den globala och den per användare — är **helt verkningslös** där.

**Uppmätt 2026-08-17**, samma fem gåvor som i §13 men i ett fönster utan skrivrätt:

```
  runAction sa ja:    5 ganger
  lastRun sparad:     NEJ
  poang spenderade:   500
```

Tillsammans med 15a betydde det att en overlayflik både tog betalt **och** ignorerade cooldownen.
Streamern såg en inställning i panelen som inte gällde i den utgång som faktiskt sändes.

**Nedskalat 2026-08-17 av samma fix som 15a.** Nivå 1 i master-valet är per definition den enda
flik som får skriva, så när studion är öppen fastnar `lastRun` och cooldownen fungerar igen —
uppmätt med tre flikar: fem gåvor under cooldown 30 s ger en spelning och ett avdrag
(`tests/action-event-flikar.test.js`, prov 9).

**Rotorsaken löst 2026-08-17.** Körningstidsstämplarna bor nu i en egen nyckel,
`vyra-action-cooldowns`, skriven med rå `localStorage` — ingen projektion, ingen version, inget
lås. Cooldownen fungerar därmed i **varje** flik, också en självkörande nivå 2-overlay med OBS
igång utan öppen studio. Uppmätt i en ensam overlay, fem gåvor under cooldown 30 s och kostnad 100:
en uppspelning och 100 poäng, mot fem och 500 före.

Tre följder av flytten, alla avsiktliga:

- **Cooldowns synkas inte längre till molnet.** De låg förr inne i `vyra-action-event-v2`, en
  EXTRA_KEY, och följde alltså med till nästa dator som om "när spelade det här senast" vore en del
  av layouten. Nu är de per maskin, precis som poängsaldot.
- **`write(state)` försvann ur den varmaste vägen.** Varje körd action utlöste förr en låst,
  versionshanterad projektion, bara för att spara ett tal.
- **Nyckeln torkas vid kontobyte.** `per` är keyad på tittarnas användarnamn, så en kvarlämnad
  nyckel hade låtit nästa konto på en delad dator läsa förra kontots tittare. `beginLogout` torkade
  bara `EXTRA_KEYS`, `RETIRED_KEYS` och markören — därför finns nu **`EPHEMERAL_KEYS`** i
  `session-state.js`: nycklar vi *använder*, som varken projiceras, synkas eller backas upp, men
  som måste torkas. Vaktat av prov 6 i `tests/action-cooldown-lager.test.js`.

Läsningen är tvåkällig och skrivningen enkällig: en installation som uppgraderar har kvar sina
stämplar inne i actionen, och utan reservläsningen hade varje cooldown nollställts vid
uppdateringen. De gamla fälten skrivs aldrig igen och vittrar bort av sig själva.

Vaktat av `tests/action-cooldown-lager.test.js` (8 prov), mutationsprovat åt fyra håll. Prov 5 —
"stämpeln läcker inte tillbaka in i det som synkas" — måste köras i en **skrivbar** flik: i en
overlay stoppas den gamla skrivningen ändå av `writeActive`, så provet hade varit grönt även med
felet återinfört.

Det förklarade också varför `tests/action-event-kedjan.test.js` aldrig kunde se en cooldown: den
riggen sätter `navigator.locks = undefined`. Efter flytten gäller det inte längre — cooldownen
lever utanför projektionen och biter i vilken rigg som helst.

### ~~15c. En full kö tar betalt för det som aldrig ryms~~ — LÖST

`sceneMaxQueue` i `action-runtime.js` lever i overlayfliken, bakom en BroadcastChannel, och går
inte att fråga synkront därifrån poängen dras. `kanKora` kan därför inte svara på den.

**Uppmätt 2026-08-17**, fyra gåvor utan cooldown mot en scen med `maxQueue: 1`:

```
  runAction sa ja:    4 ganger
  widgeten spelade:   1 gang(er)
  koen rymmer:        2
  poang spenderade:   400
```

Fyra betalda, tre som ryms, en som tystnade. Det här är den enda av §13:s grindar som inte gick att
flytta före avdraget, och den kräver en väg tillbaka från overlayn — alltså väg 2 (återbetalning)
för just det här fallet.

**Löst 2026-08-17 via väg 2.** Overlayn rapporterar en strypt uppspelning, mastern betalar tillbaka.
Samma mätning efter fixen: 400 dragna blev **200**, och de 200 som ströps kom tillbaka.

Fyra saker som avgör om en återbetalning är rätt, och som alla är lätta att bygga fel:

- **Bara kö-grenen räknas.** `execute()` säger nej av fyra skäl; tre av dem är inte förlorade
  uppspelningar. Fel scen (`allowed()`) är **routing** — räknades det som strypning vore varje
  flerscensuppsättning en gratis återbetalningsautomat. `skipOnNext` hör inte heller hit: den
  kortar ner en uppspelning som faktiskt sker.
- **Återbetalning sker per KÖP, inte per körning.** Ett event betalar en gång men kan skicka ut
  flera actions; spelade en av tre fick tittaren det hen betalade för. Mastern håller en huvudbok
  `{runIds, kvar, username, belopp}` och betalar först när sista körningen ströps.
- **Rapporten kan komma FÖRE registreringen.** `runAction` skickar ut synkront, så overlayns
  `execute()` hinner säga nej innan `map()` lämnat ifrån sig sitt sista `runId`. En huvudbok som
  bara tittar bakåt hade missat precis de fall den byggdes för; tidiga rapporter parkeras och
  hämtas hem av registreringen.
- **`add()` är inte `refund()`.** `add` räknar upp `earned`, livstidssumman bakom `getLevel()`, och
  `spend` sänker den aldrig. Med `add` hade en tittare kunnat nivå upp genom att med flit svämma
  över kön. Nya `VyraPoints.refund` återställer saldot utan att röra `earned`.

**Ingen master-vakt i återbetalningen, med flit.** Planen hade en; mutationsprovet visade att den
var både överflödig och skadlig. Överflödig för att huvudboken redan är vakten — bara den flik som
*drog* poängen känner igen ett `runId`. Skadlig för att en flik som drog och sedan tappade platsen
(en nivå 2-overlay när studion öppnas) hade slutat betala tillbaka mitt i flödet.

Vaktat av `tests/action-poang-retur.test.js` (10 prov), mutationsprovat åt sju håll.

**Siffrorna för 15a-15c är mätningar, inte krav.** Ingen av dem är låst i ett prov som asserterar
det trasiga beteendet — det var precis vad §13 varnade för.

Verifierad: 2026-08-17.

## ~~14. Actions och TTS Chat är två skilda talsystem~~ — LÖST

En TTS-action går till `window.speechSynthesis` direkt (`action-runtime.js` → `tts()`).
TTS Chat-panelen (`tts-chat.js`) har en egen väg: molnröster via `server/tts.js` (msedge-tts,
prefixet `cloud:`) **eller** webbläsarens, med kö, maxlängd, cooldown, Special Users och Comment
Types.

**Uppmätt 2026-08-14** — en action med `types:['tts']`, text `"Tack {username} for {giftname}!"`,
volym 60, i jsdom med de riktiga filerna:

```
  talade:          "Tack lisa for Rose!"  rate 1.2, pitch 0.9, volume 0.6
  nätverksanrop:   (inga)
  VyraTtsChat:     undefined
```

Platshållarna fylls och hastighet/tonhöjd/volym går fram — kopplingen fungerar. Men:

1. **Molnrösterna är oåtkomliga för Actions.** En röst vald i TTS Chat bär prefixet `cloud:`, och
   `action-runtime.js` skickar värdet rakt in i `speechSynthesis`. Ingen träff → standardrösten.
2. **Ingen delad kö.** TTS Chat spelar en i taget; Actions går utanför. En gåva mitt i en
   chattuppläsning ger två röster samtidigt.

Röstlistan i action-panelen var ett tredje fel i samma familj och är åtgärdad — se
`tests/action-tts-rost.test.js`. De två ovan kvarstår.

**Åtgärd:** låt Actions gå genom `tts-chat.js`:s uppspelningsväg i stället för att ropa på
`speechSynthesis` själva. Det löser båda på en gång, men kräver att `tts-chat.js` exponerar sin kö
(den exponerar inget API idag) och att röstlistan i action-panelen får med `cloud:`-rösterna.
Volymen är per action och per TTS Chat-inställning — bestäm vilken som vinner innan de slås ihop.

Verifierad: 2026-08-14.

**Löst 2026-08-17.** Uppmätt före och efter, samma två scenarier:

```
FORE                                        EFTER
  roster som talade:  3 (alla flikar)         roster som talade:  1 (overlay 1)
  poang spenderade:   30                      poang spenderade:   10
  TTS-action i mun pa chatten: JA (+12 ms)    talade samtidigt:   nej
```

**Inventeringen avslöjade ett tredje fel, större än de två nedskrivna.** `tts-chat.js` lyssnar
direkt på `vyra-live-event` utan overlay-vakt och utan master-grind, så varje öppen flik läste upp
samma chattrad *och* drog sin egen kostnad. Det är §15a om igen, för rösten — och att automationen
lagades först gjorde asymmetrin värre, inte bättre.

### Vad som byggdes

- **`vyra-tal.js`** — ett delat talutrymme. Kön var talspecifik (`{text, opts}`), men det verkliga
  villkoret är *ett ljud i taget, nästa startar när föregående rapporterar klart*. Enheten är
  därför ett anspråk med ett löfte: `koa({kalla, spela: () => Promise, maxKo})`. Då kan chatten och
  en action dela kö utan att kön behöver veta vad ett `cloud:`-röstnamn är.
- **Ljudfiler köas inte — de duckas.** Ett gåvoljud hör ihop med sin visuella effekt i tid; att
  lägga det bakom en tjugo sekunder lång uppläsning förstör larmet i stället för att rädda det.
  `volymfaktor()` + `lyssna()` sänker ljudet medan någon talar, även ett som redan rullar.
  Duckningen är enkelriktad med flit: talet duckar aldrig för ett gåvoljud.
- **`vyra-masterval.js`** — elektionen ur `action-master.js` utbruten till en fabrik, eftersom
  rösten behöver exakt samma mekanism med **omvänd** prioritet. Två hjärtslagsnycklar, en
  implementation; att kopiera 60 rader hade varit precis det fel §13 handlade om.
- **`VyraRostMaster`** — nivå 1 är en **overlay**, inte studion. En streamer fångar sitt ljud via
  browser source i OBS, inte via desktop audio, så en röst som bara talar i Studion försvinner ur
  sändningen. Nivå 2 är studion, så en ensam studioflik fortfarande låter.
- **Vem betalar och vem låter är två olika frågor.** Automationsmastern avgör *om* raden ska läsas
  och drar kostnaden — en gång. Beslutet går sedan ut till alla flikar, och röstmastern talar.

Actions TTS gateas **inte** på röstmastern: `allowed()` routar dem redan till rätt scens overlay,
och en grind ovanpå det hade tystat scen 1:s action så fort scen 2:s overlay råkade hålla
röstplatsen.

Vaktat av `tests/action-talutrymme.test.js` (8 prov), mutationsprovat åt sju håll.

**Ett fel fixen själv skapade och som mätningen fångade:** kapacitetskontrollen före avdraget läste
den *egna* fliken kö. Efter uppdelningen är den betalande fliken sällan den talande, så studion såg
en tom kö och tog betalt för rader overlayn sedan slängde — 40 poäng för två upplästa rader.
Röstmastern publicerar därför sin kölängd i `vyra-tal-ko`, och `hasQueueRoom` läser den.

**Resten adopterad 2026-08-17 — och listan var fel.** Punkten sa fyra fristående ljudkällor. Mätt i
källan var det **tre**:

| Fil | Vad som faktiskt spelas | Utfall |
|---|---|---|
| `gift-fireworks.js` | `new Audio(...)`, volym ur `fwVolume` | duckas |
| `battle-mvp-session.js` | `new Audio(FANFAR_FIL)` **plus en WebAudio-fallback** punkten inte nämnde | båda duckas |
| `sound-alerts.js` | `new Audio(...)` i panelens förhandsvisning | duckas |
| ~~`media.js`~~ | **noll `new Audio`.** Varje videoelement är `muted` (rad 11, 65, 546, 578, 712) | inget att göra |

`media.js` hade alltså aldrig något ljud att ducka. Vaktat ändå (prov 14), så att ett nytt `Audio`
eller ett omutat videoelement tvingar fram ett beslut i stället för att smyga in ostyrt.

**Och `action-runtime.js` bar redan sin egen `duckaMedan`.** Att lägga en delad hjälpare bredvid den
hade gett fyra implementationer av samma tre steg — sätt volym, prenumerera, avregistrera — som kan
glida isär. Den privata är därför borttagen; `VyraTal.duckaLjud()` äger dansen och alla fyra går
genom den. Prov 13 vaktar att ingen av dem prenumererar på egen hand igen.

Ett element kan spelas om: `sound-alerts.js` bygger ett `audioEl` per kort och återanvänder det vid
varje klick. `duckaLjud` släpper därför en tidigare prenumeration på samma nod innan den tecknar en
ny — annars staplas en per klick, och den gamla fortsätter skriva sin egen basvolym.

Den syntetiska fanfaren läser duckningen **en gång, vid schemaläggningen**. Salvan är ~1,1 s
förschemalagda ramper; att ändra dem mitt i kräver att varje ramp skrivs om, för en fallback som
bara körs när ljudfilen saknas.

Vaktat av prov 9–14 i `tests/action-talutrymme.test.js`.

# Regler som kostat oss något

§5 är skuld: en namngiven plats i koden som väntar på en fix. §7–§11 är av en annan sort —
**mönster som bet flera gånger under Etapp 5**, och som inte går att laga en gång för alla eftersom
de uppstår på nytt varje gång någon skriver ett prov eller lägger till en modul.

§7 och §11 är de akuta. Båda ger **tyst falskt positivt utfall**: allt ser grönt ut, och felet
upptäcks först när någon råkar titta. §8, §9 och §10 är arkitekturregler — de säger hur man ska
bygga, inte vad som är trasigt just nu.

## 7. Prov som mäter en proxy i stället för verkligt tillstånd

Ett prov som passerar **utan implementationen** är falskt grönt. Det vanligaste sättet att skriva
ett sådant är att hävda frånvaron av en effekt utan att först bevisa att handlingen ens skedde.

Fyra fall, alla uppmätta under Etapp 5:

| PR | Provet påstod | Varför det passerade utan koden |
|---|---|---|
| #159 | "indikatorn fick ingen tidsstämpel" | `writeActive` svarar `not-writable` utan projicerad session — provet mätte frånvaron av en **sparning**, inte av en tidsstämpel |
| #162 | "zoom skriver inte till sessionen" | noll klick på knappar som inte fanns skriver förstås noll gånger |
| #163 | "Shift stänger av snappen" | ett orört läge ser likadant ut oavsett om Shift stängde av något eller om det aldrig fanns något att stänga |
| #163 | "det sparade värdet ligger på rutnätet" | slutläget råkade bli delbart med 8 |

**Regeln:** varje prov som hävdar en frånvaro måste innehålla en **kontrollmätning** som bevisar att
handlingen utfördes. `assert.deepEqual(klickade, ['ut','in','anpassa'])` före
`assert.equal(skrivningar, 0)`. Fixturvärden ska väljas så att det förväntade felutfallet inte kan
inträffa av en slump — målwidgeten i snapp-proven står på `203,147` just för att `203` inte är
delbart med 8, annars gick en träff på widgeten inte att skilja från en träff på rutnätet.

Mutationsprov och kontrollmätning löser **olika** problem: mutationsprovet visar att sviten som
helhet fångar strukturen, kontrollmätningen att det enskilda provet har skärpa. Båda behövs.

**Kandidatlista så här** (varje träff ska granskas för hand — det här är ingen dom, bara formen som
frånvaroprov har):

```bash
git grep -nE "assert\.(equal|strictEqual)\([a-zA-Z0-9_.]+, *0[,)]" -- tests/
```

## 8. DOM-existens är inte användarsynlighet

Tre varianter, alla uppmätta. Alla tre passerar strukturella prov och missar det enda som räknas:
**kan användaren se det?**

1. **Monterad men utanför bild.** Autospar-indikatorn i #159 landade på `y=902` i ett 900 px högt
   fönster — den fanns i DOM, hade rätt text, och syntes aldrig. Samma sak hade hänt zoomkontrollen
   i #162 om den placerats `absolute` i `.workarea`: den behållaren rullar, så `bottom` ankras mot
   *innehållets* botten, inte den synliga.
2. **I DOM men aldrig tänd.** Katalogens miniatyrer och widgetskal är släckta på två nivåer, roten
   och det inre effektlagret — och Glove Snipe (§1 ovan) renderas men kan inte nås av ett riktigt
   event.
3. **Semantiskt korrekt men visuellt oskiljbart.** Snappväxeln i #163 satte `aria-pressed` rätt,
   togglade snappen rätt, och **såg likadan ut i båda lägen** (se §11 för orsaken). Den här varianten
   är den farligaste: den passerar tillgänglighetsprov, den passerar funktionella prov, och en
   skärmläsare säger till och med rätt sak.

**Mät så här** för variant 3 — jämför computed styles mellan lägena, inte attributet:

```js
const las = () => { const cs = getComputedStyle(el);
  return cs.backgroundImage + '|' + cs.backgroundColor + '|' + cs.borderTopColor };
const pa = las(); el.click(); const av = las();
assert.notEqual(pa, av);
```

**Åtgärd (föreslagen, ej byggd):** en generell vakt som sveper alla element märkta
`[data-must-be-visible]` och kräver rektangel > 0, inom förälderns synliga box, och `opacity > 0`.
Fyra separata fall har hittills fixats en och en.

## 9. Editor-moduler måste läsa DOM efter render, inte state före render

`state` säger vad som var tänkt. DOM säger vad som blev. I editorn skiljer de sig oftare än man tror,
och **fyra buggar i Etapp 5 hade samma rot**:

| PR | Vad som lästes fel | Vad DOM sa |
|---|---|---|
| #158 | render-wrappar når inte editor-vyn | `layout-safe.js` äger `#view` och returnerar utan att anropa kedjan |
| #160 | `mediaMeta` skulle bära filens mått | den bär `{name, id}` — inget annat |
| #160 | tomt H-fält = ingen höjd | widgeten har en höjd på duken, den är bara inte satt för hand |
| #162 | duken är 432×768 | `layout-format.js` kan byta format; storleken finns på noden |

Rotorsaken till att det inte går att komma runt: **fyra panelbyggare laddas dynamiskt** av `media.js`,
alltså efter varje statiskt skript i `studio.html`. Deras `props`-wrappar hamnar därför alltid utanpå
en statisk fils och returnerar sin egen HTML utan att nå inåt. Ett statiskt skript kan **aldrig** bli
ytterst i den kedjan — ingen placering av skripttaggen hjälper.

De fyra, uppmätta mot `main` 2026-08-09:

| Rad i `media.js` | Laddar |
|---|---|
| 792 | `ensureEditorOverlayBundle()` — bland annat `last-x-alerts.js` |
| 803 | `standalone-widgets.js` |
| 852 | `custom-widgets.js` |
| 873 | `premium-final.js`, `runtime-controls.js`, `chatbot-controls.js` |

**Bevisa så här** — radnumren rör sig, mönstret gör det inte:

```bash
git grep -nE "createElement\('script'\)|vyraLoadBundle" -- media.js
```

**Regeln:** editor-moduler monterar via `MutationObserver` på `#view` och mäter i DOM. Se
`vyra-historik.js`, `vyra-proportioner.js`, `vyra-zoom.js` och `vyra-snapp.js` för mönstret.

## 10. Bindare som skriver över varandra på samma selektor är död kod utan varning

Fem bindare band `.resize-handle` innan #161: `manualResize` (media.js), `wholeScale`, `videoResize`,
`customResize` (custom-widgets.js) — var och en `handle.onpointerdown = …`, alltså sista skrivning
vinner. Uppmätt i riktig Chrome, alla fyra widgettyper:

| Typ | Vem vann | Vad som ändrades |
|---|---|---|
| generisk (Top Like) | `wholeScale` | `widgetScale` |
| Top Gift | `wholeScale` | `widgetScale` |
| `video` | `videoResize` | `width` + `height` |
| custom bild/text/video | `custom-widgets.js` | `width` + `height` |

**`manualResize` vann aldrig.** Den band handtaget utan typvakt, kördes först och skrevs över i
samtliga fall — död kod sedan den skrevs, och **ingen provfil nämnde `manualResize`, `wholeScale`
eller `widgetScale`**, så täckningen på den kod som faktiskt kördes var noll.

Sista-bunden-vinner är ingen design; det är en olycka som råkade se ut som en. Det som gör mönstret
farligt är att varje enskild fil ser korrekt ut — felet finns bara i kombinationen, och det syns inte
i någon diff.

**Bevisa så här** — flera träffar på *samma* selektor är kandidaten:

```bash
git grep -nE "querySelector\('\.[a-z-]*handle'\)" -- '*.js' ':!*.min.js'
```

Rent läge efter #161 är **tre** träffar: `media.js` (routern för `.resize-handle`), `media.js`
(gåvohandtaget, en annan selektor) och `custom-widgets.js` (den dokumenterade delade ägaren av
`.resize-handle`). Blir det fyra på `.resize-handle` är någon tillbaka i sista-bunden-vinner.

**Åtgärd:** en uttalad router som väljer ägare ur widgetens typ, inte ur laddningsordningen. Se
`window.VyraResize.agare(w)` i `media.js`. Där ägarskapet är delat mellan filer (custom-typerna ägs
av `custom-widgets.js`) ska routern **returnera tidigt med en namngiven kommentar** i stället för att
slåss om handtaget.

## 11. CSS-specificitet mellan moduler kan tyst nollställa styling

När två moduler stylar samma element via olika selektorer avgörs resultatet av **specificitet**, inte
av ordning eller avsikt. Skillnaden syns inte i någon av filerna var för sig.

Uppmätt i #163:

| Regel | Kom från | Specificitet | Utfall |
|---|---|---|---|
| `.vy-kontroll button` | #162 | (0,1,1) | **vann** |
| `.snapp-vaxel` (på-läget) | #163 | (0,1,0) | förlorade — död kod |
| `.snapp-vaxel.av` (av-läget) | #163 | (0,2,0) | vann |

Följden: växeln såg **likadan ut i båda lägen**. `aria-pressed` växlade, snappen slogs av och på,
och ingenting syntes — se §8 variant 3.

**Mät så här:** jämför computed styles mellan tillstånden i ett browser-prov. Att läsa CSS-filerna
räcker inte; specificitetskollisionen uppstår först i kaskaden.

**Åtgärd:** en modul som sätter en klass som visuellt tillstånd på ett element en annan modul redan
stylar måste **matcha eller överträffa** den befintliga specificiteten — i #163 blev det
`.vy-kontroll button.snapp-vaxel` (0,2,1) respektive `.vy-kontroll button.snapp-vaxel.av` (0,3,1).
Och tillståndsskiftet ska vaktas av ett prov som jämför utseendet, inte attributet.

Verifierad: 2026-08-09.

---

## Sådant som är löst, men värt att minnas

- **Ett event som `count`, `combo` eller `repeatcount`.** Combostorleken nådde en gång aldrig fram
  till fyrverkeriet eftersom `action-runtime.js` letade efter fältnamn eventet inte bar. Löst i
  PR #94 genom att skicka hela payloaden i stället för ett enda tal.
- **Ett prov som hoppar över på varje utvecklarmaskin ser ut som CI:s grunda checkout.**
  `widget-defaults-migration.test.js` sökte baseline i ordningen `feature/event-deduplication`,
  `origin/main`, `main`. Den första var en LOKAL grenreferens; grenen raderades i Steg 0.5 eftersom
  den var mergad, och därefter hittade listan ingen ref med literalerna hos någon som städar sina
  lokala grenar. Provet skippade tyst i månader och såg ut att bara vara CI som skippade.
  Fjärrgrenen fanns kvar hela tiden. Löst 2026-08-14 genom att sätta `origin/`-formen först.
- **Ett migrationsbevis slutar vara sant den dag designen medvetet går vidare.** När provet väl
  kördes föll det: 8 av 28 varianter skilde sig från historien — målfärgerna (d0a7156, palett per
  modell), battle-MVP:s etikett och visa-flaggor (195fc8a), gifter-nivåns text (058badb) och Gift
  Jar som porterades först efteråt (23ece1d). Alla åtta var beslutade. Historien ändras inte i
  efterhand, så ett krav på exakt likhet kunde aldrig bli grönt igen. Provet är därför omskrivet
  till en driftvakt: varje avvikelse måste stå i `AVSIKTLIG_DRIFT` med commiten som beslutade den,
  och de 20 varianter som ingen rört jämförs fortfarande bit för bit. Mutationsprovat åt båda
  hållen — en tyst ändring i en icke-beslutad variant faller, och ett extra fält utöver ett
  beslutat undantag faller också.
- **Ett prov som bara kan köras en gång ser rätt ut i CI för att CI alltid är ny.**
  `overlay-put-sync.test.js` applicerade eventet `after-put-1` och lät raden ligga kvar i
  `goal_event_apply`. Claimen är idempotent per `(workspace_id, event_id)`, så andra körningen mot
  samma databas claimade ingenting och provet föll på "eventet claimades inte — inget mål matchade".
  Grön en gång, röd för alltid därefter. Uppmätt 2026-08-14: grön på färsk databas, röd direkt på
  omkörning. GitHubs tjänstecontainer är ny varje körning och dolde det. `reset()` tömmer nu även
  idempotenstabellen. **Städa allt provet skriver, inte bara det du kom att tänka på** — annars är
  "order independence, proven rather than asserted" bara den första körningens tur.
- **Åtta provfiler kördes ingenstans.** De grindar sig på `TEST_DATABASE_URL` — riktigt, de kräver
  en engångsdatabas — men `ci.yml` sätter den aldrig och `goal-runtime-postgres.yml` startade bara
  på push till `integration/live-goals-base`, en gren inget flöde rör längre. Uppmätt 2026-08-14:
  **111 av serverns 410 prov överhoppade** i den konfiguration CI faktiskt körde. Löst genom att
  flytta triggern till samma villkor som `ci.yml`; jobbet är inte en dubblett, det bevisar
  målkontraktet mot Postgres 18 (Railways version) medan `ci.yml` står på 16 för sin backup-klient.
- **Släppporten läste `web/Dockerfile`.** Katalogen har aldrig funnits i repot — hela git-historiken
  är tom på den — så `validatePublicArtifact()` kastade ENOENT i stället för att kontrollera något.
  Den publika imagen byggs av `Dockerfile` i roten, som redan failar bygget om `server`, `scripts`,
  `docs`, `electron-app` eller `tiktok-bridge` hamnar i dokumentroten. Porten läser den filen nu.
- **Ett `{ skip }` i optionsobjektet avgörs när provet registreras, inte när det körs.** 43
  browserprov satte `skip` på nytt inne i `test.before` när ingen webbläsare gick att starta.
  Omtilldelningen nådde aldrig fram: `test('...', { skip }, ...)` hade redan läst värdet. På en
  maskin utan startbar webbläsare föll varje prov på `newContext of null` i stället för att hoppas
  över, och de filer som startar riggen inne i provkroppen läckte en lyssnande server så att
  processen hängde. Uppmätt 2026-08-14: 87 hårda fel och sex domäner som aldrig blev klara. Löst
  genom att avgöra saken synkront före registreringen — `tests/helpers/webblasare.js`, vaktat av
  `tests/browser-rigg.test.js`. Vill man skjuta upp beslutet till körtid finns `t.skip(...)` inne i
  provet; det är mönstret server-provens `blocked()` redan använder.
- **Delade räknare i Redis kopplar ihop provfiler som tror att de är ensamma.** API-gränsen nycklas
  på klientens IP, och varje provfil kommer från 127.0.0.1 mot samma Redis — så måltesterna gjorde
  slut på budgeten och `studio-goal-stream` fick 429 där den väntade 202. Grön ensam, röd i grupp,
  och olika fel beroende på om körningen var parallell eller seriell. Löst i `server/rate-limit.js`:
  `NODE_TEST_CONTEXT` (sätts av node:test, finns aldrig i drift) ger en egen nyckelrymd per process.
  Drift delar fortfarande räknare — två instanser bakom samma lastdelare måste göra det.
- **`cleanEvent` är den tystaste förlustpunkten i hela kedjan.** Chattexten, profilbilden,
  gåvovärdet, fan-nivån och gifter-nivån har alla i tur och ordning strukits där utan att något
  larmade. Lägg nya fält **efter `at:`** — ett kontraktstest läser bara 1600 tecken från
  `function cleanEvent`.
- **En ram, en sockel eller en glöd som animeras via sitt innehåll överlever innehållet.** Fan Level
  Ups `loyalty` hade felet åt båda hållen. På väg IN låg poppen på `.fan-profile img`, så ansiktet
  tonade in inuti en orange skiva som stod fullt målad från första bildrutan (löst i #212). På väg
  UT låg samma animation på samma ankare, så ansiktet krympte bort medan skivan lyste vidare —
  uppmätt i Chromium vid 480 ms av 500: behållaren 1.00, ankaret 0.00, och fotograferat som en tom
  glödande skiva över texten i varje alert. Grannarna `stack`, `heartbeat`, `badgereveal`, `ribbon`
  och `duo` animerade redan `.fan-profile` direkt och hade aldrig problemet. Regeln är densamma åt
  båda hållen: **rör behållaren, aldrig ankaret** — ankaret rider med. Löst 2026-08-18.
- **Ett prov som mäter ett elements EGNA opacitet mäter inte vad som är målat.** Samma lagning
  läser efteråt `opacity: 1` på `.fan-profile img`, för att ankaret inte längre har någon egen
  animation — det ärver behållarens. Ett prov som krävt att ankaret tonar ut hade alltså varit
  grönt före lagningen och rött efter den: det hade vaktat buggen. Måttet som bär är produkten av
  `opacity` och transformskalan hela vägen upp till widgetlådan, alltså den effektiva, ärvda
  synligheten. Den siffran bryr sig inte om vilket element som råkar bära animationen, och det är
  precis därför den håller. `tests/browser/fan-fas-loyalty.browser.test.js`.
- **En handskriven lista over "filerna som vaktas" ar korrekt den dag den skrivs.**
  `panel-live-path.test.js` bar regeln *render() far inte anropas fran en oninput-handler* och sex
  filnamn skrivna for hand. Tva panelfiler tillkom efterat — `custom-widgets.js` och
  `gift-fireworks.js` — och vakten sag dem aldrig. Uppmatt i riktig Chrome 2026-08-18: av **atta
  tecken skrivna i egenskapspanelens textruta kom ETT fram**. Resten gick till `BODY`, eftersom
  `render()` bytt ut elementet innan andra tangenttrycket. Anvandaren fick klicka i rutan for varje
  bokstav. Listan ar nu harledd ur klientens egen monkey-patch-konvention (`props=function` /
  `bind=function`), sa en nionde panelfil arver regeln utan att nagon behover komma ihag den.
  **En vakt som raknar upp vaktar bara det nagon kom ihag.** Löst 2026-08-18.
- **Ett prov som blir gront bade fore och efter lagningen ar ingen vakt, hur rimligt det an later.**
  Samma omgang: ett prov skulle mata att panelens scrollTop overlever skrivandet. Det foll fint —
  men pa `el.focus()`, som sjalv drar in elementet i en scrollbar behallare, inte pa omrenderingen.
  Med baslinjen tagen efter fokus blev provet gront i bada tillstanden, eftersom textrutan ligger sa
  hogt i panelen att fokus och omrendering landar pa samma varde. Det togs bort i stallet for att
  behallas som utfyllnad. Kravet star kvar: **mutationsprova at bada hallen, och stryk det som inte
  kan falla.**
- **En cachebust-sträng får inte namnge det den bustar.** `const version='20260818-guardian'` levde
  i `media.js` i tre timmar och överlevde den familj den var uppkallad efter. Vid skrotningen fanns
  ingen Guardian-kod kvar, men strängen hade blivit kvar om inte en assertion i skrotningsskriptet
  fångat den — och nästa läsare som sökte på "guardian" hade hittat en versionsträng och ingen
  implementation, och fått lägga ihop varför själv. **En sträng som namnger kod är ett löfte om att
  koden finns.** Strängen ska svara på NÄR filen byttes, inte på VAD som låg i den; vad som ändrades
  hör hemma i commiten och i bump-kommentaren. Regeln vaktas nu av
  `tests/widget-rendering-cache-and-fountain.test.js` (*ingen cachebust-strang namnger en
  widgetfamilj*), med en svartlista över familjenamn i stället för en generisk ordregel — ett datum
  eller en ordningssiffra är precis vad vi vill ha och får inte fällas. Vakten hittade direkt en
  ärvd överträdelse, `20260807-topgift`, som står kvar i en uttrycklig och krympande lista: att döpa
  om den nu vore en bump utan ändring, alltså en gratis omladdning för varje användare.
- **En egenskap som en animation skriver över måste animationen själv bära med sig.**
  `.ge-diamant` är en kvadrat roterad 45 grader — rotationen är formens identitet, inte ett
  tillstånd. Entréanimationen skrev `transform`, och därmed försvann rotationen: uppmätt i foto 6 av
  Guardian Emblem, där diamanten var en grön **kvadrat** under hela `oppna` och blev en diamant
  först i hyllningen. Det är samma lärdom som `--gw-spacing` (*ett storleksval som inte överlever
  sin egen animation är ingen inställning*), en nivå djupare: det gäller varje egenskap i samma
  `transform`-sträng, inte bara de som råkar vara inställningar. Lagningen är en egen keyframe som
  bär rotationen i båda ändarna. **Inget prov i vaktnätet kunde se det — delen fanns, var målad och
  hade yta. Ögat är mätinstrumentet för form och placering.**
- **En grund klon ger systematiskt fel proveniens i genererade kartor.** `docs/katalogkarta.md` har
  datum- och PR-kolumner ur `git log` per fil. I en shallow clone finns bara de senaste commitarna,
  så varje sektion tillskrivs den nyaste synliga commiten. Uppmätt 2026-08-18: **20 sektioner** stod
  som ändrade den dagen i PR #221 när de i själva verket inte rörts sedan 5 augusti och PR #92.
  Kartan såg komplett ut och var systematiskt fel — den farligaste sorten. `generate-catalog-map.js`
  varnar nu när `.git/shallow` finns, och kartan i det här repot är omgenererad på full historik.
