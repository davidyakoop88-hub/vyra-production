'use strict';
// Rotationens kontrakt i riktig Chrome — skrivet RÖTT FÖRST (vyra-rotation.js finns inte än).
//
// BESLUTEN SOM PROVAS (Davids val 2026-08-18):
//   * transform-origin är CENTER — widgeten roterar runt sin mitt som i varje designverktyg.
//   * widgetScaleY-luckan LÄKS: lodrät sträckning appliceras i dag bara på `.widget.selected`
//     (widget-handles synka()), och i sändningen är inget valt — sträckning har alltså ALDRIG
//     nått OBS. Komposören blir transformens enda skrivare och applicerar båda överallt.
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

test('LÄKNINGEN: widgetScaleY når sändningen — utan att något är valt', { skip }, async () => {
  // RÖTT I DAG av rätt skäl: synka() applicerar bara på .widget.selected, och i sändningen är
  // inget valt. Davids beslut 2026-08-18: komposören applicerar sträckningen överallt.
  const page = await overlayMed({ widgetScaleY: 1.5 });
  const m = await matris(page, null);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris i sändningen (transform=${m.transform}) — sträckningen når fortfarande inte OBS`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `fel scaleY i sändningen: ${t.scaleY} (väntade 1.5)`);
});

test('komposörskontraktet: rotation och sträckning i SAMMA matris', { skip }, async () => {
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `rotationen förlorade mot sträckningen: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `sträckningen förlorade mot rotationen: scaleY=${t.scaleY}`);
});

test('markeringens sträckningsväg och komposören skriver inte om varandra', { skip }, async () => {
  // Samma widget, nu VALD i editorn — synka()-vägen är aktiv samtidigt som komposören.
  // Den som skriver sist får inte vinna tyst: slutmatrisen ska bära BÅDA värdena.
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  await page.evaluate(wid => { selected = wid; render(); }, id);
  await page.waitForTimeout(700);
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `markeringen raderade rotationen: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `markeringen raderade sträckningen: scaleY=${t.scaleY}`);
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

test('resize under rotation: vid 90° ökar e-handtaget bredden när draget går NEDÅT på skärmen', { skip }, async () => {
  const { page, id } = await editorMedVald({ rotation: 90 });
  const fore = await page.evaluate(wid => state.widgets.find(x => x.id === wid).width, id);
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
  const efter = await page.evaluate(wid => state.widgets.find(x => x.id === wid).width, id);
  await page.close();
  assert.ok(efter > fore + 20,
    `bredden växte inte (${fore} → ${efter}) — pekardeltat kontraroteras inte till widgetaxlarna`);
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

