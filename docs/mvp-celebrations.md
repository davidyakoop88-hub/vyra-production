# MVP-firanden

Sex designer kompletterar de 17 befintliga MVP-varianterna. Katalognycklar:
`catalog:battlemvp:celebration:{coronation,wings,portal,rosegold,pearl,moon}`.
Katalogen och stilväljaren använder metadata i `widget-factory.js`.

## Rörelse efter Davids referenser, 2026-09-13

Referenserna visar Celestial Fireworks, Crystal Bloom och Royal Comet samt en
MVP-sekvens med ljus 0–1 s, entré 1–3 s, hyllning 3–8 s och avslut 8–9 s.
De används som rörelsereferenser för de befintliga MVP-ramarna. Gåvonamn, antal
och poäng från referensbilderna läggs inte till i MVP-widgeten.

| Modell | Ljus och entré | Hyllning | Avslut |
| --- | --- | --- | --- |
| Kröningen | Guldkomet och fallande krona; profilen lyfts på plats | Stjärnglitter kring ramen | Kronan lyfter och löses upp i guldstoft |
| Vingar | Violett ljus, kristaller och två vingar som vecklas ut; profilen avtäcks från mitten | Stabil profil med små yttre ljuspunkter | Vingarna delar sig och kristaller sprids uppåt/utåt |
| Energiportalen | Kontinuerlig elliptisk energibana, motroterande ramhalvor och cirkulärt profilavslöjande | Lugn, färdig portal | Ramen och gnistorna sugs in till centrum |
| Roséguld | Rosenblad stiger från stjälkarna; asymmetrisk blomning | Lugn blomram | Blad faller, ramen drar sig nedåt |
| Pärlvingar | Pärlor stiger, vingarna lyfts och profilen svävar upp på plats | Stillastående porträtt | Pärlor och ram lyfter bort |
| Lavendelmåne | Diagonalt stjärnljus, svepande månbåge, profil och namn avtäcks från sidan | Yttre stjärnglitter | Månen lämnar diagonala stjärnspår |

Alla delar följer vald `mvpDuration` (2–15 s, befintlig standard 10 s).
Rörelserna är huvudsakligen fördelade som 1/9, 2/9, 5/9 och 1/9 av totalen;
modellerna har egna överlappningar och tidpunkter inom faserna. Namnet är fullt
framme senast 40 procent och hålls läsbart fram till avslutet.

Profilen är en riktig cirkel, centrerad i respektive rams uppmätta fotoyta.
Inga namn eller porträtt är inbakade i ramen. MVP-rubrik och visningsnamn visas;
coins visas inte. Sparade val att dölja rubrik/namn respekteras. Battle-sessioner,
deduplicering, ljud och dolda lager använder befintlig väg.

## Drift och förhandsvisning

Ändliga CSS-animationer startas av `.mvp-active`. Inget nytt RAF-varv eller
JS-partikelsystem. Högst 76 partikelelement per aktiv widget (24 entré, 16
hyllning, 36 avslut); låg kvalitet visar högst 12 per fält. En delad, transparent
WebP-atlas på cirka 51 KB innehåller riktiga rastermotiv. Tomma katalogkort
startar inga animationer och visar inga dekorationsfält. Reduced motion ger en
stilla presentation. Sista bildrutan är helt osynlig.

Katalogens Förhandsvisa startar nu den valda MVP-modellens kompletta sekvens,
med Spela igen. Den väntar på rambilderna och kör endast på utkastets egen DOM.
Den anropar aldrig `triggerBattleMvp`, ändrar inte vinnaren eller sparade widgets,
och skickar ingen händelse till en riktig overlay. Ett borttaget utkast startas
inte om dess bilder blir klara senare. OBS-läge avvisas av preview-funktionen.

## Kontroller

`tests/battle-mvp-celebrations.test.js` kontrollerar renderaren, rätt vinnardata,
dold widget, säkra bilder samt att preview inte ändrar layout/live-state.
`tests/browser/mvp-celebrations-motion.browser.test.js` mäter verkliga
animationer, sex skilda entréer/avslut, rund profil i 280/400/560 px, läsbart namn,
släckt slutbild, reduced motion och katalogens riktiga preview/replay-flöde.
