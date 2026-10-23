'use strict';
// LIVE-KONTROLL: "Tap Tap saknas" (slutgranskningen 2026-10-23).
//
// Uppmätt i studion med Pink Princess (helt paket) i layouten: Matchövervakningen sa "X2/X3 saknas",
// "Tap Tap saknas", "Glove saknas" och "Snipe saknas". Raden räknade bara de gamla
// enklippswidgetarna (battleEventKind boost/tap/glove/snipe); ett paket är sedan 2026-10-09 EN
// widget med battleEventKind 'pack' och matchade ingen av dem. Klippet som valts under Vip-widget
// (battle-fx-auto.js) räknades inte heller. Och knappen "Tap Tap" skickade ett påhittat battle_tap
// genom record(): MOTTAGNA, "Matchhändelser" och "Senaste: TAP" visade en match som aldrig hänt.
//
// Proven nedan laddar den RIKTIGA live-client.js och live-control.js i samma fönster och matar en
// like i exakt den form bryggan skickar (tiktok-bridge/normalizer.js likeFields + cloudEvent)
// genom VyraLive.ingest — samma väg som SSE-strömmen tar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const N = require(path.join(__dirname, '..', 'tiktok-bridge', 'normalizer.js'));

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const fonster = [];
test.after(() => { for (const w of fonster) { try { w.VyraLive?.stop?.() } catch {} try { w.close() } catch {} } });

function oppna(widgets, { battleFx = null, liveClient = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><aside></aside><h1 id="title"></h1><main id="view"></main></body>',
    { url: 'https://vyra.example/studio.html', runScripts: 'dangerously' });
  const w = dom.window;
  fonster.push(w);
  w.toasts = [];
  w.toast = m => w.toasts.push(m);
  w.EventSource = class { addEventListener() {} close() {} };
  w.fetch = async () => { throw new Error('ingen server i provet'); };
  w.HTMLMediaElement.prototype.play = function () { this.dataset.spelar = '1'; return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.VyraAuth = { lastDetail: () => null, api: async () => ({ ok: true }) };
  if (battleFx) w.VyraBattleFx = { installning: () => ({ pack: battleFx }) };
  const kor = src => { const s = w.document.createElement('script'); s.textContent = src; w.document.body.append(s); };
  // Som studio.js: state är en const i den delade lexikala miljön, inte en egenskap på window.
  kor(`const state=${JSON.stringify({ widgets })};`);
  // render/bind/save/view är studio.js-globaler som overlay-packages.js lindar och live-client.js
  // ropar på. Studion själv laddas inte här — bara katalogen (VYRA_OVERLAY_PACKAGES) behövs.
  kor('var render=function(){},bind=function(){},save=function(){},view="liveControl";');
  kor(las('overlay-packages.js'));
  // Ordningen speglar media.js injektionskedja: cloud-fields.js före live-client.js.
  if (liveClient) { kor(las('cloud-fields.js')); kor(las('live-client.js')); }
  kor(las('live-control.js'));
  w.VyraLiveControl.render();
  return w;
}
const paket = (id, boostPack, over = {}) => Object.assign({ id, type: 'templateGloveSnipe', battleEventKind: 'pack', boostPack, title: boostPack }, over);
const chip = (w, sel) => w.document.querySelector(sel);
const klar = w => w.document.querySelector('.lc-battle-ready').textContent;

// En riktig like som den lämnar bryggan: tiktok-live-proto v3 (count / total som sträng).
function riktigLike(id, count) {
  const data = { user: { uniqueId: 'lisa_live', nickname: 'Lisa', userId: '7001' }, count, total: '4200' };
  return N.cloudEvent(id, 'like', N.likeFields(data));
}

test('ett helt WebM-paket i layouten ger alla fyra klippen — inget "saknas"', () => {
  const w = oppna([paket('p1', 'pinkPrincess')]);
  for (const k of ['boost', 'tap', 'glove', 'snipe']) {
    assert.ok(chip(w, `[data-lc-klipp="${k}"]`).classList.contains('ok'), k + ' ska vara OK med Pink Princess i layouten: ' + klar(w));
  }
  assert.doesNotMatch(klar(w), /saknas/);
  assert.match(chip(w, '[data-lc-klipp="tap"]').title, /Spelas från: Pink Princess/);
  assert.equal(w.document.querySelector('[data-lc-klipp-hint]'), null, 'inget saknas, alltså ingen åtgärdsrad');
});

test('ett MP4-paket har inget Snipe-klipp — och raden säger vad som gäller', () => {
  const w = oppna([paket('p1', 'koiPearl')]);
  assert.match(klar(w), /Tap Tap 1/);
  assert.match(klar(w), /Snipe saknas/);
  assert.match(w.document.querySelector('[data-lc-klipp-hint]').textContent, /inget Snipe-klipp/);
});

test('ett dolt paket räknas inte, och utan klipp säger raden vad man ska göra', () => {
  const w = oppna([paket('p1', 'pinkPrincess', { hidden: true })]);
  assert.match(klar(w), /Tap Tap saknas/);
  assert.match(w.document.querySelector('[data-lc-klipp-hint]').textContent, /lägg till ett helt battle-paket/);
});

test('paketet som valts under Vip-widget (battle-fx-motorn) räknas utan widget', () => {
  const w = oppna([], { battleFx: 'royalRuby' });
  assert.match(klar(w), /Tap Tap 1/);
  assert.match(chip(w, '[data-lc-klipp="tap"]').title, /Royal Ruby/);
});

test('en riktig like genom VyraLive.ingest gör Likes-raden OK', () => {
  const w = oppna([paket('p1', 'pinkPrincess')], { liveClient: true });
  assert.equal(typeof w.VyraLive?.ingest, 'function', 'live-client.js laddades inte');
  const fore = chip(w, '[data-lc-likes]');
  assert.ok(!fore.classList.contains('ok'), 'utan likes får raden inte vara OK');
  assert.match(fore.textContent, /Likes: (väntar på TikTok|inga ännu)/);
  assert.ok(fore.title.length > 10, 'raden ska säga vad man gör åt det');

  const like = riktigLike('cloud-like-1', 15);
  assert.equal(like.type, 'like'); assert.equal(like.count, 15);
  w.VyraLive.ingest(like);

  const efter = chip(w, '[data-lc-likes]');
  assert.ok(efter.classList.contains('ok'), 'likes kom in men raden är inte OK: ' + efter.textContent);
  assert.match(efter.textContent, /Likes 15 \/ min/);
  w.VyraLive.ingest(riktigLike('cloud-like-2', 7));
  assert.match(chip(w, '[data-lc-likes]').textContent, /Likes 22 \/ min/);
  assert.equal(w.VyraLiveControl.getSnapshot().likes.ok, true);
});

test('test- och simulerade likes gör aldrig Likes-raden OK', () => {
  const w = oppna([], { liveClient: true });
  w.VyraLive.ingest({ ...riktigLike('test-1', 9), id: 'test-1' });
  w.VyraLive.ingest({ ...riktigLike('sim-1', 9), __simulerad: true });
  w.VyraLiveControl.record({ ...riktigLike('t-2', 9), __test: true });
  assert.ok(!chip(w, '[data-lc-likes]').classList.contains('ok'), chip(w, '[data-lc-likes]').textContent);
});

test('knappen Tap Tap förhandsvisar paketets klipp och skriver ingenting i statistiken', () => {
  const w = oppna([paket('p1', 'pinkPrincess')]);
  const fore = w.VyraLiveControl.getSnapshot();
  w.document.querySelector('[data-battle-test="tap"]').click();
  const efter = w.VyraLiveControl.getSnapshot();
  assert.equal(efter.stats.received, fore.stats.received, 'testet räknades som ett mottaget event');
  assert.equal(efter.battle.events, fore.battle.events, 'testet räknades som en matchhändelse');
  assert.equal(efter.battle.lastKind, fore.battle.lastKind);
  assert.equal(efter.events.length, 0, 'testet hamnade i händelseloggen');
  const ruta = w.document.querySelector('[data-lc-forhands]');
  assert.ok(ruta && !ruta.hidden, 'förhandsvisningen visas inte');
  assert.match(ruta.querySelector('video').getAttribute('src'), /pink-princess\/tap\.webm$/);
  assert.equal(ruta.querySelector('video').dataset.spelar, '1');
  assert.match(w.toasts.at(-1), /Förhandsvisning: Pink Princess · Tap Tap — skickas inte till OBS/);
  // Rutan ligger utanför vyn: en omritning (som varje like ger) får inte döda klippet.
  w.VyraLiveControl.render();
  assert.ok(!w.document.querySelector('[data-lc-forhands]').hidden);
});

test('knappen Tap Tap utan klipp säger vad som saknas i stället för att låtsas', () => {
  const w = oppna([]);
  assert.equal(w.VyraLiveControl.testBattle('tap'), false);
  const ruta = w.document.querySelector('[data-lc-forhands]');
  assert.ok(!ruta || ruta.hidden);
  assert.match(w.toasts.at(-1), /Inget Tap Tap-klipp: lägg till ett battle-paket i layouten/);
  assert.equal(w.VyraLiveControl.getSnapshot().stats.received, 0);
});
