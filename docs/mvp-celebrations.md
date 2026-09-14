# MVP-firanden

Sex nya designer kompletterar de 17 befintliga MVP-varianterna. De skapas från
`catalog:battlemvp:celebration:{coronation,wings,portal,rosegold,pearl,moon}`.
Katalogen och stilväljaren använder samma metadata i `widget-factory.js`.

Varje design visar vinnaren med en riktig profilbild, MVP-rubrik och visningsnamn.
Inga namn eller porträtt är inbakade i ramen. Coins visas inte. Sparade val att
dölja rubrik eller namn respekteras. Befintliga battle-sessioner, deduplicering,
ljud och dolda lager följer samma väg som tidigare.

Alla sex har fyra faser inom vald visningstid (standard 10 sekunder):
uppladdning 0–18 %, entré 18–42 %, avslöjande 42–70 % och final 70–100 %.
Kröningen faller ned med guldregn; Vingar öppnas från mitten; Energiportalen
roterar med en radiell final; Roséguld blommar med drivande kronblad;
Pärlvingar lyfter med pärlor; Lavendelmåne sveper fram med stjärnfall.

Animationerna är ändliga CSS-animationer på `.mvp-active`, utan en ny
JavaScript-bildloop. `prefers-reduced-motion` ger en stilla presentation.
Editor och katalog visar den färdiga designen utan att starta en live-händelse.
