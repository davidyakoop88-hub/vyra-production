'use strict';
// AUTOMATISK BATTLE-FX: ett riktigt boost-fönster från bryggan ska spela valt pakets klipp i OBS.
//
// Bryggan skickar BARA typen `glove` med `multiplier` (tiktok-bridge/normalizer.js
// battleTaskFields). Proven vaktar mappningen talet -> klipp, att placeringen hamnar i nederkant
// oavsett OBS-källans form, och att länken i routeLiveBattleEvent INTE tar något från de andra:
// Glove Snipe-widgeten ska fortfarande tändas.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const fx = require(path.join(__dirname, '..', 'battle-fx-auto.js'));

test('multiplikatorn väljer klipp', () => {
  assert.equal(fx.klippFor({ type: 'glove', multiplier: 2 }), 'boost-x2');
  assert.equal(fx.klippFor({ type: 'glove', multiplier: 3 }), 'boost-x3');
  assert.equal(fx.klippFor({ type: 'glove', multiplier: 5 }), 'glove', 'Boosting Glove är 5x');
  assert.equal(fx.klippFor({ type: 'glove' }), 'glove', 'utan tal faller den tillbaka på glove');
  assert.equal(fx.klippFor({ type: 'x2' }), 'boost-x2');
  assert.equal(fx.klippFor({ type: 'x3' }), 'boost-x3');
  assert.equal(fx.klippFor({ type: 'tap' }), 'tap');
  assert.equal(fx.klippFor({ type: 'snipe' }), 'snipe');
});

test('vanliga event spelar ingenting', () => {
  // Bärande: en gåva med count 2 får aldrig läsas som ett x2-fönster.
  for (const e of [{ type: 'gift', count: 2, multiplier: 2 }, { type: 'like', count: 3 }, { type: 'follow' },
    { type: 'battle', multiplier: 2 }, { type: 'battle_mvp' }, null, {}]) {
    assert.equal(fx.klippFor(e), null, JSON.stringify(e));
  }
});

test('placeringen ligger i nederkant i både liggande och stående OBS-källa', () => {
  for (const [vw, vh] of [[1920, 1080], [1080, 1920], [432, 768]]) {
    const p = fx.placering(vw, vh, 1);
    const toppPx = p.y / 1920 * vh, hojdPx = Math.min(vw * 9 / 16, vh * 0.9);
    assert.ok(Math.abs(toppPx + hojdPx - vh) <= 1, `${vw}x${vh}: slutar ${toppPx + hojdPx} i stället för ${vh}`);
    assert.equal(p.x, 0); assert.equal(p.width, 1080);
  }
  const halv = fx.placering(1920, 1080, 0.5);
  assert.equal(halv.width, 540); assert.equal(halv.x, 270, 'mindre storlek ska centreras');
  assert.equal(fx.placering(1920, 1080, 0.1).width, 432, 'storleken har ett golv på 40 %');
});

function miljo(pack) {
  const korda = [], glove = [];
  const fonster = {
    innerWidth: 1920, innerHeight: 1080,
    VyraExtras: { data: { battleFx: pack ? { pack, storlek: 1 } : undefined } },
    VYRA_OVERLAY_PACKAGES: { pinkPrincess: { name: 'Pink Princess', icon: '💎', files: [
      { key: 'boost-x2', label: 'X2 Boost', path: 'a/x2.webm' }, { key: 'glove', label: 'Glove Power', path: 'a/glove.webm' }] } },
    VyraActionRuntime: { execute: d => { korda.push(d); return true; } },
    routeLiveBattleEvent: e => { glove.push(e); }
  };
  return { fonster, korda, glove };
}
// Kör filen mot ett eget fönsterobjekt i stället för globalThis, utan DOM.
function ladda(fonster) {
  const fs = require('fs'), vm = require('vm');
  const kod = fs.readFileSync(path.join(__dirname, '..', 'battle-fx-auto.js'), 'utf8');
  const sandbox = { window: fonster, console, document: { querySelector: () => null }, Date, Math, Number, String, Object, URLSearchParams, Promise };
  vm.runInNewContext(kod, sandbox);
  return fonster;
}

test('ett x2-fönster spelar paketets X2 i scen 1 — och Glove Snipe tänds ändå', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: 'e1', type: 'glove', multiplier: 2 });
  assert.equal(m.glove.length, 1, 'den gamla länken måste fortfarande få eventet');
  assert.equal(m.korda.length, 1);
  const a = m.korda[0].action;
  assert.equal(a.videoMedia.packagePath, 'a/x2.webm');
  assert.equal(a.scene.number, 1, 'bara scen 1 — tre OBS-källor ska inte ge tre effekter');
  assert.equal(a.duration, 20, 'taket — runtime tar bort videon redan när den tar slut');
});

test('gamla händelser ur serverns historik spelas inte om', () => {
  const nu = 1791286500000;
  assert.equal(fx.forGammal({ id: nu - 5000 }, nu), false);
  assert.equal(fx.forGammal({ id: nu - 120000 }, nu), true, 'två minuter gammal boost är inte längre nu');
  assert.equal(fx.forGammal({ timestamp: nu - 40000, id: 'x' }, nu), true);
  assert.equal(fx.forGammal({ id: 'e1' }, nu), false, 'utan tidsstämpel spelas den');
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: Date.now() - 60000, type: 'glove', multiplier: 2 });
  assert.equal(m.korda.length, 0);
  assert.equal(m.glove.length, 1, 'de andra länkarna avgör själva');
});

test('samma event två gånger spelar en gång', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: 'e2', type: 'glove', multiplier: 5 });
  m.fonster.routeLiveBattleEvent({ id: 'e2', type: 'glove', multiplier: 5 });
  assert.equal(m.korda.length, 1);
  assert.equal(m.korda[0].action.videoMedia.packagePath, 'a/glove.webm');
});

test('avstängd eller saknat klipp spelar ingenting', () => {
  const av = miljo(''); ladda(av.fonster);
  av.fonster.routeLiveBattleEvent({ id: 'e3', type: 'glove', multiplier: 2 });
  assert.equal(av.korda.length, 0, 'utan valt paket ska inget spelas');
  assert.equal(av.glove.length, 1);
  const saknas = miljo('pinkPrincess'); ladda(saknas.fonster);
  saknas.fonster.routeLiveBattleEvent({ id: 'e4', type: 'glove', multiplier: 3 });
  assert.equal(saknas.korda.length, 0, 'paketet i provet har ingen X3');
});

test('ett fel i den gamla länken stoppar inte effekten', () => {
  const m = miljo('pinkPrincess');
  m.fonster.routeLiveBattleEvent = () => { throw new Error('trasig widget'); };
  ladda(m.fonster);
  assert.throws(() => m.fonster.routeLiveBattleEvent({ id: 'e5', type: 'glove', multiplier: 2 }));
  assert.equal(m.korda.length, 1);
});

test('overlay-länkens battlefx går före studions val — och kan stänga av', () => {
  const m = miljo(''); m.fonster.location = { search: '?overlay=1&scene=1&battlefx=pinkPrincess&battlefxstorlek=60' };
  ladda(m.fonster);
  assert.deepEqual(JSON.parse(JSON.stringify(m.fonster.VyraBattleFx.installning())), { pack: 'pinkPrincess', storlek: 0.6 });
  m.fonster.routeLiveBattleEvent({ id: 'e6', type: 'glove', multiplier: 2 });
  assert.equal(m.korda.length, 1, 'utan inloggning ska länken räcka');
  assert.equal(m.korda[0].action.scene.width, 648);
  const av = miljo('pinkPrincess'); av.fonster.location = { search: '?overlay=1&battlefx=av' };
  ladda(av.fonster);
  av.fonster.routeLiveBattleEvent({ id: 'e7', type: 'glove', multiplier: 2 });
  assert.equal(av.korda.length, 0, 'battlefx=av stänger av för just den källan');
});

test('overlay.html skickar battlefx vidare till studio.html', () => {
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'overlay.html'), 'utf8');
  assert.match(html, /'battlefx','battlefxstorlek'/);
});
