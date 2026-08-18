# Guardian Emblem — referensdesignen

Tre referensbilder skickades 2026-08-18. **Bilderna själva finns inte i repot** — de kom som
bilagor i chatten, och en bilaga överlever inte att samtalet sammanfattas. Den här filen är det som
gör att designbeslutet gör det. Läs den innan du rör `guardian-emblem.css`.

Första bygget gjordes efter att bilderna försvunnit i en sammanfattning, ur enbart spec-texten. Det
gav en **sköld med en hjort i**. Referensen är en **rund avatarram med en hjort över**. Delarna
stämde, kompositionen var en annan widget. Det är därför den här filen finns.

## Kompositionen, uppifrån och ner

1. **Praktstegsbrickan.** En stående guldinramad romb med mörkgrön botten och praktstegets SIFFRA i
   guld. Sitter fritt ovanför allt annat, med luft omkring sig.
2. **Hjorten.** Vit-beige hjorthuvud rakt framifrån med guldhalsband. Geviret är **guld**, enormt,
   och bågar ut åt båda sidor — det är emblemets bredaste form och får sticka ut utanför ramen.
   Hjorten sitter BAKOM och ÖVER avatarramen, som en krona av horn.
3. **Kronspetsen.** En liten guldromb med grön smaragd sitter i skarven mellan hjortens hals och
   ramens överkant, med två små vingspetsar ut åt sidorna.
4. **Avatarramen.** En tjock GULDRING, cirkulär. Innanför den en mörkgrön ring (steg 2 och uppåt),
   och innanför den svart botten med användarens bild. Ramen är emblemets mitt och dess största
   sammanhängande yta.
5. **Plymerna.** Guldblad som spretar uppåt och utåt från ramens sidor — formade som flammor, inte
   som lagerkvistar. Mellan guldbladen sitter MÖRKGRÖNA blad. De är stora: tillsammans ungefär lika
   breda som ramen är.
6. **Sidosköldarna.** Två små mörkgröna sköldar med guldkant och ett GULDHJORTHUVUD i, en till
   vänster och en till höger, i höjd med ramens nederkant. Under varje sköld en liten grön romb.
7. **Voluterna.** Guldslingor som rullar ut åt båda sidor längst ner och slutar i spiraler.
8. **Bottendiamanten.** En stor grön smaragd i en fyruddig guldinfattning, mitt under ramen.
9. **Kristallerna.** Fyra spetsiga gröna kristaller i guldfattning som sticker upp bakom plymerna —
   två inre, två yttre och högre.
10. **GUARDIAN-banderollen.** Ett brett mörkgrönt band med guldram och guldtexten i versaler, som
    sveper över emblemets nedre tredjedel och delvis täcker ramen. Sidosköldarna sitter bakom
    bandets ändar.

## Vad varje praktsteg visar

| Steg | Referens | Mått | Vad som tillkommer |
|---|---|---|---|
| 1 | bild 2, vänster | 400×330 | ram, avatar, plymer, voluter, bottendiamant, bricka med "1" |
| 2 | bild 2, höger | 400×360 | grön innerring, liten hjortsköld ovanpå ramen |
| 3 | bild 1 | 400×495 | hjorten med geviret, kronspetsen, två sidosköldar |
| 4 | bild 3 | 400×585 | fyra kristaller, GUARDIAN-banderollen |

## Paletten

| | |
|---|---|
| Guld, ljust | `#f4d47c` |
| Guld | `#d4af37` |
| Guld, djupt | `#8a6d1f` |
| Smaragd | `#2ecc71` |
| Mörkgrönt fält | `#0d3b2a` |
| Skogsgrönt, djupt | `#0a1f1a` |
| Hjortens päls | `#e8e0d0` |

## Regler som följer av bilderna

- **Ramen är rund, aldrig en sköld.** Sköldformen finns bara i de två små sidoemblemen.
- **Geviret får sticka ut utanför lådan i höjd, men aldrig i bredd** — 400 px är formatet.
- **Hjorten tillkommer i steg 3.** Steg 1 och 2 har ingen hjort alls, bara ramen och guldet.
- **Grönt är alltid botten, guld är alltid kontur.** Aldrig tvärtom.

## Mätta fallgropar i bygget

Tre saker gick fel och syntes bara på foto — inget prov i vaktnätet kunde se någon av dem.

1. **Hjorten blev en mus.** Rund skalle, stora runda öron, ingen mule. Skillnaden mot en hjort är
   **avsmalningen**: ett långt ansikte som går från hög panna ner till en mörk nos. Tappar man den
   blir det ett gnagare oavsett hur stort geviret är.
2. **Kronspetsen låg över mulen.** Hjortens negativa undermarginal drog ner huvudet så att den gröna
   romben hamnade mitt i ansiktet. Marginalen är en **mätning**, inte en smak: ramens överkant ska
   ligga strax under nosen, där halsen börjar.
3. **Bottendiamanten kunde inte nå över banderollen.** Den låg inuti ramen, och ramen har eget
   `z-index`. En absolut placerad del inuti en förälder med `z-index` kan **aldrig** nå över en
   granne till föräldern, hur högt dess eget `z-index` än är. Diamanten ligger nu i flödet, i samma
   stackningskontext som bandet.
