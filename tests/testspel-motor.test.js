'use strict';
// TESTMOTORN (vyra-testspel.js) mot den riktiga render/bind-kedjan i jsdom, med TESTADAPTRAR.
//
// Inga familjer registreras i PR 2, så i studion syns ingen knapp. Här registreras adaptrar inne i
// provet och motorn måste garantera kraven för ▶ Testa widget (panelspecifikationen 2.1–2.6):
//   * spelningen sker på en KLON (egen nod, kopia av widgeten, aldrig i state),
//   * hela förloppet entré → visning → utgång, ■ Stoppa och omspelning med samma förlopp,
//   * render(), byte av vald widget och Esc stoppar testet först,
//   * inget fetch, VyraLive.send, VyraAuth.api eller save(), och VyraAlertQueue är orörd —
//     även när adaptern FÖRSÖKER (då stoppas testet och state återställs),
//   * den riktiga noden, grannwidgetarna och state är tecken för tecken desamma efteråt,
//   * ingenting alls i overlayläget,
//   * knappen visas bara när registerposten pekar på en registrerad adapter.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);
const vanta = (ms = 30) => new Promise(r => setTimeout(r, ms));
const vantaTills = async (fn, max = 3000) => { for (let t = 0; t < max && !fn(); t += 20) await vanta(20); };

const post = testId => `({
  typ: 'templateHeartGoal',
  modell: w => w.heartTheme || 'classic',
  galler: ['classic'],
  test: ${JSON.stringify(testId)},
  kontroller: [
    { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#heartTitle' },
  ],
})`;

// En snäll adapter: rör bara klonen och använder bara ctl för det som ska hända senare.
const SNALL = ({ entre = 40, visning = 40, utgang = 40 } = {}) => `{
  spela(nod, k, ex, ctl) {
    __logg.push({ steg: 'spela', klon: nod.dataset.testspelKlon, nodId: nod.dataset.id, kId: k.id,
      arW: k === state.widgets.find(x => x.id === 'w1'), iState: state.widgets.some(x => x.id === k.id),
      iDom: nod.isConnected, namn: ex.namn, profil: ex.bildnamn(ex.profil), fryst: Object.isFrozen(ex), typ: ctl.typ });
    nod.classList.add('prov-spelar');
    nod.dataset.steg = 'entre';
    k.templateTitle = 'ÄNDRAD PÅ KLONEN';
    ctl.setTimeout(() => { nod.dataset.steg = 'visning'; __logg.push({ steg: 'timer' }); }, ${entre});
    ctl.raf(() => __logg.push({ steg: 'raf' }));
    return { entre: ${entre}, visning: ${visning}, utgang: ${utgang} };
  },
  stoppa(nod, k) { __logg.push({ steg: 'stoppa', kId: k.id }); nod.classList.remove('prov-spelar'); },
}`;

function studio({ url, testId = 'prov', adapter = SNALL(), registrera = true } = {}) {
  const h = createDom({ url, state: { widgets: [], projectName: 'testspel' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s); };
  run(`window.__fel = []; window.addEventListener('error', e => __fel.push(String(e.message)));
       window.__logg = []; window.__anrop = [];
       localStorage.removeItem('vyra-panelram');`);
  h.load('overlay-sanitize.js');
  h.load('vyra-exempeldata.js');
  h.load('vyra-panelregister.js');
  h.load('vyra-panelram.js');
  h.load('vyra-testspel.js');
  h.load('vyra-panelordning.js');
  h.load('runtime-controls.js');                    // den riktiga VyraAlertQueue
  // Spioner på de vägar som når sändningen, servern eller lagringen. De läggs på FÖRE ett test, så
  // motorns vakter hamnar utanpå: ett blockerat anrop når aldrig spionen.
  run(`
    window.fetch = function () { __anrop.push('fetch'); return Promise.resolve({ ok: true, json: () => ({}) }); };
    window.VyraLive = { send() { __anrop.push('VyraLive.send'); }, ingest() { __anrop.push('VyraLive.ingest'); } };
    window.VyraAuth = { api() { __anrop.push('VyraAuth.api'); return Promise.resolve({}); } };
    const skriv = VyraSessionState.writeActive;
    VyraSessionState.writeActive = function () { __anrop.push('save'); return skriv.apply(this, arguments); };
    const kö = VyraAlertQueue.push;
    VyraAlertQueue.push = function () { __anrop.push('VyraAlertQueue.push'); return kö.apply(this, arguments); };
    if (${JSON.stringify(testId)}) window.__post = VyraPanelregister.definiera(${post(testId)});
    ${registrera && testId ? `VyraTestspel.registrera(${JSON.stringify(testId)}, ${adapter});` : ''}
    const a = VyraWidgets.create('catalog:heartgoal:classic'); a.id = 'w1'; a.x = 10; a.y = 20;
    const b = VyraWidgets.create('catalog:heartgoal:classic'); b.id = 'w2'; b.x = 400; b.y = 20;
    const c = VyraWidgets.create('catalog:toplike:voltage'); c.id = 'w3'; c.x = 10; c.y = 400;
    const d = VyraWidgets.create('catalog:socialgoal:followers:crown-rail:landscape'); d.id = 'w4'; d.x = 400; d.y = 400;
    state.widgets.push(a, b, c, d); selected = 'w1'; view = 'editor'; render();`);
  h.run = run;
  h.$ = sel => h.document.querySelector(sel);
  h.T = () => h.window.VyraTestspel;
  h.w = id => h.window.eval(`state.widgets.find(x => x.id === ${JSON.stringify(id)})`);
  h.nod = id => h.$(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  h.klon = () => h.$('.canvas [data-testspel-klon]');
  h.state = () => h.window.eval('JSON.stringify(state)');
  h.ytor = () => ['w1', 'w2', 'w3', 'w4'].map(id => h.nod(id) && h.nod(id).outerHTML);
  h.dold = () => !!h.$('style[data-testspel-dolj="w1"]');
  h.logg = () => Array.from(h.window.__logg, x => x.steg);
  h.anrop = () => Array.from(h.window.__anrop);
  return h;
}

test('knappen visas bara när registerposten pekar på en registrerad adapter', async () => {
  // Post med test-id men ingen adapter: ingen knapp och ingen sektion 1.
  const utan = studio({ registrera: false });
  await vanta();
  assert.equal(utan.$('#pr-testspel'), null, 'knappen får inte visas utan adapter');
  assert.equal(utan.$('[data-panelram-sektion="1"]'), null, 'en tom sektion 1 får inte byggas');
  assert.equal(utan.T().kan(utan.w('w1')), false);
  assert.equal(utan.T().spela(utan.w('w1')), false);
  // Registreras adaptern dyker knappen upp vid nästa render.
  utan.run(`VyraTestspel.registrera('prov', ${SNALL()}); render();`);
  await vanta();
  const knapp = utan.$('[data-panelram-sektion="1"] #pr-testspel');
  assert.ok(knapp, 'knappen ska ligga i sektion 1');
  assert.equal(knapp.textContent, '▶ Testa widget');
  assert.equal(utan.$('[data-panelram-sektion="1"] .pr-tidslinje').textContent, 'EntréVisningUtgång');

  // En widget utan post (Top Like) får ingen knapp; inte heller en post utan test.
  const h = studio();
  await vanta();
  h.run(`selected = 'w3'; render();`);
  await vanta();
  assert.equal(h.$('#pr-testspel'), null);
  const ingen = studio({ testId: null });
  await vanta();
  assert.equal(ingen.$('#pr-testspel'), null);
  assert.equal(ingen.T().kan(ingen.w('w1')), false);
  assert.equal(ingen.window.__fel.length + utan.window.__fel.length + h.window.__fel.length, 0);
});

test('spelar på en klon: hela förloppet, och allt är som förut efteråt', async () => {
  const h = studio();
  await vanta();
  const fore = { ytor: h.ytor(), state: h.state(), ko: h.window.eval('JSON.stringify(VyraAlertQueue.stats())') };

  h.$('#pr-testspel').click();
  const k = h.klon();
  assert.ok(k, 'klonen ska finnas i duken');
  assert.equal(k.dataset.id, 'w1__prov');
  assert.equal(k.previousElementSibling, h.nod('w1'), 'klonen ligger som syskon direkt efter den riktiga noden');
  assert.equal(k.style.left, h.nod('w1').style.left);
  assert.equal(k.style.top, h.nod('w1').style.top);
  assert.equal(k.style.pointerEvents, 'none');
  assert.ok(k.classList.contains('prov-spelar'));
  assert.ok(h.dold(), 'den riktiga noden ska vara gömd under testet');
  assert.equal(h.$('#pr-testspel').textContent, '■ Stoppa test');
  const s = h.window.__logg[0];
  assert.deepEqual([s.klon, s.nodId, s.kId, s.arW, s.iState, s.iDom], ['1', 'w1__prov', 'w1__prov', false, false, true]);
  assert.equal(s.namn, 'Alex');
  assert.equal(s.profil, 'Exempelprofil', 'bildens namn, aldrig sökvägen');
  assert.ok(s.fryst, 'exempeldatan ska vara fryst');
  assert.equal(h.w('w1').templateTitle, h.window.VyraWidgets.create('catalog:heartgoal:classic').templateTitle,
    'en ändring på klonen får inte nå widgeten');

  const st = h.T().status();
  assert.equal(st.aktiv, true);
  assert.equal(st.fas, 'entre');
  assert.deepEqual({ ...st.faser }, { entre: 40, visning: 40, utgang: 40 });
  assert.equal(h.$('.pr-tidslinje li[aria-current]').dataset.fas, 'entre');
  // Klart av sig självt, efter alla tre faserna i ordning. Väntan pollar i stället för att gissa
  // tider, så provet håller även när sviten körs parallellt.
  await vantaTills(() => !h.T().status().aktiv);
  assert.equal(h.T().status().aktiv, false, 'testet ska ta slut av sig självt');
  assert.deepEqual(Array.from(h.T().status().senaste.forlopp), ['entre', 'visning', 'utgang']);
  assert.equal(h.T().status().senaste.orsak, 'klar');
  assert.equal(h.klon(), null, 'klonen ska vara borta');
  assert.ok(!h.dold(), 'den riktiga noden ska synas igen');
  assert.equal(h.$('#pr-testspel').textContent, '▶ Testa widget');
  assert.deepEqual(h.logg(), ['spela', 'raf', 'timer', 'stoppa']);

  assert.deepEqual(h.ytor(), fore.ytor, 'den riktiga noden och grannarna ska vara byte-identiska');
  assert.equal(h.state(), fore.state, 'state ska vara byte-identisk');
  assert.equal(h.window.eval('JSON.stringify(VyraAlertQueue.stats())'), fore.ko, 'VyraAlertQueue ska vara orörd');
  assert.deepEqual(h.anrop(), [], 'inget fetch, VyraLive, VyraAuth, save eller kö');
  assert.equal(h.T().brott().length, 0);
  assert.equal(h.window.__fel.length, 0, h.window.__fel.join(' | '));
});

test('■ Stoppa avbryter direkt, och omspelning ger samma förlopp', async () => {
  const h = studio({ adapter: SNALL({ entre: 300, visning: 300, utgang: 300 }) });
  await vanta();
  const fore = { ytor: h.ytor(), state: h.state() };
  h.$('#pr-testspel').click();
  const forsta = { ...h.T().status().faser };
  const ex1 = h.window.__logg[0];
  h.$('#pr-testspel').click();                       // ■ Stoppa test
  assert.equal(h.T().status().aktiv, false);
  assert.equal(h.T().status().senaste.orsak, 'knapp');
  assert.equal(h.klon(), null);
  assert.ok(!h.dold());
  assert.equal(h.$('#pr-testspel').textContent, '▶ Testa widget');
  await vanta(350);
  assert.ok(!h.logg().includes('timer'), 'en ctl-timer får inte gå efter ■');

  h.window.__logg.length = 0;
  h.$('#pr-testspel').click();                       // ▶ igen
  assert.equal(h.T().status().aktiv, true);
  assert.deepEqual({ ...h.T().status().faser }, forsta, 'samma faser andra gången');
  const ex2 = h.window.__logg[0];
  assert.deepEqual({ ...ex2 }, { ...ex1 }, 'samma exempeldata och samma klon andra gången');
  h.T().stoppa();
  assert.deepEqual(h.ytor(), fore.ytor);
  assert.equal(h.state(), fore.state);
  assert.deepEqual(h.anrop(), []);
});

test('render(), byte av vald widget och Esc stoppar testet', async () => {
  const h = studio({ adapter: SNALL({ entre: 500, visning: 500, utgang: 500 }) });
  await vanta();
  const fore = { ytor: h.ytor(), state: h.state() };

  h.$('#pr-testspel').click();
  assert.ok(h.klon());
  h.run('render()');
  assert.equal(h.T().status().aktiv, false);
  assert.equal(h.T().status().senaste.orsak, 'render');
  assert.equal(h.klon(), null, 'render() mitt i testet ska ta bort klonen');
  assert.ok(!h.dold());
  assert.ok(h.logg().includes('stoppa'), 'adapterns stoppa ska ha körts');
  await vanta();

  // Byte av vald widget utan render (selected-vakten).
  h.$('#pr-testspel').click();
  assert.ok(h.klon());
  h.run(`selected = 'w2';`);
  await vantaTills(() => !h.T().status().aktiv);
  assert.equal(h.T().status().aktiv, false);
  assert.equal(h.T().status().senaste.orsak, 'val');
  assert.equal(h.klon(), null);
  h.run(`selected = 'w1'; render();`);
  await vanta();

  // Esc.
  h.$('#pr-testspel').click();
  h.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(h.T().status().senaste.orsak, 'esc');
  assert.equal(h.klon(), null);

  // Vybyte.
  h.$('#pr-testspel').click();
  h.run(`go('settings')`);
  assert.equal(h.T().status().aktiv, false);
  assert.equal(h.klon(), null);
  h.run(`go('editor')`);
  await vanta();

  // Bara VALD widget kan spelas.
  assert.equal(h.T().spela(h.w('w2')), false);
  assert.deepEqual(h.ytor(), fore.ytor);
  assert.equal(h.state(), fore.state);
  assert.deepEqual(h.anrop(), []);
});

// En adapter som försöker allt som är förbjudet, och sväljer felen själv.
const OND = `{
  spela(nod, k, ex, ctl) {
    const forsok = (namn, fn) => { try { fn(); __logg.push({ steg: namn + ':gick' }); } catch (e) { __logg.push({ steg: namn + ':stoppad' }); } };
    forsok('fetch', () => fetch('/api/events', { method: 'POST' }));
    forsok('live', () => VyraLive.send({ type: 'gift' }));
    forsok('auth', () => VyraAuth.api('/api/x'));
    forsok('save', () => save());
    forsok('ko', () => VyraAlertQueue.push(() => {}, 6000, 10));
    forsok('lagring', () => localStorage.setItem('vyra-ond', '1'));
    forsok('render', () => render());
    state.widgets[1].x = 999;
    state.widgets[2].likeCount = 0;
    state.widgets.push(k);
    state.ondNyckel = true;
    return { entre: 50, visning: 50, utgang: 50 };
  },
  stoppa() { __logg.push({ steg: 'stoppa' }); },
}`;

test('en adapter som försöker nå sändningen, servern eller state stoppas och ingenting når fram', async () => {
  const h = studio({ adapter: OND });
  await vanta();
  const fore = { ytor: h.ytor(), state: h.state(), ko: h.window.eval('JSON.stringify(VyraAlertQueue.stats())') };
  const stall = h.$('.properties');
  h.run(`console.error = () => {}; window.toast = () => {};`);

  h.$('#pr-testspel').click();
  assert.deepEqual(h.logg(), ['fetch:stoppad', 'live:stoppad', 'auth:stoppad', 'save:stoppad', 'ko:stoppad',
    'lagring:stoppad', 'render:stoppad', 'stoppa'], 'varje förbjuden väg ska kasta i testläget');
  assert.equal(h.T().status().aktiv, false, 'testet ska ha stoppats');
  assert.equal(h.T().status().senaste.orsak, 'brott');
  const vagar = Array.from(h.T().brott(), b => b.vag);
  for (const v of ['fetch', 'VyraLive.send', 'VyraAuth.api', 'VyraAlertQueue.push', 'Storage.setItem', 'render'])
    assert.ok(vagar.includes(v), 'brottet ska loggas: ' + v + ' (' + vagar.join(', ') + ')');
  // save() är const i studio.js; den fångas på sin första väg (historiken om den är laddad, annars skrivningen).
  assert.ok(vagar.includes('VyraHistorik.notera') || vagar.includes('VyraSessionState.writeActive'), 'save() ska loggas');
  assert.ok(vagar.some(v => /^state \(/.test(v)), 'ändringen i state ska loggas');

  assert.deepEqual(h.anrop(), [], 'inget anrop får nå fetch, VyraLive, VyraAuth, save eller kön');
  assert.equal(h.state(), fore.state, 'state ska vara återställd, byte för byte');
  assert.equal(h.window.eval('JSON.stringify(VyraAlertQueue.stats())'), fore.ko);
  assert.equal(h.window.eval(`localStorage.getItem('vyra-ond')`), null);
  assert.deepEqual(h.ytor(), fore.ytor);
  assert.equal(h.klon(), null);
  assert.equal(h.$('.properties'), stall, 'adapterns render() får inte ha ritat om');

  // Efter testet är vakterna borta: vanliga anrop går igenom igen.
  h.run(`fetch('/api/status'); VyraLive.send({}); save();`);
  assert.deepEqual(h.anrop(), ['fetch', 'VyraLive.send', 'save']);
});

test('vakterna gäller även det adaptern gör senare via ctl', async () => {
  const h = studio({ adapter: `{
    spela(nod, k, ex, ctl) {
      ctl.setTimeout(() => { try { fetch('/x'); } catch (_) {} state.widgets[0].y = 5; }, 20);
      return { entre: 200, visning: 200, utgang: 200 };
    },
    stoppa() {},
  }` });
  await vanta();
  const fore = { ytor: h.ytor(), state: h.state() };
  h.run(`console.error = () => {}; window.toast = () => {};`);
  h.$('#pr-testspel').click();
  assert.equal(h.T().status().aktiv, true);
  await vantaTills(() => !h.T().status().aktiv);
  assert.equal(h.T().status().aktiv, false);
  assert.equal(h.T().status().senaste.orsak, 'brott');
  assert.deepEqual(h.anrop(), []);
  assert.equal(h.state(), fore.state);
  assert.deepEqual(h.ytor(), fore.ytor);
});

test('en riktig händelse mitt i ett test går igenom som vanligt', async () => {
  const h = studio({ adapter: SNALL({ entre: 300, visning: 300, utgang: 300 }) });
  await vanta();
  h.$('#pr-testspel').click();
  assert.equal(h.T().status().aktiv, true);
  // Utanför adaptern är vakterna genomsläppliga: livevägen och sparandet påverkas inte av testet.
  h.run(`VyraLive.send({ type: 'gift' }); fetch('/api/status'); save();`);
  assert.deepEqual(h.anrop(), ['VyraLive.send', 'fetch', 'save']);
  assert.equal(h.T().status().aktiv, true);
  assert.equal(h.T().brott().length, 0);
  h.T().stoppa();
});

test('adapterformatet: async och Promise avvisas, felaktiga faser stoppar', async () => {
  const h = studio({ registrera: false });
  await vanta();
  h.run(`console.error = () => {};`);
  const kastar = src => { h.run(`try { ${src}; window.__r = 'ok'; } catch (e) { window.__r = e.message; }`); return h.window.__r; };
  assert.match(kastar(`VyraTestspel.registrera('a', { async spela() {}, stoppa() {} })`), /async/);
  assert.match(kastar(`VyraTestspel.registrera('b', { spela() {} })`), /stoppa/);
  assert.match(kastar(`VyraTestspel.registrera('c', { spela() {}, stoppa() {}, typer: ['x'] })`), /typer/);
  assert.equal(kastar(`VyraTestspel.registrera('prov', { spela: () => Promise.resolve({ entre: 1, visning: 1, utgang: 1 }), stoppa() {} })`), 'ok');
  assert.match(kastar(`VyraTestspel.registrera('prov', { spela() {}, stoppa() {} })`), /redan/);
  h.run('render()');
  await vanta();
  assert.equal(h.T().spela(h.w('w1')), false, 'ett Promise från spela ska avvisas');
  assert.equal(h.klon(), null);
  assert.ok(!h.dold());
});

test('typväljaren: en enda, i minnet, och skickas som ctl.typ', async () => {
  const h = studio({ adapter: `{
    typer: [['gava', 'Gåva'], ['like', 'Like']],
    spela(nod, k, ex, ctl) { __logg.push({ steg: ctl.typ + '/' + ex.typ }); return { entre: 300, visning: 1, utgang: 1 }; },
    stoppa() {},
  }` });
  await vanta();
  const fore = h.state();
  const val = h.$('[data-panelram-sektion="1"] #pr-testspel-typ');
  assert.ok(val);
  assert.equal(h.document.querySelectorAll('#pr-testspel-typ').length, 1);
  h.$('#pr-testspel').click();
  val.value = 'like';
  val.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.equal(h.T().status().aktiv, false, 'byte av typ stoppar ett pågående test');
  h.$('#pr-testspel').click();
  h.T().stoppa();
  assert.deepEqual(h.logg(), ['gava/gava', 'like/like']);
  assert.equal(h.state(), fore, 'typvalet sparas inte i state');
  assert.deepEqual(h.anrop(), []);
});

test('overlayläget: ingen knapp, och spela gör ingenting', async () => {
  const h = studio({ url: 'https://vyralive.app/studio.html?overlay=1' });
  await vanta();
  const fore = { state: h.state(), html: h.$('#view').innerHTML };
  assert.equal(h.$('#pr-testspel'), null);
  assert.equal(h.T().kan(h.w('w1')), false);
  assert.equal(h.T().spela(h.w('w1')), false);
  assert.equal(h.klon(), null);
  assert.equal(h.$('style[data-testspel-dolj]'), null);
  assert.deepEqual(h.logg(), [], 'adaptern får aldrig köras i overlay');
  assert.equal(h.state(), fore.state);
  assert.equal(h.$('#view').innerHTML, fore.html);
  assert.deepEqual(h.anrop(), []);
});

test('exempeldatan är deterministisk, fryst och visar aldrig sökvägar', () => {
  const h = studio({ testId: null });
  const E = h.window.VyraExempeldata;
  const a = E.hamta('x'), b = E.hamta('x');
  assert.notEqual(a, b, 'varje anrop ger en ny kopia');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.personer[0]));
  assert.deepEqual(Array.from(a.personer, p => p.namn), ['Alex', 'Mia', 'Leo', 'Sara', 'Zoe']);
  assert.doesNotMatch(JSON.stringify(a), /assets\/|\.png|\.svg/, 'datan bär bildnycklar, inte sökvägar');
  assert.match(a.bild(a.profil), /^assets\//);
  assert.equal(a.bildnamn('rose'), 'Rose');
  for (const nyckel of ['profil', 'rose', 'lion', 'crown', 'cap', 'gava'])
    assert.ok(fs.existsSync(path.join(__dirname, '..', E.bild(nyckel))), 'reservbilden saknas: ' + nyckel);
});

test('studio.html laddar exempeldata, register, ram, motor och panelordning i beroendeordning', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'studio.html'), 'utf8');
  const plats = fil => {
    const m = html.match(new RegExp(`<script src="${fil.replace('.', '\\.')}\\?v=(\\d{8}-\\d+)"></script>`));
    assert.ok(m, fil + ' saknas eller har ingen cachebust i formatet datum-siffra');
    return html.indexOf(m[0]);
  };
  const ordning = ['vyra-exempeldata.js', 'vyra-panelregister.js', 'vyra-panelram.js', 'vyra-testspel.js', 'vyra-panelordning.js'].map(plats);
  assert.deepEqual([...ordning].sort((x, y) => x - y), ordning, 'fel laddordning');
  // Motorn kallar VyraPanelram.tillagg vid laddning, och panelordningens bind ska ligga ytterst.
  assert.doesNotMatch(html, /vyra-(testspel|exempeldata)\.js\?v=[^"]*[a-z]{4,}/i, 'inga familjenamn i ?v=');
});
