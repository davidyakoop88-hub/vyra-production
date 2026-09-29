'use strict';
// Varje ram i Top Likes valjare ska faktiskt ladda sin konst.
//
// VARFOR PROVET FINNS. 34 av de 53 ramarna ar .png och 19 ar .svg. media.js byggde
// tidigare ALLTID sokvagen med hardkodat `.png?v=2`, och toplike-studio.js lagade
// det i efterhand med en strangersattning som matchade den literalen. En bump av
// cachebusten hade tystat lagningen och tagit bort 19 av 53 ramar -- utan fel i
// konsollen, utan nagot annat spar an att ramen var borta.
//
// media.js slar numera upp filnamnet i VYRA_FRAME_FILES och plastret ar borta.
// Provet vaktar att det forblir sant, och det delar ramarna i PNG och SVG var for
// sig: en grupp som tystnar helt skulle annars kunna passera obemarkt.
//
// Mutationsprovat mot den gamla koden: med `?v=2` andrad till `?v=3` foll det pa
// exakt de 19 svg-ramarna och bara pa dem.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
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

let server, browser, bas;
let skip = hoppaOver();          // maste vara let: node:test laser { skip } vid registrering

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

test('varje ram i valjaren laddar sin konst i Top Like', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    const saknade = [];
    page.on('response', r => { if (r.status() >= 400 && /profile-frames/.test(r.url())) saknade.push(r.url()); });

    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForFunction(() => !!window.VYRA_FRAME_FILES &&
      Object.keys(window.VYRA_FRAME_FILES).length > 0, null, { timeout: 30000, polling: 100 });

    const karta = await page.evaluate(() => window.VYRA_FRAME_FILES);
    const ramar = Object.keys(karta);
    assert.ok(ramar.length >= 50, 'forvantade hela ramkatalogen, fick ' + ramar.length);

    // Bada grupperna maste finnas, annars kan provet vara gront for att den ena
    // aldrig testades. 34 png och 19 svg vid matningen 2026-09-17.
    const png = ramar.filter(r => /\.png$/i.test(karta[r]));
    const svg = ramar.filter(r => /\.svg$/i.test(karta[r]));
    assert.ok(png.length >= 30, 'forvantade minst 30 png-ramar, fick ' + png.length);
    assert.ok(svg.length >= 15, 'forvantade minst 15 svg-ramar, fick ' + svg.length);

    const fel = [];
    const laddadePerTyp = { png: 0, svg: 0 };
    for (const ram of ramar) {
      const begard = await page.evaluate(r => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create('catalog:toplike:clean');
        w.x = 20; w.y = 20; w.profileFrame = r;
        state.widgets.push(w); selected = null; render();
        // Sedan 2026-09-24 ritas varje Top Like i en av de sex ranking-sixpack-designerna, och en vald
        // profilram laggs dar som .rk6-profilram (ranking-sixpack.js) i stallet for media.js:s
        // .tl-frame-art. Samma fil, samma sokvag — det ar den provet vaktar.
        const konst = document.querySelector('.tl-frame-art, .rk6-profilram');
        return konst ? konst.getAttribute('src') : null;
      }, ram);

      if (!begard) { fel.push(ram + ': ingen ramkonst renderades alls'); continue; }

      // Polla in laddningen i stallet for en fast vantetid - CI:s runner ar langsammare
      // an min maskin, och en fast siffra ar hur ett prov borjar flacka.
      let laddad = false;
      try {
        await page.waitForFunction(() => {
          const i = document.querySelector('.tl-frame-art, .rk6-profilram');
          return !!i && i.complete && i.naturalWidth > 0;
        }, null, { timeout: 5000, polling: 50 });
        laddad = true;
      } catch (_) { /* faller igenom till felraden nedan */ }

      const fil = karta[ram];
      if (!laddad) fel.push(ram + ': begarde ' + begard.split('/').pop() + ', tillgangen heter ' + fil);
      else laddadePerTyp[/\.svg$/i.test(fil) ? 'svg' : 'png']++;

      // Sokvagen ska byggas ratt fran borjan, inte lagas i efterhand av en
      // strangersattning som en cachebust-bump kan tysta.
      assert.equal(begard.split('/').pop(), fil,
        ram + ': begarde ' + begard.split('/').pop() + ' men tillgangen heter ' + fil);
    }

    assert.deepEqual(fel, [], fel.length + ' av ' + ramar.length + ' ramar laddade inte:\n  ' + fel.join('\n  '));
    assert.equal(laddadePerTyp.png, png.length, 'alla png-ramar ska ha laddat');
    assert.equal(laddadePerTyp.svg, svg.length, 'alla svg-ramar ska ha laddat');
    console.log('  laddade: ' + laddadePerTyp.png + ' png + ' + laddadePerTyp.svg + ' svg');
    assert.deepEqual([...new Set(saknade)].map(u => u.split('/').pop()), [],
      'nagon ramtillgang gav 404');
  } finally {
    await page.close();
  }
});

test('ramkatalogen och tillgangarna pa disk ar samma mangd', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.VYRA_FRAME_FILES &&
      Object.keys(window.VYRA_FRAME_FILES).length > 0, null, { timeout: 30000, polling: 100 });
    const karta = await page.evaluate(() => window.VYRA_FRAME_FILES);

    const mapp = path.join(ROOT, 'assets', 'images', 'profile-frames');
    const paDisk = new Set(fs.readdirSync(mapp).filter(f => /\.(png|svg)$/i.test(f)));

    const utanFil = Object.entries(karta).filter(([, fil]) => !paDisk.has(fil)).map(([id]) => id);
    assert.deepEqual(utanFil, [], 'ramar i katalogen som saknar tillgang pa disk');

    // Ovant: en tillgang som ingen ram pekar pa. Inte ett fel, men vart att veta -
    // det ar sa en ram blir liggande obrukad efter en omdopning.
    const anvanda = new Set(Object.values(karta));
    const oanvanda = [...paDisk].filter(f => !anvanda.has(f));
    if (oanvanda.length) console.log('  oanvanda ramtillgangar: ' + oanvanda.join(', '));
  } finally {
    await page.close();
  }
});
