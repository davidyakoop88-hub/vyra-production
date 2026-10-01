# MVP-firanden

Sex nya designer kompletterar de 17 befintliga MVP-varianterna. De skapas från
`catalog:battlemvp:celebration:{coronation,wings,portal,rosegold,pearl,moon}`.
Katalogen och stilväljaren använder samma metadata i `widget-factory.js`.

Varje design visar vinnaren med en riktig profilbild, MVP-rubrik och visningsnamn.
Inga namn eller porträtt är inbakade i ramen. Coins visas inte. Sparade val att
dölja rubrik eller namn respekteras. Befintliga battle-sessioner, deduplicering,
ljud och dolda lager följer samma väg som tidigare.

## Rörelser: 6 WOW och 17 BASIC

De sex ursprungliga firandena är **WOW**: Kröningen, Vingar, Energiportalen,
Roséguld, Pärlvingar och Lavendelmåne. De behåller sina egna bildmotiv och
partikelprofiler. Uppladdning sker först, ramen samlas och vinnaren är fullt
synlig vid 15–18 % av tiden (1,5–1,8 sekunder vid standardvärdet 10 sekunder).
Partikeltoppen ligger vid avslöjandet, nya partiklar upphör vid 22 % och sista
resterna tonas bort före 32 %. Ramen ligger sedan lugn fram till den individuella
utgången vid 93–100 %. Namnet tonas bort något före ramen.

De tio klassiska stilarna och sju PNG-ramarna är **BASIC**. De får separata,
återhållsamma entréer utan en ny partikelmotor: kronan landar, bandet öppnas,
lagrarna vrids på plats, mörka vingar öppnas, draken stiger, rodret vrids och
skuggstjärnan samlas. Klassiska stilar har egna riktningar och perspektiv:
Inferno uppåt, Royal nedåt, Ice en kristallvridning, Cyber horisontell öppning,
Storm sidoförskjutning, Aurora mjuk båge och Samurai en diagonal rörelse.
Royal Purple landar mjukt, Neon Cyber fälls fram och Diamond Elite vinklas fram.
Äldre oändliga pulser och glitchar stängs av i dessa versioner.

Alla nya MVP-katalogval sparar **10 sekunder**. Befintliga sparade tider
respekteras; gamla widgets utan tid använder fortfarande sessionens 7-sekunders
fallback. Renderare och timer läser samma sparade värde. BASIC-hooken heter
`.mvp-motion[data-mvp-motion]` med `--mvm-duration`; WOW använder `.mvc-*`
och `--mvc-duration`. Guldkronans specialbyggda entré lämnas oförändrad.

Animationerna är ändliga och aktiveras med den befintliga `.mvp-active`.
`prefers-reduced-motion` ger en stilla presentation med kort uttoning.
Editor och katalog visar den färdiga designen utan att starta en live-händelse.
Ingen ny widgetfamilj eller LIVE-händelse har skapats.

## Guldkrona

`catalog:battlemvp:celebration:gold-ribbon` kompletterar de sex firandena med en
kompakt rasterram (280 px som standard). Den riktiga vinnarens profilbild ligger
bakom den transparenta öppningen, och namnet visas under guldbandet. MVP-texten
är fast i bilden; därför saknas rubrik- och coinsreglage för just denna design.

Standardtiden är 10 sekunder: varmt ljus/rök 0–0,4 s, ram 0,4–0,9 s,
profil och stilla visning 0,9–9,4 s, gemensam uttoning 9,4–10 s. Vid ändrad
visningstid skalas faserna proportionellt. Röken försvinner tidigt och
partikelmotorn är avstängd för denna design. Minskad rörelse visar ramen
stilla med en avslutande uttoning. Den befintliga battle-kedjan äger vinnardata,
kö, deduplicering, aktivering och borttagning av den aktiva klassen.

Entrén har förstärkt rök, en kort guldgloria och lätt inzoomning. Ljuset tonar bort inom 1,8 sekunder; profilens stilla visning och totala 10 sekunder behålls.


## Individuell textpresentation

Alla 23 ursprungliga designer har egna textsignaturer. WOW: Kröningen har tydlig
varmgul sans, Vingar luftig lavendel med små kantornament, Energiportalen cyan
monospace med konsolkanter, Roséguld varm serif, Pärlvingar en diskret pärlkant
och Lavendelmåne en liten månskära. Inga pseudo-element duplicerar MVP-texten.
BASIC behåller kompakta befintliga ytor; varje variant får egen kombination av
typsnitt, vikt, färg, avstånd och sparsam linjedekor. Den äldre dubbla MVP-brickan
på emblemet döljs så endast etiketten som styrs av synlighetsreglaget återstår.
Nya PNG-ramar använder 18 px etikett och 14 px namn för att passa de minsta
skyltarna. Användarens sparade textstorlekar fortsätter gälla; inga viktiga
CSS-regler tvingar över dessa inställningar. Rörelser och tiosekunderstider
från föregående uppdatering ändras inte.


## Gold Crown borttagen från nya val

`catalog:battlemvp:frame:gold-crown` visas inte längre i katalogen eller
ramväljaren, enligt designgranskningen där kronans överdel bedömdes ofullständig.
Aktuellt urval är därför **6 WOW + 16 BASIC** (10 stilar + 6 PNG-ramar).
Guldkrona och Lion Clash är fortsatt separata nya förslag. Gold Crown-bilden,
fabriksnyckeln och renderaren finns kvar för bakåtkompatibilitet med sparade
layouter; inga användarwidgetar tas bort eller byter utseende automatiskt.
Tidigare antal ovan beskriver den ursprungliga genomgången före detta urval.


### Ytterligare borttagna val

Royal Purple (`royal-purple`), Ice (`ice`), Diamond Elite (`diamond-elite`) och
Neon Cyber (`neon-cyber`) har också tagits bort från katalog och stilväljare.
Efter dessa uttryckliga urval återstår **6 WOW + 12 BASIC**: sex klassiska
stilar och sex PNG-ramar. Fabriksnycklar och renderare för de fyra stilarna
finns kvar enbart för kompatibilitet med befintliga sparade layouter.


## Sista signaturdetaljen på de sex WOW-designerna

Små tomma CSS-lager följer detaljer i de befintliga bilderna; inga nya bilder,
namn eller profilkopior tillkommer. Porträttet förblir första bilden i DOM för
LIVE-uppdateringen. Varje detalj är ändlig och avstängd vid minskad rörelse.

| Design | Detalj vid 10 sekunders visning |
|---|---|
| Kröningen | Stenen vid 50 %, 8 % glimtar vid 1,35 s. |
| Vingar | Ljuset går från båda vingspetsarna in mot ringen, 0,7–1,7 s. |
| Energiportalen | Cyan och korall möts över profilöppningen vid 1,35 s. |
| Roséguld | Ett ljus följer övre rosen och ytterkanten, sedan berörs MVP-linjen vid 1,8 s. |
| Pärlvingar | Fyra pärlor reflekterar i ordning vid 1,0 / 1,2 / 1,4 / 1,6 s. |
| Lavendelmåne | Stjärnan vid 18 %, 68 % markerar avslöjandet vid 1,4 s. Vid utgången försvinner ramen senast 9,7 s; stjärnan lyser kvar till den sista uttoningen. |

Samtliga signaturdetaljer är osynliga vid 5 s, så vinnaren får en lugn hållfas.
BASIC får inga nya dekorationslager; profilen landar något före namnet
(1,4 respektive 1,9 s) med en liten, mjuk förflyttning. Guldkrona och Lion Clash
lämnas oförändrade. Tider skalas proportionellt med sparad visningstid.
