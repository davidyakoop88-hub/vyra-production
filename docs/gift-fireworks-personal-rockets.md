# Personliga raketer

GIFT FIREWORKS har fyra designer via `fwTheme`: `royal` (lila och guld),
`ice` (isblått och silver), `rose` (roséguld) och `comet` (Kometspiral).
Äldre sparade `fwMotion`-värden fungerar fortfarande. Temaknapparna sparar
färgparet och rörelsen; färgerna kan därefter justeras separat.

Varje raket bär eventets gåvobild och vänder till samma events profilbild
vid sin explosion. Båda ansiktena delar position och storlek. Saknad eller
trasig profil visar en personsiluett utan text. Gamla sparade textfält lämnas
orörda men renderas inte längre. Ingen livedata sparas i layouten.

Nivåerna styrs av gåvans VÄRDE, och trappan räknas ur widgetens minsta
gåvovärde (`fwMin`). Fram till 2026-09-19 styrdes de av gåvoantalet, vilket i
sändningen 2026-09-18 gav alla elva stora tändningar till 1-mynts-gåvor medan
23 gåvor värda 26 536 mynt — en av dem på 5000 — körde den minsta nivån.

| Totalvärde | Visade raketer | Extra uppbyggnad |
| --- | --- | --- |
| under 10 × minimum | 1 | 0 s |
| 10–99 × minimum | 3 | 0,9 s |
| 100 × minimum eller mer | 7 | 4,2 s |

Med minsta gåvovärde 1 går trappan alltså 10 och 100 mynt; med 10 går den 100
och 1000. Ett event där beloppet inte går att läsa — editorns testknapp, till
exempel — faller tillbaka på antalet precis som förr.

Antalet raketer representerar en show, inte en raket per gåva. Grundtiden är
fortfarande 2–10 sekunder. Varje raket har egen ankomsttid, explosion och flip.
Tidigare profiler tonar ut före finalen; sista profilen får längre visningstid.
Designerna skiljer sig genom raka raketvågor/guldregn, korsande banor/silverstjärnor,
solfjädrar/roséguld och spiralbanor/virvlande explosioner.

Tre avsändare kan spela samtidigt i separata lager. Livelänken håller högst
200 väntande händelser och skickar dem när en plats blir ledig. Fyrverkerier
använder denna kö i stället för den delade alertkön; andra alerts är oförändrade.
Direkta Action-anrop har också en begränsad väntelista i renderaren. Session-slut
rensar lager, köer, timers och dubblettminne. Gamla köcallbacks är generationsskyddade.

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
