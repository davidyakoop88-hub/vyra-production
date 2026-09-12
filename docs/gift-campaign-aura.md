# Gift Campaign – godkänd aura

Den spelbara `campaign-rose-show-preview.html` godkändes av David den 12 september 2026. Gift Campaign erbjuder nu Guldslöja, Platinum Light och Emerald Mist, var och en liggande och stående. De åtta tidigare temana tas bort från katalogen och temaväljaren. Sparade widgetar behåller sina gåvor, mål, räknare, storlekar och placeringar; äldre teman får en kompatibel aura vid rendering.

Entrén sker en gång från vald sida och kampanjen stannar synlig. Gåvorna har valbart mjukt lyft, lätt lutning, ljusvåg eller stilla läge. Ljusvandringen återkommer efter 25 sekunder och lämnar företräde åt inkommande gåvor. En gåva får perspektivrörelse, en ljusbana och gnistor. Täta gåvor köas per gåvoplats utan att avbryta pågående reaktion; räknaren uppdateras oberoende av kön. Ljud är avstängt som standard och har eget volymreglage.

`gift-event-images.js` är fortsatt enda skrivare av kampanjens liveantal. `gift-campaign-aura-session.js` kopplar synliga widgetar till `gift-campaign-aura-engine.js`; motorn använder VFX:s gemensamma ticker och kvalitetsnivåer. Dolda, borttagna och avslutade widgetar frigör sina prenumerationer. Katalogkort målas frysta utan ticker eller ljud. Reduced motion visar en stilla aura med uppdaterade räknare.

Verifiering: 168 exakta canvas- och gåvotransformjämförelser mot den godkända förhandsvisningen över tre teman, två orienteringar och sju tidpunkter. Riktade tester täcker köer, räknare, sparade värden, livscykel, inställningar och katalogval. Simulerade normaliserade livehändelser verifierar klientkopplingen; en riktig TikTok LIVE-sändning har inte genomförts som del av denna ändring.
