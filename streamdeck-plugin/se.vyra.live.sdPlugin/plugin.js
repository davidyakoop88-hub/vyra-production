'use strict';
// VYRA Live — Stream Deck-plugin. Ett tryck kör en Action i VYRA.
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

ws.addEventListener('open', () => send({ event: registerEvent, uuid }));

ws.addEventListener('message', async e => {
  let m; try { m = JSON.parse(e.data) } catch (_) { return }
  if (m.event !== 'keyDown') return;

  // Nyckeln kommer från Property Inspector. Tom nyckel är giltig — då binder streamern sitt Event
  // till "vilken knapp som helst" i stället för till en specifik.
  const nyckel = String((m.payload && m.payload.settings && m.payload.settings.nyckel) || '').slice(0, 200);

  try {
    const r = await fetch(`${VYRA}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'knapp', eventKey: nyckel }),
      signal: AbortSignal.timeout(4000)
    });
    if (r.ok) visa(m.context);
    else {
      fel(m.context);
      console.error(`[vyra] ${r.status} från VYRA Desktop`);
    }
  } catch (err) {
    // Vanligaste orsaken: VYRA Desktop kör inte. Krysset på knappen säger det direkt.
    fel(m.context);
    console.error('[vyra] nådde inte VYRA Desktop på 4173 —', err.message);
  }
});

ws.addEventListener('error', () => console.error('[vyra] WebSocket-fel mot Stream Deck'));
ws.addEventListener('close', () => process.exit(0));
