'use strict';
// SKINN-REGLERNA HOR TILL TOP LIKE — OCH BARA DIT.
//
// toplike-studio.js:212 stamplar `skin-${skin}` med en STRANGERSATTNING pa `class="widget
// vyra-toplike`, och RANKING_TYPES ar ['templateTopLike','templateTopCoins','templateTopPoints'].
// Alla tre far darfor `skin-clean-bar` (okand skin -> clean-bar), aven de som har egna designer.
// Uppmatt 2026-09-21 i riktig Chromium pa main (2aa070c), fore scopningen:
//
//   Top Coins halo          display=grid  kolumner=42px 162.422px 11.5781px  hojd=42px
//   Top Coins signal-orbit  IDENTISK med halo — de tva designerna hade samma radgeometri
//
// De vardena ar clean-bars, inte designens: `.widget.vyra-toplike.skin-clean-bar .toplike-row`
// ar (0,4,0) och topcoins-v2.css:s enda radregel `html body .widget.vyra-topcoins-new
// .toplike-row` ar (0,3,2). Bada ar !important, och fler klasser slar fler element — !important
// pa bada sidor avgor ingenting. Samma klamning gav Top Points buggen dar Podium ritade Neons
// bild (se tests/browser/toppoints-designer.browser.test.js).
//
// VARFOR :where(). Scopningen lades som `:where(.vyra-templatetoplike)` och inte som en vanlig
// klass. Uppmatt: med en vanlig klass steg varje scopad regel fran (0,4,0) till (0,5,0), och da
// vann regler som forut FORLORADE — Top Likes mini-podium bytte radhojd fran 89.5 till 92.625 px.
// `:where()` har noll specificitet, sa reglerna behaller exakt sin gamla vikt och byter bara
// malgrupp. Det ar ocksa varfor det forsta provet nedan matar Top Like och inte bara Top Coins:
// en scopning som rakar andra Top Like ar inte en fix.
//
// Provet mater BERAKNADE varden och VILKA SELEKTORER SOM MATCHAR, inte kallkod. Ett kallkodsprov
// kan inte se vilken regel som vinner — det var precis darfor Top Points-buggen overlevde sitt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { ALERTS } = require('../helpers/katalognycklar.js');
const V = require('../helpers/visuell.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };

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

let browser, server, sida;
const skip = hoppaOver();

// ⚠️ `before(fn, options)`, inte tvartom — med optionsobjektet forst kor hooken ALDRIG och hela
// filen blir gron pa ingenting (uppmatt 2026-09-03, star i tests/helpers/webblasare.js).
test.before(async () => {
  if (skip) return;
  server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  browser = await startaWebblasare();
  sida = await browser.newPage({ viewport: V.VIEWPORT });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => document.documentElement.classList.contains('overlay-output'),
    null, { timeout: 30000, polling: 100 });
  await sida.waitForFunction(() => typeof window.render === 'function', null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(2500);
  await sida.evaluate(V.RIGG);
}, { timeout: 120000 });

test.after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise(r => server.close(r));
});

// Monterar via KATALOGKNAPPEN. En rigg som skapar widgeten direkt ur fabriken hoppar over allt
// handlern satter — det var det andra av de tva felen i Top Points-omgangen.
async function matUpp(nyckel) {
  const foto = await V.fotografera(sida, nyckel, ALERTS);
  if (foto.fel) return { fel: foto.fel };
  return sida.evaluate(() => {
    const w = document.querySelector('#view .widget.vyra-toplike');
    if (!w) return { fanns: false };
    const rad = w.querySelector('.toplike-row');
    if (!rad) return { fanns: true, rad: false };
    const cs = getComputedStyle(rad);
    // Vilka selektorer UR toplike-studio.css traffar widgeten eller dess rad? Delas upp i
    // skinn-selektorer (de som ska vara borta for Top Coins) och ovriga (delade rankingregler,
    // som ska fortsatta galla alla tre typerna).
    const skinnTraffar = [], ovrigaTraffar = [];
    for (const ark of [...document.styleSheets]) {
      if (!(ark.href || '').includes('toplike-studio.css')) continue;
      let regler = []; try { regler = [...ark.cssRules]; } catch (_) { continue; }
      for (const reg of regler) {
        if (!reg.selectorText) continue;
        for (const del of reg.selectorText.split(',')) {
          const sel = del.trim();
          let traff = false;
          try { traff = w.matches(sel) || rad.matches(sel); } catch (_) { continue; }
          if (!traff) continue;
          (/skin-/.test(sel) ? skinnTraffar : ovrigaTraffar).push(sel);
        }
      }
    }
    return {
      fanns: true, rad: true,
      klasser: w.className,
      display: cs.display,
      hojd: Math.round(parseFloat(cs.height) * 100) / 100,
      kolumner: cs.gridTemplateColumns,
      skinnTraffar: [...new Set(skinnTraffar)],
      ovrigaTraffar: [...new Set(ovrigaTraffar)],
    };
  });
}

// ---------------------------------------------------------------------------------------------
// 1. REGRESSIONSVAKT: Top Likes clean-bar ska vara OFORANDRAD av scopningen.
//
// Varden uppmatta bade fore och efter scopningen 2026-09-21, identiska i bada:
//   display=grid  hojd=42px  kolumner borjar pa 42px  kant=1px
// Hojden och display kommer fran `.widget.vyra-toplike:where(.vyra-templatetoplike)
// .skin-clean-bar .toplike-row`. Slutar den regeln matcha Top Like ar scopningen for snav.
test('Top Likes clean-bar behaller sin radgeometri efter scopningen', { skip }, async () => {
  const m = await matUpp('catalog:toplike:clean-bar');
  assert.equal(m.fel, undefined, `monteringen misslyckades: ${m.fel}`);
  assert.equal(m.rad, true, 'ingen .toplike-row i Top Like-widgeten');

  assert.match(m.klasser, /\bvyra-templatetoplike\b/,
    `Top Like bar inte sin typklass — utan den matchar ingen scopad regel. Klasser: "${m.klasser}"`);
  assert.match(m.klasser, /\bskin-clean-bar\b/,
    `Top Like fick ingen skin-klass stamplad. Klasser: "${m.klasser}"`);

  assert.equal(m.display, 'grid',
    `clean-bars rad ska vara grid (fran toplike-studio.css), ar "${m.display}" — scopningen har last ute Top Like`);
  assert.equal(m.hojd, 42,
    `clean-bars radhojd ska vara 42px (samma fore och efter scopningen), ar ${m.hojd}px`);
  assert.match(m.kolumner, /^42px /,
    `clean-bars forsta kolumn ska vara 42px, kolumnerna ar "${m.kolumner}"`);

  // DEN HAR raden ar den som faller om scopningen pekar pa fel typklass. Ett tidigare utkast
  // nojde sig med 'nagon skinn-selektor traffar', och det provet FORBLEV GRONT nar jag muterade
  // :where(.vyra-templatetoplike) till :where(.vyra-templatetopcoins) — andra skinn-selektorer
  // traffade anda. Vakten maste krava just clean-bars RADREGEL, den som ger grid och 42px.
  const radregel = m.skinnTraffar.filter((s) => /skin-clean-bar/.test(s) && /.toplike-row/.test(s));
  assert.ok(radregel.length > 0,
    'ingen clean-bar-regel for .toplike-row traffar Top Like — scopningen har last ute Top Like. '
    + `Traffade skinn-selektorer: ${m.skinnTraffar.join(' | ') || '(inga)'}`);
});

// ---------------------------------------------------------------------------------------------
// 2. Top Coins radgeometri styrs av sin EGEN design. Ingen skinn-regel ur toplike-studio.css far
//    na den. De delade rankingreglerna (utan skin-) far finnas kvar: de ar (0,2,0)-(0,3,0) och
//    forlorar mot topcoins-v2.css:s (0,3,2), alltsa styr de ingenting har.
for (const design of ['halo', 'signal-orbit']) {
  test(`Top Coins ${design}: ingen skinn-regel ur toplike-studio.css nar raden`, { skip }, async () => {
    const m = await matUpp(`catalog:ranking:templateTopCoins:${design}`);
    assert.equal(m.fel, undefined, `monteringen misslyckades: ${m.fel}`);
    assert.equal(m.rad, true, 'ingen .toplike-row i Top Coins-widgeten');

    assert.doesNotMatch(m.klasser, /\bvyra-templatetoplike\b/,
      `Top Coins bar Top Likes typklass — da biter varje scopad regel anda. Klasser: "${m.klasser}"`);

    assert.deepEqual(m.skinnTraffar, [],
      `skinn-regler ur toplike-studio.css traffar fortfarande Top Coins ${design}: ${m.skinnTraffar.join(' | ')}`);

    // display kommer nu fran topcoins-v2.css. Fore scopningen var den 'grid' (clean-bars varde)
    // for BADA designerna — det var sa de tva sag likadana ut i radgeometrin.
    assert.equal(m.display, 'flex',
      `raden ar "${m.display}" — 'grid' betyder att clean-bar-regeln bet igen`);
    assert.notEqual(m.hojd, 42,
      `radhojden ar 42px, alltsa clean-bars — designens egen hojd ska galla`);
  });
}

// De tva designerna ska inte langre ha IDENTISK radgeometri. Fore scopningen hade de exakt samma
// (42px 162.422px 11.5781px, hojd 42) eftersom bada ritades av clean-bar.
test('Top Coins tva designer har inte langre identisk radgeometri', { skip }, async () => {
  const a = await matUpp('catalog:ranking:templateTopCoins:halo');
  const b = await matUpp('catalog:ranking:templateTopCoins:signal-orbit');
  assert.equal(a.fel, undefined, `halo: ${a.fel}`);
  assert.equal(b.fel, undefined, `signal-orbit: ${b.fel}`);
  assert.notDeepEqual(
    { display: a.display, hojd: a.hojd },
    { display: b.display, hojd: b.hojd },
    `halo och signal-orbit har identisk radgeometri (${a.display}, ${a.hojd}px) — samma signatur som `
    + 'buggen dar Top Points podium ritade neons bild');
});
