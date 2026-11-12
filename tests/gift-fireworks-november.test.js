'use strict';
// NOVEMBER-FYRVERKERIET (fwTheme 'november'): EN GAVA GER ETT FYRVERKERI, OCH HELA ANIMATIONEN HINNER SPELAS.
//
// EN EGEN DESIGN, INTE EN NY SUPERNOVA (David 2026-11-12: "Ja, egen design"). Forsta versionen satte en
// flagga pa varje ny Supernova. Da visade panelen fortfarande fargschema, typsnitt och palett, men den
// inbaddade sidan laser inget av dem. Sist i filen star proven som haller isar de tva.
//
// Davids krav 2026-11-11: "kontrollera att varje TikTok-gava ger exakt ett fyrverkeri och att hela
// animationen hinner spelas i OBS". November-versionen ritas av en inbaddad sida
// (assets/gift-fireworks-november/widget.html + app.js) som har SIN EGEN tidslinje:
//
//   raket k skjuts vid k x 0,085 s         (SPACING i app.js)
//   raketen flyger i 1,57 s                (ROCKET_TIME)
//   den stora gavan lever 4,6 s, eller 3,5 s i en megakombo pa 50 eller fler (heroes.max)
//   den stora gavan borjar synas 1,5 s in i sitt liv och ar fullt framme 0,4 s senare (HERO_AT)
//
// Forsta versionen gav 7 s + 0,085 s per raket. Det lamnade 0,9 s marginal, och den ats upp av tva
// saker som inte var inraknade: den inbaddade sidan ska laddas och vantar upp till 0,8 s pa
// gavobilden, och hela widgeten tonar ut de sista 0,6 s. Slutet kunde alltsa klippas.
//
// Talen nedan ar app.js egna. Andras de dar maste de andras har, och da faller provet med flit.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const ROT = path.join(__dirname, '..');
const SPACING = .085, ROCKET_TIME = 1.57, HERO_AT = 1.5, HERO_IN = .4;
const storLever = n => n >= 50 ? 3.5 : 4.6;
// Nar den inbaddade sidans egen animation ar helt slut, raknat fran att raketerna borjar skjutas.
const animationSlut = n => (n - 1) * SPACING + ROCKET_TIME + storLever(n);
// Nar den sista stora gavan ar fullt framme.
const storFramme = n => (n - 1) * SPACING + ROCKET_TIME + HERO_AT + HERO_IN;

const fw = (over = {}) => Object.assign({
  id: 'fw1', type: 'templateGiftFireworks', x: 36, y: 64, width: 360, title: 'Gift Fireworks · November',
  fwTheme: 'november', fwMin: 1, fwSound: false
}, over);

function boot(widgets = [fw()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  return h;
}
const ramar = h => [...h.document.querySelectorAll('.gift-fireworks-fx iframe')];

test('bilderna och den inbaddade sidan finns', () => {
  for (const fil of ['widget.html', 'widget.js', 'app.js', '0001_Rose.png'])
    assert.ok(fs.existsSync(path.join(ROT, 'assets/gift-fireworks-november', fil)), fil + ' saknas');
  const app = fs.readFileSync(path.join(ROT, 'assets/gift-fireworks-november/app.js'), 'utf8');
  // Tidslinjen som provet raknar med maste vara den app.js faktiskt har.
  assert.match(app, /SPACING=85\b/); assert.match(app, /ROCKET_TIME=1\.57\b/); assert.match(app, /HERO_AT=1\.5\b/);
  assert.match(app, /max:mega\?3\.5:4\.6/);
});

test('hela animationen hinner spelas: speltiden tacker uppstart, animation och uttoning', () => {
  const h = boot(), F = h.window.VyraFireworks;
  for (const n of [1, 2, 5, 10, 49, 50, 99, 100]) {
    const speltid = F.durationFor({ combo: n }) / 1000;
    // Uppstarten: sidan ska laddas och vantar hogst 0,8 s pa gavobilden. Uttoningen: widgeten tonar ut de sista 0,6 s.
    const behov = 1.0 + animationSlut(n) + 0.6;
    assert.ok(speltid >= behov - 1e-6, `antal ${n}: speltiden ${speltid.toFixed(2)} s racker inte till ${behov.toFixed(2)} s`);
    assert.ok(speltid <= behov + 0.5, `antal ${n}: speltiden ${speltid.toFixed(2)} s ar onodigt lang (behov ${behov.toFixed(2)} s)`);
  }
});

test('nasta fyrverkeri far starta nar den stora gavan ar framme, inte forst nar allt tonat ut', () => {
  const h = boot(), F = h.window.VyraFireworks;
  for (const n of [1, 10, 50, 100]) {
    const topp = F.releaseFor({ combo: n }) / 1000, speltid = F.durationFor({ combo: n }) / 1000;
    assert.ok(topp >= 1.0 + storFramme(n), `antal ${n}: nasta far inte starta innan den stora gavan ar framme`);
    assert.ok(topp < speltid, `antal ${n}: platsen ska bli ledig fore speltidens slut`);
  }
  // Utan detta tog varje gava drygt 7 s och kon hann bara cirka atta i minuten; aldre an 60 s spelas inte.
  assert.ok(F.releaseFor({ combo: 1 }) <= 5600, 'en enkel gava ska slappa sin plats inom 5,6 s');
});

test('en gava ger exakt ett fyrverkeri, och en streak ar EN gava med sitt antal', () => {
  const h = boot();
  assert.notEqual(h.window.triggerGiftFireworks({ id: 'g1', combo: 1, username: 'a', __test: true }), false);
  assert.equal(ramar(h).length, 1, 'en gava, en inbaddad sida');
  assert.equal(new URL(ramar(h)[0].src).searchParams.get('combo'), '1');
  // Samma gava in en gang till (tva vagar: sessionen och en egen Action) tander inte tva.
  h.window.triggerGiftFireworks({ id: 'g1', combo: 1, username: 'a', __test: true });
  assert.equal(ramar(h).length, 1, 'dubbletten far inte tanda ett andra fyrverkeri');
});

test('en streak pa fem ger ett fyrverkeri med fem raketer, inte fem fyrverkerier', () => {
  const h = boot();
  h.window.triggerGiftFireworks({ id: 's1', repeatcount: 5, username: 'a', __test: true });
  assert.equal(ramar(h).length, 1);
  assert.equal(new URL(ramar(h)[0].src).searchParams.get('combo'), '5');
});

test('antalet folja gavans antal, inte dess varde, och stannar vid 100', () => {
  const h = boot();
  h.window.triggerGiftFireworks({ id: 'v1', combo: 1, diamonds: 30000, username: 'a', __test: true });
  assert.equal(new URL(ramar(h)[0].src).searchParams.get('combo'), '1', 'en dyr gava ar fortfarande EN raket');
  const h2 = boot();
  h2.window.triggerGiftFireworks({ id: 'v2', combo: 400, username: 'a', __test: true });
  assert.equal(new URL(ramar(h2)[0].src).searchParams.get('combo'), '100');
});

test('gavans och avsandarens bilder skickas bara som http(s)-adresser', () => {
  const h = boot();
  h.window.triggerGiftFireworks({ id: 'b1', combo: 1, giftImage: 'https://example.com/g.png', profileImage: 'javascript:alert(1)', __test: true });
  const p = new URL(ramar(h)[0].src).searchParams;
  assert.equal(p.get('gift'), 'https://example.com/g.png');
  assert.equal(p.get('profile'), null, 'en osaker adress skickas inte vidare');
});

test('rutan ar staende som animationen (360 x 640), sa fyrverkeriet inte krymps', () => {
  const h = boot();
  const box = h.document.querySelector('[data-id="fw1"]');
  assert.match(box.getAttribute('style'), /height:640px/);
  // En Supernova behaller sin liggande ruta.
  const h2 = boot([fw({ fwTheme: 'supernova', fwNovaStyle: 'classic' })]);
  assert.match(h2.document.querySelector('[data-id="fw1"]').getAttribute('style'), /height:300px/);
});

// ---- EGEN DESIGN, BREDVID SUPERNOVA ------------------------------------------------------------------

test('katalognyckeln ger november-fyrverkeriet, och Supernova ar orord', () => {
  const h = boot(), V = h.window.VyraWidgets;
  const nov = V.create('catalog:giftfireworks:november');
  assert.equal(nov.type, 'templateGiftFireworks');
  assert.equal(nov.fwTheme, 'november');
  assert.equal(nov.title, 'Gift Fireworks · November');
  assert.equal(nov.width, 360);
  // Inga falt som den inbaddade sidan inte laser: de hade blivit reglage utan verkan.
  for (const falt of ['fwColor', 'fwColor2', 'fwFont', 'fwTextColor', 'fwNovember']) assert.equal(falt in nov, false, falt + ' ska inte finnas');
  const sn = V.create('catalog:giftfireworks:supernova');
  assert.equal(sn.fwTheme, 'supernova');
  assert.equal('fwNovember' in sn, false, 'en ny Supernova far inte bli november-versionen');
  assert.equal(sn.fwColor, '#ffd06b');
  // November ar inget av de sex dukstemana och star darfor inte i deras tabell.
  assert.equal(Object.hasOwn(V.variants('giftfireworks.theme'), 'november'), false);
});

test('en Supernova ritas av duksmotorn, aldrig av den inbaddade sidan', () => {
  // Aven en widget som hann sparas med den gamla flaggan ar en vanlig Supernova.
  const h = boot([fw({ fwTheme: 'supernova', fwNovaStyle: 'classic', fwNovember: true, fwColor: '#ffd06b', fwColor2: '#a764ff' })]);
  const anrop = [];
  h.window.VyraSupernova = { duration: () => 7, toppen: () => 3, mount: (...a) => anrop.push(a), preview() {}, dispose() {} };
  h.window.triggerGiftFireworks({ id: 'sn1', combo: 1, username: 'a', __test: true });
  assert.equal(ramar(h).length, 0, 'Supernova far inte badda in november-sidan');
  assert.equal(anrop.length, 1, 'Supernova ska ritas av duksmotorn');
});

test('stilen valjs med ett eget falt och bara bland de tre som animationen har', () => {
  const stil = w => { const h = boot([fw(w)]); h.window.triggerGiftFireworks({ id: 'st', combo: 1, __test: true }); return new URL(ramar(h)[0].src).searchParams.get('style'); };
  assert.equal(stil({}), 'classic');
  assert.equal(stil({ fwNovStil: 'prism' }), 'prism');
  assert.equal(stil({ fwNovStil: 'comet' }), 'comet');
  assert.equal(stil({ fwNovStil: 'finnsinte' }), 'classic');
  const app = fs.readFileSync(path.join(ROT, 'assets/gift-fireworks-november/app.js'), 'utf8');
  for (const s of ['classic', 'prism', 'comet']) assert.ok(app.includes(s + ":['#"), s + ' saknas i app.js paletter');
});

test('panelen visar bara det som gor nagot: inga farger, ingen palett, inget typsnitt, inget fargschema', () => {
  const h = boot();
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run("selected='fw1';window.__panel=props();");
  const panel = h.window.__panel;
  for (const id of ['fwNovStil', 'fwMin', 'fwExcludeAnon', 'fwSound', 'fwVolume', 'propX', 'propY', 'propWidth'])
    assert.match(panel, new RegExp('id="' + id + '"'), id + ' saknas i panelen');
  for (const id of ['fwColor', 'fwColor2', 'fwTextColor', 'fwFont', 'fwNameFx', 'fwFarger', 'fwFinal', 'fwLanes', 'fwCanvasTheme', 'fwPreset', 'inheritBrandKit'])
    assert.doesNotMatch(panel, new RegExp('id="' + id + '"'), id + ' gor ingenting for november-fyrverkeriet');
  assert.doesNotMatch(panel, /data-fw-theme-choice/, 'de sex dukstemana ska inte ga att valja har');
});

test('katalogen har ett eget kort for november, bredvid dukstemana', () => {
  const h = boot();
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run("document.querySelector('.editor-shell').insertAdjacentHTML('afterbegin','<div class=\"widget-catalog\"></div>');bind();");
  const kort = h.document.querySelector('[data-catalog-key="catalog:giftfireworks:november"]');
  assert.ok(kort, 'kortet saknas');
  // Kortet bar inte data-fw-theme: det ar markoren for de sex dukstemana.
  assert.equal(kort.hasAttribute('data-fw-theme'), false);
  assert.ok(h.document.querySelector('[data-catalog-key="catalog:giftfireworks:supernova"]'), 'Supernovas kort ska finnas kvar');
  run("state.widgets.length=0;document.querySelector('[data-catalog-key=\"catalog:giftfireworks:november\"]').click();window.__ny=state.widgets[state.widgets.length-1];");
  assert.equal(h.window.__ny.fwTheme, 'november');
});
