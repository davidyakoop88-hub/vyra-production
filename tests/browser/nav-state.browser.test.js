'use strict';
// Navigationen ljuger om sin egen state. Fyra defekter, alla uppmatta i en RIKTIG webblasare
// 2026-08-08, alla osynliga i kallkoden.
//
// Varfor browser och inte jsdom: prov 4 mater `scrollWidth` mot `clientWidth`. jsdom har ingen
// layout — bada ar alltid 0 dar, sa provet hade gatt gront utan att stalla fragan. Prov 1 och 3
// kraver dessutom att sidans egna skript kor sin routing pa riktigt.
//
// ORSAKERNA, uppmatta fore fixen:
//
//   A3  studio.js:97  go(v) vaxlar .active BARA over [data-view].
//       extras.js:11  showExtra() vaxlar over ALLA `aside button`.
//       Asymmetrin: ett extra-val rensar allt, ett vy-val rensar bara andra vyer. Uppmatt kedja:
//       Guide -> [guide], sedan Analytics -> [guide, analytics], sedan Installningar ->
//       [guide, settings].
//
//   A2  #crumb skrivs pa exakt ETT stalle i hela kodbasen (live-control.js:42, satter
//       'VYRA / LIVE-KONTROLL'). Vy-routern uppdaterar #title men aldrig #crumb, sa brodsmulan
//       star kvar pa 'VYRA / OVERSIKT' pa varje sida.
//
//   A4  #title sätts pa minst fyra stallen med egna strangar. Uppmatt: navet sager
//       'Installningar' men #title sager 'Settings'; navet sager 'Vip-paket' men #title sager
//       'Overlay-paket'.
//
//   A7  Tva olika orsaker till kapning, darfor mats bredd och inte teckenantal:
//       'Action & Event'      scrollW 87  > clientW  68  (LIVE-badgen ater 31px)
//       'Support & feedback'  scrollW 120 > clientW 112  (texten ar for lang for ytan)
//
// Automationer-noden ar display:none och hoppas over overallt — den renderas inte, sa det finns
// ingenting att mata pa den.
//
// ROTT NU: alla fyra.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

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

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// 1440x900 speglar en vanlig laptop. Sidofaltets bredd — och darmed kapningen i prov 4 — beror pa
// fonsterbredden, sa ett bredare testfonster hade dolt A7 helt.
async function oppnaStudio() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('[data-view],[data-extra]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page;
}

// Bara navval som faktiskt renderas. Automationer ar display:none och har darfor bredd 0.
const SYNLIGA_NAVVAL = () =>
  [...document.querySelectorAll('[data-view],[data-extra]')]
    .filter(b => b.getBoundingClientRect().width > 0)
    .map(b => ({
      nyckel: b.dataset.view || b.dataset.extra,
      typ: b.dataset.view ? 'view' : 'extra',
      etikett: (b.querySelector('span') || b).textContent.trim(),
    }));

const valjare = n => `[data-view="${n.nyckel}"],[data-extra="${n.nyckel}"]`;

async function navvalen(page) { return page.evaluate(SYNLIGA_NAVVAL) }

async function klicka(page, nyckel) {
  await page.click(`[data-view="${nyckel}"],[data-extra="${nyckel}"]`, { timeout: 5000 });
  await page.waitForTimeout(600);
}

// ---- Prov 1 · A3 -----------------------------------------------------------------------------
test('bara ett navval ar aktivt at gangen', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    // Guide forst med flit — ett extra-val ar det som blir kvar tant. Sedan VARJE synligt navval,
    // eftersom asymmetrin bor i varje enskild routingfunktion: studio.js go(), overlay-preview.js
    // och overlay-packages.js har var sin kopia av samma toggle. En kedja med tre val hade bara
    // bevisat de tre.
    const navval = await navvalen(page);
    for (const { nyckel } of [{ nyckel: 'guide' }, ...navval]) {
      await klicka(page, nyckel);
      const aktiva = await page.evaluate(() =>
        [...document.querySelectorAll('[data-view],[data-extra]')]
          .filter(b => b.getBoundingClientRect().width > 0)
          .filter(b => b.classList.contains('active') || b.getAttribute('aria-current') === 'page')
          .map(b => b.dataset.view || b.dataset.extra));

      assert.deepEqual(aktiva, [nyckel],
        `efter klick pa "${nyckel}" ar dessa markerade som aktiva: [${aktiva.join(', ')}] — ` +
        'exakt ett navval ska vara aktivt');
    }
  } finally { await page.close() }
});

// ---- Prov 2 · A2 -----------------------------------------------------------------------------
test('brodsmulan foljer aktuell vy', { skip, timeout: 120000 }, async () => {
  const page = await oppnaStudio();
  try {
    const navval = await navvalen(page);
    assert.ok(navval.length >= 10, `hittade bara ${navval.length} synliga navval`);

    const fel = [];
    for (const n of navval) {
      await klicka(page, n.nyckel);
      const crumb = await page.evaluate(() => (document.querySelector('#crumb')?.textContent || '').trim());
      const vantat = n.etikett.toLocaleUpperCase('sv-SE');
      if (!crumb.endsWith(vantat)) fel.push(`${n.etikett}: brodsmulan sager "${crumb}"`);
    }

    assert.deepEqual(fel, [],
      'brodsmulan ska sluta med aktuell navetikett i versaler (VYRA / GUIDE), men:\n  ' +
      fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 3 · A4 -----------------------------------------------------------------------------
// Oversikt ar ett AVSIKTLIGT undantag: sidan halsar pa anvandaren i stallet for att upprepa
// sidnamnet. Undantaget ar namngivet har och far inte utokas tyst — varje nytt namn i listan ar
// ett designbeslut, inte en genvag till gront.
const TITELUNDANTAG = { home: /^God [a-zåäö]+, .+/i };

test('sidtiteln matchar navetiketten', { skip, timeout: 120000 }, async () => {
  const page = await oppnaStudio();
  try {
    const navval = await navvalen(page);
    const fel = [];

    for (const n of navval) {
      await klicka(page, n.nyckel);
      const title = await page.evaluate(() => (document.querySelector('#title')?.textContent || '').trim());

      const undantag = TITELUNDANTAG[n.nyckel];
      if (undantag) {
        if (!undantag.test(title)) fel.push(`${n.etikett}: undantaget kraver en halsning, fick "${title}"`);
        continue;
      }
      if (title !== n.etikett) fel.push(`nav "${n.etikett}" -> #title "${title}"`);
    }

    assert.deepEqual(fel, [],
      'sidtiteln ska vara samma ord som navetiketten, men:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 4 · A7 -----------------------------------------------------------------------------
test('inga synliga navetiketter kapas', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    // scrollWidth DUGER INTE har. Med text-overflow:ellipsis mater den den REDAN forkortade
    // texten, inte den fulla. Uppmatt fall: "Automation" gav scrollWidth 69 mot clientWidth 68 —
    // alltsa "ryms" — medan ordet i verkligheten behover 71px och renderades som "Automati...".
    // En klon utan breddbegransning ger den sanna textbredden.
    const matt = await page.evaluate(() =>
      [...document.querySelectorAll('[data-view],[data-extra]')]
        .filter(b => b.getBoundingClientRect().width > 0)
        .map(b => {
          const span = b.querySelector('span') || b;
          const klon = span.cloneNode(true);
          klon.style.cssText =
            'position:absolute;left:-9999px;width:auto;max-width:none;white-space:nowrap;overflow:visible';
          span.parentElement.appendChild(klon);
          const full = klon.getBoundingClientRect().width;
          klon.remove();
          return {
            etikett: span.textContent.trim(),
            full,
            yta: span.getBoundingClientRect().width,
          };
        }));

    assert.ok(matt.length >= 10, `hittade bara ${matt.length} synliga navetiketter`);

    // INGEN heltalsslack. En overspillning pa en enda pixel tander ellipsen och kapar ordet:
    // "Automation" behovde 69px i en 68px yta och renderades som "Automati...". En tidigare
    // version av det har provet hade `+1` som skydd mot flakighet och slappte igenom precis det.
    // 0.5px tacker delpixelavrundning utan att dolja en verklig kapning.
    const kapade = matt.filter(m => m.full - m.yta > 0.5);

    assert.deepEqual(
      kapade.map(m => `${m.etikett} (behover ${m.full.toFixed(1)}px, har ${m.yta.toFixed(1)}px)`), [],
      'varje navetikett ska fa plats i sin yta, men dessa kapas');
  } finally { await page.close() }
});
