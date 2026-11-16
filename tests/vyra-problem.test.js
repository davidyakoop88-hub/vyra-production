'use strict';
// Felrapporten "Problem i sändningen" (vyra-problem.js) och delarna som rapporterar till den.
// Sändningen 2026-11-16: avataren ignorerade en moderators "!s" tyst, battle-klippen klipptes av
// varandra och MVP:n upplevdes sen — utan att något gick att läsa i efterhand.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROT, 'vyra-problem.js'), 'utf8');

function sida(url = 'https://vyralive.app/studio.html') {
  const dom = new JSDOM('<!doctype html><body><div class="lc-page"><div class="lc-head"></div></div></body>', { url, runScripts: 'outside-only' });
  dom.window.eval(KALLA);
  return dom.window;
}

test('rapportera sparar en rad och ritar rutan i LIVE-kontroll', () => {
  const w = sida();
  assert.equal(w.VyraProblem.rapportera('avatar', 'varning', 'Avataren ignorerade "!s" från @mod: test'), true);
  const l = w.VyraProblem.lista();
  assert.equal(l.length, 1);
  assert.equal(l[0].kalla, 'avatar');
  assert.equal(l[0].niva, 'varning');
  const ruta = w.document.querySelector('.lc-problem');
  assert.ok(ruta, 'rutan monterades inte');
  assert.match(ruta.textContent, /Problem i sändningen/);
  assert.match(ruta.textContent, /0 fel · 1 varningar · 0 info/);
  assert.equal(w.document.querySelector('.lc-head').nextElementSibling, ruta, 'rutan ska ligga direkt under rubriken');
});

test('samma rapport inom 10 s räknas upp i stället för att bli en ny rad', () => {
  const w = sida();
  for (let i = 0; i < 4; i++) w.VyraProblem.rapportera('ljud', 'varning', 'Kön var full');
  w.VyraProblem.rapportera('ljud', 'varning', 'Något annat');
  const l = w.VyraProblem.lista();
  assert.equal(l.length, 2);
  assert.equal(l.find(r => r.text === 'Kön var full').antal, 4);
  assert.match(w.document.querySelector('.lc-problem').textContent, /×4/);
});

test('loggen tak: högst 300 rader, nyast först', () => {
  const w = sida();
  for (let i = 0; i < 320; i++) w.VyraProblem.rapportera('tts', 'info', 'rad ' + i);
  const l = w.VyraProblem.lista();
  assert.equal(l.length, 300);
  assert.equal(l[0].text, 'rad 319');
  assert.equal(w.document.querySelectorAll('.lc-problem-rad').length, 60, 'rutan visar bara de 60 senaste');
});

test('OBS-overlayn rapporterar inte (ingen delad lagring, ingen ruta)', () => {
  const w = sida('https://vyralive.app/studio.html?overlay=1&scene=1');
  assert.equal(w.VyraProblem.rapportera('avatar', 'fel', 'x'), false);
  assert.equal(w.VyraProblem.lista().length, 0);
  assert.equal(w.document.querySelector('.lc-problem'), null);
});

test('data rensas till enkla värden — ingen rå payload eller bilder', () => {
  const w = sida();
  w.VyraProblem.rapportera('mvp', 'info', 'MVP visades 2,0 s efter matchslut', { battleId: 'b1', sek: 2, user: { bild: 'x' } });
  assert.deepEqual({ ...w.VyraProblem.lista()[0].data }, { battleId: 'b1', sek: 2 });
});

test('Rensa tömmer loggen', () => {
  const w = sida();
  w.VyraProblem.rapportera('battle', 'info', 'x');
  w.document.querySelector('[data-problem-rensa]').click();
  assert.equal(w.VyraProblem.lista().length, 0);
  assert.match(w.document.querySelector('.lc-problem').textContent, /Inga problem rapporterade/);
});

test('exportera ger en fil med problemen och LIVE-kontrollens händelser', () => {
  const w = sida();
  w.URL.createObjectURL = () => 'blob:x';
  w.URL.revokeObjectURL = () => {};
  w.VyraLiveControl = { getSnapshot: () => ({ events: [{ type: 'chat' }] }) };
  w.VyraProblem.rapportera('tts', 'fel', 'Ingen röst kunde läsa');
  let namn = '';
  w.HTMLAnchorElement.prototype.click = function () { namn = this.download; };
  const fil = w.VyraProblem.exportera();
  assert.equal(fil.format, 'vyra-sandning');
  assert.equal(fil.problem.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fil.liveKontroll)), { events: [{ type: 'chat' }] });
  assert.match(namn, /^VYRA-sandning-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
});

test('nyckeln torkas vid kontobyte (EPHEMERAL_KEYS) och filen ägs av live-domänen', () => {
  const ss = fs.readFileSync(path.join(ROT, 'session-state.js'), 'utf8');
  assert.match(ss, /EPHEMERAL_KEYS = \[[^\]]*'vyra-problemlogg'/);
  const dom = JSON.parse(fs.readFileSync(path.join(ROT, '.claude', 'domaner.json'), 'utf8'));
  const live = Object.values(dom.domaner || dom).find(d => d && Array.isArray(d.filer) && d.filer.includes('live-control.js'));
  assert.ok(live && live.filer.includes('vyra-problem.js'));
  const media = fs.readFileSync(path.join(ROT, 'media.js'), 'utf8');
  assert.ok(media.indexOf("vyra-problem.js?v=") > -1 && media.indexOf("vyra-problem.js?v=") < media.indexOf("live-control.js?v="),
    'vyra-problem.js ska laddas före live-control.js');
});

// ---- Avataren förklarar varför ett kommando inte togs emot -------------------------------------
test('chattavatar-modell.forklara: sändningens fall', () => {
  const M = require(path.join(ROT, 'chattavatar-modell.js'));
  const o = { streamer: () => 'jokero', publik: () => 'mod' };
  const ev = (comment, isModerator, username = 'moddaren') => ({ type: 'chat', comment, username, isModerator });
  assert.match(M.forklara(ev('!s', true), o).orsak, /behöver en text efter/);
  assert.match(M.forklara(ev('!s hej', false), o).orsak, /inte som moderator/);
  assert.match(M.forklara(ev('!d1 kom', true), o).orsak, /utan något efter/);
  assert.equal(M.forklara(ev('!s hej', true), o), null, 'ett giltigt kommando har inget att förklara');
  assert.equal(M.forklara(ev('hej allihop', false), o), null, 'vanlig chatt rapporteras aldrig');
  assert.match(M.forklara(ev('!k', false), { streamer: () => '', publik: () => 'alla' }).orsak, /tittare får bara/);
});

// ---- Battle-FX: beslut som förklarar varför ett klipp inte syntes -------------------------------
test('battle-fx-auto rapporterar avstängt paket när en boost kommer', () => {
  const dom = new JSDOM('<!doctype html><body><div class="lc-page"><div class="lc-head"></div></div></body>', { url: 'https://vyralive.app/studio.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(KALLA);
  const fall = [];
  w.routeLiveBattleEvent = () => {};
  w.eval(fs.readFileSync(path.join(ROT, 'battle-fx-auto.js'), 'utf8'));
  w.routeLiveBattleEvent({ type: 'glove', multiplier: 2, at: Date.now(), id: 'g1' });
  w.routeLiveBattleEvent({ type: 'chat', comment: 'hej' });
  const l = w.VyraProblem.lista();
  assert.equal(l.length, 1, JSON.stringify(l));
  assert.equal(l[0].kalla, 'battle');
  assert.match(l[0].text, /Automatisk battle-FX är avstängd/);
  void fall;
});
