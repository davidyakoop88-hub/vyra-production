# Personliga raketer

GIFT FIREWORKS har fyra designer via `fwTheme`: `royal` (lila och guld),
`ice` (isblått och silver), `rose` (roséguld) och `comet` (Kometspiral).
Äldre sparade `fwMotion`-värden fungerar fortfarande. Temaknapparna sparar
färgparet och rörelsen; färgerna kan därefter justeras separat.

Varje raket bär eventets gåvobild och vänder till samma events profilbild
vid sin explosion. Båda ansiktena delar position och storlek. Saknad eller
trasig profil visar en personsiluett utan text. Gamla sparade textfält lämnas
orörda men renderas inte längre. Ingen livedata sparas i layouten.

Nivåerna styrs av gåvans VÄRDE. Fram till 2026-09-19 styrdes de av gåvoantalet,
vilket i sändningen 2026-09-18 gav alla elva stora tändningar till 1-mynts-gåvor
medan 23 gåvor värda 26 536 mynt — en av dem på 5000 — körde den minsta nivån.

**Gränsen och trappan är två olika siffror**, och det är avsiktligt.
`fwMin` avgör vad som tänder något alls; `fwFinal` avgör vad som räknas som
stort. Ett första försök lät `fwMin` göra båda jobben, och då gick det inte att
både låta en 1-mynts-gåva tända och hålla finalen sällsynt — mätt på bandet gav
`fwMin=1` fyrtionio stora finaler på två timmar.

| Totalvärde | Visade raketer | Extra uppbyggnad |
| --- | --- | --- |
| under `fwFinal` / 10 | 1 | 0 s |
| `fwFinal` / 10 upp till `fwFinal` | 3 | 0,9 s |
| `fwFinal` eller mer | 7 | 4,2 s |

Standardvärdet är 1000, alltså firande vid 100 mynt och stor final vid 1000.
Ett event där beloppet inte går att läsa — editorns testknapp, till exempel —
faller tillbaka på antalet precis som förr.

Antalet raketer representerar en show, inte en raket per gåva. Grundtiden är
fortfarande 2–10 sekunder. Varje raket har egen ankomsttid, explosion och flip.
Tidigare profiler tonar ut före finalen; sista profilen får längre visningstid.
Designerna skiljer sig genom raka raketvågor/guldregn, korsande banor/silverstjärnor,
solfjädrar/roséguld och spiralbanor/virvlande explosioner.

## Ett fyrverkeri i taget (gäller sedan 2026-10-18)

**Användarens beslut 2026-10-18**, efter sändningen 2026-10-17 där tre gåvor med ett
par sekunders mellanrum spelades som tre fyrverkerier bredvid varandra: *"ett
fyrverkeri i taget som standard, nästa startar efter cirka 3 s, och kön trycks ihop
när den blir lång."* Det ersätter det tidigare beslutet att tre avsändare spelar
samtidigt.

- **Standard är en fil.** Reglaget "Samtidiga fyrverkerier" (`fwLanes`, 1–5) har
  standard 1. Fältet skrivs bara när reglaget faktiskt flyttas, så en widget som
  aldrig rört det får den nya standarden utan migrering, och ett sparat val (t.ex. 3)
  respekteras: då spelar tre avsändare i var sin fil som förut.
- **Nästa startar vid toppen**, inte när hela visningstiden har gått. Toppen kommer
  från motorn som ritar: festivalmotorns sista explosion plus en sekund
  (`VyraFestival.toppen`). Kön lägger till 100 ms.

  | Nivå (festival) | Visningstid | Topp | Nästa startar efter |
  | --- | --- | --- | --- |
  | enkel | 7 s | 3,09 s | 3,19 s |
  | firande | 11 s | 7 s | 7,1 s |
  | final | 20 s | 16 s | 16,1 s |

  De äldre CSS-temana har ingen sol; där startar nästa raket så att den landar just
  när förra kortet tonar ut (visningstid − flygtid, 4,4 s med standardinställningar).
- **Högst en utfasning.** Det förra fyrverkeriet tonar ut bakom nästa i sin egen takt.
  Startar ett nytt medan två redan tonar ut kortas det äldsta av på 300 ms.
- **Kön trycks ihop när fler än fem väntar:** samma avsändares väntande gåvor slås
  ihop till en, med summerat värde (värdet styr nivån, så tio rosor kan bli ett
  firande i stället för tio tändningar); tempot för gåvan som startar höjs till
  1 + (väntande − 5) / 5, högst 2; och en gåva som väntat mer än 60 s spelas inte
  alls utan räknas (`VyraGiftFireworks.forsenade()`).
- **Tidslinje, uppmätt 2026-10-18** i Chromium i riktig tid (festival, enkel nivå,
  1 mynt per gåva), samma rigg före och efter:

  | | Före (tre filer) | Efter (en fil) |
  | --- | --- | --- |
  | 3 gåvor 1,5 s isär | startar 0 / 1,5 / 3,0 s, tre bredvid varandra | startar 0 / 3,20 / 6,39 s |
  | 30 gåvor, 30 avsändare | tre åt gången var 7,2 s; sista tre startar 64,8 s | 1 + 29 i tempo 2 → 1,8 → 1; sista startar 57,9 s, ingen kastad |
  | 30 gåvor, 3 avsändare | som ovan, 30 fyrverkerier | 6 fyrverkerier med summerat värde, sista 16,0 s |

  Raden med tre avsändare är mätt med provriggens klocka (`gift-fireworks-en-i-taget.test.js`
  räknar på samma sätt). Bildintervall i samma körning, headless: 20,1 ms i snitt före
  och 18,5 ms efter, p95 33,4 respektive 33,3 ms — en körning var, ingen garanti.

Heart Fireworks följer samma princip (`heart-fireworks-session.js`): ett i taget,
nästa vid toppen ur `fire()`-tidslinjen (en gåva 1,9 s, tolv hjärtan 3,7 s), samma
sammanslagning, tempo och 60 s-gräns. Heart Fireworks har inget reglage för fler.

Livelänken håller högst 200 väntande händelser. Fyrverkerier använder denna kö i
stället för den delade alertkön; andra alerts är oförändrade. Direkta Action-anrop
har också en begränsad väntelista i renderaren, och den väntar på samma topp.
Session-slut rensar lager, köer, timers och dubblettminne. Gamla köcallbacks är
generationsskyddade.

Animationerna använder CSS, ingen ny ticker eller allokering per bildruta.
Partikeltätheten begränsas till 12–40 per raket; vid sjuraketsshower högst 33.
När flera avsändare överlappar sänks alla aktiva raketer till 12 gnistor och
kostsamma ljusskuggor/ringar tas bort. Tre stora shower behåller sina 21 raketer
men använder högst 252 gnistor tillsammans.
Reducerad rörelse visar en stillastående bildväxling utan raketflykt, blixtar
eller partiklar. Bildadresser går genom `VyraSafe` och profilfel använder egen
reservhantering så att den globala gåvoreserven inte ersätter ett ansikte.

Verifiering: panel- och livekedjetester, kökapacitet/sessionrensning, samtidiga
avsändare, bildfel och URL-validering. Chrome testar alla fyra designer vid
2/5/10 sekunder, nivå 1/100, separata animationstidslinjer och reducerad rörelse.
Ingen riktig TikTok LIVE-sändning eller generell FPS-garanti ingår i dessa prov.

Lokal Chrome-mätning över 180 bildintervall: tre samtidiga stora shower gav
53,80 ms i genomsnitt före belastningsanpassning och 21,02 ms efter; p95 gick
från 100,1 till 33,3 ms. Enstaka längre bildintervall finns kvar. Detta är en
enskild lokal observation, inte en garanti för alla datorer eller OBS-miljöer.
