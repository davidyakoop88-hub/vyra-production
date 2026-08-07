// latency-probe.js — mäter var tiden faktiskt går mellan gåvan och widgeten.
//
// David 2026-08-07: konkurrentens widgetar tänds synligt snabbare än våra. Två kandidater, av helt
// olika slag, och det går inte att avgöra genom att läsa kod:
//
//   NÄTET     TikControls widget ansluter till ws://127.0.0.1 — deras app kör på samma dator som
//             OBS. Vårt överlägg går över Railway och tillbaka när det laddas från vyralive.app.
//             Uppmätt i deras klientkod samma kväll: ingen moln-socket alls, bara localhost.
//   KÖN       VyraAlertQueue släpper EN alert i taget och väntar minst 800 ms, i praktiken hela
//             widgetens visningstid. Tre gåvor i rad ställer sig på led hos oss.
//
// Kön kan mycket väl kosta hundra gånger mer än nätet. Optimerar vi fel sak vinner vi ingenting,
// och därför mäts båda separat innan något ändras.
//
// TVÅ TAL, INGEN EVENTLOGG. En rad i minuten, bara när den ändrats, och den bär enbart millisekunder
// och antal — aldrig användarnamn, gåvonamn eller kommentarer. Samma regel som [bridge][flode].
//
// Läs den i konsolen på överlägget, eller hämta den när som helst med VyraFordrojning.rapport().
// Kör två överlägg samtidigt i OBS — ett mot 127.0.0.1 och ett mot vyralive.app — så mäts båda
// vägarna på exakt samma gåvor.
(function (root) {
  'use strict';

  const INTERVALL_MS = 60000;
  // Ett event vars tidsstämpel ligger mer än fem minuter fel mäter en klocka som gått isär, inte en
  // fördröjning. Sådana kastas hellre än att dra upp snittet.
  const RIMLIGT_MS = 300000;

  const tomt = () => ({ n: 0, summa: 0, max: 0 });
  let nat = tomt(), ko = tomt(), senasteRad = '';

  function mat(m, ms) {
    if (!Number.isFinite(ms) || ms < 0 || ms > RIMLIGT_MS) return;
    m.n += 1; m.summa += ms; m.max = Math.max(m.max, ms);
  }
  const snitt = m => (m.n ? Math.round(m.summa / m.n) : 0);

  // ---- 1. nätet: bryggans tidsstämpel mot när eventet når klienten -----------------------------
  // `at` sätts av bryggan när TikTok levererade gåvan och färdas oförändrat genom cleanEvent.
  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    const at = Number(event && event.at);
    if (Number.isFinite(at) && at > 0) mat(nat, Date.now() - at);
    if (typeof tidigareRoute === 'function') return tidigareRoute(event);
  };

  // ---- 2. kön: från att jobbet läggs in tills det faktiskt spelas ------------------------------
  // Mätningen sitter INNE i jobbet, inte runt push(): push returnerar direkt, och det är väntan
  // efteråt som är hela frågan. runtime-controls.js installerar kön en stund efter start, så
  // kopplingen provas flera gånger i stället för att gissa en tidpunkt.
  function hooka() {
    const q = root.VyraAlertQueue;
    if (!q || q.__fordrojningMatt || typeof q.push !== 'function') return;
    const urPush = q.push.bind(q);
    q.push = function (run, duration, priority) {
      const koadAt = Date.now();
      return urPush(function () {
        mat(ko, Date.now() - koadAt);
        return run();
      }, duration, priority);
    };
    q.__fordrojningMatt = true;
  }
  // Synkront först: finns kön redan ska den kopplas nu, inte om en bildruta. Sedan några försök
  // till, eftersom runtime-controls.js installerar den vid 500 ms, 2200 ms och på load.
  hooka();
  [600, 2400, 5000].forEach(ms => root.setTimeout(hooka, ms));

  const timer = root.setInterval(() => {
    if (!nat.n && !ko.n) return;
    const rad = `nat=${snitt(nat)}ms (max ${nat.max}) ko=${snitt(ko)}ms (max ${ko.max}) n=${nat.n}`;
    if (rad === senasteRad) return;                 // oförändrat sedan förra minuten: ingen rad
    senasteRad = rad;
    try { root.console && root.console.log('[VYRA fördröjning] ' + rad) } catch (_) {}
  }, INTERVALL_MS);

  // Teardown enligt kontraktet: ingen setInterval får överleva en utloggning eller ett kontobyte.
  function riv() {
    try { root.clearInterval(timer) } catch (_) {}
    nat = tomt(); ko = tomt(); senasteRad = '';
  }
  try { root.VyraSessionState && root.VyraSessionState.registerTeardown &&
        root.VyraSessionState.registerTeardown('latency-probe', riv) } catch (_) {}
  try { root.addEventListener('vyra-session-ended', riv) } catch (_) {}

  root.VyraFordrojning = {
    rapport: () => ({
      nat: { antal: nat.n, snitt: snitt(nat), max: nat.max },
      ko: { antal: ko.n, snitt: snitt(ko), max: ko.max }
    }),
    glom: () => { nat = tomt(); ko = tomt(); senasteRad = '' }
  };
})(window);
