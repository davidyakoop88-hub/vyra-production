# Supernova

Supernova är ett nytt katalogval, `catalog:giftfireworks:supernova`. De fyra tidigare
fyrverkeridesignerna behåller sina inställningar och sin rörelse.

Widgeten använder samma typ och live-trigger som Gift Fireworks, med
`fwTheme: 'supernova'`. Standardbredden är 540 px. `fwNovaStyle` väljer mellan
Original (`classic`), Kaskad (`willow`) och Stjärnregn (`sparkle`). Huvudfärg och
accent följer `fwColor` respektive `fwColor2`. Fyra färgteman och egna färger finns
i panelen; Återställ original återställer stil och färger utan att flytta widgeten.

Rörelsen kommer från den godkända spelbara Supernova-förhandsvisningen. En gåva
ger en uppskjutning, tio ett rytmiskt firande och hundra en show med större final.
Visningstiderna är 6, 9 respektive 18 sekunder. Varje samtidiga gåvohändelse har
en egen renderer och tidslinje; den delade tickern driver dem tillsammans.
Gåva och profilbild visas på samma plats genom en flip. Overlayen är transparent
och visar inga användarnamn eller gåvonamn.

Panelen visar bara inställningar som den nya renderaren använder. De äldre
reglagen för grundtid, rakettid, intro/outro och partikeltäthet visas inte för
Supernova. Minsta myntvärde, anonymfilter, ljud, testantal, reservbild och position
följer den befintliga live-vägen.

`media.js` laddar VFX-typer, den delade tickern och Supernova-motorn före
fyrverkeriets ingång och dess panel. Katalogminiatyren är en stilla förhandsvisning
och skickar ingen live-händelse.

Vid minskad rörelse visas en stilla profilbild i stället för uppskjutningar och
explosioner. Vid hög samtidighet glesas partiklarna ut för att begränsa belastningen.
Bildladdning och ljuduppspelning är beroende av nätverk respektive webbläsarens
ljudpolicy; bilder har reservmotiv och nekad ljuduppspelning stoppar inte effekten.
