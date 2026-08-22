'use strict';
// PROV-ROOMID.js — SKRIVSKYDDAD SOND. Ett enda syfte: gar det att hamta ett roomId har?
//
// Davids test mot @jokero060 misslyckades under en visuellt bekraftad LIVE med
//   Failed to retrieve Room ID from all sources.   (TikTokLiveConnection.fetchRoomId)
// Det ar inte ett anslutnings- eller autentiseringsfel - biblioteket hittar aldrig rummet.
//
// VILLKOREN, uppfyllda av KONSTRUKTION och inte av disciplin:
//   · anvander INTE bridge.js  -> ingen prenumeration pa event, ingen POST till moln eller
//     till http://127.0.0.1:4173. Den har filen har noll utgaende anrop utover bibliotekets egna.
//   · prenumererar pa INGA event -> ingen chatt, inga gavor, inga tittarnamn kan na loggen
//   · kopplar ned direkt efter att roomId lasts
//   · skickar inga interaktioner och ror inget konto
//
// Startraden skrivs FORE anslutningen, sa en tom logg aldrig kan misstolkas igen.
const path = require('path');
const Inspelare = require('./inspelare.js');

const anvandare = String(process.argv[2] || '').replace(/^@/, '').trim();
if (!anvandare) { console.error('Anvandning: node PROV-ROOMID.js <tiktok-anvandarnamn>'); process.exit(2) }

// VILLKOR 6: kontrollera pa-knappen, gissa inte.
const PA = process.env.VYRA_INSPELNING === '1';
console.log('VYRA_INSPELNING = ' + JSON.stringify(process.env.VYRA_INSPELNING || '(osatt)')
  + '  -> inspelning ' + (PA ? 'PA' : 'AV'));
if (!PA) { console.error('AVBRYTER: satt VYRA_INSPELNING=1 forst, annars skriver sonden ingenting.'); process.exit(3) }

const inspelare = Inspelare.skapa({
  pa: true,
  katalog: process.env.VYRA_INSPELNING_KATALOG || path.join(__dirname, 'inspelningar'),
  anvandare,
  maxByte: 5 * 1024 * 1024,
  typer: 'alla',
});

// VILLKOR 7: startraden FORE anslutningen.
inspelare.livscykel('sond-start', {
  anvandare, node: process.version, bibliotek: (() => {
    try { return require('tiktok-live-connector/package.json').version } catch { return 'okand' }
  })(),
});
console.log('Startrad skriven. Node ' + process.version + '. Provar @' + anvandare + ' ...');

(async () => {
  const { TikTokLiveConnection } = require('tiktok-live-connector');
  const connection = new TikTokLiveConnection(anvandare, {});   // {} som bryggan; inga event-lyssnare, med flit
  let kod = 0;
  try {
    const state = await connection.connect();
    const roomId = state && state.roomId;
    inspelare.livscykel('sond-roomid', { anvandare, roomId: String(roomId || ''), lyckades: true });
    console.log('LYCKADES  roomId = ' + roomId);
  } catch (err) {
    const rad = {
      anvandare, lyckades: false,
      fel: String((err && err.message) || err).slice(0, 300),
      feltyp: (err && err.constructor && err.constructor.name) || 'okand',
      stack: String((err && err.stack) || '').split('\n').slice(1, 4).map(s => s.trim()).join(' | ').slice(0, 400),
    };
    inspelare.livscykel('sond-fel', rad);
    console.log('MISSLYCKADES  ' + rad.fel);
    console.log('  feltyp: ' + rad.feltyp);
    console.log('  stack : ' + rad.stack);
    kod = 1;
  } finally {
    // VILLKOR 4: kort forsok, sedan ned.
    try { await connection.disconnect() } catch (_) {}
    inspelare.livscykel('sond-slut', { anvandare });
    setTimeout(() => process.exit(kod), 300);
  }
})();
