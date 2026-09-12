# De fyra fyrverkeridesignerna

De uttryckliga temana `royal`, `ice`, `rose` och `comet` använder nu den godkända
spelbara förhandsvisningens rörelse i `gift-classics-engine.js`. Varje tema har
egen koreografi. Supernovas separata renderer och tre stilar är kvar.

En, tio och hundra gåvor ger 6, 9 respektive 18 sekunders firande. Renderaren
använder en transparent canvas och samma gåva/profil-flip som förhandsvisningen.
Händelser får egna tidslinjer på den delade VFX-tickern.

Nya katalogval skapas med bredd 540 px och förhandsvisningens färger:

| Tema | Huvudfärg | Accent |
|---|---|---|
| Lila & guld | `#ffd06b` | `#a764ff` |
| Isblå & silver | `#dcecff` | `#49cfff` |
| Roséguld | `#edb98b` | `#ff7cc8` |
| Kometspiral | `#45e1d1` | `#ff806c` |

Befintliga widgets flyttas inte och behåller bredd och egna färger. Panelen för
uttryckliga teman visar designval, färgteman, egna färger och återställning av
det valda temat. Oanvända reglage för den äldre partikelmotorn visas inte där.
Reservbilder ligger i en stängd BILDER-grupp.

Äldre widgets utan `fwTheme` använder fortfarande den tidigare DOM-renderaren,
sina gamla tider och sin gamla panel. Ingen sparad layout migreras.
