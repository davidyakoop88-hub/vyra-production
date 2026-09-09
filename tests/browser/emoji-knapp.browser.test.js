'use strict';
// EMOJI I TEXTFÄLTEN — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD: "lägga till emoji som man skriver på sms". Windows-tangenten och punkt öppnar redan
// systemets emoji-väljare i vilket textfält som helst, men det vet nästan ingen — därför en knapp
// som syns.
//
// VILKA FÄLT, och varför inte alla. Uppmätt över fem widgets 2026-09-09 bär panelerna tre sorters
// textfält:
//   * text som tittarna ser        ctwText, heartTitle, followLabel, followName, followMessage
//   * sökvägar till bilder         pfTopGiftProfile, pfTopGiftGift, followProfile
//   * interna namn                 runtimePresetName, och de dolda pt/pv
// En emoji i en bildsökväg ger en trasig bild, och i ett presetnamn ett filnamn ingen kan söka på.
// Knappen hör bara till den första gruppen.
//
// KONTRAKTET: knappen finns vid text som visas, saknas vid sökvägar och interna namn, och en emoji
// hamnar VID MARKÖREN — inte sist. Att alltid lägga sist hade gjort knappen oanvändbar mitt i en
// mening, vilket är precis där man vill ha en emoji.
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

async function panelen(nyckel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, nyckel);
  await page.waitForTimeout(800);
  return page;
}

// Fält som SKA ha knappen, per widget.
const SKA_HA = [
  ['catalog:custom:text', 'ctwText'],
  ['catalog:heartgoal:classic', 'heartTitle'],
  ['catalog:followeralert', 'followLabel'],
  ['catalog:followeralert', 'followMessage'],
  ['catalog:lastx:card', 'followName'],
];

// Fält som INTE ska ha den.
const SKA_INTE = [
  ['catalog:topgift:premium:royal', 'pfTopGiftProfile', 'sökväg till en bild'],
  ['catalog:followeralert', 'followProfile', 'sökväg till en bild'],
  ['catalog:custom:text', 'runtimePresetName', 'internt namn'],
];

const harKnapp = (page, id) => page.evaluate(f => {
  const el = document.querySelector('.properties #' + f);
  if (!el) return { finns: false };
  const rad = el.closest('label') || el.parentElement;
  return { finns: true, knapp: !!(rad && rad.querySelector('.vyra-emoji-knapp')) };
}, id);

for (const [nyckel, falt] of SKA_HA) {
  test(`${nyckel} #${falt}: har en emoji-knapp`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const ut = await harKnapp(page, falt);
      assert.ok(ut.finns, `${nyckel}: fältet #${falt} finns inte i panelen`);
      assert.equal(ut.knapp, true, `${nyckel}: #${falt} saknar emoji-knapp`);
    } finally { await page.close(); }
  });
}

for (const [nyckel, falt, varfor] of SKA_INTE) {
  test(`${nyckel} #${falt}: har INGEN emoji-knapp (${varfor})`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const ut = await harKnapp(page, falt);
      assert.ok(ut.finns, `${nyckel}: fältet #${falt} finns inte i panelen`);
      assert.equal(ut.knapp, false,
        `${nyckel}: #${falt} fick en emoji-knapp, men är ${varfor}`);
    } finally { await page.close(); }
  });
}

test('en emoji hamnar vid markören och når widgeten', { skip }, async () => {
  const page = await panelen('catalog:custom:text');
  try {
    const ut = await page.evaluate(() => {
      const falt = document.querySelector('.properties #ctwText');
      falt.value = 'Hej David';
      falt.dispatchEvent(new Event('input', { bubbles: true }));
      falt.focus();
      falt.setSelectionRange(3, 3);              // markören efter "Hej"

      const knapp = (falt.closest('label') || falt.parentElement).querySelector('.vyra-emoji-knapp');
      if (!knapp) return { fel: 'ingen knapp' };
      knapp.click();

      const val = document.querySelector('.vyra-emoji-val');
      if (!val) return { fel: 'väljaren öppnades inte' };
      const forsta = val.querySelector('button');
      if (!forsta) return { fel: 'väljaren har inga emoji' };
      const tecken = forsta.textContent.trim();
      forsta.click();

      // Markoren sätts om i en mikrotask nar panelen ritat om sig — vänta in den.
      return new Promise(klar => setTimeout(() => klar({
        tecken,
        varde: document.querySelector('.properties #ctwText').value,
        iWidgeten: state.widgets[0].customText,
        markor: document.querySelector('.properties #ctwText').selectionStart,
      }), 150));
    });
    assert.ok(!ut.fel, ut.fel);
    assert.equal(ut.varde, 'Hej' + ut.tecken + ' David',
      `emojin hamnade fel: "${ut.varde}" (väntade den efter "Hej")`);
    assert.equal(ut.iWidgeten, ut.varde,
      `widgeten fick "${ut.iWidgeten}" men fältet visar "${ut.varde}"`);
    assert.equal(ut.markor, 3 + ut.tecken.length,
      `markören hamnade på ${ut.markor}, väntade efter den infogade emojin`);
  } finally { await page.close(); }
});

test('väljaren stängs med Escape', { skip }, async () => {
  const page = await panelen('catalog:custom:text');
  try {
    const kvar = await page.evaluate(() => {
      const falt = document.querySelector('.properties #ctwText');
      (falt.closest('label') || falt.parentElement).querySelector('.vyra-emoji-knapp').click();
      if (!document.querySelector('.vyra-emoji-val')) return 'öppnades aldrig';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.querySelector('.vyra-emoji-val') ? 'kvar' : null;
    });
    assert.equal(kvar, null, `väljaren ${kvar} efter Escape`);
  } finally { await page.close(); }
});
