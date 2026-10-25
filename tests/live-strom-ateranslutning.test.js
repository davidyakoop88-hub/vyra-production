'use strict';
// STUDIONS LIVE-STRÖM ÖPPNAS IGEN NÄR WEBBLÄSAREN GER UPP (David 2026-10-24: "Spotify funkade en
// gång", "TTS läser en kommentar i timmen").
//
// EventSource återansluter själv bara efter ett nätverkstapp. Svarar servern med något annat än 200
// — 502 under en deploy, 401, 429 — går strömmen till CLOSED för gott. live-client.js släppte då
// handtaget och ingenting öppnade en ny: studion stod döv tills sidan laddades om, medan
// OBS-widgetarna (egen backoff i base-widget.js) fortsatte. TTS-chatten och Spotify-kommandona körs
// bara i studion och tystnade därför. Provet kör den riktiga filen.
const test = require('node:test'), assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/browser-harness.js');

const WS = 'ws-A';

function live() {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: WS }] }) };
  browser.load('live-client.js');
  return browser;
}
const oppna = b => b.openStreams.filter(s => !s.closed);
// Webbläsaren ger upp: readyState CLOSED, sedan error. Timers som fanns innan felet (bl.a. sidans
// egen setTimeout(openStream, 2000)) räknas inte som återanslutningar.
function gerUpp(stream, b) { b.fore = b.timers.timeouts.length; stream.readyState = 2; stream.onerror && stream.onerror() }
function aterslutTimers(b) { return b.timers.timeouts.slice(b.fore || 0).filter(t => !t.cleared && !t.fired) }
function kor(t) { t.fired = true; t.fn() }

test('en ström som går till CLOSED öppnas igen efter en sekund', async () => {
  const b = live();
  b.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await b.settle();
  assert.equal(oppna(b).length, 1);
  const forsta = oppna(b)[0];

  gerUpp(forsta, b);
  assert.equal(forsta.closed, true, 'den döda strömmen stängdes inte');
  const vantan = aterslutTimers(b);
  assert.equal(vantan.length, 1, 'ingen återanslutning planerades');
  assert.equal(vantan[0].ms, 1000);

  kor(vantan[0]);
  assert.equal(oppna(b).length, 1, 'ingen ny ström öppnades');
  assert.notEqual(oppna(b)[0], forsta);
  assert.match(oppna(b)[0].url, new RegExp(WS));
});

test('backoffen dubblas vid upprepade fel och nollställs när strömmen öppnas', async () => {
  const b = live();
  b.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await b.settle();
  const vantetider = [];
  for (let i = 0; i < 7; i++) {
    gerUpp(oppna(b)[0], b);
    const [t] = aterslutTimers(b);
    vantetider.push(t.ms);
    kor(t);
  }
  assert.deepEqual(vantetider, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);

  for (const fn of oppna(b)[0].handlers.get('open') || []) fn();
  gerUpp(oppna(b)[0], b);
  assert.equal(aterslutTimers(b)[0].ms, 1000, 'en lyckad anslutning nollställde inte backoffen');
});

test('ett vanligt nätverkstapp lämnas åt webbläsaren', async () => {
  const b = live();
  b.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await b.settle();
  const s = oppna(b)[0];
  b.fore = b.timers.timeouts.length;
  s.readyState = 0;   // CONNECTING: webbläsaren försöker själv
  s.onerror();
  assert.equal(s.closed, false);
  assert.equal(aterslutTimers(b).length, 0);
});

test('utloggning stoppar en planerad återanslutning', async () => {
  const b = live();
  b.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await b.settle();
  gerUpp(oppna(b)[0], b);
  const [t] = aterslutTimers(b);
  b.emit('vyra-session-ended', { mode: 'neutral' });
  await b.settle();
  assert.equal(t.cleared, true, 'återanslutningen ligger kvar efter utloggning');
  t.fn();
  assert.equal(oppna(b).length, 0, 'en ström öppnades åt ett utloggat konto');
});
