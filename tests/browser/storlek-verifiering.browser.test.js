'use strict';
// VERIFIERINGEN AV STORLEKSRÄTTNINGEN (2026-10-18), i riktig Chrome.
//
// Efter att över/under-handtagen slutat sträcka (storlek-proportioner.browser.test.js) mätte en
// andra genomgång hela katalogen igen och hittade fel som inte satt i handtagen utan runt dem:
//
//   1. Panelen. Laset tog kvoten ur FÖRSTA <img> i widgeten — profilbilden (1:1) — så ett klick
//      gjorde Skattkista Pill 340x78 till 340x340. Bredd saknade verkan i 40 av 173 modeller,
//      Höjd skrev style.height så att ramen slutade omsluta motivet, och fälten visade inte det
//      som ritades (Top Like 250x368 mot 189x278).
//   2. Förankringen. Läsbarhetslägena (rk6-kompakt, lv-kompakt) byter layout först i render() vid
//      släppet, och en rot med transition visar en zoom på väg — motsatt kant flyttade 89 px.
//   3. Top Coins/Top Points bar kvar `--tc-scale`/`--tp-scale` från sina gamla klasser, så draget
//      skrev en variabel ingen läste och widgeten hoppade vid släppet.
//   4. Formatbytet. Duken animerar sitt mått, så gränsmarkeringen mätte Mobil-duken efter bytet
//      till Dator 16:9 och 25 av 29 utstickande widgetar fick ingen varning.
//   5. Follower Alert doldes när den var vald — ram och handtag gick inte att ta i.
//   6. Ovala profilbilder i Guardian (alla steg), sex Battle MVP-firanden och Royal Rose.
//   7. Pro-podiet och Streak Pro ritade utanför sin rot.
//   8. Handtagen krympte med widgetens zoom (6 px höga vid 50 %).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg' };

function servera() {
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const fil = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();

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

// Hjälparna körs inne i sidan. __lagg lägger EN katalogwidget vald i Layout och låter koreografin
// spela klart — geometri får inte mätas mitt i en animation.
const HJALP = () => {
  window.__lagg = async (k, p) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(k);
    Object.assign(w, { x: 60, y: 90 }, p || {});
    state.widgets.push(w); selected = w.id; render();
    await new Promise(r => setTimeout(r, 400));
    const el = document.querySelector('.widget.selected');
    if (el) for (const a of el.getAnimations({ subtree: true })) { try { a.finish() } catch (_) { a.pause() } }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    bind(); await new Promise(r => setTimeout(r, 200));
    return w.id;
  };
  window.__nod = id => document.querySelector(`.editor-shell .canvas [data-id="${id}"]`);
  window.__mat = id => {
    const el = window.__nod(id), r = el.getBoundingClientRect(), z = parseFloat(getComputedStyle(el).zoom) || 1;
    return { v: r.left, h: r.right, o: r.top, u: r.bottom, b: r.width, hh: r.height, mx: r.left + r.width / 2, my: r.top + r.height / 2,
      ow: el.offsetWidth, oh: el.offsetHeight, visB: el.offsetWidth * z, visH: el.offsetHeight * z,
      w: JSON.parse(JSON.stringify(state.widgets.find(x => x.id === id))),
      pw: +((document.querySelector('#propWidth') || {}).value), ph: +((document.querySelector('#propHeight') || {}).value) };
  };
  // Hur långt synligt innehåll (inte handtag) sticker ut ur roten, per sida.
  window.__utanfor = id => {
    const el = window.__nod(id), r = el.getBoundingClientRect();
    const u = { o: 0, u: 0, v: 0, h: 0 };
    for (const c of el.querySelectorAll('*')) {
      if (c.closest('.vyra-handle,.resize-handle')) continue;
      const cs = getComputedStyle(c);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const b = c.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      u.o = Math.max(u.o, r.top - b.top); u.u = Math.max(u.u, b.bottom - r.bottom);
      u.v = Math.max(u.v, r.left - b.left); u.h = Math.max(u.h, b.right - r.right);
    }
    return u;
  };
  window.__falt = (sel, v) => {
    const f = document.querySelector(sel); if (!f) return false;
    f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
};

async function editorn(viewport = { width: 1600, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(HJALP);
  return page;
}

async function dra(page, riktning, dx, dy) {
  const h = await page.evaluate(r => {
    const e = document.querySelector(`.widget.selected [data-vyra-handle="${r}"]`);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, traff: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === e };
  }, riktning);
  assert.ok(h, `handtaget ${riktning} saknas`);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + dx / 2, h.y + dy / 2, { steps: 4 });
  await page.mouse.move(h.x + dx, h.y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  return h;
}

// ---- 1. PANELEN ---------------------------------------------------------------------------------

test('panelen: fasta kompositioner visar den ritade lådan, låset ändrar ingenting och Storlek skalar likformigt', { skip, timeout: 240000 }, async () => {
  // Uppmätt före rättningen (fält mot ritat, och vad låsklick + Bredd +30 % gav):
  //   Guardian sapphire 400x570  -> låst Bredd 520x520 (kvot 0.702 -> 1.000)
  //   Top Like Voltage  250x368 / ritat 189x278 -> 189x325, bredden ritades aldrig om
  //   Skattkista Pill   340x340 / ritat 340x78  -> låsklicket ensamt gav 340x340
  //   Gift Fireworks    Höjd +30 % olåst: w.height 390, ritat 300
  //   Heart Goal Frost  310x356 / ritat 230x264
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:guardianemblem:model:sapphire', 'catalog:toplike:voltage', 'catalog:skattkista:pill',
      'catalog:giftfireworks:rose', 'catalog:heartgoal:frost', 'catalog:gifterlevel:duo', 'catalog:lastx:stack',
      'catalog:ranking:templateTopCoins:basic-v2', 'catalog:socialgoal:followers:crown-tower:portrait']) {
      const r = await page.evaluate(async k => {
        const id = await window.__lagg(k, { x: 40, y: 40 });
        const f = window.__mat(id);
        const wf = document.querySelector('#propWidth'), hf = document.querySelector('#propHeight');
        const knapp = document.querySelector('[data-aspect-lock]');
        const las = knapp ? { disabled: knapp.disabled, pressed: knapp.getAttribute('aria-pressed') } : null;
        if (knapp) knapp.click();
        await new Promise(r => setTimeout(r, 150));
        const efterKlick = window.__mat(id);
        // Storlek är panelens enda storlekskontroll för en fast komposition (se vyra-proportioner.js)
        window.__falt('#propScale', '130');
        await new Promise(r => setTimeout(r, 600));
        bind(); await new Promise(r => setTimeout(r, 150));
        return { f, efterKlick, e: window.__mat(id), las, dis: [wf.disabled, hf.disabled] };
      }, k);
      if (Math.abs(r.f.pw - r.f.visB) > 1 || Math.abs(r.f.ph - r.f.visH) > 1)
        fel.push(`${k}: fälten ${r.f.pw}x${r.f.ph}, ritat ${r.f.visB.toFixed(0)}x${r.f.visH.toFixed(0)}`);
      if (!r.dis[0] || !r.dis[1]) fel.push(`${k}: Bredd/Höjd är redigerbara — tre kontroller för samma skala`);
      if (!r.las || !r.las.disabled || r.las.pressed !== 'true') fel.push(`${k}: låset visas inte som alltid på`);
      if (r.efterKlick.ow !== r.f.ow || r.efterKlick.oh !== r.f.oh) fel.push(`${k}: låsklicket ändrade lådan ${r.f.ow}x${r.f.oh} -> ${r.efterKlick.ow}x${r.efterKlick.oh}`);
      if (r.e.w.width !== r.f.w.width || r.e.w.height !== r.f.w.height) fel.push(`${k}: w.width/w.height skrevs`);
      const kx = r.e.visB / r.f.visB, ky = r.e.visH / r.f.visH;
      if (Math.abs(kx - 1.3) > 0.03 || Math.abs(ky - 1.3) > 0.03) fel.push(`${k}: X ${kx.toFixed(3)} Y ${ky.toFixed(3)}, väntade 1.3`);
      if (Math.abs(r.e.pw - r.e.visB) > 1 || Math.abs(r.e.ph - r.e.visH) > 1) fel.push(`${k}: fälten efteråt ${r.e.pw}x${r.e.ph}, ritat ${r.e.visB.toFixed(0)}x${r.e.visH.toFixed(0)}`);
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('panelen: ett skript som ändå ändrar Bredd/Höjd på en fast komposition skriver ingenting', { skip, timeout: 120000 }, async () => {
  const page = await editorn();
  try {
    const r = await page.evaluate(async () => {
      const id = await window.__lagg('catalog:followeralert:blush', { x: 40, y: 40 });
      const fore = JSON.stringify(window.__mat(id).w);
      for (const sel of ['#propWidth', '#propHeight']) { const f = document.querySelector(sel); f.disabled = false; window.__falt(sel, '777'); }
      await new Promise(r => setTimeout(r, 400));
      return { fore, efter: JSON.stringify(window.__mat(id).w) };
    });
    assert.equal(r.efter, r.fore, 'Follower Alerts egen bindField skrev bredden förbi panelen');
  } finally { await page.close() }
});

test('panelen: Storlek på Guardian och Top Coins låter inget innehåll hamna utanför ramen', { skip, timeout: 120000 }, async () => {
  // Före: Guardian steg 3 Bredd 400 -> 520 gav 520x658 och innehåll 13 px över och under ramen;
  // Top Coins basic-v2 Höjd 230 -> 299 lade 139 px innehåll under ramen.
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:guardianemblem:3', 'catalog:guardianemblem:2', 'catalog:ranking:templateTopCoins:basic-v2', 'catalog:latonskningar:spotify', 'catalog:socialgoal:diamonds:diamond-orbit:circle']) {
      for (const falt of ['#propWidth', '#propHeight']) {
        const r = await page.evaluate(async ([k, falt]) => {
          const id = await window.__lagg(k, { x: 20, y: 20, widgetScale: 0.6 });
          const fore = window.__utanfor(id);
          window.__falt('#propScale', falt === '#propWidth' ? '75' : '45');   // två steg via Storlek
          await new Promise(r => setTimeout(r, 500));
          return { fore, efter: window.__utanfor(id) };
        }, [k, falt]);
        for (const s of ['o', 'u', 'v', 'h']) {
          if (r.efter[s] > Math.max(3, r.fore[s] * 1.3 + 1)) fel.push(`${k} ${falt}: ${s} ${r.fore[s].toFixed(1)} -> ${r.efter[s].toFixed(1)} px`);
        }
      }
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('panelen: egen text och egen bild behåller riktiga mått och låset håller lådans form', { skip, timeout: 120000 }, async () => {
  const page = await editorn();
  try {
    // Laset fangar LADANS kvot, inte bildfilens — forr gav forsta lasta andringen 272x340 ur 300x300.
    const bild = await page.evaluate(async () => {
      const id = await window.__lagg('catalog:custom:image', { width: 300, height: 300, aspectLocked: false });
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 300)); bind(); await new Promise(r => setTimeout(r, 100));
      window.__falt('#propWidth', '360');
      await new Promise(r => setTimeout(r, 400));
      return window.__mat(id).w;
    });
    assert.equal(bild.aspectLocked, true);
    assert.equal(bild.aspectRatio, 1, `låset fångade ${bild.aspectRatio}, lådan är 1:1`);
    assert.equal(bild.width, 360); assert.equal(bild.height, 360);

    // Låst utan sparad kvot (en sparning eller synk där den saknas) faller tillbaka på lådan.
    const text = await page.evaluate(async () => {
      const id = await window.__lagg('catalog:custom:text', { width: 400, height: 100, aspectLocked: true });
      delete state.widgets[0].aspectRatio; bind(); await new Promise(r => setTimeout(r, 100));
      window.__falt('#propWidth', '500');
      await new Promise(r => setTimeout(r, 400));
      return { w: window.__mat(id).w, skala: !!document.querySelector('#propScale') };
    });
    assert.equal(text.w.width, 500);
    assert.equal(text.w.height, 125, `låset ignorerades utan aspectRatio: höjd ${text.w.height}`);
    assert.equal(text.skala, false, 'egen text ska inte få ett skalreglage');
  } finally { await page.close() }
});

// ---- 2-3. FÖRANKRINGEN --------------------------------------------------------------------------

const ANKARE = { n: ['mx', 'u'], s: ['mx', 'o'], e: ['v', 'my'], w: ['h', 'my'], ne: ['v', 'u'], nw: ['h', 'u'], se: ['v', 'o'], sw: ['h', 'o'] };
const UT = { n: [0, -40], s: [0, 40], e: [40, 0], w: [-40, 0], ne: [40, -40], nw: [-40, -40], se: [40, 40], sw: [-40, 40] };

test('handtagen: motsatt kant står still även när läsbarhetsläget byter layout vid släppet', { skip, timeout: 420000 }, async () => {
  // Före: Top Like basic-v2 n-handtaget flyttade underkanten 89 px, Royal Rose n 104 px (--tc-scale),
  // Top Points prism-vertical w högerkanten 67 px, Gifter Level number (transition 0.4s) n 25 px.
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:toplike:basic-v2', 'catalog:ranking:templateTopCoins:royal-rose', 'catalog:ranking:templateTopPoints:prism-vertical',
      'catalog:gifterlevel:number', 'catalog:battlemvp:celebration:gold-ribbon', 'catalog:ranking:templateTopPoints:basic-v2']) {
      for (const rot of [0, 15]) {
        for (const r of ['n', 'e', 'sw']) {
          const id = await page.evaluate(([k, rot]) => window.__lagg(k, { x: 120, y: 160, widgetScale: 0.6, rotation: rot || undefined }), [k, rot]);
          const f = await page.evaluate(i => window.__mat(i), id);
          let [dx, dy] = UT[r];
          if (rot) { const a = rot * Math.PI / 180; [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
          const h = await dra(page, r, dx, dy);
          const e = await page.evaluate(i => window.__mat(i), id);
          const namn = `${k} ${r}@${rot}`;
          if (!h.traff) fel.push(`${namn}: handtaget gick inte att greppa i sin mitt`);
          if (!(e.w.widgetScale > 0.61)) fel.push(`${namn}: skalan växte inte (${e.w.widgetScale})`);
          if ('widgetScaleY' in e.w) fel.push(`${namn}: widgetScaleY`);
          for (const kant of rot ? ['mx', 'my'] : ANKARE[r]) {
            if (Math.abs(e[kant] - f[kant]) > 3) fel.push(`${namn}: ${kant} flyttade sig ${(e[kant] - f[kant]).toFixed(1)} px`);
          }
        }
      }
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('Top Coins Royal Rose: draget syns medan det pågår och widgeten hoppar inte vid släppet', { skip, timeout: 120000 }, async () => {
  const page = await editorn();
  try {
    const id = await page.evaluate(() => window.__lagg('catalog:ranking:templateTopCoins:royal-rose', { x: 60, y: 200 }));
    const stil = await page.evaluate(i => window.__nod(i).getAttribute('style'), id);
    assert.doesNotMatch(stil, /--tc-scale|--tp-scale/, 'rk6 bär fortfarande en död skalvariabel');
    const f = await page.evaluate(i => window.__mat(i), id);
    const h = await page.evaluate(() => { const b = document.querySelector('.widget.selected [data-vyra-handle="s"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(h.x, h.y); await page.mouse.down();
    await page.mouse.move(h.x, h.y + 40, { steps: 6 });
    const under = await page.evaluate(i => window.__mat(i), id);
    await page.mouse.up(); await page.waitForTimeout(600);
    const e = await page.evaluate(i => window.__mat(i), id);
    assert.ok(under.hh > f.hh + 20, `ingenting syntes under draget (${f.hh} -> ${under.hh})`);
    assert.ok(Math.abs(e.o - f.o) <= 3, `överkanten flyttade sig ${(e.o - f.o).toFixed(1)} px`);
    assert.ok(Math.abs(e.mx - f.mx) <= 3, `mitten flyttade sig ${(e.mx - f.mx).toFixed(1)} px i sidled`);
  } finally { await page.close() }
});

test('Storlek-reglaget håller mitten: transition på roten, egen zoom och läsbarhetsläge', { skip, timeout: 240000 }, async () => {
  // Före: gold-ribbon 100 -> 200 % flyttade mitten (-200, -234) px (transition 0.4s), Gift Bubbles
  // 50 % (0, 46) px, Royal Rose 50 % (-108, -94) px.
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:battlemvp:celebration:gold-ribbon', 'catalog:giftbubbles', 'catalog:ranking:templateTopCoins:royal-rose',
      'catalog:gifterlevel:duo', 'catalog:heartfireworks', 'catalog:pggoal:2']) {
      for (const mal of [50, 200]) {
        const r = await page.evaluate(async ([k, mal]) => {
          const id = await window.__lagg(k, { x: 100, y: 200 });
          const f = window.__mat(id);
          if (!window.__falt('#propScale', String(mal))) return null;
          await new Promise(r => setTimeout(r, 800));
          return { f, e: window.__mat(id) };
        }, [k, mal]);
        if (!r) { fel.push(`${k}: inget Storlek-reglage`); continue; }
        if (r.e.w.widgetScale !== mal / 100) fel.push(`${k} ${mal}%: skalan ${r.e.w.widgetScale}`);
        if (Math.abs(r.e.mx - r.f.mx) > 2 || Math.abs(r.e.my - r.f.my) > 2) fel.push(`${k} ${mal}%: mitten (${(r.e.mx - r.f.mx).toFixed(1)}, ${(r.e.my - r.f.my).toFixed(1)})`);
        if (Math.abs(r.e.b / r.f.b - mal / 100) > 0.02) fel.push(`${k} ${mal}%: bredden x${(r.e.b / r.f.b).toFixed(3)}`);
      }
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('handtagen har samma storlek i varje skala och sitter på ramens kant', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    for (const z of [0.5, 1, 2]) {
      const m = await page.evaluate(async z => {
        const id = await window.__lagg('catalog:battlemvp:inferno', { x: 60, y: 120, widgetScale: z });
        const el = window.__nod(id), r = el.getBoundingClientRect();
        const ut = {};
        for (const d of ['n', 'e', 'nw']) {
          const b = el.querySelector(`:scope > [data-vyra-handle="${d}"]`).getBoundingClientRect();
          const fx = d.includes('w') ? r.left : d.includes('e') ? r.right : r.left + r.width / 2;
          const fy = d.includes('n') ? r.top : r.top + r.height / 2;
          ut[d] = { b: b.width, h: b.height, dx: b.left + b.width / 2 - fx, dy: b.top + b.height / 2 - fy };
        }
        return ut;
      }, z);
      assert.ok(Math.abs(m.n.b - 26) < 1.5 && Math.abs(m.n.h - 11) < 1.5, `skala ${z}: n-handtaget ${m.n.b}x${m.n.h}`);
      assert.ok(Math.abs(m.nw.b - 14) < 1.5, `skala ${z}: nw-handtaget ${m.nw.b}`);
      for (const d of ['n', 'e', 'nw']) assert.ok(Math.abs(m[d].dx) <= 1.5 && Math.abs(m[d].dy) <= 1.5, `skala ${z}: ${d} sitter (${m[d].dx.toFixed(1)}, ${m[d].dy.toFixed(1)}) från kanten`);
    }
  } finally { await page.close() }
});

// ---- 4. FORMATBYTET -----------------------------------------------------------------------------

test('Mobil -> Dator 16:9: en widget som sticker ut under duken markeras direkt, och efter render', { skip, timeout: 120000 }, async () => {
  const page = await editorn();
  try {
    const r = await page.evaluate(async () => {
      document.querySelector('[data-format="mobile"]').click();
      await new Promise(r => setTimeout(r, 300));
      // en INLÄST widget (inte ny) — passningen för nya ska inte flytta den
      state.widgets.length = 0;
      state.widgets.push({ id: 'g4', type: 'templateGuardianEmblem', x: 16, y: 80, width: 400, height: 570, guardianStep: 4, widgetScale: 1 });
      selected = 'g4'; render(); await new Promise(r => setTimeout(r, 400));
      const fore = window.__nod('g4').dataset.stickerUt || '';
      document.querySelector('[data-format="widescreen"]').click();
      await new Promise(r => setTimeout(r, 50));          // mitt i dukens transition (0,22 s)
      const direkt = window.__nod('g4').dataset.stickerUt || '';
      const varning = document.querySelector('.properties [data-grans-varning] p');
      render(); await new Promise(r => setTimeout(r, 100));
      const efterRender = window.__nod('g4').dataset.stickerUt || '';
      document.querySelector('[data-format="mobile"]').click();
      await new Promise(r => setTimeout(r, 100));
      return { fore, direkt, varning: varning && varning.textContent, efterRender, tillbaka: window.__nod('g4').dataset.stickerUt || '' };
    });
    assert.equal(r.fore, '', 'Guardian på 16,80 ryms i Mobil-duken');
    assert.equal(r.direkt, 'nere', `ingen markering efter formatbytet (${r.direkt})`);
    assert.match(r.varning || '', /^Sticker ut \d+ px/, 'panelen varnade inte');
    assert.equal(r.efterRender, 'nere', 'markeringen försvann vid nästa render');
    assert.equal(r.tillbaka, '', 'markeringen stod kvar i Mobil');
  } finally { await page.close() }
});

test('en ny Guardian i Dator 16:9 passas in med likformig skala, inte en ändrad bredd', { skip, timeout: 120000 }, async () => {
  // Före: passningen rörde bara w.width, så Guardian steg 3 (400x560) stack ut 128 px under 432-duken.
  const page = await editorn();
  try {
    const r = await page.evaluate(async () => {
      document.querySelector('[data-format="widescreen"]').click();
      await new Promise(r => setTimeout(r, 400));
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:guardianemblem:3');
      state.widgets.push(w); selected = w.id; render();
      await new Promise(r => setTimeout(r, 1200));
      render(); await new Promise(r => setTimeout(r, 300));
      const el = window.__nod(w.id), c = document.querySelector('.editor-shell .canvas');
      const z = parseFloat(getComputedStyle(el).zoom) || 1;
      const ut = window.VyraGrans.stickerUt(parseInt(el.style.left, 10), parseInt(el.style.top, 10), el.offsetWidth, el.offsetHeight, window.VyraGrans.dukFor(el));
      document.querySelector('[data-format="mobile"]').click();
      return { ut, width: w.width, skala: w.widgetScale, hojd: el.offsetHeight * z, duk: c.offsetHeight };
    });
    assert.equal(r.ut, false, 'Guardian sticker fortfarande ut');
    assert.equal(r.width, 400, `bredden ändrades till ${r.width}`);
    assert.ok(r.skala < 1, `skalan ${r.skala}`);
    assert.ok(r.hojd <= 432.5, `synlig höjd ${r.hojd}`);
  } finally { await page.close() }
});

// ---- 5. FOLLOWER ALERT --------------------------------------------------------------------------

test('Follower Alert: vald syns, handtagen går att ta i, och SKALA håller mitten', { skip, timeout: 120000 }, async () => {
  const page = await editorn();
  try {
    const id = await page.evaluate(() => window.__lagg('catalog:followeralert:ocean', { x: 100, y: 200 }));
    const syn = await page.evaluate(i => { const cs = getComputedStyle(window.__nod(i)); return { v: cs.visibility, o: cs.opacity, pe: cs.pointerEvents }; }, id);
    assert.equal(syn.v, 'visible', 'den valda alerten är dold i Layout');
    assert.equal(syn.pe, 'auto');
    const f = await page.evaluate(i => window.__mat(i), id);
    const h = await dra(page, 'se', 40, 40);
    assert.ok(h.traff, 'se-handtaget går inte att greppa');
    const e = await page.evaluate(i => window.__mat(i), id);
    assert.ok(e.w.widgetScale > 1.05, `handtaget skalade inte (${e.w.widgetScale})`);
    assert.ok(Math.abs(e.v - f.v) <= 3 && Math.abs(e.o - f.o) <= 3, 'handtaget startade ett widgetdrag i stället (hörnet flyttade sig)');

    const s = await page.evaluate(async () => {
      const i = await window.__lagg('catalog:followeralert:ocean', { x: 100, y: 200 });
      const f = window.__mat(i);
      window.__falt('#followScale', '0.5');
      await new Promise(r => setTimeout(r, 700));
      return { f, e: window.__mat(i), propScale: !!document.querySelector('#propScale') };
    });
    assert.equal(s.propScale, false, 'två reglage för samma skala');
    assert.equal(s.e.w.widgetScale, 0.5);
    assert.ok(Math.abs(s.e.mx - s.f.mx) <= 2 && Math.abs(s.e.my - s.f.my) <= 2, `mitten flyttade sig (${(s.e.mx - s.f.mx).toFixed(1)}, ${(s.e.my - s.f.my).toFixed(1)})`);
  } finally { await page.close() }
});

// ---- 6-7. PROFILBILDER OCH RAMAR ----------------------------------------------------------------

test('runda profilbilder är runda: Battle MVP-firanden, Royal Rose', { skip, timeout: 180000 }, async () => {
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:battlemvp:celebration:coronation', 'catalog:battlemvp:celebration:moon', 'catalog:battlemvp:celebration:pearl',
      'catalog:battlemvp:celebration:portal', 'catalog:battlemvp:celebration:rosegold', 'catalog:battlemvp:celebration:wings',
      'catalog:toplike:royal-rose', 'catalog:ranking:templateTopCoins:royal-rose']) {
      for (const skala of [0.6, 1.5]) {
        const ovala = await page.evaluate(async ([k, skala]) => {
          const id = await window.__lagg(k, { x: 10, y: 10, widgetScale: skala });
          const ut = [];
          for (const c of window.__nod(id).querySelectorAll('*')) {
            const cs = getComputedStyle(c);
            if (cs.display === 'none' || !/^50%/.test(cs.borderTopLeftRadius)) continue;
            if (!c.querySelector('img') && c.tagName !== 'IMG') continue;
            if (c.offsetWidth < 16 || c.offsetHeight < 16) continue;
            const kvot = c.offsetWidth / c.offsetHeight;
            if (Math.abs(kvot - 1) > 0.02) ut.push(`${c.className || c.tagName} ${c.offsetWidth}x${c.offsetHeight}`);
          }
          return ut;
        }, [k, skala]);
        if (ovala.length) fel.push(`${k} @${skala}: ${ovala.slice(0, 2).join(', ')}`);
      }
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});

test('Pro-podiet och Streak Pro ritar inom sin rot', { skip, timeout: 180000 }, async () => {
  // Före: .pod och .pod-title 16 px till höger om ramen i alla 13 podier, STREAK-pillen 17 px
  // under ramen i alla fem Streak Pro.
  const page = await editorn();
  const fel = [];
  try {
    for (const k of ['catalog:pgpodium:frostfire-crown', 'catalog:pgpodium:obsidian-dragon', 'catalog:pgpodium:none',
      'catalog:pgstreak:frost-wings', 'catalog:pgstreak:emerald-wings']) {
      const u = await page.evaluate(async k => { const id = await window.__lagg(k, { x: 20, y: 20 }); await new Promise(r => setTimeout(r, 400)); return window.__utanfor(id); }, k);
      for (const s of ['o', 'u', 'v', 'h']) if (u[s] > 2) fel.push(`${k}: ${s} ${u[s].toFixed(1)} px utanför`);
    }
  } finally { await page.close() }
  assert.deepEqual(fel, []);
});
