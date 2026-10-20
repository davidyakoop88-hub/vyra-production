'use strict';
// SLUTGRANSKNING B (2026-10-20): DE HÖGA FYNDEN, ETT PROV VAR.
//
// Granskningen fotograferade 94 modeller i studio och overlay. De höga fynden här syntes i sändningen
// eller gjorde ett panelfält verkningslöst, och varje prov nedan föll mot 5d75be0c:
//   B-001/B-002  Koi Pearl Lagoon och Masquerade Ball: svarta MP4-rutor med vattenstämpel. Katalogen
//                erbjuder dem inte längre (paketpreview-affisch.browser.test.js), och en SPARAD widget
//                ritas som förut men panelen säger tydligt att paketet bör bytas.
//   B-003        Egen bild/video: studiotipset "Välj en bild i panelen →" ritades i overlayn.
//   B-005        Social Goal cirkel: fältet Rubrik gjorde ingenting (rubriken är målad i bilden).
//   B-006        Social Goal Rail: rubriken låg på ornamentet och "0 / 1 000" under ändkapseln.
//   B-007        Heart Me: glöden klipptes av en rak linje när hjärtat var delvis fyllt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function studio() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister && typeof VyraWidgets !== 'undefined'
    && !!window.VyraGoalMotion, null, { timeout: 40000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  return page;
}
async function overlay() {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function' && !!window.VyraGoalMotion, null, { timeout: 40000, polling: 100 });
  return page;
}
// En widget, vald, på en annars tom duk. Väntar in panelramen.
async function valj(page, nyckel, falt, ram = true) {
  await page.evaluate(([n, f]) => {
    state.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; Object.assign(w, f || {});
    state.widgets.push(w); selected = 'prov'; render();
  }, [nyckel, falt]);
  if (ram) await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(300);
}
async function iOverlay(page, nyckel, falt) {
  await page.evaluate(async ([n, f]) => {
    const st = window.eval('state'); st.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; Object.assign(w, f || {});
    st.widgets.push(w); render();
    await new Promise(r => setTimeout(r, 600));
  }, [nyckel, falt]);
}

const AVVECKLAD = 'Klippen i det här paketet har en vattenstämpel och är svarta bakom effekten – byt till ett annat paket.';

test('B-001/B-002: en sparad Koi Pearl/Masquerade ritas som förut och panelen säger att paketet ska bytas', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    for (const p of ['koiPearl', 'masquerade']) {
      await valj(page, `catalog:glovesnipe:${p}:pack:2`);
      const m = await page.evaluate(() => {
        const rad = document.querySelector('.properties [data-panelram-sektion="2"] #prGloveAvvecklad');
        return { text: rad && rad.textContent.trim(), synlig: !!rad && rad.getClientRects().length > 0,
          ritad: !!document.querySelector('.canvas .battle-pack-full[data-id="prov"] video.pack-fx-video') };
      });
      assert.equal(m.text, AVVECKLAD, p + ': raden om vattenstämpeln saknas i Innehåll');
      assert.equal(m.synlig, true, p + ': raden syns inte');
      assert.equal(m.ritad, true, p + ': den sparade widgeten ritas inte längre');
    }
    await valj(page, 'catalog:glovesnipe:pinkPrincess:pack:2');
    assert.equal(await page.evaluate(() => !!document.querySelector('.properties #prGloveAvvecklad')), false, 'Pink Princess fick raden');
  } finally { await page.close(); }
});

test('B-003: Egen bild och Egen video utan fil ritar inget studiotips i overlayn', { skip, timeout: 120000 }, async () => {
  const ov = await overlay(), st = await studio();
  try {
    for (const k of ['catalog:custom:image', 'catalog:custom:video']) {
      await iOverlay(ov, k);
      const o = await ov.evaluate(() => { const el = document.querySelector('[data-id="prov"]'); return el ? { text: el.innerText.trim(), tips: !!el.querySelector('.cw-placeholder') } : null; });
      assert.ok(o, k + ' ritades inte i overlayn');
      assert.equal(o.tips, false, k + ': platshållaren finns i overlayn');
      assert.equal(o.text, '', k + ': overlayn visar text: ' + o.text);
      // I studion står tipset kvar — det är där det hör hemma.
      await valj(st, k, null, false);
      assert.match(await st.evaluate(() => document.querySelector('.canvas [data-id="prov"] .cw-placeholder')?.textContent || ''), /Välj en (bild|video) i panelen/);
    }
  } finally { await ov.close(); await st.close(); }
});

test('B-005: cirkelns rubrik är en del av bilden — inget verkningslöst Rubrik-fält, en rad säger varför', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    for (const k of ['catalog:socialgoal:followers:crown-orbit:circle', 'catalog:socialgoal:likes:heart-orbit:circle', 'catalog:socialgoal:diamonds:diamond-orbit:circle']) {
      await valj(page, k);
      const m = await page.evaluate(() => ({ falt: !!document.querySelector('.properties #gmTitle'),
        rad: document.querySelector('.properties [data-panelram-sektion="2"] #gmTitleBild')?.textContent || '' }));
      assert.equal(m.falt, false, k + ': Rubrik-fältet visas fast det inte gör något');
      assert.match(m.rad, /Rubriken är en del av bilden/, k + ': raden som förklarar saknas');
    }
    // Liggande och stående har kvar fältet, och det verkar där.
    await valj(page, 'catalog:socialgoal:followers:crown-rail:landscape');
    assert.equal(await page.evaluate(() => !!document.querySelector('.properties [data-panelram-sektion="2"] #gmTitle')), true, 'Rail tappade Rubrik');
    assert.equal(await page.evaluate(() => !!document.querySelector('.properties #gmTitleBild')), false);
  } finally { await page.close(); }
});

test('B-006: Rail har rubrik och antal på en rad ovanför rälsen, inne i konstens bredd', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    for (const k of ['catalog:socialgoal:likes:heart-rail:landscape', 'catalog:socialgoal:followers:crown-rail:landscape', 'catalog:socialgoal:diamonds:diamond-rail:landscape']) {
      await iOverlay(page, k, { width: 400, x: 16, y: 200, goalTitle: 'LIKE GOAL' });
      const m = await page.evaluate(async () => {
        const rot = document.querySelector('[data-id="prov"]');
        const art = rot.querySelector('.goal-motion-art');
        if (!art.complete) await new Promise(r => art.addEventListener('load', r, { once: true }));
        const b = e => e.getBoundingClientRect();
        // Konstens synliga räls: bilden är 11:1, och rälsens kropp ligger i bildens mittband.
        return { art: b(art).toJSON(), h3: b(rot.querySelector('.goal-motion-copy h3')).toJSON(), tal: b(rot.querySelector('.goal-motion-copy strong')).toJSON(), box: b(rot).toJSON() };
      });
      assert.ok(m.h3.bottom <= m.art.top + 2, `${k}: rubriken ligger på rälsen (${m.h3.bottom} > ${m.art.top})`);
      assert.ok(m.tal.bottom <= m.art.top + 2, `${k}: antalet ligger på eller under rälsen (${m.tal.bottom} > ${m.art.top})`);
      assert.ok(Math.abs(m.h3.top - m.tal.top) < 12 || Math.abs(m.h3.bottom - m.tal.bottom) < 6, `${k}: rubrik och antal står inte på samma rad`);
      assert.ok(m.tal.right <= m.art.right && m.h3.left >= m.art.left, `${k}: texten går utanför konsten`);
      assert.ok(m.h3.right < m.tal.left, `${k}: rubrik och antal överlappar`);
    }
  } finally { await page.close(); }
});

test('B-007: Heart Me-glöden sitter på ett omslutande element, inte på det klippta', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    await iOverlay(page, 'catalog:heartgoal:ice', { heartCurrent: 25, heartTarget: 50 });
    const m = await page.evaluate(() => {
      const img = document.querySelector('[data-id="prov"] img.heart-filled');
      const omslag = img && img.parentElement;
      return { klipp: img && getComputedStyle(img).clipPath, filter: img && getComputedStyle(img).filter,
        omslag: omslag && omslag.className, omslagFilter: omslag && getComputedStyle(omslag).filter, omslagKlipp: omslag && getComputedStyle(omslag).clipPath };
    });
    assert.match(m.klipp, /inset\(50%/, 'provet mäter inget: hjärtat är inte halvfyllt');
    assert.equal(m.filter, 'none', 'det klippta elementet bär fortfarande skuggan — clip-path klipper den: ' + m.filter);
    assert.match(m.omslagFilter, /drop-shadow/, 'glöden försvann: ' + m.omslagFilter);
    assert.equal(m.omslagKlipp, 'none', 'omslaget är också klippt');
  } finally { await page.close(); }
});

// MEDEL: Social Goal Mål/Startvärde utan server (premium-final.js bindGoalControl).
test('B-010: Mål och Startvärde som inte kan sparas säger det med en rad under fältet', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    await valj(page, 'catalog:socialgoal:followers:crown-rail:landscape');
    for (const id of ['#pfGoalTarget', '#pfGoalCurrent']) {
      await page.evaluate(id => { const el = document.querySelector('.properties ' + id); el.value = '1234'; el.dispatchEvent(new Event('change', { bubbles: true })); }, id);
      await page.waitForTimeout(400);
      const m = await page.evaluate(id => { const el = document.querySelector('.properties ' + id); const rad = (el.closest('label') || el.parentElement).querySelector('.pr-goal-status');
        return { varde: el.value, rad: rad && rad.getClientRects().length ? rad.textContent : null }; }, id);
      assert.notEqual(m.varde, '1234', 'provet mäter inget: värdet sparades');
      assert.match(m.rad || '', /logga in|servern/, id + ': fältet hoppade tillbaka utan besked');
    }
  } finally { await page.close(); }
});

// MEDEL: Goal Pro (playground-widgets.js W.goalvar).
test('B-008/B-009: Goal Pro firar först när siffran når 100 %, och nollställningen hoppar staplar och text samtidigt', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    await iOverlay(page, 'catalog:pggoal:1');
    await page.waitForFunction(() => !!document.querySelector('[data-id="prov"] .gv .gv1 .pc'), null, { timeout: 15000, polling: 100 });
    const m = await page.evaluate(async () => {
      const P = window.VyraPlaygroundWidgets, gv = document.querySelector('[data-id="prov"] .gv');
      const pc = () => document.querySelector('[data-id="prov"] .gv1 .pc').textContent;
      P.feed({ type: 'gift', username: 'a', giftName: 'A', coins: 1620, repeatCount: 1, __test: true });
      await new Promise(r => setTimeout(r, 1500));
      const fore = pc();
      P.feed({ type: 'gift', username: 'b', giftName: 'B', coins: 400, repeatCount: 1, __test: true });
      // Direkt efter: siffran har inte hunnit fram, skylten får inte synas.
      const direkt = { done: gv.classList.contains('done'), pc: pc() };
      let vidFirande = null;
      for (let i = 0; i < 100 && !vidFirande; i++) { await new Promise(r => setTimeout(r, 30)); if (gv.classList.contains('done')) vidFirande = pc(); }
      // Nollställningen: första bildrutan efter att skylten tagits bort.
      let efter = null;
      for (let i = 0; i < 400 && !efter && vidFirande; i++) {
        await new Promise(r => requestAnimationFrame(r));
        if (!gv.classList.contains('done')) {
          const f = document.querySelector('[data-id="prov"] .gv1 .gv1b .f');
          efter = { pc: pc(), bredd: f ? f.getBoundingClientRect().width / f.parentElement.getBoundingClientRect().width : null };
        }
      }
      return { fore, direkt, vidFirande, efter };
    });
    assert.match(m.fore, /^8\d%$/, 'provet mäter inget: värdet nådde inte 81 %: ' + m.fore);
    assert.equal(m.direkt.done, false, `MÅL NÅTT! syntes medan siffran visade ${m.direkt.pc}`);
    assert.equal(m.vidFirande, '100%', 'skylten kom innan siffran nått 100 %: ' + m.vidFirande);
    assert.ok(m.efter, 'målet nollställdes aldrig');
    assert.equal(m.efter.pc, '0%');
    assert.ok(m.efter.bredd == null || m.efter.bredd < 0.05, `stapeln står kvar på ${Math.round(m.efter.bredd * 100)} % medan texten säger 0 %`);
  } finally { await page.close(); }
});
