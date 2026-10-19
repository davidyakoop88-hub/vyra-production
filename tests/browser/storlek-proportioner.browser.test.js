'use strict';
// STORLEK OCH PROPORTIONER I RIKTIG CHROME (2026-10-18).
//
// Granskningen 2026-10-18 mätte i webbläsaren att ett låst Top Like Voltage blev
// matrix(1,0,0,0.8,0,0) av underhandtaget, och att Davids Guardian i sändningen hade scaleY(0.3).
// Rotorsaken var gemensam: widget-handles.js skrev w.widgetScaleY utan att se på låset, och
// vyra-rotation.js ritade den som transform:scaleY — även i overlayn.
//
// Det här provet mäter det som jsdom inte kan: riktig layout, riktiga pekarhändelser och den
// riktiga overlay-vägen (overlay.html?access= med state från /api/overlay-access, som en sändning).
// Logiken för alla 220 katalognycklar provas i tests/storlek-likformig.test.js och migreringens
// regel i tests/storlek-migrering.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg' };

// En server som också svarar som molnets overlay-access, så att den separata overlayn får sitt
// state precis som i en sändning. `overlays` byts per prov.
const TOKEN = 'provtoken-storlek-aldrig-i-produktion';
let overlayState = { widgets: [] };
function servera() {
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === '/api/overlay-access/' + TOKEN) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, overlay: { id: 'OV-STORLEK', version: 1, state: overlayState } })); return;
    }
    if (u === '/api/overlay-access/' + TOKEN + '/events/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write(': oppen\n\n'); return;
    }
    if (u.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const fil = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function oppnaEditorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  return page;
}

// Lägger EN widget ur katalogen i Layout, vald, och fryser koreografin (se widget-handtag-provet:
// geometri får inte mätas mitt i en animation).
async function lagg(page, nyckel, props = {}) {
  const id = await page.evaluate(([k, p]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(k);
    Object.assign(w, { x: 60, y: 90 }, p);
    state.widgets.push(w);
    selected = w.id;
    render();
    return w.id;
  }, [nyckel, props]);
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const widget = document.querySelector('.widget.selected');
    if (!widget) return;
    const andliga = widget.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming?.().iterations !== Infinity);
    await Promise.all(andliga.map(a => a.finished.catch(() => {})));
    for (const a of widget.getAnimations({ subtree: true })) a.pause();
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return id;
}

const mat = (page, id) => page.evaluate(i => {
  const el = document.querySelector(`.canvas [data-id="${i}"]`);
  const w = state.widgets.find(x => x.id === i);
  const r = el.getBoundingClientRect();
  return { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height,
    mx: r.left + r.width / 2, my: r.top + r.height / 2, transform: getComputedStyle(el).transform,
    w: JSON.parse(JSON.stringify(w)) };
}, id);

// matrix(a,b,c,d): skalan per axel ur kolumnernas längd. 'none' = ingen transform alls.
function skalor(t) {
  const m = /matrix\(([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)/.exec(t || '');
  if (!m) return { sx: 1, sy: 1 };
  const [a, b, c, d] = m.slice(1).map(Number);
  return { sx: Math.hypot(a, b), sy: Math.hypot(c, d) };
}

async function dra(page, riktning, dx, dy) {
  const h = await page.evaluate(r => {
    const e = document.querySelector(`.widget.selected [data-vyra-handle="${r}"]`);
    if (!e) return null;
    // Greppa handtagets INRE halva: egen bild/video/text har overflow:hidden, och handtagen sitter
    // till halva utanför kanten — den yttre halvan är bortklippt och tar inte emot pekaren.
    const b = e.getBoundingClientRect(), w = e.closest('.widget').getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const ix = Math.sign((w.left + w.width / 2) - x) * Math.min(3, b.width / 3);
    const iy = Math.sign((w.top + w.height / 2) - y) * Math.min(3, b.height / 3);
    return { x: x + ix, y: y + iy };
  }, riktning);
  assert.ok(h, `handtaget ${riktning} saknas`);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + dx / 2, h.y + dy / 2, { steps: 4 });
  await page.mouse.move(h.x + dx, h.y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const UT = { n: [0, -50], s: [0, 50], e: [50, 0], w: [-50, 0], ne: [50, -50], nw: [-50, -50], se: [50, 50], sw: [-50, 50] };
const ANKARE = {   // [x-kant, y-kant] som ska stå still: v/h/m = vänster/höger/mitt, o/u/m = över/under/mitt
  n: ['mx', 'u'], s: ['mx', 'o'], e: ['v', 'my'], w: ['h', 'my'],
  ne: ['v', 'u'], nw: ['h', 'u'], se: ['v', 'o'], sw: ['h', 'o'] };

test('Top Like Voltage med låset PÅ: underhandtaget ger ingen scaleY, formen står kvar', { skip, timeout: 120000 }, async () => {
  const page = await oppnaEditorn();
  try {
    const id = await lagg(page, 'catalog:toplike:voltage', { aspectLocked: true });
    const fore = await mat(page, id);
    await dra(page, 's', 0, 60);
    const efter = await mat(page, id);
    assert.equal('widgetScaleY' in efter.w, false, `widgetScaleY skrevs: ${efter.w.widgetScaleY}`);
    const { sx, sy } = skalor(efter.transform);
    assert.ok(Math.abs(sx - sy) < 0.001, `roten fick skilda skalor: ${efter.transform}`);
    assert.ok(efter.w.widgetScale > (fore.w.widgetScale || 1) + 0.1, `skalan växte inte: ${efter.w.widgetScale}`);
    const kvotFore = fore.bredd / fore.hojd, kvotEfter = efter.bredd / efter.hojd;
    assert.ok(Math.abs(kvotEfter / kvotFore - 1) < 0.02, `formen ändrades: ${kvotFore.toFixed(3)} -> ${kvotEfter.toFixed(3)}`);
    assert.ok(efter.hojd > fore.hojd + 30, `höjden växte inte: ${fore.hojd} -> ${efter.hojd}`);
    assert.ok(Math.abs(efter.o - fore.o) <= 3, `överkanten flyttade sig ${Math.round(efter.o - fore.o)} px`);
    assert.ok(Math.abs(efter.mx - fore.mx) <= 3, `mitten flyttade sig i sidled ${Math.round(efter.mx - fore.mx)} px`);
  } finally { await page.close() }
});

test('alla åtta handtag, låst och olåst: formen står kvar och motsatt kant står still', { skip, timeout: 240000 }, async () => {
  const page = await oppnaEditorn();
  const fel = [];
  try {
    // Guardian (400 x 480) står på skala 0.6 så att även underhandtagen ligger inom fönstret.
    for (const [nyckel, extra] of [['catalog:toplike:voltage', { x: 120, y: 160 }], ['catalog:guardianemblem:4', { x: 120, y: 120, widgetScale: 0.6 }]]) {
      for (const las of [true, false]) {
        for (const r of Object.keys(UT)) {
          const id = await lagg(page, nyckel, { aspectLocked: las, ...extra });
          const fore = await mat(page, id);
          await dra(page, r, ...UT[r]);
          const efter = await mat(page, id);
          const namn = `${nyckel} ${r} ${las ? 'låst' : 'olåst'}`;
          if ('widgetScaleY' in efter.w) fel.push(`${namn}: widgetScaleY ${efter.w.widgetScaleY}`);
          const { sx, sy } = skalor(efter.transform);
          if (Math.abs(sx - sy) > 0.001) fel.push(`${namn}: transform ${efter.transform}`);
          if (efter.w.width !== fore.w.width) fel.push(`${namn}: bredden ${fore.w.width} -> ${efter.w.width}`);
          const k0 = fore.bredd / fore.hojd, k1 = efter.bredd / efter.hojd;
          if (Math.abs(k1 / k0 - 1) > 0.02) fel.push(`${namn}: formen ${k0.toFixed(3)} -> ${k1.toFixed(3)}`);
          if (!(efter.bredd > fore.bredd + 10)) fel.push(`${namn}: växte inte (${fore.bredd} -> ${efter.bredd})`);
          for (const kant of ANKARE[r]) {
            if (Math.abs(efter[kant] - fore[kant]) > 3) fel.push(`${namn}: ${kant} flyttade sig ${Math.round(efter[kant] - fore[kant])} px`);
          }
        }
      }
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('Storlek (widgetScale) skalar varje katalogmodell likformigt i Layout', { skip, timeout: 600000 }, async () => {
  // Uppmätt före ändringen: 47 av 220 nycklar ritade ingen skala alls (Gift Fireworks, Heart
  // Fireworks, Gift Bubbles, Goal Pro, Podium Pro, Streak Pro) — hörnhandtaget ändrade värdet utan
  // att något syntes efter render. Egen text/media bär riktiga mått och får ingen skala.
  const page = await oppnaEditorn();
  // Animationerna stängs av: flera designer skalar eller vänder roten i sin koreografi, och då
  // mäter två bilder olika faser i stället för olika storlekar.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  const fel = [];
  let provade = 0;
  try {
    for (const nyckel of kravNycklar()) {
      const r = await page.evaluate(async k => {
        const vanta = () => new Promise(res => setTimeout(res, 120));
        const box = () => { const el = document.querySelector('.canvas [data-id="sk1"]'); if (!el) return null; const b = el.getBoundingClientRect(); return { b: b.width, h: b.height }; };
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(k);
        w.id = 'sk1'; w.x = 20; w.y = 20;
        state.widgets.push(w); selected = null; render(); await vanta();
        const a = box();
        w.widgetScale = 1.5; render(); await vanta();
        // Kontraktets klassning, inte implementationens: egen text/media bär riktiga mått.
        const klass = w.type === 'templateCustomText' ? 'text'
          : ['templateCustomImage', 'templateCustomVideo', 'video'].includes(w.type) ? 'media' : 'fast';
        return { a, b: box(), klass };
      }, nyckel);
      if (!r.a || !r.b || !r.a.b || !r.a.h) { fel.push(`${nyckel}: ritades inte`); continue; }
      provade++;
      const kx = r.b.b / r.a.b, ky = r.b.h / r.a.h;
      const vantat = r.klass === 'fast' ? 1.5 : 1;
      if (Math.abs(kx - vantat) > 0.04 || Math.abs(ky - vantat) > 0.04)
        fel.push(`${nyckel} (${r.klass}): X ${kx.toFixed(3)} Y ${ky.toFixed(3)}, väntade ${vantat}`);
    }
  } finally { await page.close() }
  assert.ok(provade >= 100, `bara ${provade} nycklar provade`);
  assert.deepEqual(fel, []);
});

test('Storlek-reglaget: finns för fasta kompositioner, skalar runt mitten, inte för egen text, ingen dubblett', { skip, timeout: 120000 }, async () => {
  const page = await oppnaEditorn();
  try {
    const id = await lagg(page, 'catalog:toplike:voltage');
    await page.evaluate(() => bind());
    await page.waitForTimeout(300);
    const fore = await mat(page, id);
    const falt = await page.evaluate(() => {
      const el = document.querySelector('#propScale');
      return el ? { synlig: el.offsetParent !== null, varde: el.value, etikett: el.closest('label').textContent } : null;
    });
    assert.ok(falt, 'Storlek-reglaget saknas i panelen');
    assert.ok(falt.synlig, 'Storlek-reglaget finns men syns inte');
    assert.equal(falt.varde, '100');
    assert.match(falt.etikett, /Storlek/);
    await page.evaluate(() => {
      const el = document.querySelector('#propScale');
      el.value = '150'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(500);
    const efter = await mat(page, id);
    assert.equal(efter.w.widgetScale, 1.5);
    assert.ok(Math.abs(efter.bredd / fore.bredd - 1.5) < 0.03 && Math.abs(efter.hojd / fore.hojd - 1.5) < 0.03,
      `inte likformigt: ${fore.bredd}x${fore.hojd} -> ${efter.bredd}x${efter.hojd}`);
    assert.ok(Math.abs(efter.mx - fore.mx) <= 3 && Math.abs(efter.my - fore.my) <= 3, 'mitten flyttade sig');

    await lagg(page, 'catalog:custom:text');
    await page.evaluate(() => bind());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => !!document.querySelector('#propScale')), false,
      'egen text ska ändra riktiga mått, inte få ett skalreglage');

    await lagg(page, 'catalog:followeralert');
    await page.evaluate(() => bind());
    await page.waitForTimeout(300);
    const antal = await page.evaluate(() => document.querySelectorAll('#propScale, #followScale').length);
    assert.ok(antal <= 1, `två reglage för samma skala (${antal})`);
  } finally { await page.close() }
});

test('egen bild: låset håller formen från sidhandtagen, olåst ändrar bara sin axel', { skip, timeout: 120000 }, async () => {
  const page = await oppnaEditorn();
  try {
    let id = await lagg(page, 'catalog:custom:image', { width: 300, height: 200, aspectLocked: true, aspectRatio: 1.5 });
    await dra(page, 'e', 60, 0);
    let m = await mat(page, id);
    assert.ok(m.w.width > 330, `bredden växte inte: ${m.w.width}`);
    assert.ok(Math.abs(m.w.width / m.w.height - 1.5) < 0.02, `låst kvot 1.5 blev ${(m.w.width / m.w.height).toFixed(3)}`);
    assert.equal('widgetScaleY' in m.w, false);

    id = await lagg(page, 'catalog:custom:image', { width: 300, height: 200, aspectLocked: false });
    await dra(page, 's', 0, 60);
    m = await mat(page, id);
    assert.equal(m.w.width, 300, 'olåst underhandtag ändrade bredden');
    assert.ok(m.w.height > 230, `riktig höjd växte inte: ${m.w.height}`);
    assert.equal(skalor(m.transform).sy, 1, 'egen bild fick en sträckning');
    // Innehållet sträcks aldrig: renderaren ritar bilden med object-fit enligt "Anpassning".
    const kalla = fs.readFileSync(path.join(ROOT, 'custom-widgets.js'), 'utf8');
    assert.match(kalla, /object-fit:\$\{fit\}/, 'egen bild ritas inte längre med object-fit');
    assert.match(kalla, /<option value="cover">Fyll \(beskär\)<\/option><option value="contain">Anpassa \(visa allt\)<\/option>/);
  } finally { await page.close() }
});

// ---- DEN SEPARATA OVERLAYN ------------------------------------------------------------------
//
// Davids Guardian, uppmätt i produktion 2026-10-18: left 280, top 49, width 717, height 570,
// zoom 0.35, transform rotate(0deg) scaleY(0.3). Samma widget utan widgetScaleY är kontrollen —
// sträckningen gick kring mitten, så den migrerade widgetens mitt ska ligga där kontrollens ligger.
const GUARDIAN = { id: 'templateGuardianEmblem-mvdvhtgu-9f68ff697e82', type: 'templateGuardianEmblem',
  x: 280, y: 49, width: 717, height: 570, widgetScale: 0.35, guardianStep: 4, guardianLang: 'sv',
  guardianShowUsername: true, guardianUsername: '@Guardian', layer: 9 };

async function overlayMed(widget) {
  overlayState = { widgets: [widget] };
  const page = await browser.newPage({ viewport: { width: 1080, height: 1000 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/overlay.html?access=${TOKEN}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.canvas .guardian-emblem'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const el = document.querySelector('.canvas .guardian-emblem');
    const r = el.getBoundingClientRect();
    const w = state.widgets[0];
    return { mx: r.left + r.width / 2, my: r.top + r.height / 2, bredd: r.width, hojd: r.height,
      lada: el.offsetWidth / el.offsetHeight, transform: getComputedStyle(el).transform,
      overlay: document.documentElement.classList.contains('overlay-output'), w: JSON.parse(JSON.stringify(w)) };
  });
  await page.close();
  return { ...m, fel };
}

test('Guardian med sparad scaleY(0.3) i den separata overlayn: inte platt, mitten kvar, samma efter omladdning', { skip, timeout: 120000 }, async () => {
  const kontroll = await overlayMed({ ...GUARDIAN });
  const sparad = await overlayMed({ ...GUARDIAN, widgetScaleY: 0.3 });
  const igen = await overlayMed({ ...GUARDIAN, widgetScaleY: 0.3 });      // omladdning: samma sparade värde
  assert.ok(sparad.overlay, 'sidan gick inte in i overlay-läge');
  assert.deepEqual(sparad.fel, [], 'runtimefel i overlayn');
  const { sx, sy } = skalor(sparad.transform);
  assert.ok(Math.abs(sx - sy) < 0.001, `Guardian är fortfarande sträckt i sändningen: ${sparad.transform}`);
  assert.equal('widgetScaleY' in sparad.w, false, 'widgetScaleY migrerades inte i overlayn');
  // naturlig form: den synliga rutan har lådans egen kvot (717/570), inte en tillplattad
  assert.ok(Math.abs((sparad.bredd / sparad.hojd) / sparad.lada - 1) < 0.02,
    `formen är ${(sparad.bredd / sparad.hojd).toFixed(3)}, lådan ${sparad.lada.toFixed(3)} — fortfarande platt`);
  // ytan bevaras: den nya skalan är 0.35 × √0.3
  assert.ok(Math.abs(sparad.w.widgetScale - 0.35 * Math.sqrt(0.3)) < 0.002, `skalan ${sparad.w.widgetScale}`);
  assert.ok(Math.abs(sparad.mx - kontroll.mx) <= 2 && Math.abs(sparad.my - kontroll.my) <= 2,
    `mitten flyttade sig: (${Math.round(kontroll.mx)}, ${Math.round(kontroll.my)}) -> (${Math.round(sparad.mx)}, ${Math.round(sparad.my)})`);
  assert.ok(Math.abs(igen.mx - sparad.mx) < 0.5 && Math.abs(igen.bredd - sparad.bredd) < 0.5,
    'en omladdning av samma sparade värde gav en annan bild');
});
