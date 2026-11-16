'use strict';
// Prioritet i kön (action-runtime.js) — en stor gåva ska inte vänta bakom tjugo rosor.
//
// Proven kör den riktiga kön i en overlayflik. Varje action har `skipOnNext`, som kortar pausen
// till 150 ms när något väntar bakom, så att en kö på fem spelar ut på under en sekund. Ordningen
// läses ur `vyra:runtime-alert`, som kön skickar i exakt den ordning den spelar.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const A = (namn, o = {}) => ({ id: 'a-' + namn, name: namn, types: ['alert'], config: { alertText: namn },
  duration: 1, skipOnNext: true, scene: { number: 1 }, ...o });
let lopnr = 0;
const bud = action => ({ action, payload: { username: 'lisa' }, runId: `run-${++lopnr}` });

async function overlay({ maxQueue = 0 } = {}) {
  const lager = F.delatLager();
  if (maxQueue) lager.setItem('vyra-scene-settings-v1', JSON.stringify({ 1: { maxQueue } }));
  lager.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  const w = await F.fonster({ namn: 'overlay', scen: 1, lager });
  living.push(w);
  // jsdom utan pretendToBeVisual saknar requestAnimationFrame, som stage() använder för bild/video.
  if (!w.requestAnimationFrame) w.requestAnimationFrame = f => w.setTimeout(f, 0);
  w.__spelat = [];
  w.__strypta = [];
  w.document.addEventListener('vyra:runtime-alert', e => w.__spelat.push(e.detail.action.name));
  w.document.addEventListener('vyra:action-dropped', e => w.__strypta.push(e.detail.runId));
  return w;
}

test('1: en prioriterad action går före de vanliga, men avbryter inte den som spelar', async () => {
  const w = await overlay();
  const k = w.VyraActionRuntime;
  k.execute(bud(A('A')));
  k.execute(bud(A('B')));
  k.execute(bud(A('C')));
  k.execute(bud(A('H1', { prioritet: 'hog' })));
  k.execute(bud(A('H2', { prioritet: 'hog' })));
  await vanta(1500);
  assert.deepEqual(w.__spelat, ['A', 'H1', 'H2', 'B', 'C']);
});

test('2: utan fältet beter sig kön som förut — först in, först ut', async () => {
  const w = await overlay();
  for (const n of ['A', 'B', 'C']) w.VyraActionRuntime.execute(bud(A(n, { prioritet: undefined })));
  await vanta(900);
  assert.deepEqual(w.__spelat, ['A', 'B', 'C']);
});

test('3: full kö — en prioriterad knuffar ut den senast köade vanliga, som får poängen tillbaka', async () => {
  const w = await overlay({ maxQueue: 2 });
  const k = w.VyraActionRuntime;
  const a = bud(A('A')), b = bud(A('B')), c = bud(A('C')), h = bud(A('H', { prioritet: 'hog' })), d = bud(A('D'));
  assert.equal(k.execute(a), true);
  assert.equal(k.execute(b), true);
  assert.equal(k.execute(c), true);
  assert.equal(k.execute(h), true, 'den prioriterade fick inte plats');
  assert.deepEqual(w.__strypta, [c.runId], 'den senast köade vanliga ska knuffas ut och rapporteras');
  assert.equal(k.execute(d), false, 'en vanlig action i en full kö ska hoppas över som förut');
  assert.deepEqual(w.__strypta, [c.runId, d.runId]);
  assert.ok(w.__toaster.some(t => /C gav plats åt en prioriterad action/.test(t)), w.__toaster.join(' | '));
  await vanta(1200);
  assert.deepEqual(w.__spelat, ['A', 'H', 'B']);
});

test('4: en kö full av bara prioriterade tar inte emot fler', async () => {
  const w = await overlay({ maxQueue: 2 });
  const k = w.VyraActionRuntime;
  k.execute(bud(A('A')));
  k.execute(bud(A('H1', { prioritet: 'hog' })));
  k.execute(bud(A('H2', { prioritet: 'hog' })));
  const h3 = bud(A('H3', { prioritet: 'hog' }));
  assert.equal(k.execute(h3), false);
  assert.deepEqual(w.__strypta, [h3.runId]);
  await vanta(900);
  assert.deepEqual(w.__spelat, ['A', 'H1', 'H2']);
});

test('5: rutan i Ny Action sparar prioriteten, och listan visar märket', async () => {
  const lager = F.delatLager();
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true });
  living.push(w);
  const d = w.document;
  const nav = d.createElement('a'); nav.dataset.extra = 'actions'; nav.className = 'active'; d.body.append(nav);
  w.VyraActionEvent.refresh();
  d.querySelector('#newAeAction').click();
  d.querySelector('#aeActionName').value = 'Lejonbrus';
  d.querySelector('input[data-fn-check][value="alert"]').checked = true;
  const ruta = d.querySelector('#aeHogPrioritet');
  assert.ok(ruta, 'rutan Hög prioritet saknas i Ny Action');
  ruta.checked = true;
  d.querySelector('#saveAeAction').click();
  await vanta(200);
  const s = JSON.parse(lager.getItem(F.KEY));
  assert.equal(s.actions[0].prioritet, 'hog');
  assert.match(d.querySelector('[data-action-row] .ae-col-name').textContent, /Lejonbrus\s+Prioritet/);
  d.querySelector('[data-edit-action]').click();
  assert.equal(d.querySelector('#aeHogPrioritet').checked, true, 'rutan var inte ikryssad vid redigering');
  assert.equal(d.querySelector('[data-ae-avancerat]').open, true, 'Avancerade val ska vara öppet när prioriteten är på');
});

// ── ERSÄTT (2026-11-16): battle-paketens klipp i reservvägen (ingen battle-widget på duken). ──
const fx = (namn, o = {}) => A(namn, { types: ['alert', 'video'], videoMedia: { packagePath: `assets/${namn}.webm`, name: namn },
  duration: 20, skipOnNext: false, ersatt: 'battle-fx', prioritet: 'hog', ...o });

test('6: ett nytt battle-klipp ersätter det som spelar direkt, i stället för att vänta 20 s', async () => {
  const w = await overlay();
  const k = w.VyraActionRuntime;
  k.execute(bud(fx('tap')));
  await vanta(50);
  assert.equal(w.document.querySelectorAll('#vyraActionRuntime [data-ersatt="battle-fx"]').length, 1);
  k.execute(bud(fx('x3')));
  await vanta(50);
  assert.deepEqual(w.__spelat, ['tap', 'x3'], 'X3 väntade bakom Tap Tap');
  const kvar = [...w.document.querySelectorAll('#vyraActionRuntime [data-ersatt="battle-fx"] video')].map(v => v.getAttribute('src'));
  assert.deepEqual(kvar, ['assets/x3.webm'], 'det gamla klippet ligger kvar på skärmen');
});

test('7: en gåvoalert i kön påverkas inte, och spelar efter battle-klippet', async () => {
  const w = await overlay();
  const k = w.VyraActionRuntime;
  k.execute(bud(fx('tap', { duration: 1 })));
  const gava = bud(A('Gåva', { skipOnNext: false, duration: 1 }));
  k.execute(gava);
  k.execute(bud(fx('snipe', { duration: 1 })));
  await vanta(50);
  assert.deepEqual(w.__spelat, ['tap', 'snipe'], 'Snipe ska ersätta Tap Tap direkt');
  assert.deepEqual(w.__strypta, [], 'gåvan ska inte strypas av ett battle-klipp');
  await vanta(1200);
  assert.deepEqual(w.__spelat, ['tap', 'snipe', 'Gåva'], 'gåvoalerten ska spela efter battle-klippet');
});

test('8: väntande battle-klipp ur samma grupp städas bort, andra grupper rörs inte', async () => {
  const w = await overlay();
  const k = w.VyraActionRuntime;
  k.execute(bud(A('Gåva1', { skipOnNext: false, duration: 1 })));
  k.execute(bud(fx('tap', { duration: 1 })));
  k.execute(bud(fx('x2', { duration: 1 })));
  k.execute(bud(A('Gåva2', { skipOnNext: false, duration: 1 })));
  await vanta(2600);
  assert.deepEqual(w.__spelat, ['Gåva1', 'x2', 'Gåva2'], 'Tap Tap ska ha ersatts medan den väntade, gåvorna spelas båda');
});
