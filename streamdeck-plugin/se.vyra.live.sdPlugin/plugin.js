'use strict';
// VYRA Live — Stream Deck-plugin. Ett tryck kör en Action, ett ljud, en uppläsning, musik, en
// OBS-scen, en timer eller en widget i VYRA (0.2.0; 0.1 hade bara Manuell knapp).
//
// KEDJAN, och varje led är mätt 2026-09-15 innan den här filen skrevs:
//
//   knapp → POST http://127.0.0.1:4173/api/events {"type":"knapp","eventKey":"<nyckel>"}
//         → cleanEvent i electron-app/local-server.js (typen överlever, eventKey överlever)
//         → klienten pollar GET /api/events
//         → liveEventTriggers() i live-client.js ger triggern 'knapp' med value = eventKey
//         → ditt Event i Action & Event kör sin Action i sin scen
//
// FYRA SAKER SOM ÄR MÄTTA, INTE ANTAGNA:
//
//   1. INGEN `ws`-DEPENDENCY. Node 20+ har WebSocket som global (undici). Pluginet har därför
//      noll beroenden och behöver inget `npm install` för att köra.
//
//   2. INGET ORIGIN-HUVUD. local-server.js:114 släpper bara igenom POST utan Origin, eller med
//      exakt http://127.0.0.1:4173 / http://localhost:4173. Node:s fetch sätter inget Origin —
//      uppmätt: 200. En HTML-baserad plugin hade fått 403 "Origin nekad", och det är därför den
//      här filen kör i Node och inte i en webview.
//
//   3. INGET `username` SKICKAS. `first` i liveEventTriggers är sant för ett namn som inte setts
//      förut, och då fyras firstActivity OCKSÅ. En Action bunden dit hade kört vid varje tryck.
//
//   4. PORTEN ÄR FAST. electron-app/main.js:10 sätter `const PORT = 4173`. Ingen upptäckt behövs.
//
// ACTIONS SPELAS BARA I OBS-UTGÅNGEN. allowed() i action-runtime.js kräver
// window.VYRA_OVERLAY_SCENE, som är odefinierad i Studion. Ett tryck gör därför ingenting synligt
// i Studiofönstret — det är avsiktligt och provat. Har du ingen OBS-källa öppen ser pluginet
// trasigt ut fast det fungerar, så knappen visar ✓/✗ på serverns svar för att skilja dem åt.

const VYRA = 'http://127.0.0.1:4173';
// MOLNVÄGEN. Kör inte VYRA Desktop — streamern sitter på en annan dator, eller vill slippa appen —
// postar pluginet i stället hit, med en ENHETSTOKEN som byts fram mot en parkopplingskod (server/
// streamdeck.js). Origin: ingen — Node:s fetch skickar inget, och /api/streamdeck/* kräver ingen.
const MOLN = 'https://vyralive.app';
// Knapp (UUID i manifest.json) → kommando som streamdeck.js i VYRA utför. 'se.vyra.live.knapp' står
// inte här med flit: den är 0.1-knappen och skickar sin nyckel som förut, så gamla knappar fungerar.
const KOMMANDO = {
  'se.vyra.live.action': 'action', 'se.vyra.live.ljud': 'ljud', 'se.vyra.live.tts': 'tts',
  'se.vyra.live.spotify': 'spotify', 'se.vyra.live.latonsk': 'latonsk', 'se.vyra.live.scen': 'scen',
  'se.vyra.live.timer': 'timer', 'se.vyra.live.widget': 'widget'
};
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^-+/, ''), process.argv[i + 1]);

const port = args.get('port');
const uuid = args.get('pluginUUID');
const registerEvent = args.get('registerEvent');
if (!port || !uuid || !registerEvent) {
  console.error('[vyra] startades utan Stream Decks argument — kör inte den här filen direkt');
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const send = o => { try { ws.send(JSON.stringify(o)) } catch (_) {} };
const visa = (context, tecken) => send({ event: 'showOk', context });
const fel = context => send({ event: 'showAlert', context });

// Parkopplingens enhetstoken bor i GLOBALA inställningar (delas av alla knappar), inte per knapp —
// streamern parkopplar en gång och alla knappar når molnet. Stream Deck skickar den vid start.
let moln = {};

ws.addEventListener('open', () => {
  send({ event: registerEvent, uuid });
  send({ event: 'getGlobalSettings', context: uuid });
});

// Ett knapptryck levereras FÖRST till VYRA Desktop, och bara om det misslyckas till molnet — så en
// streamer med appen igång aldrig får en runda över internet i onödan. Den gamla 'knapp'-knappen
// (0.1) har ingen molnväg: den saknar sdKommando och molnrutten skulle avvisa den med 400.
async function leverera(kropp, context) {
  try {
    const r = await fetch(`${VYRA}/api/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(kropp), signal: AbortSignal.timeout(3000)
    });
    if (r.ok) return visa(context);
  } catch (_) { /* Desktop kör troligen inte — prova molnet nedan */ }

  if (kropp.type === 'streamdeck' && moln.deviceToken) {
    try {
      const r = await fetch(`${MOLN}/api/streamdeck/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + moln.deviceToken },
        body: JSON.stringify(kropp), signal: AbortSignal.timeout(6000)
      });
      if (r.ok) return visa(context);
      console.error(`[vyra] molnet svarade ${r.status}`);
    } catch (err) { console.error('[vyra] nådde inte molnet —', err.message); }
  }
  // Krysset skiljer "kom inte fram" från "kördes". Utan Desktop och utan parkoppling: kryss.
  fel(context);
  console.error('[vyra] varken VYRA Desktop (4173) eller molnet nåddes');
}

// Byter en parkopplingskod mot en enhetstoken och sparar den globalt. Property Inspector skickar
// koden hit (sendToPlugin) i stället för att prata med molnet själv — en webview skickar ett Origin
// och kan råka ut för CORS, medan Node:s fetch inte gör det.
async function parkoppla(kod, namn, context, action) {
  const svara = nytt => send({ event: 'sendToPropertyInspector', context, action, payload: nytt });
  try {
    const r = await fetch(`${MOLN}/api/streamdeck/pair`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kod: String(kod || ''), namn: String(namn || '') }), signal: AbortSignal.timeout(8000)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.deviceToken) {
      moln = { deviceToken: j.deviceToken, workspace: j.workspace, parkoppladAt: Date.now() };
      send({ event: 'setGlobalSettings', context: uuid, payload: moln });
      return svara({ parkopplad: true });
    }
    svara({ parkopplad: false, fel: j.error || `Fel ${r.status}` });
  } catch (err) { svara({ parkopplad: false, fel: err.message }); }
}

ws.addEventListener('message', async e => {
  let m; try { m = JSON.parse(e.data) } catch (_) { return }

  if (m.event === 'didReceiveGlobalSettings') { moln = (m.payload && m.payload.settings) || {}; return; }
  if (m.event === 'sendToPlugin') {
    const d = m.payload || {};
    if (d.parkoppla) return parkoppla(d.kod, d.namn, m.context, m.action);
    if (d.status) return send({ event: 'sendToPropertyInspector', context: m.context, action: m.action, payload: { parkopplad: !!moln.deviceToken } });
    return;
  }
  if (m.event !== 'keyDown') return;

  const installning = (m.payload && m.payload.settings) || {};
  const kommando = KOMMANDO[m.action];

  // Nyckeln kommer från Property Inspector. Tom nyckel är giltig — då binder streamern sitt Event
  // till "vilken knapp som helst" i stället för till en specifik.
  const nyckel = String(installning.nyckel || '').slice(0, 200);

  // DE NYA KNAPPARNA (0.2.0) skickar typen `streamdeck` med ett kommando i stället för `knapp`.
  // eventKey är UNIK per tryck: local-server.js dedupar på eventKey i 120 s, och ett andra tryck
  // på samma knapp hade annars tystats. Vad knappen gör bär sdKommando/sdVarde/sdVal, som
  // local-server.js cleanEvent släpper igenom på just den här typen. streamdeck.js utför dem.
  const kropp = kommando
    ? { type: 'streamdeck', eventKey: `sd:${m.context}:${Date.now()}`, sdKommando: kommando,
        sdVarde: String(installning.varde || '').slice(0, 300), sdVal: String(installning.val || '').slice(0, 40) }
    : { type: 'knapp', eventKey: nyckel };

  leverera(kropp, m.context);
});

ws.addEventListener('error', () => console.error('[vyra] WebSocket-fel mot Stream Deck'));
ws.addEventListener('close', () => process.exit(0));
