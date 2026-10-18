'use strict';
// Rotationens kontrakt i riktig Chrome — skrivet RÖTT FÖRST (vyra-rotation.js finns inte än).
//
// BESLUTEN SOM PROVAS (Davids val 2026-08-18):
//   * transform-origin är CENTER — widgeten roterar runt sin mitt som i varje designverktyg.
//   * widgetScaleY sträcker INTE längre (beslut 2026-10-18, ersätter 2026-08-18): komposören skriver
//     bara `rotate(θ)`, och en sparad widgetScaleY migreras till en likformig skala när widgeten ritas.
//     Transformskalan i Top Coins Halo/Signal Orbit komponeras in (2026-10-19) — se provet längst ned.
//
// KOMPOSÖRSKONTRAKTET: transform på widgetroten har EN ägare. satStrackning (widget-handles.js)
// skrev `scaleY() !important` ensam förr — rotation och sträckning måste komponeras av samma
// hand (`rotate(θ) scaleY(sy)`), annars vinner den som skrev sist tyst. Neutralläget är
// FRÅNVARO: rotation 0/saknas och scaleY≈1 ⇒ ingen inline-transform alls, så orörda layouter
// förblir pixelidentiska (bakåtkompatibiliteten är ett eget prov).
//
// §7: rotationen går in via state + render()/overlay-boot (samma localStorage+projektionsväg som
// scenbakgrund-sviten) — aldrig via appliceringsfunktionen direkt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
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
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// En widget i editorn, seedad genom den riktiga kedjan (projektion före seedning — §7-fixturen).
async function editorMed(widgetProps) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  const id = await page.evaluate(props => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:toplike:clean');
    Object.assign(w, { x: 60, y: 90 }, props);
    state.widgets.push(w);
    selected = null; // KRITISKT för läknings-kontraktet: ingenting är valt i sändningen
    render();
    return w.id;
  }, widgetProps);
  await page.waitForTimeout(700);
  return { page, id };
}

// Sändningsytan, samma väg som scenbakgrund-sviten: localStorage + omladdning + lokal projektion.
async function overlayMed(widgetProps) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(props => {
    const w = Object.assign({ id: 'rotprov', type: 'templateTopLike', theme: 'clean',
      x: 60, y: 90, width: 320, title: 'TOP LIKES' }, props);
    localStorage.setItem('vyra-state', JSON.stringify({ widgets: [w] }));
  }, widgetProps);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(300);
  // Tokenvägen (overlay-access.js apply()) kör render() efter projektionen — samma här.
  await page.evaluate(() => { if (typeof render === 'function') render(); });
  await page.waitForTimeout(700);
  return page;
}

const matris = (page, id) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { fel: 'elementet saknas' };
  const cs = getComputedStyle(el);
  return { fel: null, transform: cs.transform, origin: cs.transformOrigin,
    bredd: el.offsetWidth, hojd: el.offsetHeight };
}, id ? `.canvas [data-id="${id}"]` : '.canvas [data-id]');

// matrix(a,b,c,d,e,f): rotation θ ⇒ a=cosθ·sx, b=sinθ·sx. Vinkeln ur atan2(b,a) är
// skalinvariant; scaleY läses ur kolonn 2:s längd.
function tolkaMatris(t) {
  const m = /matrix\(([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)/.exec(t || '');
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  return { vinkel: Math.atan2(b, a) * 180 / Math.PI, scaleY: Math.hypot(c, d) };
}

test('bakåtkompatibilitet: utan rotation och utan sträckning finns ingen transform alls', { skip }, async () => {
  const { page, id } = await editorMed({});
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  assert.equal(m.transform, 'none',
    `en orörd widget fick en transform (${m.transform}) — gamla layouter ska vara pixelidentiska`);
});

test('w.rotation=30 roterar roten runt mitten i editorn', { skip }, async () => {
  const { page, id } = await editorMed({ rotation: 30 });
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris på roten (transform=${m.transform}) — rotationen appliceras inte`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `fel vinkel: ${t.vinkel}° (väntade 30°)`);
  const [ox, oy] = m.origin.split(' ').map(parseFloat);
  assert.ok(Math.abs(ox - m.bredd / 2) < 1 && Math.abs(oy - m.hojd / 2) < 1,
    `origin är ${m.origin}, inte mitten (${m.bredd / 2} ${m.hojd / 2}) — Davids beslut är center`);
});

test('rotationen når sändningen genom den riktiga overlay-vägen', { skip }, async () => {
  const page = await overlayMed({ rotation: -45 });
  const m = await matris(page, null);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris i sändningen (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel + 45) < 0.5, `fel vinkel i sändningen: ${t.vinkel}° (väntade -45°)`);
});

test('en sparad widgetScaleY sträcker inte sändningen — den blir en likformig skala', { skip }, async () => {
  // Beslut 2026-10-18: inget innehåll sträcks. Komposören skriver bara rotate(θ), och en sparad
  // widgetScaleY migreras till en likformig widgetScale (ytan bevaras) när widgeten ritas.
  const page = await overlayMed({ widgetScaleY: 1.5 });
  const m = await matris(page, null);
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((state.widgets || [])[0] || null)));
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(!t || Math.abs(t.scaleY - 1) < 0.001, `sändningen är sträckt: ${m.transform}`);
  assert.ok(w, 'widgeten finns inte i sändningens state');
  assert.equal('widgetScaleY' in w, false, 'widgetScaleY migrerades inte bort');
  assert.ok(Math.abs(w.widgetScale - Math.round(Math.sqrt(1.5) * 1000) / 1000) < 0.002, `skalan blev ${w.widgetScale}, väntade √1.5`);
});

test('komposörskontraktet: rotationen ensam i matrisen, även med en sparad widgetScaleY', { skip }, async () => {
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `fel vinkel: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1) < 0.001, `rotationen bär en sträckning: scaleY=${t.scaleY}`);
});

test('markeringen och komposören skriver inte om varandra — och ingen av dem sträcker', { skip }, async () => {
  // Samma widget, nu VALD i editorn — handtagens synk är aktiv samtidigt som komposören.
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  await page.evaluate(wid => { selected = wid; render(); }, id);
  await page.waitForTimeout(700);
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `markeringen raderade rotationen: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1) < 0.001, `markeringen sträckte roten: scaleY=${t.scaleY}`);
});

// ==== STEG 3-5: HANDTAGET, PANELFÄLTET OCH RESIZE UNDER ROTATION — RÖTT FÖRST ==================
//
// Handtaget ('rot', lollipop ovanför n) hör hemma i widget-handles synka()-mönstret. Vinkeln
// behöver INTE kanvasskalan: likformig scale bevarar vinklar, så atan2 kring mitten är
// zoominvariant — det ÄR beviset mot skalfällan (samma dragning vid skala 1 och 0.5 ska ge
// samma grader). Shift = 15°-steg. Panelfältet injiceras efter Höjd-fältet i den RENDERADE
// panelen (§9 — aldrig i props()-strängarna) och oninput patchar stil direkt (PR #221:
// textfält får inte riva vyn). Resize under rotation kontraroterar pekardeltat: vid 90° pekar
// e-handtaget nedåt på skärmen, så ett drag NEDÅT ska öka bredden.

async function editorMedVald(widgetProps, skala = 1) {
  const { page, id } = await editorMed(widgetProps);
  await page.evaluate(wid => { selected = wid; render(); }, id);
  await page.waitForTimeout(700);
  if (skala !== 1) {
    await page.evaluate(s => { document.querySelector('.canvas').style.transform = `scale(${s})`; }, skala);
    await page.waitForTimeout(300);
  }
  return { page, id };
}

const mitt = (page, id) => page.evaluate(wid => {
  const r = document.querySelector(`.canvas [data-id="${wid}"]`).getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, id);

async function draRotation(page, id, franGrader, tillGrader, radie, shift) {
  const { cx, cy } = await mitt(page, id);
  const punkt = g => [cx + radie * Math.cos(g * Math.PI / 180), cy + radie * Math.sin(g * Math.PI / 180)];
  const h = await page.evaluate(() => {
    const el = document.querySelector('[data-vyra-handle="rot"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { mx: r.left + r.width / 2, my: r.top + r.height / 2 };
  });
  assert.ok(h, 'rotationshandtaget saknas');
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(h.mx, h.my);
  await page.mouse.down();
  // pekarbanan följer en cirkel kring mitten — starta där handtaget faktiskt är, sluta vid målvinkeln
  const [sx, sy] = punkt(franGrader);
  await page.mouse.move(sx, sy, { steps: 3 });
  const [ex, ey] = punkt(tillGrader);
  await page.mouse.move(ex, ey, { steps: 6 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(400);
}

test('rotationshandtaget finns och är synligt vid markering (§8)', { skip }, async () => {
  const { page } = await editorMedVald({});
  const h = await page.evaluate(() => {
    const el = document.querySelector('[data-vyra-handle="rot"]');
    return { finns: !!el, synlig: !!el && el.offsetParent !== null };
  });
  await page.close();
  assert.ok(h.finns, 'inget rot-handtag på den valda widgeten');
  assert.ok(h.synlig, 'rot-handtaget finns men syns inte');
});

test('samma dragning ger samma vinkel vid kanvasskala 1 och 0.5 — vinkeln är zoominvariant', { skip }, async () => {
  const vinklar = [];
  for (const skala of [1, 0.5]) {
    const { page, id } = await editorMedVald({}, skala);
    await draRotation(page, id, -90, -50, 120, false);
    vinklar.push(await page.evaluate(wid => state.widgets.find(x => x.id === wid).rotation, id));
    await page.close();
  }
  assert.ok(typeof vinklar[0] === 'number' && Math.abs(vinklar[0]) > 5,
    `draget satte ingen vinkel (${vinklar[0]})`);
  assert.ok(Math.abs(vinklar[0] - vinklar[1]) < 3,
    `vinkeln beror på kanvasskalan: ${vinklar[0]}° vid 1.0 mot ${vinklar[1]}° vid 0.5 — skalfällan`);
});

test('Shift snäpper rotationen till 15°-steg', { skip }, async () => {
  const { page, id } = await editorMedVald({});
  await draRotation(page, id, -90, -52, 120, true);
  const rot = await page.evaluate(wid => state.widgets.find(x => x.id === wid).rotation, id);
  await page.close();
  assert.ok(typeof rot === 'number' && Math.abs(rot) > 1, `draget satte ingen vinkel (${rot})`);
  assert.equal(Math.abs(rot % 15), 0, `vinkeln ${rot}° är inte ett 15°-steg trots Shift`);
});

test('resize under rotation: vid 90° växer widgeten av e-handtaget när draget går NEDÅT på skärmen', { skip }, async () => {
  // Top Like är en fast komposition: handtaget ändrar den likformiga skalan (w.widgetScale), inte bredden.
  const { page, id } = await editorMedVald({ rotation: 90 });
  const fore = await page.evaluate(wid => Number(state.widgets.find(x => x.id === wid).widgetScale) || 1, id);
  const h = await page.evaluate(() => {
    const el = document.querySelector('[data-vyra-handle="e"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { mx: r.left + r.width / 2, my: r.top + r.height / 2 };
  });
  assert.ok(h, 'e-handtaget saknas');
  await page.mouse.move(h.mx, h.my);
  await page.mouse.down();
  await page.mouse.move(h.mx, h.my + 40, { steps: 5 });  // NEDÅT på skärmen = utåt längs widgetens e-axel vid 90°
  await page.mouse.up();
  await page.waitForTimeout(400);
  const efter = await page.evaluate(wid => JSON.parse(JSON.stringify(state.widgets.find(x => x.id === wid))), id);
  await page.close();
  assert.ok((Number(efter.widgetScale) || 1) > fore + 0.05,
    `widgeten växte inte (${fore} → ${efter.widgetScale}) — pekardeltat kontraroteras inte till widgetaxlarna`);
  assert.equal('widgetScaleY' in efter, false, 'handtaget skrev en sträckning');
});

test('panelfältet Rotation: synligt, oninput patchar stil utan render, onchange går genom save-tratten', { skip }, async () => {
  const { page, id } = await editorMedVald({});
  const falt = await page.evaluate(() => {
    const el = document.querySelector('#propRotation');
    return { finns: !!el, synlig: !!el && el.offsetParent !== null };
  });
  assert.ok(falt.finns, 'panelfältet #propRotation saknas');
  assert.ok(falt.synlig, 'panelfältet finns men syns inte (§8)');
  const resultat = await page.evaluate(async wid => {
    const el = document.querySelector('#propRotation');
    const nodFore = document.querySelector(`.canvas [data-id="${wid}"]`);
    el.focus();
    el.value = '45';
    el.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 100));
    const nodEfterInput = document.querySelector(`.canvas [data-id="${wid}"]`);
    const liveTransform = getComputedStyle(nodEfterInput).transform;
    const sammaNod = nodFore === nodEfterInput;          // PR #221: oninput får inte riva vyn
    el.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 400));
    return { liveTransform, sammaNod,
      iState: state.widgets.find(x => x.id === wid).rotation,
      sparat: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || [])
        .find(x => x.id === wid)?.rotation };
  }, id);
  await page.close();
  assert.ok(resultat.sammaNod, 'oninput rev vyn — PR #221-kontraktet brutet');
  assert.match(resultat.liveTransform, /matrix/, `ingen live-rotation vid oninput: ${resultat.liveTransform}`);
  assert.equal(resultat.iState, 45, 'onchange skrev inte w.rotation');
  assert.equal(resultat.sparat, 45, 'valet gick inte genom save-tratten');
});

// TRANSFORMSKALAN ÖVERLEVER ROTATIONEN (2026-10-19). Top Coins Halo och Signal Orbit skalar med
// `transform: scale(var(--tc-scale))` i topcoins-v2.css. VyraTransform skrev `rotate(θ) !important`
// på roten, vilket ersatte regeln helt: uppmätt före rättningen föll Halo vid widgetScale 1.6 från
// 368 till 230 px så fort den roterades. Nu komponeras skalan in i rotationen (vyra-rotation.js
// cssSkala/applicera): samma s på båda axlarna, och mitten står där den oroterade har den.
const tcMat = () => {
  const e = document.querySelector('.canvas [data-id="tcrot"]');
  if (!e) return null;
  const b = e.getBoundingClientRect();
  const m = /matrix\(([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)/.exec(getComputedStyle(e).transform) || [0, 1, 0, 0, 1];
  const [a, bb, c, d] = m.slice(1).map(Number);
  return { sx: Math.hypot(a, bb), sy: Math.hypot(c, d), vinkel: Math.atan2(bb, a) * 180 / Math.PI,
    mx: b.left + b.width / 2, my: b.top + b.height / 2, ow: e.offsetWidth, klass: e.className,
    lada: window.VyraTransform ? window.VyraTransform.lada(e) : null };
};

for (const design of ['halo', 'signal-orbit']) {
  test(`Top Coins ${design}: roterad behåller sin skala, X och Y lika, mitten kvar — editor och overlay`, { skip, timeout: 90000 }, async () => {
    const nyckel = `catalog:ranking:templateTopCoins:${design}`;
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    let sparad;
    try {
      await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
      await page.waitForTimeout(2500);
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      const r = await page.evaluate(async ([k, matSrc]) => {
        const mat = new Function(`return (${matSrc})()`);
        const vanta = () => new Promise(res => setTimeout(res, 250));
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(k);
        Object.assign(w, { id: 'tcrot', x: 120, y: 120, widgetScale: 1.6 });
        state.widgets.push(w); selected = null; render(); await vanta();
        const fore = mat();
        w.rotation = 15; render(); await vanta();
        const roterad = mat();
        const sparad = JSON.parse(JSON.stringify(w));
        // Handtagsdraget skriver skalan utan render() (satSkala) — den roterade transformen ska följa.
        window.VyraTransform.satSkala(w, document.querySelector('.canvas [data-id="tcrot"]'), 2); await vanta();
        return { fore, roterad, drag: mat(), sparad, state: JSON.parse(JSON.stringify(w)) };
      }, [nyckel, tcMat.toString()]);
      sparad = r.sparad;
      assert.match(r.fore.klass, /vyra-topcoins-new/, `${nyckel} ritas inte längre av topcoins-v2 — provet mäter fel sak`);
      assert.ok(Math.abs(r.fore.sx - 1.6) < 0.01 && Math.abs(r.fore.sy - 1.6) < 0.01, `oroterad skala ${r.fore.sx}/${r.fore.sy}`);
      assert.ok(Math.abs(r.roterad.sx - 1.6) < 0.01, `roterad tappade skalan: X ${r.roterad.sx.toFixed(3)} (väntade 1.6)`);
      assert.ok(Math.abs(r.roterad.sx - r.roterad.sy) < 0.001, `X ${r.roterad.sx} och Y ${r.roterad.sy} skiljer sig`);
      assert.ok(Math.abs(r.roterad.vinkel - 15) < 0.5, `vinkeln ${r.roterad.vinkel}`);
      assert.ok(Math.abs(r.roterad.mx - r.fore.mx) <= 2 && Math.abs(r.roterad.my - r.fore.my) <= 2,
        `rotationen flyttade mitten (${(r.roterad.mx - r.fore.mx).toFixed(1)}, ${(r.roterad.my - r.fore.my).toFixed(1)})`);
      assert.ok(Math.abs(r.roterad.lada.width - r.fore.ow * 1.6) < 1, `lådan räknar inte med skalan: ${r.roterad.lada.width}`);
      assert.ok(Math.abs(r.drag.sx - 2) < 0.01 && Math.abs(r.drag.sx - r.drag.sy) < 0.001, `satSkala under rotation: ${r.drag.sx}/${r.drag.sy}`);
      assert.equal('widgetScaleY' in r.state, false);
    } finally { await page.close() }

    // Samma sparade widget i sändningen (studio.html?overlay=1, samma render-kedja som overlay.html).
    const ov = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await ov.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
      await ov.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets, null, { timeout: 30000, polling: 100 });
      await ov.waitForTimeout(2500);
      assert.match(await ov.evaluate(() => document.documentElement.className), /overlay-output/, 'sidan är inte i overlay-läge');
      const o = await ov.evaluate(async ([w, matSrc]) => {
        state.widgets.length = 0; state.widgets.push(w); selected = null; render();
        await new Promise(res => setTimeout(res, 500));
        return new Function(`return (${matSrc})()`)();
      }, [sparad, tcMat.toString()]);
      assert.ok(o, 'widgeten ritades inte i overlayn');
      assert.ok(Math.abs(o.sx - 1.6) < 0.01 && Math.abs(o.sx - o.sy) < 0.001, `overlay: X ${o.sx} Y ${o.sy}`);
      assert.ok(Math.abs(o.vinkel - 15) < 0.5, `overlay: vinkeln ${o.vinkel}`);
    } finally { await ov.close() }
  });
}
