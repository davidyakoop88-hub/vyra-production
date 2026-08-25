'use strict';
// MALWIDGETEN VID EN NY SANDNING — den lucka repaint inte tacker.
//
// UPPMATT (docs/worker-och-klient-design.md, Davids punkt 4): goal-clientens `store` haller sista
// ramen per widget i minnet, och `vyra-live-repaint` ritar bara om DEN ramen — "rita om det de
// redan har", ingen hamtning. Serverns nollstallning publicerar ingen malram alls. Foljden: en
// oppen malwidget star kvar med FORRA sandningens progress tills nasta liveevent rakar knuffa den.
//
// ATGARDEN anvander bara sadant som redan finns och ar bevisat: `resetWorkspaceGoals` bumpar
// `revision` (goal-runtime.js), och `loadSnapshot()` filtrerar mot store per revision. Resetraden
// ar alltsa strikt nyare i det ENDA ordningsbegrepp klienten lyder under, och en forlorad
// kapplopning ar ofarlig — revisionen avgor.
//
// Signalen ar `vyra-live-session` med `detail.event === 'live:start'`. Ett `live:end` hamtar INTE
// om: sandningen tog slut, och den sista siffran ska sta kvar pa skarmen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const Goals = require(path.join(__dirname, '..', 'goal-client.js'));
const TOKEN = 'obs-token';

function fakeSource(url) {
  const handlers = new Map();
  return { url, closed: false, handlers,
    addEventListener(name, fn) { handlers.set(name, [...(handlers.get(name) || []), fn]) },
    removeEventListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(f => f !== fn)) },
    close() { this.closed = true },
    emit(name, data) { for (const fn of handlers.get(name) || []) fn({ data: JSON.stringify(data) }) },
    open() { for (const fn of handlers.get('open') || []) fn({}) } };
}

function rigg(snapshot) {
  const calls = [];
  // Signalmalet ar injicerat. globalThis i Node ar ingen EventTarget (uppmatt: `dispatchEvent is
  // not a function` pa 22.22), och i webblasaren ar det `window` — samma kod, olika mal.
  const handelser = new EventTarget();
  const runtime = Goals.createGoalRuntime({
    events: handelser,
    fetch: async (url, options) => {
      calls.push({ url, method: (options && options.method) || 'GET' });
      return { ok: true, status: 200, json: async () => ({ ok: true, goals: snapshot || [] }) };
    },
    EventSource: function (url) { return fakeSource(url) },
    requestAnimationFrame: fn => { fn(0); return 1 },
    cancelAnimationFrame: () => {},
    confirm: () => false,
    save: () => {},
  });
  return { runtime, calls, handelser };
}

const signalera = (r, detalj) => r.handelser.dispatchEvent(
  Object.assign(new Event('vyra-live-session'), { detail: detalj }));

test('mal: live:start hamtar om det auktoritativa snapshotet', async () => {
  const r = rigg();
  const strom = fakeSource(`/api/overlay-access/${TOKEN}/events/stream`);
  await r.runtime.attachSource(strom, { owned: false, scope: { mode: 'token', token: TOKEN } });
  const fore = r.calls.length;

  signalera(r, { event: 'live:start', sessionId: '11111111-1111-4111-8111-111111111111' });
  await new Promise(r2 => setImmediate(r2));

  const nya = r.calls.slice(fore);
  assert.equal(nya.length, 1, 'en ny sandning hamtade inte om malen');
  assert.equal(nya[0].url, `/api/overlay-access/${TOKEN}/goals`);
  assert.equal(nya[0].method, 'GET');
});

test('mal: live:end hamtar INTE om — sista siffran ska sta kvar', async () => {
  const r = rigg();
  const strom = fakeSource(`/api/overlay-access/${TOKEN}/events/stream`);
  await r.runtime.attachSource(strom, { owned: false, scope: { mode: 'token', token: TOKEN } });
  const fore = r.calls.length;

  signalera(r, { event: 'live:end', sessionId: '11111111-1111-4111-8111-111111111111' });
  await new Promise(r2 => setImmediate(r2));

  assert.equal(r.calls.length, fore, 'ett avslut hamtade om malen');
});

test('mal: en runtime utan scope hamtar ingenting', async () => {
  const r = rigg();
  signalera(r, { event: 'live:start', sessionId: '11111111-1111-4111-8111-111111111111' });
  await new Promise(r2 => setImmediate(r2));
  assert.deepEqual(r.calls, [], 'en runtime som aldrig kopplats hamtade anda');
});
