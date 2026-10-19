'use strict';
// ÄRV FÄRGSCHEMA GÖR DET ETIKETTEN SÄGER (panelspecifikationen 4.1).
//
// Testschemat (#123456 bakgrund, #12ab34 accent, #edcba9 text, #a1b2c3 sekundär text, Impact) sätts
// i state.brandKit. För varje modell med registerpost som erbjuder arvet kräver provet att
//   * kryssrutan "Ärv färgschema" finns i sektion 5 och listar vad som ärvs ("Ärver: …"),
//   * varje del i listan hamnar i minst en synlig nods beräknade stil när arvet slås PÅ i panelen,
//     och att ingen av dem syns när arvet är AV (före och efter),
//   * de egna kontrollerna för de delarna blir inaktiva med texten "Från färgschemat" när arvet är på.
// En modell utan arv får ingen kryssruta (provas med en modell utan registerpost).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

const SCHEMA = { background: '#123456', highlight: '#12ab34', text: '#edcba9', secondaryText: '#a1b2c3', fontFamily: 'Impact' };
// Etikettens ord → vad som ska synas i stilen.
const SPAR = {
  'accentfärg': { rgb: 'rgb(18, 171, 52)' },
  'textfärg': { rgb: 'rgb(237, 203, 169)' },
  'andra färgen': { rgb: 'rgb(161, 178, 195)' },
  'bakgrundsfärg': { rgb: 'rgb(18, 52, 86)' },
  'typsnitt': { font: 'Impact' },
};
// egna: modellens egna kontroller för det som ärvs (data-pr-kontroll), som ska bli inaktiva.
// arver: exakt vad "Ärver: …" ska säga (spec 4.2).
const TOPGIFT = { egna: ['falt:accent', 'falt:textFont'], arver: ['accentfärg', 'textfärg', 'typsnitt'] };
const MODELLER = [
  Object.assign({ namn: 'Top Gift · Design 1 (neon)', nyckel: 'catalog:topgift:premium:neon' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 2 (royal)', nyckel: 'catalog:topgift:premium:royal' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 3 (fokus)', nyckel: 'catalog:topgift:premium:fokus' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 4 (Signal Orbit)', nyckel: 'catalog:ranking:templateTopCoins:signal-orbit' }, TOPGIFT),
  // Last-X (PR 5): plattorna ärver accent, text, andra färgen och typsnitt; royal och banderollerna
  // bara typsnittet — färgerna når där bara delar som designen döljer.
  { namn: 'Last-X · card', nyckel: 'catalog:lastx:card', egna: ['falt:followColor', 'falt:textFont'],
    arver: ['accentfärg', 'textfärg', 'andra färgen', 'typsnitt'] },
  { namn: 'Last-X · royal', nyckel: 'catalog:lastx:royal', egna: ['falt:textFont'], arver: ['typsnitt'] },
  { namn: 'Last-X · crownBanner', nyckel: 'catalog:lastx:crownBanner', egna: ['falt:textFont'], arver: ['typsnitt'] },
];

let server, browser, bas;
const skip = hoppaOver();

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

async function oppna(nyckel, fel, extra) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([n, schema, extra]) => {
    state.brandKit = schema;
    state.widgets.length = 0;
    const w = Object.assign(window.VyraWidgets.create(n), extra || {}); w.id = 'arv'; w.x = 200; w.y = 200;
    state.widgets.push(w); selected = w.id; render();
  }, [nyckel, SCHEMA, extra || null]);
  await page.waitForTimeout(1200);
  return page;
}

// Alla färger och typsnitt i widgetens synliga noder.
const stilar = page => page.evaluate(() => {
  const rot = document.querySelector('.canvas .widget[data-id="arv"]');
  const ut = { farger: new Set(), typsnitt: new Set() };
  for (const n of [rot, ...rot.querySelectorAll('*')]) {
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const c = getComputedStyle(n);
    if (c.visibility === 'hidden' || c.display === 'none') continue;
    const text = [c.color, c.backgroundColor, c.backgroundImage, c.borderTopColor, c.borderLeftColor, c.boxShadow, c.textShadow,
      c.filter, c.webkitTextFillColor, c.outlineColor, c.fill, c.stroke].join(' ');
    (text.match(/rgba?\([^)]*\)/g) || []).forEach(x => ut.farger.add(x.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, 'rgb($1, $2, $3)')));
    if ((n.textContent || '').trim() && !n.children.length) ut.typsnitt.add(c.fontFamily);
  }
  return { farger: [...ut.farger], typsnitt: [...ut.typsnitt] };
});

function syns(st, del) {
  const s = SPAR[del];
  if (s.rgb) return st.farger.some(f => f.startsWith(s.rgb.replace(')', '')));
  return st.typsnitt.some(f => f.includes(s.font));
}

for (const m of MODELLER) {
  test(`fargarv-sant: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(m.nyckel, fel);
    try {
      await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
      const ruta = await page.evaluate(() => {
        const cb = document.querySelector('.properties [data-panelram-sektion="5"] #pr-inheritBrandKit');
        const lista = document.querySelector('.properties .pr-arv-lista');
        return { finns: !!cb, pa: cb && cb.checked, lista: lista ? lista.textContent : '' };
      });
      assert.equal(ruta.finns, true, 'Ärv färgschema finns i sektion 5');
      assert.equal(ruta.pa, false, 'arvet är av från början');
      const delar = ruta.lista.replace(/^Ärver:\s*/, '').replace(/\.$/, '').split(/,\s*|\s+och\s+/).filter(Boolean);
      assert.ok(delar.length > 0, 'listan säger vad som ärvs');
      for (const d of delar) assert.ok(SPAR[d], `okänd del i listan: ${d}`);
      assert.deepEqual(delar, m.arver, 'Ärver: … listar modellens delar');

      const av = await stilar(page);
      for (const d of delar) assert.equal(syns(av, d), false, `${d} syns redan innan arvet är på — provet säger då ingenting`);

      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => liveWidget('arv').inheritBrandKit), true, 'kryssrutan sparar w.inheritBrandKit');
      const pa = await stilar(page);
      for (const d of delar) assert.equal(syns(pa, d), true, `${d}: arvet är på men färgschemats värde syns inte i widgeten`);

      // De egna kontrollerna för det som ärvs är inaktiva.
      const inaktiva = await page.evaluate(egna => ({
        egna: egna.map(n => { const el = [...document.querySelectorAll(`.properties [data-pr-kontroll="${n}"] input, .properties [data-pr-kontroll="${n}"] select`)];
          return [n, el.length > 0 && el.every(i => i.disabled)]; }),
        text: [...document.querySelectorAll('.properties .pr-fran-schema')].map(n => n.textContent),
      }), m.egna);
      for (const [n, av] of inaktiva.egna) assert.equal(av, true, `${n} är inaktiv när den ärvs`);
      assert.ok(inaktiva.text.length >= m.egna.length && inaktiva.text.every(t => t === 'Från färgschemat'), 'texten Från färgschemat');

      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      const avIgen = await stilar(page);
      for (const d of delar) assert.equal(syns(avIgen, d), false, `${d} ligger kvar när arvet slagits av`);
      assert.equal(await page.evaluate(n => document.querySelector(`.properties [data-pr-kontroll="${n}"] input, .properties [data-pr-kontroll="${n}"] select`).disabled, m.egna[0]), false,
        'den egna kontrollen är aktiv igen');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('fargarv-sant: en modell som inte erbjuder arvet har ingen kryssruta', { skip, timeout: 120000 }, async () => {
  const fel = [];
  // Top Gift med gåvoram har ingen registerpost (klassiska renderaren) — ramen rör inte panelen.
  const page = await oppna('catalog:topgift:premium:neon', fel, { giftFrame: 'gold' });
  try {
    assert.equal(await page.$('#pr-inheritBrandKit'), null);
  } finally {
    await page.close();
  }
});
