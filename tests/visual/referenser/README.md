# Visuella referensbilder

En bild per katalognyckel, fotograferad i overlay-läge med transparent bakgrund — precis som OBS
ser widgeten. `tests/visual/visuell-regression.browser.test.js` fotograferar om varje nyckel och
jämför **pixel för pixel** mot bilden här. Ingen procenttolerans.

`manifest.json` säger vilka bilder som finns, deras mått och hur stor andel av ytan som är målad,
samt vilken webbläsarbuild de togs på. `historik.md` säger *varför* de senast byttes.

## Tröskeln: 1 av 255 per kanal, och ingen budget

Två färger som skiljer en 255-del räknas som samma färg. Det är **inte** en procenttolerans, och
skillnaden är hela poängen:

| | Säger | Följd |
|---|---|---|
| Procenttolerans | "upp till N % av bilden får skilja sig" | en budget som ett riktigt fel kan gömma sig i — en avklippt etikett på 200 pixlar passerar om budgeten är 300 |
| Tröskel per kanal | "1/255 är samma färg" | ingen budget alls: **en enda** pixel som skiljer 2 fäller provet |

Skälet är uppmätt. CI skrev 167 referenser och körde sedan vakten mot dem på samma maskin och samma
binär. 166 reproducerade exakt — noll pixlar. En gjorde inte det:

```
catalog:topstreak:frame:rose-heart: 26 av 100800 pixlar, inom 1×40 px vid (127,248),
största kanalskillnad 1 av 255
```

Ett hårstreck, en pixel brett, där ett värde avrundas åt olika håll mellan två körningar. Samma
nyckel reproducerar perfekt lokalt på en annan Chromium-build över två helt skilda webbläsarstarter.
En avrundning i sista biten syns inte på någon skärm.

Tröskeln döljer inte en flyttad kant, en ändrad färg, text ovanpå text eller en avklippt platta —
allt sådant ändrar kanaler med tiotal eller hundratal. Och den vaktas av ett eget prov: ett par
bilder som skiljer 1 på varje kanal ska räknas som identiska, ett par som skiljer 2 på **en enda**
pixel ska fälla. Höjs tröskeln till 2 blir det provet rött.

## Varför inga procent

Uppmätt 2026-08-19: samma widget fotograferad två gånger i samma session gav 0 olika pixlar av
224 000, och 0 igen efter en helt ny webbläsarstart. Determinismen finns. En procenttolerans hade
inte köpt stabilitet vi saknade — den hade bara dolt exakt de små förskjutningar vakten finns för
att hitta: en avklippt kant, en etikett som spiller ut ur sin platta, två rader text som lagt sig
över varandra.

Priset är att bilderna bara är giltiga på **samma Chromium-build**. Två builds rastrerar typsnitt
olika. `manifest.json` bär därför binärens versionssträng, och vakten vägrar jämföra någon
annanstans — den säger rakt ut att webbläsaren bytts i stället för att skylla alla nycklar på
widgetarna. CI installerar den build `package-lock.json` pinnar
(`npx playwright install --with-deps chromium`), och det är där referenserna hör hemma.

## Så uppdaterar du en referens

Vakten skapar aldrig en bild åt sig själv. Enda vägen är ett explicit kommando med **motivering**:

```bash
VYRA_VISUELL_MOTIV="guldkanten på Battle MVP gick från 2 till 3 px" npm run test:visual:update

# bara en familj, medan du arbetar:
VYRA_VISUELL_BARA=battlemvp VYRA_VISUELL_MOTIV="…" npm run test:visual:update
```

Motiveringen är obligatorisk och minst 12 tecken. Den skrivs till `historik.md`, så varje ändrad
pixel har ett skäl någon fick skriva ner.

**Motiveringen är inte byråkrati.** En referens som går att uppdatera utan eftertanke slutar vara en
vakt: nästa gång provet faller är den snabbaste vägen till grönt att skriva om bilden, och då har vi
bytt bort ett larm mot en tystnad. Kravet på ett skäl gör den vägen lika dyr som att titta på
diffbilden.

## När vakten faller

Felmeddelandet namnger nyckeln, hur många pixlar som skiljer och var diffbilden hamnade
(`tests/visual/diff/`, ignorerad av git). Diffbilden visar den nya bilden nedtonad med de avvikande
pixlarna i rött — titta på den **innan** du bestämmer om ändringen var avsedd.

Tre utfall behandlas var för sig, för de betyder olika saker:

| Utfall | Betyder |
|---|---|
| `saknar referensbild` | nyckeln är ny — kör uppdateringen en gång |
| `måtten ändrades` | widgeten har bytt storlek, inte bara utseende |
| `N pixlar skiljer` | utseendet har ändrats — se diffbilden |
| `kunde inte fotograferas` | felet sitter i widgeten eller i riggen, inte i bilden |

## Widgetar med egen regi

De flesta widgetar fryses utifrån: riggen pausar deras CSS-animationer på en fast tidpunkt. En
widget vars förlopp i stället drivs av **klasser** som en JS-klocka byter över tid går inte att
frysa så — spolar man animationerna till en tidpunkt medan klasserna står på en annan blir
kombinationen omöjlig och bilden tom (uppmätt på Guardian Emblem: 0 % målat vid samtliga nio
tidpunkter, mot 66–82 % levande).

Sådana familjer får en egen regi i `REGI` (`tests/helpers/katalognycklar.js`), som använder
familjens egen utbytbara klocka: den stoppar klockan, ställer lådan i den fas som ska fotograferas
och fryser animationerna en fast tid in i just den fasen. Bilden bestäms då av kod, inte av tajming.
Guardian Emblem fotograferas i `hyllning` vid 900 ms — 20 fotograferingar av 20 lyckades.

## Vad som INTE har någon referens

Fem poster i `UTAN_REFERENS` (`tests/helpers/katalognycklar.js`) undantar tillsammans 14 av 181
nycklar. Varje post bär sitt uppmätta skäl:

| Post | Nycklar | Skäl i korthet |
|---|---|---|
| `catalog:custom:image` / `:video` | 2 | tomma behållare som väntar på användarens egen fil — 0,4 % respektive 0,2 % målat |
| `catalog:giftfireworks:` | 3 | partiklar på en Pixi-duk med egen ticker; duken är tom vid varje fast tidpunkt |
| `catalog:glovesnipe:` | 8 | effekten är H.264-video, och provets Chromium saknar den kodeken (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`) — i OBS spelar de |
| `catalog:likefountain` | 1 | ständig rörelse: 22 olika bildrutor på 12 s, ingen kom igen |

Ett undantag är alltid ett hål i täckningen, och listan har ett tak i provet så att den ska göra ont
att växa. En tom referens matchar allt — både vakten och uppdateringsskriptet vägrar därför skriva
eller jämföra en bild som målar under 3 % av sin yta. Listan vaktas dessutom av ett eget prov: varje
post måste ha ett begripligt skäl, den måste träffa en riktig katalognyckel, och summan av
träffarna måste vara exakt de nycklar som faktiskt hoppas över.

## Filerna är binära i git

`.gitattributes` märker `*.png` här som `binary -diff`: ingen radslutskonvertering (en CRLF-
konvertering på en Windows-maskin hade ändrat varenda byte) och ingen textdiff i granskningen.
`manifest.json` är däremot avsiktligt läsbar — det är den som avslöjar en webbläsarväxling.
