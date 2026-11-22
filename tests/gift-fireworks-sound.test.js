'use strict';
// Gift Fireworks fick ett ljud.
//
// Fram till nu var "Aktivera ljud" en DOD knapp: kryssrutan fanns i panelen och sparades pa
// widgeten, men ingenstans i kodbasen anropades Audio eller AudioContext for fyrverkerierna. Den
// var pa som standard, sa den lovade ett ljud som aldrig kom.
//
// Darfor byggdes ingen volymreglage nar panelen stalldes i niva med TIKTORY - en volym ovanpa en
// dod kryssruta hade blivit en andra dod knapp. Nu finns ljudet, och da hor volymen hemma.
//
// Uppspelningen foljer samma monster som sound-alerts.js redan anvander: new Audio(sokvag),
// currentTime = 0, play(), och ett fangat fel. play() returnerar ett lofte som webblasare AVVISAR
// nar autoplay ar blockerad - i editorn utan anvandargest, till exempel. Det far aldrig valta
// fyrverkeriet, som ar det som faktiskt syns.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
// TVA LJUD (David 2026-11-22): uppskjutning nar raketen lyfter, EN small nar den slar ut. Forr en fil
// pa 8,5 s med en hel serie smallar.
const UPP = 'assets/sounds/fyrverkeri/uppskjutning.mp3', SMALL = 'assets/sounds/fyrverkeri/small.mp3';

test.after(closeAll);

// jsdom implementerar inte HTMLMediaElement.play - den kastar "Not implemented". Audio stubbas
// darfor, och stubben registrerar allt som ar vart att mata: sokvag, volym och att play kordes.
const STUBB = `
  window.__ljud = [];
  window.Audio = function (src) {
    const a = { src, volume: 1, currentTime: 0, spelade: 0,
      play() { this.spelade += 1; return window.__playSvar ? window.__playSvar() : Promise.resolve() } };
    window.__ljud.push(a); return a;
  };
`;

function panel(extra = {}) {
  const w = Object.assign({ id: 'fw1', type: 'templateGiftFireworks', x: 10, y: 10, width: 360,
    title: 'Gift Fireworks', fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5,
    fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b',
    fwSound: true }, extra);
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets: [w], projectName: 'fwljud' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(STUBB);
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='fw1';view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return { h, run, d: h.document };
}

// ---- filen ---------------------------------------------------------------------------------------
test('ljudfilerna ligger i repot', () => {
  for (const LJUD of [UPP, SMALL]) {
    const p = path.join(ROOT, ...LJUD.split('/'));
    assert.ok(fs.existsSync(p), `${LJUD} saknas — kryssrutan skulle da lova ett ljud som inte finns`);
    assert.ok(fs.statSync(p).size > 10000, LJUD + ' ar misstankt liten');
  }
});

test('ljudets ursprung ar antecknat', () => {
  const p = path.join(ROOT, 'assets', 'sounds', 'fyrverkeri', 'ATTRIBUTION.md');

  assert.ok(fs.existsSync(p), 'ingen attribution — kallan till ett ljud som levereras publikt ' +
    'maste ga att sparas');
});

// ---- uppspelningen -------------------------------------------------------------------------------
test('ett fyrverkeri spelar uppskjutningen direkt och EN small nar raketen slar ut', async () => {
  const { h, run } = panel({ fwSound: true });
  run(`window.__entre = VyraFireworks.tiderFor(state.widgets[0], { combo: 2 }).entre;
       triggerGiftFireworks({ combo: 2, username: 'a', giftName: 'Rose' })`);
  const ljud = h.window.__ljud;

  assert.equal(ljud.length, 1, `${ljud.length} ljud direkt — bara uppskjutningen ska spela innan raketen slagit ut`);
  assert.match(ljud[0].src, /assets\/sounds\/fyrverkeri\/uppskjutning\.mp3/, `sokvagen var ${ljud[0].src}`);
  assert.equal(ljud[0].spelade, 1, 'play() anropades aldrig');
  assert.ok(h.window.__entre > 0, 'raketens fard saknas');
  await new Promise(r => setTimeout(r, h.window.__entre + 80));
  assert.equal(ljud.length, 2, `${ljud.length} ljud efter smallen`);
  assert.match(ljud[1].src, /assets\/sounds\/fyrverkeri\/small\.mp3/, `smallens sokvag var ${ljud[1].src}`);
  assert.equal(ljud[1].spelade, 1);
});

test('November: ljudet foljer sidans signal per raket, med sparr mot ett brus av samtidiga ljud', () => {
  const { h, run } = panel({ fwSound: true, fwTheme: 'november' });
  run(`triggerGiftFireworks({ combo: 3, username: 'a', giftName: 'Rose' })`);
  const ram = h.document.querySelector('[data-id="fw1"] .gift-fireworks-fx iframe');
  assert.ok(ram, 'November-ramen ritades inte');
  assert.equal(h.window.__ljud.length, 0, 'November spelar inget innan sidan i ramen sagt till');
  h.window.VyraFireworks.ljudSignal(ram, 'launch');
  h.window.VyraFireworks.ljudSignal(ram, 'launch');
  h.window.VyraFireworks.ljudSignal(ram, 'burst');
  const src = Array.from(h.window.__ljud, a => String(a.src).replace(/^.*\//, ''));
  assert.deepEqual(src, ['uppskjutning.mp3', 'small.mp3'], 'tva uppskjutningar inom 180 ms ska ge ett ljud: ' + src.join(', '));
  const sida = fs.readFileSync(path.join(ROOT, 'assets', 'gift-fireworks-november', 'widget.js'), 'utf8');
  assert.match(sida, /addEventListener\('firework-sound'[\s\S]*VyraFireworks\.ljudSignal\(frameElement, ev\.detail\)[\s\S]*effect\.launch/,
    'widget.js skickar inte sidans signal vidare, eller satter lyssnaren forst efter launch()');
});

test('ar ljudet avstangt spelas ingenting', () => {
  const { h, run } = panel({ fwSound: false });
  run(`triggerGiftFireworks({ combo: 2 })`);

  assert.equal(h.window.__ljud.length, 0, 'ljudet spelade trots att kryssrutan ar av');
});

test('blockeras fyrverkeriet av anonymfiltret spelas inget ljud heller', () => {
  const { h, run } = panel({ fwSound: true, fwExcludeAnon: true });
  run(`triggerGiftFireworks({ combo: 2, isAnonymous: true })`);

  assert.equal(h.window.__ljud.length, 0,
    'ett ljud spelade for en gava som filtrerades bort — tittarna hor nagot de inte ser');
});

// ---- volymen -------------------------------------------------------------------------------------
test('panelen har en volymreglage med nummerfalt, 0-100', () => {
  const { d } = panel();
  const r = d.querySelector('#fwVolume'), n = d.querySelector('#fwVolumeNum');

  assert.ok(r, 'volymreglaget saknas');
  assert.ok(n, 'volymens nummerfalt saknas');
  assert.equal(r.min, '0');
  assert.equal(r.max, '100');
});

test('volymen fran panelen anvands vid uppspelning', () => {
  const { h, run } = panel({ fwSound: true, fwVolume: 40 });
  run(`triggerGiftFireworks({ combo: 1 })`);

  assert.equal(h.window.__ljud[0].volume, 0.4,
    `volymen blev ${h.window.__ljud[0].volume} — panelen sa 40 av 100`);
});

test('volym 0 ar tyst men valter ingenting', () => {
  const { h, run } = panel({ fwSound: true, fwVolume: 0 });
  run(`window.__fel=null;try{triggerGiftFireworks({combo:1})}catch(e){window.__fel=e.message}`);

  assert.equal(h.window.__fel, null, 'volym 0 kastade');
  assert.ok(h.window.__ljud.every(a => a.volume === 0), 'ett ljud spelade med volym over 0');
});

test('utan satt volym anvands ett rimligt standardvarde', () => {
  const { h, run } = panel({ fwSound: true });
  run(`triggerGiftFireworks({ combo: 1 })`);
  const v = h.window.__ljud[0].volume;

  assert.ok(v > 0 && v <= 1, `standardvolymen blev ${v}`);
});

// ---- nar webblasaren sager nej ---------------------------------------------------------------------
test('ett avvisat play() valter inte fyrverkeriet', () => {
  // Webblasare avvisar play() nar autoplay ar blockerad. Animationen ar det som syns och far
  // aldrig falla for att ljudet inte fick spelas.
  const { h, run } = panel({ fwSound: true });
  run(`window.__playSvar = () => Promise.reject(new Error('NotAllowedError'));
       window.__fel = null;
       try { window.__svar = triggerGiftFireworks({ combo: 3 }) } catch (e) { window.__fel = e.message }`);

  assert.equal(h.window.__fel, null, `triggern kastade: ${h.window.__fel}`);
  assert.equal(h.window.__svar, true, 'triggern rapporterade misslyckande fast animationen kordes');
  assert.equal(h.window.state ? undefined : undefined, undefined);
});

test('ett avvisat play() ger ingen ohanterad avvisning', async () => {
  const { h, run } = panel({ fwSound: true });
  let ohanterad = null;
  h.window.addEventListener('unhandledrejection', e => { ohanterad = String(e.reason) });
  run(`window.__playSvar = () => Promise.reject(new Error('NotAllowedError'));
       triggerGiftFireworks({ combo: 1 })`);
  await new Promise(r => setTimeout(r, 50));

  assert.equal(ohanterad, null, `ohanterad avvisning: ${ohanterad}`);
});
