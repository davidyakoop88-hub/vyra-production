'use strict';
// Verktygsraden ovanfor duken i Layout far aldrig ga ihop (granskningsfynd F01, 2026-10-17).
//
// LAGET FORE, uppmatt med samma matning som nedan: raden var `flex-wrap:nowrap` med fast
// `height:40px`. .layout-format-picker har min-width:0, sa raden krympte formatgruppen under sitt
// innehall och knapparna rann ut over Angra/Gor om, Bakgrund och Testevent. Krockar vid 1024,
// 1145, 1280, 1366, 1440 och 1600 px fonster; "Gor om" och "Dator 16:9 · 1920 × 1080" brots
// dessutom inne i knappen, och knappar lag utanfor mittkolumnen vid alla bredder.
//
// Grupperna monteras av fyra filer (layout-format.js, vyra-historik.js, stage-background.js,
// vyra-zoom.js). Provet fragar darfor inte vem som byggt vad — bara om rektanglarna pa skarmen
// skar varandra, och om de ryms i mittkolumnen.
//
// VARFOR RIKTIG WEBBLASARE: allt harinne ar getBoundingClientRect. jsdom saknar layout och svarar
// 0 for allt, sa provet hade varit gront aven med raden helt hopkrockad.
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

// Bredderna fran granskningen (1145 och 1366 var skarmbilderna) plus grannarna runt dem.
const BREDDER = [1024, 1145, 1280, 1366, 1440];

const MAT = () => {
  const tb = document.querySelector('.editor-shell .editor-toolbar');
  const wa = document.querySelector('.editor-shell .workarea');
  if (!tb || !wa) return { fel: 'verktygsraden eller mittkolumnen saknas' };
  const t = tb.getBoundingClientRect(), a = wa.getBoundingClientRect();
  const synlig = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const delar = [...tb.querySelectorAll('button, .layout-format-picker>span, output, [data-zoom-niva]')]
    .filter(synlig)
    .filter(e => !e.closest('.sb-popover'));
  const namn = e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) || e.className || e.tagName;
  const r = delar.map(e => ({ n: namn(e), e, b: e.getBoundingClientRect() }));
  const krockar = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const A = r[i], B = r[j];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    const x = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
    const y = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
    if (x > 0.5 && y > 0.5) krockar.push(`${A.n} × ${B.n}`);
  }
  const utanforKolumnen = r.filter(d => d.b.left < a.left - 0.5 || d.b.right > a.right + 0.5).map(d => d.n);
  // Raden har ingen fast hojd langre: allt som syns maste ligga inom radens egen ruta, annars
  // klipps det eller ritas ovanpa lankraden under.
  const utanforRaden = r.filter(d => d.b.top < t.top - 0.5 || d.b.bottom > t.bottom + 0.5).map(d => d.n);
  // En knapp vars text bryts blir minst dubbelt sa hog som en rad text — da har raden krympt den.
  const brutnaKnappar = r.filter(d => d.e.tagName === 'BUTTON').filter(d => {
    const lh = parseFloat(getComputedStyle(d.e).lineHeight) || parseFloat(getComputedStyle(d.e).fontSize) * 1.3;
    return d.b.height > lh * 2 + 4;
  }).map(d => d.n);
  const zoom = document.querySelector('[data-vy-kontroll]');
  return {
    mittkolumn: Math.round(a.width), radhojd: Math.round(t.height), antal: r.length,
    namn: r.map(d => d.n), krockar, utanforKolumnen, utanforRaden, brutnaKnappar,
    zoomFranOverkant: zoom ? Math.round(zoom.getBoundingClientRect().top - t.top) : null,
    // Bara radens egen bredd: duken (432 px) ar bredare an mittkolumnen vid 1024-1145 och far
    // rulla mittkolumnen — det ar en annan fraga an verktygsraden.
    radenSvamarOver: tb.scrollWidth > tb.clientWidth + 1,
  };
};

test('verktygsraden i Layout: inga knappar overlappar och allt ryms i mittkolumnen', { skip, timeout: 180000 }, async () => {
  const page = await browser.newPage({ viewport: { width: BREDDER[0], height: 900 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    // Alla fyra grupperna maste vara monterade, annars mater provet en halvtom rad.
    await page.waitForFunction(() => {
      const tb = document.querySelector('.editor-shell .editor-toolbar');
      return !!tb && !!tb.querySelector('.layout-format-picker') && !!tb.querySelector('[data-angra]')
        && !!tb.querySelector('.scenbakgrund-kontroll') && !!tb.querySelector('[data-vy-kontroll]')
        && !!tb.querySelector('#testEvent');
    }, null, { timeout: 30000, polling: 100 });

    const fel = [];
    for (const bredd of BREDDER) {
      await page.setViewportSize({ width: bredd, height: 900 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(MAT);
      assert.ok(!m.fel, m.fel);
      // Kontrollmatning: matningen ser verkligen knapparna (Format, Mobil, Dator, Angra, Gor om,
      // Bakgrund, Testevent, minus, procent, plus, Anpassa, snapp). Hittar den farre har
      // selektorn tappat dem och ett tomt resultat hade sett ut som "inga krockar".
      if (m.antal < 10) fel.push(`${bredd} px: matningen hittade bara ${m.antal} delar (${m.namn.join(', ')})`);
      if (m.krockar.length) fel.push(`${bredd} px (mittkolumn ${m.mittkolumn}): overlapp ${m.krockar.join('; ')}`);
      if (m.utanforKolumnen.length) fel.push(`${bredd} px: utanfor mittkolumnen ${m.utanforKolumnen.join(', ')}`);
      if (m.utanforRaden.length) fel.push(`${bredd} px: utanfor verktygsraden (klipps) ${m.utanforRaden.join(', ')}`);
      if (m.brutnaKnappar.length) fel.push(`${bredd} px: knapptext bruten ${m.brutnaKnappar.join(', ')}`);
      if (m.radenSvamarOver) fel.push(`${bredd} px: verktygsradens innehall ar bredare an raden`);
    }
    assert.deepEqual(fel, [], fel.join('\n'));
  } finally { await page.close() }
});

test('zoomen stannar i verktygsradens forsta rad nar raden bryts', { skip, timeout: 90000 }, async () => {
  // Brytningen far inte skicka ner zoomen: zoom- och editor-ui-placeringsproven kraver <=40 px
  // fran radens overkant. Vid 1366 och 1440 ryms Format och zoom bredvid varandra.
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-toolbar [data-vy-kontroll]')
      && !!document.querySelector('.editor-toolbar .layout-format-picker'), null, { timeout: 30000, polling: 100 });
    for (const bredd of [1366, 1440]) {
      await page.setViewportSize({ width: bredd, height: 900 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(MAT);
      assert.ok(m.zoomFranOverkant !== null && m.zoomFranOverkant <= 40,
        `${bredd} px: zoomen ar ${m.zoomFranOverkant} px fran verktygsradens overkant`);
    }
  } finally { await page.close() }
});

test('raden ar lika hog fore och efter att grupperna monterats (duken hoppar inte)', { skip, timeout: 90000 }, async () => {
  // layout-safe.js ritar raden med bara Testevent; Format, Angra/Gor om, Bakgrund och zoom
  // monteras av MutationObservers efterat. En radbrytande rad som vaxer da flyttar duken nedat
  // under den som mater direkt efter render() — widget-las-provet klickade 34 px fel av det.
  // Vid 1366 och 1600 (tva rader) ska hojden vara densamma. Smalare an ~1300 px kan zoomen
  // behova en egen tredje rad, och den raden gar inte att reservera i forvag.
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-toolbar [data-vy-kontroll]'),
      null, { timeout: 30000, polling: 100 });
    for (const bredd of [1366, 1600]) {
      await page.setViewportSize({ width: bredd, height: 1000 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(async () => {
        render();
        const tb = () => document.querySelector('.editor-shell .editor-toolbar');
        const fore = tb().getBoundingClientRect().height;
        const barn = tb().children.length;
        await new Promise(r => setTimeout(r, 300));
        return { fore: Math.round(fore), efter: Math.round(tb().getBoundingClientRect().height),
          barnFore: barn, barnEfter: tb().children.length };
      });
      // Kontrollmatning: monteringen ska verkligen ske efter render(), annars bevisar provet inget.
      assert.ok(m.barnEfter > m.barnFore, `${bredd} px: grupperna fanns redan direkt efter render() (${m.barnFore} barn)`);
      assert.equal(m.efter, m.fore, `${bredd} px: raden var ${m.fore} px direkt efter render() och ${m.efter} px efter monteringen`);
    }
  } finally { await page.close() }
});
