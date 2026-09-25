# Naturliga Gift Fireworks

Den godkända spelbara rörelsestudien `work/fireworks-natural.js` i Davids arbetsyta
är källan till `gift-natural-engine.js`. Den nya renderaren används av de fem
uttryckliga temana royal, ice, rose, comet och supernova. Äldre widgets utan ett
sådant `fwTheme` behåller DOM-renderaren. Ingen sparad placering migreras.

## Beteende

- En gåva ger en form per uppspelning: rosa hjärta, guldgul smiley och blå stjärna
  växlar per widget. Serien börjar om när livesessionen avslutas.
- Tio gåvor ger en följd av uppskjutningar och en final med flera explosioner.
- Hundra gåvor bygger en längre show. Rose avslutar med ett hjärta av 36 separata
  små explosioner och en central gåva/profilbild.
- Visningstiderna är 7, 11 respektive 20 sekunder. Gåvan flippar till avsändarens
  profilbild på samma position. Widgeten visar inga namn.
- Varje händelse får eget slumpfrö och förberäknade partiklar. Ett explicit frö
  och variantnummer reproducerar samma rörelse för verifiering.
- Supernova Original blandar fyra rörelsetyper. Kaskad använder Royal-rörelsen;
  Stjärnregn använder Ice-rörelsen.

Renderaren äger ingen klocka. Värden använder den befintliga delade VFX-tickern,
avregistrerar färdiga eller dolda effekter och begränsar partikelmängden vid
samtidiga händelser. Canvasen rensas och har transparent bakgrund. Formatet är
960:800; även värdens CSS-storlek behöver behålla detta förhållande.

## Färger och bilder

Sparade färgpar som motsvarar tidigare standardvärden tolkas som originaltemat,
så att den godkända nya designens färger visas. Avvikande sparade färger och
ärvda varumärkesfärger aktiverar en uttrycklig egen palett. Denna tolkning kan
inte skilja ett manuellt valt färgpar från ett identiskt gammalt standardpar.

De tre formerna för en gåva behåller sina särskilda rosa, guldgula och blå färger
även när en egen palett används för större firanden. Huvudfärg och accent ändrar
de större effekternas färger utan att ändra rörelsen.

Gåvo- och profilbilder tillhör respektive händelse. Ogiltiga adresser använder
säkra reservbilder. Om en bild inte kan laddas prövas den medföljande reservbilden
en gång; om även den misslyckas ritas en enkel silhuett. Bildfel stoppar inte
fyrverkeriets tidslinje.

Detta dokument beskriver implementationen och är inte i sig ett besked om att
ändringen är mergad eller driftsatt. Verifiera publiceringen separat.
