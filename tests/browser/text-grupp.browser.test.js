'use strict';
// EN GEMENSAM TEXTGRUPP FÖR ALLA WIDGETS — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD: "vi har mer men ändå ser kaos ut", efter att ha jämfört med Tiktory, som har SAMMA
// TEXT-grupp i varje widget. Mätningen bakom det: av 21 widgetfamiljer har 8 typsnitt, 8 textstorlek,
// 3 skugga, 2 kontur och 1 regnbåge. Kan man byta typsnitt i Top Like men inte i Top Gift går
// systemet inte att lära sig — det är därför det känns rörigt trots att VYRA har mer än konkurrenten.
//
// VAD GRUPPEN STYR, och varför inte allt:
//   typsnitt      21 font-family-regler i CSS att övervinna — säkert
//   kontur         8 -webkit-text-stroke-regler — funktionen saknas nästan helt
//   skugga       136 text-shadow-regler, men skugga är additiv — hanterbart
//   textskala    646 font-size-regler bär varje widgets proportioner. En absolut storlek hade
//                 plattat ut dem allihop, så gruppen erbjuder en MULTIPLIKATOR i stället.
//   (färg)       935 color-regler bär widgetarnas design — guld för värdet, vitt för namnet.
//                 En global färg hade suddat ut den skillnaden, så färgen ligger kvar hos
//                 familjerna. Det är en medveten avvikelse från "samma grupp som Tiktory".
//
// ATT NÅ TEXTEN. Widgetarna delar ingen markupform — samma skäl som widget-background.js anger för
// sin DOM-efterbehandling. Men bakgrunden räcker det att sätta på roten, och typografi ärvs INTE
// hit: elva CSS-regler sätter font-family och 46 sätter text-shadow på element INNE i widgetarna.
// Stilen måste därför landa på de element som faktiskt bär text.
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

// Ett tvärsnitt över familjer med olika markupform: premium, klassisk, lista, alert, egen text.
const WIDGETS = [
  'catalog:topgift:premium:royal',
  'catalog:topstreak:premium:liquid',
  'catalog:toplike:clean',
  'catalog:fanlevel:gold',
  'catalog:lastx:card',
  'catalog:custom:text',
  'catalog:heartgoal:classic',
];

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

async function seeda(page, nyckel, falt) {
  await page.evaluate(([n, f]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    Object.assign(w, f || {});
    state.widgets.push(w);
    selected = w.id;
    render();
  }, [nyckel, falt]);
  await page.waitForTimeout(700);
}

// Läser den beräknade stilen på widgetens textbärande blad — de element som faktiskt visar text.
const textBlad = page => page.evaluate(() => {
  const rot = document.querySelector(`.canvas [data-id="${state.widgets[0].id}"]`);
  if (!rot) return null;
  const ut = [];
  for (const el of rot.querySelectorAll('*')) {
    if (el.children.length || !(el.textContent || '').trim()) continue;
    const cs = getComputedStyle(el);
    ut.push({
      text: el.textContent.trim().slice(0, 14),
      font: cs.fontFamily,
      storlek: parseFloat(cs.fontSize),
      skugga: cs.textShadow,
      kontur: cs.webkitTextStrokeWidth,
    });
  }
  return ut;
});

for (const nyckel of WIDGETS) {
  test(`${nyckel}: panelen har en TEXT-grupp`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel);
      const grupper = await page.evaluate(() =>
        [...document.querySelectorAll('.properties > .property-group')]
          .map(g => (g.querySelector('h4, .pg-toggle')?.textContent || '').replace(/[▸▾›]/g, '').trim()));
      assert.ok(grupper.some(g => /^TEXT$/i.test(g)),
        `${nyckel}: ingen TEXT-grupp i panelen. Grupperna är: ${grupper.join(' | ')}`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: typsnittet slår igenom på texten`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { textFont: 'Georgia' });
      const blad = await textBlad(page);
      assert.ok(blad && blad.length, `${nyckel}: hittade inga textbärande element`);
      const fel = blad.filter(b => !/georgia/i.test(b.font));
      assert.deepEqual(fel.map(f => `"${f.text}" har ${f.font}`), [],
        `${nyckel}: ${fel.length} av ${blad.length} textelement fick inte Georgia`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: konturen slår igenom`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { textOutline: 2, textOutlineColor: '#ff0000' });
      const blad = await textBlad(page);
      assert.ok(blad && blad.length, `${nyckel}: hittade inga textbärande element`);
      const utan = blad.filter(b => !(parseFloat(b.kontur) >= 2));
      assert.deepEqual(utan.map(f => `"${f.text}" har ${f.kontur}`), [],
        `${nyckel}: ${utan.length} av ${blad.length} textelement fick ingen 2px kontur`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: skuggan slår igenom`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { textShadowBlur: 6, textShadowColor: '#000000' });
      const blad = await textBlad(page);
      assert.ok(blad && blad.length, `${nyckel}: hittade inga textbärande element`);
      const utan = blad.filter(b => b.skugga === 'none' || !b.skugga);
      assert.deepEqual(utan.map(f => `"${f.text}"`), [],
        `${nyckel}: ${utan.length} av ${blad.length} textelement saknar skugga`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: textskalan ändrar storleken proportionellt`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel);
      const fore = await textBlad(page);
      assert.ok(fore && fore.length, `${nyckel}: hittade inga textbärande element`);

      await seeda(page, nyckel, { textScale: 1.5 });
      const efter = await textBlad(page);
      assert.equal(efter.length, fore.length, `${nyckel}: antalet textelement ändrades av skalan`);

      // PARAS PÅ TEXTEN, INTE PÅ INDEX. Widgetarna renderas om från grunden mellan mätningarna och
      // bladens ordning är inte stabil — uppmätt: "@StreamQueen" jämfördes mot rubrikens 13 px och
      // gav 2,31x, fast själva skalningen var korrekt. Elementet identifieras därför av sin text.
      const storlekPer = rader => {
        const m = new Map();
        for (const r of rader) if (!m.has(r.text)) m.set(r.text, r.storlek);
        return m;
      };
      const a = storlekPer(fore), b = storlekPer(efter);

      // PROPORTIONELLT, inte likformigt: en widget vars rubrik är 14 px och namn 25 px ska behålla
      // den skillnaden. Därför mäts kvoten per element, inte ett gemensamt slutvärde.
      const fel = [];
      for (const [text, foreStorlek] of a) {
        const efterStorlek = b.get(text);
        if (efterStorlek === undefined) continue;      // texten ändrades av seedningen
        const kvot = efterStorlek / foreStorlek;
        if (Math.abs(kvot - 1.5) > 0.06) {
          fel.push(`"${text}" ${foreStorlek}px -> ${efterStorlek}px (${kvot.toFixed(2)}x)`);
        }
      }
      assert.ok(a.size > 0, `${nyckel}: inga textelement att jämföra`);
      assert.deepEqual(fel, [], `${nyckel}: ${fel.length} element skalades inte med 1,5`);
    } finally { await page.close(); }
  });
}
