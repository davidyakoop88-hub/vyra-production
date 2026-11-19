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

test('battlefxhojd flyttar upp klippets underkant (uppskalad källa som går utanför canvasen)', () => {
  const [vw, vh] = [432, 768];
  const p = fx.placering(vw, vh, 1, 0.56);
  const toppPx = p.y / 1920 * vh, hojdPx = vw * 9 / 16;
  assert.ok(Math.abs(toppPx + hojdPx - vh * 0.56) <= 1, `slutar ${toppPx + hojdPx} i stället för ${vh * 0.56}`);
  assert.deepEqual(fx.placering(vw, vh, 1, undefined), fx.placering(vw, vh, 1), 'utan värde = nederkant');
  assert.ok(fx.placering(vw, vh, 1, 0.05).y >= 0, 'golv på 30 %, aldrig ovanför toppen');
});

// Fejkad klocka: Glove och Snipe planeras framat i tiden, och proven ska inte vanta pa riktigt.
function miljo(pack) {
  const korda = [], glove = [], timers = [];
  let klocka = 0;
  const fonster = {
    innerWidth: 1920, innerHeight: 1080,
    // Samma fejkade klocka för Date.now() som för timrarna (avståndsregeln mäter tid mellan klipp).
    Date: { now: () => klocka + 1e9 },
    VyraExtras: { data: { battleFx: pack ? { pack, storlek: 1 } : undefined } },
    VYRA_OVERLAY_PACKAGES: { pinkPrincess: { name: 'Pink Princess', icon: '💎', files: [
      { key: 'boost-x2', label: 'X2 Boost', path: 'a/boost-x2.webm' }, { key: 'glove', label: 'Glove Power', path: 'a/glove.webm' },
      { key: 'tap', label: 'Tap Tap', path: 'a/tap.webm' }, { key: 'snipe', label: 'Snipe', path: 'a/snipe.webm' }] } },
    VyraActionRuntime: { execute: d => { korda.push(d); return true; } },
    routeLiveBattleEvent: e => { glove.push(e); },
    setTimeout: (fn, ms) => { const t = { fn, at: klocka + ms, av: false }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.av = true; }
  };
  const spolaFram = sek => {
    const mal = klocka + sek * 1000;
    for (;;) {
      const nasta = timers.filter(t => !t.av && t.at <= mal).sort((a, b) => a.at - b.at)[0];
      if (!nasta) break;
      klocka = nasta.at; nasta.av = true; nasta.fn();
    }
    klocka = mal;
  };
  const spelat = () => korda.map(d => d.action.videoMedia.packagePath.replace(/^a\/|\.webm$/g, ''));
  return { fonster, korda, glove, spolaFram, spelat, tid: () => klocka };
}
// Kör filen mot ett eget fönsterobjekt i stället för globalThis, utan DOM.
function ladda(fonster) {
  const fs = require('fs'), vm = require('vm');
  const kod = fs.readFileSync(path.join(__dirname, '..', 'battle-fx-auto.js'), 'utf8');
  const sandbox = { window: fonster, console, document: { querySelector: () => null }, Date, Math, Number, String, Object, URLSearchParams, Promise };
  vm.runInNewContext(kod, sandbox);
  return fonster;
}
const start = (id, extra) => Object.assign({ id: 's-' + id + '-' + Math.random(), type: 'battle', battleStatus: 'battle_started', battleId: id }, extra);
const slut = id => ({ id: 'f-' + id + '-' + Math.random(), type: 'battle', battleStatus: 'battle_finished', battleId: id });
const boost = (id, multiplier, durationSec, nr) => ({ id: 'b-' + id + '-' + nr, type: 'glove', multiplier, durationSec, battleId: id });

test('regel 1: Tap Tap när matchen börjar — en gång per match', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m1', { remainingSec: 300 }));
  // TikTok skickar battle_started om och om igen under matchen.
  m.fonster.routeLiveBattleEvent(start('m1', { remainingSec: 280 }));
  m.fonster.routeLiveBattleEvent(start('m1', { remainingSec: 250 }));
  assert.deepEqual(m.spelat(), ['tap']);
  assert.equal(m.glove.length, 3, 'de andra länkarna får varje event');
  assert.equal(m.korda[0].action.scene.number, 1, 'bara scen 1 — tre OBS-källor ska inte ge tre effekter');
  assert.equal(m.korda[0].action.duration, 20, 'taket — runtime tar bort videon redan när den tar slut');
});

test('regel 2: X2/X3 hoppar över matchens första boost', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m2', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('m2', 2, 90, 1));
  assert.deepEqual(m.spelat(), ['tap'], 'första boosten spelar ingen X2');
  m.fonster.routeLiveBattleEvent(boost('m2', 2, 90, 2));
  // Avståndsregeln (2026-11-16): samma sekund som Tap Tap väntar X2 in 10 s (längsta klippet) i stället för att klippa av den.
  assert.deepEqual(m.spelat(), ['tap'], 'X2 ska inte avbryta Tap Tap');
  m.spolaFram(9);
  assert.deepEqual(m.spelat(), ['tap'], 'X2 får inte klippa av Tap Tap, som är upp till 10 s långt');
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2'], 'andra boosten spelar X2 när avståndet hållits');
  // Ny match: räkningen börjar om.
  m.fonster.routeLiveBattleEvent(slut('m2'));
  m.fonster.routeLiveBattleEvent(start('m3', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('m3', 2, 90, 1));
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2', 'tap']);
});

// Davids regel 2026-11-16: "första bonustiden lämnar vi" — den första boosten är helt tyst, även
// handsken. Från andra boosten: X2/X3 direkt, Glove när 30 s återstår av fönstret.
test('regel 3: Glove när 30 s återstår av varje boost — men inte den första', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m4', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('m4', 3, 90, 1));
  m.spolaFram(90);
  assert.deepEqual(m.spelat(), ['tap'], 'första boosten ska varken ge X3 eller handske');
  m.fonster.routeLiveBattleEvent(boost('m4', 2, 90, 2));
  m.spolaFram(59);
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2']);
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2', 'glove'], '90 s fönster: Glove efter 60 s');
  // Okänd längd: reserven är 60 s, alltså Glove efter 30 s. (10 s efter handsken, så att
  // avståndsregeln inte skjuter upp X2.)
  m.spolaFram(10);
  m.fonster.routeLiveBattleEvent(boost('m4', 2, 0, 3));
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2', 'glove', 'boost-x2']);
  m.spolaFram(30);
  assert.deepEqual(m.spelat(), ['tap', 'boost-x2', 'glove', 'boost-x2', 'glove']);
});

test('regel 4: Snipe när 30 s återstår av matchen — tiden rättas av senare meddelanden', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m5', { remainingSec: 300 }));
  m.spolaFram(100);
  m.fonster.routeLiveBattleEvent(start('m5', { remainingSec: 190 })); // TikTok säger 10 s mindre
  m.spolaFram(159);
  assert.deepEqual(m.spelat(), ['tap']);
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['tap', 'snipe']);
  m.spolaFram(9);
  assert.deepEqual(m.spelat(), ['tap', 'snipe'], 'handsken ska inte komma före 20 s kvar');
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['tap', 'snipe', 'glove'], 'handsken när 20 s återstår');
  m.fonster.routeLiveBattleEvent(start('m5', { remainingSec: 20 }));
  m.spolaFram(60);
  assert.deepEqual(m.spelat(), ['tap', 'snipe', 'glove'], 'Snipe och sluthandsken spelas en gång var');
});

test('regel 5: handsken vid 20 s kvar — även när overlayn laddats sent, men aldrig i efterhand', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  // Laddad mitt i matchen med 25 s kvar: Snipe spelas direkt (som förut — den har inte hunnit
  // spelas), och handsken kommer när 20 s återstår, alltså om 5 s.
  m.fonster.routeLiveBattleEvent(start('m5b', { remainingSec: 25 }));
  m.spolaFram(4);
  assert.deepEqual(m.spelat(), ['snipe']);
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['snipe', 'glove']);
  // Laddad med 15 s kvar: ingen handske i efterhand.
  const n = miljo('pinkPrincess'); ladda(n.fonster);
  n.fonster.routeLiveBattleEvent(start('m5c', { remainingSec: 15 }));
  n.spolaFram(60);
  assert.ok(!n.spelat().includes('glove'), `en sen handske spelades: ${n.spelat()}`);
  // Slutar matchen tidigt avbryts den väntande handsken.
  const o = miljo('pinkPrincess'); ladda(o.fonster);
  o.fonster.routeLiveBattleEvent(start('m5d', { remainingSec: 300 }));
  o.fonster.routeLiveBattleEvent(slut('m5d'));
  o.spolaFram(400);
  assert.deepEqual(o.spelat(), ['tap']);
});

test('utan remainingSec räknas matchen som 300 s', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m6'));
  m.spolaFram(269);
  assert.deepEqual(m.spelat(), ['tap']);
  m.spolaFram(1);
  assert.deepEqual(m.spelat(), ['tap', 'snipe']);
});

test('matchen slutar tidigt: väntande Snipe och Glove spelas inte', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m7', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('m7', 2, 90, 1));
  m.fonster.routeLiveBattleEvent(slut('m7'));
  m.spolaFram(400);
  assert.deepEqual(m.spelat(), ['tap']);
  m.fonster.routeLiveBattleEvent(start('m7', { remainingSec: 10 }));
  assert.deepEqual(m.spelat(), ['tap'], 'en avslutad match startar inte om');
});

test('overlayn laddas mitt i en match: ingen Tap Tap i efterhand, men Snipe kommer', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m8', { remainingSec: 120 }));
  assert.deepEqual(m.spelat(), []);
  m.spolaFram(90);
  assert.deepEqual(m.spelat(), ['snipe']);
});

test('testknapparna spelar sitt klipp direkt', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: 'battle-fx-test-1', type: 'glove', multiplier: 2, battleId: 'battle-fx-test' });
  // Molnet kan byta id — battleId räcker som markering.
  m.fonster.routeLiveBattleEvent({ id: 'annat-id', type: 'glove', multiplier: 5, battleId: 'battle-fx-test' });
  m.fonster.routeLiveBattleEvent({ id: 'battle-fx-test-3', type: 'tap' });
  assert.deepEqual(m.spelat(), ['boost-x2', 'glove', 'tap']);
  assert.equal(m.fonster.VyraBattleFx.lage(), null, 'test räknas inte som en match');
});

test('uttryckliga tap/snipe-event (Stream Deck) spelar direkt', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: 'sd1', type: 'snipe' });
  assert.deepEqual(m.spelat(), ['snipe']);
});

test('gamla händelser ur serverns historik spelas inte om', () => {
  const nu = 1791286500000;
  assert.equal(fx.forGammal({ id: nu - 5000 }, nu), false);
  assert.equal(fx.forGammal({ id: nu - 120000 }, nu), true, 'två minuter gammal boost är inte längre nu');
  assert.equal(fx.forGammal({ timestamp: nu - 40000, id: 'x' }, nu), true);
  assert.equal(fx.forGammal({ id: 'e1' }, nu), false, 'utan tidsstämpel spelas den');
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent({ id: Date.now() - 60000, type: 'battle', battleStatus: 'battle_started', battleId: 'g1' });
  assert.equal(m.korda.length, 0);
  assert.equal(m.glove.length, 1, 'de andra länkarna avgör själva');
});

test('samma event två gånger räknas en gång', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m9', { remainingSec: 300 }));
  const b = boost('m9', 2, 90, 1);
  m.fonster.routeLiveBattleEvent(b);
  m.fonster.routeLiveBattleEvent(b);
  assert.deepEqual(m.spelat(), ['tap'], 'en dubblett får inte räknas som andra boosten');
  assert.equal(m.fonster.VyraBattleFx.lage().boostar, 1);
});

test('avstängd eller saknat klipp spelar ingenting', () => {
  const av = miljo(''); ladda(av.fonster);
  av.fonster.routeLiveBattleEvent(start('m10'));
  av.fonster.routeLiveBattleEvent({ id: 'e3', type: 'glove', multiplier: 2 });
  assert.equal(av.korda.length, 0, 'utan valt paket ska inget spelas');
  assert.equal(av.glove.length, 2);
  const saknas = miljo('pinkPrincess'); ladda(saknas.fonster);
  saknas.fonster.routeLiveBattleEvent(start('m11', { remainingSec: 300 }));
  saknas.fonster.routeLiveBattleEvent(boost('m11', 3, 90, 1));
  saknas.fonster.routeLiveBattleEvent(boost('m11', 3, 90, 2));
  assert.deepEqual(saknas.spelat(), ['tap'], 'paketet i provet har ingen X3');
});

test('ett fel i den gamla länken stoppar inte effekten', () => {
  const m = miljo('pinkPrincess');
  m.fonster.routeLiveBattleEvent = () => { throw new Error('trasig widget'); };
  ladda(m.fonster);
  assert.throws(() => m.fonster.routeLiveBattleEvent(start('m12')));
  assert.equal(m.korda.length, 1);
});

test('overlay-länkens battlefx går före studions val — och kan stänga av', () => {
  const m = miljo(''); m.fonster.location = { search: '?overlay=1&scene=1&battlefx=pinkPrincess&battlefxstorlek=60&battlefxhojd=56' };
  ladda(m.fonster);
  assert.deepEqual(JSON.parse(JSON.stringify(m.fonster.VyraBattleFx.installning())), { pack: 'pinkPrincess', storlek: 0.6, botten: 0.56 });
  m.fonster.routeLiveBattleEvent(start('m13'));
  assert.equal(m.korda.length, 1, 'utan inloggning ska länken räcka');
  assert.equal(m.korda[0].action.scene.width, 648);
  const av = miljo('pinkPrincess'); av.fonster.location = { search: '?overlay=1&battlefx=av' };
  ladda(av.fonster);
  av.fonster.routeLiveBattleEvent(start('m14'));
  assert.equal(av.korda.length, 0, 'battlefx=av stänger av för just den källan');
});

test('overlay.html skickar battlefx vidare till studio.html', () => {
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'overlay.html'), 'utf8');
  assert.match(html, /'battlefx','battlefxstorlek','battlefxhojd'/);
});

// ---- tiderna hela vägen: bryggan -> molnet ------------------------------------------------------
test('bryggan räknar matchens återstod i TikToks klocka och molnet bär fälten', () => {
  const N = require(path.join(__dirname, '..', 'tiktok-bridge', 'normalizer.js'));
  const f = N.battleFields({ battleId: 'x', battleSettings: { startTimeMs: '1788640000000', duration: 300, status: 1 }, common: { createTime: '1788640100000' } });
  assert.equal(f.remainingSec, 200);
  const utan = N.battleFields({ battleId: 'x', battleSettings: { status: 1 } });
  assert.equal('remainingSec' in utan, false, 'saknas tiden skickas inget fält — hellre inget än en nolla');
  const moln = N.cloudEvent('e', 'glove', { multiplier: 2, durationSec: 90, battleId: 'x' });
  assert.equal(moln.durationSec, 90); assert.equal(moln.battleId, 'x');
  assert.equal(N.cloudEvent('e', 'battle', f).remainingSec, 200);
  const bus = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'event-bus.js'), 'utf8');
  assert.match(bus, /remainingSec:/); assert.match(bus, /durationSec:/);
  const desk = require('fs').readFileSync(path.join(__dirname, '..', 'electron-app', 'local-server.js'), 'utf8');
  assert.match(desk, /remainingSec: number/); assert.match(desk, /durationSec: number/);
  const bridge = require('fs').readFileSync(path.join(__dirname, '..', 'tiktok-bridge', 'bridge.js'), 'utf8');
  assert.match(bridge, /durationSec: f\.fonsterSekunder/);
});

// ---- PAKETWIDGETEN I LAYOUTEN (2026-10-10) -----------------------------------------------------
// Ligger ett helt Video FX-paket på duken (media.js VyraBattlePaket) spelar motorn i DEN, inte i
// action-runtimens egen ruta: widgeten är lika bred som duken, står där streamern lagt den, och
// kräver ingen `&scene=1` på länken. Uppmätt 2026-10-09: Davids länk saknade scenen, så runtimen
// nekade varje klipp en hel sändning ('inte scen 1').
function medPaket(m, pack = 'pinkPrincess') {
  const spelade = [];
  m.fonster.VyraBattlePaket = { finns: () => true, paket: () => pack, spela: k => { spelade.push(k); return true; } };
  return spelade;
}

test('paketwidgeten tar över uppspelningen från action-runtimen', () => {
  const m = miljo('pinkPrincess'); const spelade = medPaket(m); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('p1', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('p1', 2, 90, 1));
  m.fonster.routeLiveBattleEvent(boost('p1', 3, 90, 2));
  m.spolaFram(300);
  // Första boosten tyst; andra: X3 och Glove efter 60 s; Snipe vid 30 s kvar; handske vid 20 s kvar.
  assert.deepEqual(spelade, ['tap', 'boost-x3', 'glove', 'snipe', 'glove'], 'samma regler, men i widgeten');
  assert.deepEqual(m.korda, [], 'action-runtimen ska inte få klippet också — då spelas det dubbelt');
});

test('paketwidgetens paket gäller när panelen inte valt något', () => {
  // Panelvalet (vyra-extras battleFx.pack) är tomt; widgeten på duken bär paketet.
  const m = miljo(undefined); const spelade = medPaket(m, 'royalRuby'); ladda(m.fonster);
  assert.equal(m.fonster.VyraBattleFx.installning().pack, 'royalRuby');
  assert.equal(m.fonster.VyraBattleFx.hantera({ type: 'tap' }), 'spelas i widgeten');
  assert.deepEqual(spelade, ['tap']);
});

test('utan paketwidget är allt som förut: runtime, scen 1, panelvalet', () => {
  const m = miljo('pinkPrincess'); ladda(m.fonster);
  m.fonster.VyraBattlePaket = { finns: () => false, paket: () => '', spela: () => { throw new Error('ska inte anropas'); } };
  assert.equal(m.fonster.VyraBattleFx.hantera({ type: 'tap' }), 'spelas');
  assert.deepEqual(m.spelat(), ['tap']);
});

// HELBILDSPAKET (Neon Miami, 2026-11-14): klippen är stående 9:16 med effekter uppe och nere, så de
// spelas över hela källan (1080 bred från y 0) — inte i ett 16:9-band i nederkant som de andra.
test('helbildspaket spelas över hela källan, vanliga paket i nederkant', () => {
  const { fonster, korda } = miljo('neonMiami');
  fonster.VYRA_OVERLAY_PACKAGES.neonMiami = { name: 'Neon Miami', icon: '🌴', helbild: true, files: [
    { key: 'boost-x2', label: 'X2 Boost', path: 'a/x2.webm' }, { key: 'glove', label: 'Glove Power (X5)', path: 'a/glove.webm' }] };
  const f = ladda(fonster).VyraBattleFx;
  f.spela({ id: 'battle-fx-test-hel', type: 'glove', multiplier: 2 }, { test: true });
  assert.equal(korda.length, 1);
  assert.deepEqual({ ...korda[0].action.scene }, { number: 1, x: 0, y: 0, width: 1080, layer: 40 });
  const vanlig = miljo('pinkPrincess');
  ladda(vanlig.fonster).VyraBattleFx.spela({ id: 'battle-fx-test-vanlig', type: 'glove', multiplier: 2 }, { test: true });
  assert.notEqual(vanlig.korda[0].action.scene.y, 0, 'ett 16:9-paket ska fortfarande ligga i nederkant');
});

// ── SLUTFASEN: inga krockar (2026-11-16). De sista 35 s tillhör Snipe (30 s) och sluthandsken
// (20 s). Proven spelar hela matcher med fejkad klocka och mäter NÄR varje klipp startar.
function tidsatt(m) {
  const logg = [];
  m.fonster.VyraBattlePaket = { finns: () => true, paket: () => 'pinkPrincess', spela: k => { logg.push({ k, t: m.tid() / 1000 }); return true; } };
  return logg;
}

test('slutfasen: en sen boost-handske hoppas över, Snipe och sluthandsken får spela klart', () => {
  const m = miljo('pinkPrincess'); const logg = tidsatt(m); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('s1', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('s1', 2, 60, 1));          // första: tyst
  m.spolaFram(200);                                               // 100 s kvar
  m.fonster.routeLiveBattleEvent(boost('s1', 2, 90, 2));          // handsken skulle landa vid 270 s = 30 s kvar
  m.spolaFram(200);
  assert.deepEqual(logg.map(x => `${x.k}@${x.t}`), ['tap@0', 'boost-x2@200', 'snipe@270', 'glove@280'],
    'boost-handsken vid 270 s hade krockat med Snipe');
});

test('slutfasen: X2/X3 som öppnar de sista 40 s spelas inte — men gör det strax före', () => {
  const m = miljo('pinkPrincess'); const logg = tidsatt(m); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('s2', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('s2', 2, 60, 1));
  m.spolaFram(258);                                               // 42 s kvar: före slutfasen
  m.fonster.routeLiveBattleEvent(boost('s2', 3, 20, 2));
  m.spolaFram(12);                                                // 30 s kvar: i slutfasen
  m.fonster.routeLiveBattleEvent(boost('s2', 2, 20, 3));
  m.spolaFram(100);
  const k = logg.map(x => `${x.k}@${x.t}`);
  assert.ok(!k.some(x => /^boost-x2@27/.test(x)), `X2 i slutfasen spelades: ${k}`);
  assert.deepEqual(k.filter(x => /^(snipe|glove)/.test(x)).slice(-2), ['snipe@270', 'glove@280']);
});

test('slutfasen flyttar med när TikTok rättar återstoden', () => {
  const m = miljo('pinkPrincess'); const logg = tidsatt(m); ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('s3', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('s3', 2, 60, 1));
  m.spolaFram(100);
  m.fonster.routeLiveBattleEvent(start('s3', { remainingSec: 230 })); // TikTok förlängde matchen 30 s
  m.spolaFram(160);                                                   // 70 s kvar
  m.fonster.routeLiveBattleEvent(boost('s3', 2, 20, 2));              // X2 vid 70 s kvar ska spela
  m.spolaFram(200);
  const k = logg.map(x => `${x.k}@${x.t}`);
  assert.ok(k.includes('boost-x2@260'), `X2 före den flyttade slutfasen spelades inte: ${k}`);
  assert.deepEqual(k.filter(x => /^(snipe|glove)/.test(x)).slice(-2), ['snipe@300', 'glove@310']);
});

test('hela matcher: inga två klipp startar inom 10 s från varandra — längsta klippet hinner spela klart', () => {
  // Många boostlägen över en hel match — ett glapp är två klipp som avbryter varandra direkt.
  for (const forskjutning of [0, 15, 40, 75, 110, 150, 190, 220, 245, 255, 262, 268]) {
    const m = miljo('pinkPrincess'); const logg = tidsatt(m); ladda(m.fonster);
    m.fonster.routeLiveBattleEvent(start('h' + forskjutning, { remainingSec: 300 }));
    m.fonster.routeLiveBattleEvent(boost('h' + forskjutning, 2, 60, 1));
    m.spolaFram(forskjutning + 1);
    m.fonster.routeLiveBattleEvent(boost('h' + forskjutning, 3, 60, 2));
    m.spolaFram(400);
    const t = logg.map(x => x.t).sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) {
      assert.ok(t[i] - t[i - 1] >= 10, `boost vid ${forskjutning + 1} s: ${logg.map(x => `${x.k}@${x.t}`)} — två klipp ${t[i] - t[i - 1]} s isär`);
    }
    assert.deepEqual(logg.filter(x => x.k === 'snipe').length, 1);
  }
});

// 2026-11-19, David efter sändningen: "det var dubbel så räknade trippel". Regeln i boostHandelse var
// `mult >= 3 -> boost-x3`. En tittares Boosting Glove kommer som ett glove-event med multiplikator 5,
// så varje handske mitt i en match spelade X3-klippet — medan klippFor (och filhuvudet) säger att
// bara exakt 3 är en trippelboost och att 5 är handsken.
test('en Boosting Glove (5x) mitt i matchen spelar aldrig X3-klippet', () => {
  const m = miljo('pinkPrincess');
  // Provpaketet saknar X3-klipp, och då syns felet inte ("paketet saknar boost-x3"). Jungle Spirit,
  // som David körde, har det — därför får paketet ett här.
  m.fonster.VYRA_OVERLAY_PACKAGES.pinkPrincess.files.push({ key: 'boost-x3', label: 'X3 Boost', path: 'a/boost-x3.webm' });
  ladda(m.fonster);
  m.fonster.routeLiveBattleEvent(start('m10', { remainingSec: 300 }));
  m.fonster.routeLiveBattleEvent(boost('m10', 2, 30, 1));          // första boosten är tyst
  m.spolaFram(40);
  m.fonster.routeLiveBattleEvent(boost('m10', 5, 30, 2));          // en tittares handske
  m.spolaFram(1);
  assert.ok(!m.spelat().includes('boost-x3'), `handsken (5x) spelade X3-klippet: ${m.spelat()}`);
  m.spolaFram(40);
  m.fonster.routeLiveBattleEvent(boost('m10', 2, 30, 3));          // en riktig dubbelboost
  m.spolaFram(1);
  assert.ok(m.spelat().includes('boost-x2'), `dubbelboosten ska spela X2: ${m.spelat()}`);
  assert.ok(!m.spelat().includes('boost-x3'), `ingen trippelboost har kommit: ${m.spelat()}`);
  m.spolaFram(40);
  m.fonster.routeLiveBattleEvent(boost('m10', 3, 30, 4));          // en riktig trippelboost
  m.spolaFram(1);
  assert.ok(m.spelat().includes('boost-x3'), `trippelboosten ska spela X3: ${m.spelat()}`);
});
