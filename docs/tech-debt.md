# Känd teknisk skuld

Sådant som är **uppmätt och verifierat**, inte misstänkt. Varje punkt har en plats i koden och ett
sätt att bevisa den. Ta bort en punkt när den är åtgärdad — inte när den känns åtgärdad.

Filen ersätter `docs/live-readiness-matrix.md` (PR #54, stängd 2026-08-06). Den matrisen var en
ögonblicksbild som hann bli inaktuell på ungefär halva sina rader innan den mergades, och en av dess
rader höll på att pensionera en fungerande widgetfamilj. Det här är i stället bara de påståenden som
fortfarande stämmer, och som ingen annanstans är nedskrivna.

Senast verifierad mot `main`: **2026-08-09**.

---

## 1. Glove Snipe kan inte tändas av ett riktigt event

`media.js` `routeLiveBattleEvent()` tänder Glove Snipe på eventtyperna `tap`, `snipe`, `glove`,
`x2` och `x3`. **Ingen av dem är en ingest-typ.** Bryggan publicerar `gift`, `like`, `share`,
`subscribe`, `member`, `chat`, `viewer`, `battle` och `follow` — inget annat.

Widgeten kan alltså bara nås från battle-UI:t eller en Actions-regel. Den är preview-only i praktiken.

**Bevisa så här:**

```bash
git grep -c "'tap'\|'snipe'\|'glove'" -- tiktok-bridge/
```

Svarar den 0 finns ingen väg dit.

Det här är samma mönster som redan åtgärdats i tre widgetar — se
`battle-mvp-session.js`, `fan-level-session.js` och `gifter-level-session.js` för receptet.
Glove Snipe är den sista kända kvarvarande.

## 2. Gift Fireworks "Testa"-knappen kringgår alertkön

Testknappen i panelen anropar effekten direkt. Livevägen går genom `VyraAlertQueue`, som spelar en
alert i taget och håller nästa tillbaka i hela visningstiden.

Följden: **editorn känns snabbare än verkligheten.** Klickar man testknappen fem gånger ser man fem
fyrverkerier; fem riktiga gåvor spelas efter varandra med sekunder emellan.

Det är inte fel i sig — en testknapp ska vara omedelbar — men det är en fälla när någon justerar
timing i editorn och tror att det är vad tittarna ser.

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

## 4. widget-defaults-migration-provet beror på en lokal baseline-gren

`tests/widget-defaults-migration.test.js` letar efter en gammal `media.js` med de
inline-katalogliteraler som fanns före widget-fabriken. Den söker i denna ordning:

```js
for (const rev of ['feature/event-deduplication:media.js', 'origin/main:media.js', 'main:media.js'])
```

Första posten är en **lokal grenreferens**. Efter Steg 0.5 (2026-08-08) raderades den grenen —
den var mergad och övergiven. Provet hoppar nu över hos utvecklare som städar sina lokala grenar.
Fjärrgrenen finns kvar på origin, så fixen är att låta provet peka på
`origin/feature/event-deduplication:media.js` i stället.

Uppmätt 2026-08-08 — bara den ena refen bär literalerna:

```
JA   origin/feature/event-deduplication:media.js
nej  origin/main:media.js
nej  main:media.js
```

Provet är redan byggt för att hoppa över graceful — se raderna 2 och 9–10 i filen, som förklarar
att detta är "local migration proof, not part of the permanent contract" och att CI:s grunda
checkout alltid skippar det. Ingenting i CI påverkas. Det är en utvecklarbekvämlighet, inte ett
kontraktsbrott.

**Bevisa så här:**

```bash
node --test tests/widget-defaults-migration.test.js
```

Efter Steg 0.5 utan fixen: 2 prov skippas, 0 fel. Efter att provet pekats om — eller efter lokal
återskapning med `git branch feature/event-deduplication origin/feature/event-deduplication` —
kör alla prov.

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

## 6. Laddningsgrindar i browser-prov pekar på UI-kopia

Sex command-center-prov väntar på att premium-vyn ersatt basvyn genom att läsa **kopiatexten** ur
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

Sex träffar = skulden kvarstår. Noll = konverterad.

**Åtgärd:** grinda på en strukturell markör i stället — ett stabilt klassnamn eller
data-attribut som premium-vyn redan renderar (t.ex. att `.eyebrow`-elementet finns i `#view`),
eller ett explicit `data-cc-ready`-attribut som `overview-premium.js` sätter. Egen städ-PR;
uppmätt 2026-08-09 att inga ANDRA prov i sviten delar mönstret, så konverteringen är avgränsad
till de sex filerna.

Verifierad: 2026-08-09.

---

# Regler som kostat oss något

§1–§6 är skuld: namngivna platser i koden som väntar på en fix. §7–§11 är av en annan sort —
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
- **`cleanEvent` är den tystaste förlustpunkten i hela kedjan.** Chattexten, profilbilden,
  gåvovärdet, fan-nivån och gifter-nivån har alla i tur och ordning strukits där utan att något
  larmade. Lägg nya fält **efter `at:`** — ett kontraktstest läser bara 1600 tecken från
  `function cleanEvent`.
