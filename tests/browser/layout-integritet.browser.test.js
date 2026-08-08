'use strict';
// Layouten kollapsar pa tre stallen, alla uppmatta i riktig Chrome 2026-08-09 vid 1440x900.
//
// ORSAKERNA, uppmatta fore fixen:
//
//   A1  action-event.css:9 satter grid-template-columns:60px 78px minmax(0,1fr) auto auto
//       !important pa .ae-scene-links article. Men barn 3 (Max ko-etiketten) har grid-column:1/-1
//       och spanner ALLA spar — sa allt efter den borjar om pa en ny rad fran spar 1. Foljden i
//       TOMT lage: hjalptexten far 60px (bryts pa 8 rader), knappen 78px (4 rader), 968px star
//       tomt. I FYLLT lage: URL-faltet far 60px (visar "https:/"), Kopiera 78px, och
//       Oppna-knappen far 968px och radbryter sin egen pil. BADA lagena ar trasiga.
//
//   A9  studio.js:95 renderar formen som <label>Text<input></label>, och studio.css styr den med
//       .settings-page label{display:block;border-bottom:...} + .settings-page input{float:right}.
//       Floaten ger: 353-399px glapp mellan etikett och falt, harlinjen (pa labeln, 658px bred)
//       loper 16px forbi faltets hogerkant, och Spara-knappen ligger 0px fran raden ovan
//       eftersom den flytande inputen tas ur flodet. TikTok-status ar dessutom ett <input
//       disabled> som ser identiskt ut med det redigerbara faltet ovanfor.
//
//   A10 aside har scrollHeight 1030 men clientHeight 900 och overflow-y:visible — ingen
//       skrollmekanism. Installningar-knappen ligger pa y=924..968 och gar inte att na.
//
// Browser och inte jsdom: varje prov har mater layout (getBoundingClientRect, radbrytning,
// skrollbarhet). jsdom har ingen layout — allt ar 0 dar och proven hade gatt gront utan att
// stalla fragan.
//
// ROTT NU: alla sju.
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

// 1440x900 ar matpunkten dar alla tre defekterna ar uppmatta. A10 forsvinner i ett hogre fonster,
// A1:s sparbredder andras med ett smalare.
async function oppnaStudio() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('[data-view],[data-extra]')
    && typeof window.go === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page;
}

async function tillAutomatik(page) {
  await page.click('[data-extra="actions"]', { timeout: 5000 });
  await page.waitForFunction(() => !!document.querySelector('.ae-scene-links article'),
    null, { timeout: 10000 });
  await page.waitForTimeout(400);
}

// Installningar nas via routern, inte via klick — navvalet ligger utanfor bild (A10), och det
// har provet far inte vara beroende av att A10 ar lagad.
async function tillInstallningar(page) {
  await page.evaluate(() => go('settings'));
  await page.waitForFunction(() => !!document.querySelector('.settings-page'),
    null, { timeout: 10000 });
  await page.waitForTimeout(400);
}

// Radhojd for "far texten plats pa en rad?": klona elementet utan breddbegransning och jamfor.
// Samma metod som nav-state prov 4 — scrollWidth underrapporterar ihop med ellipsis, och
// hojdjamforelse ar det enda som fangar radbrytning i knappar med padding.
const KLONMATT = el => {
  const klon = el.cloneNode(true);
  klon.style.cssText = 'position:absolute;left:-9999px;width:auto;max-width:none;white-space:nowrap;overflow:visible';
  el.parentElement.appendChild(klon);
  const m = { bredd: klon.getBoundingClientRect().width, hojd: klon.getBoundingClientRect().height };
  klon.remove();
  return m;
};

// ---- Prov 1 · A1 tomt lage --------------------------------------------------------------------
test('A1: tomma scenraden klammer inte sitt innehall', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillAutomatik(page);
    const m = await page.evaluate(() => {
      const art = document.querySelector('.ae-scene-links article');
      const hjalp = art.querySelector('.ae-scene-needs-token');
      const knapp = art.querySelector('[data-create-scene-link]');
      if (!hjalp || !knapp) return { fel: 'tomt-lagets element saknas — har layouten redan en token?' };
      const ar = art.getBoundingClientRect();
      const hr = hjalp.getBoundingClientRect();
      const kr = knapp.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(hjalp).lineHeight) || parseFloat(getComputedStyle(hjalp).fontSize) * 1.5;
      // Dodytan: fran radens sista element till artikelns hogra innerkant.
      const sistaHoger = Math.max(hr.right, kr.right);
      const artInnerHoger = ar.right - parseFloat(getComputedStyle(art).paddingRight);
      // Knappens naturliga bredd via obegransad klon — samma metod som nav-state prov 4.
      // En knapp som ar smalare an sitt innehall klipper eller radbryter texten, och det syns
      // varken pa klamning eller dodyta: .ae-scenes-overview button (28px 1fr-grid, skriven for
      // scenKORTEN) traffar aven den har knappen och kollapsar 1fr till 0.
      const klon = knapp.cloneNode(true);
      klon.style.cssText = 'position:absolute;left:-9999px;display:inline-block;width:auto;white-space:nowrap';
      document.body.appendChild(klon);
      const knappNaturlig = klon.getBoundingClientRect().width;
      klon.remove();
      return {
        hjalpBredd: Math.round(hr.width),
        hjalpHojd: Math.round(hr.height),
        radhojdTak: Math.round(lh * 3),
        knappBredd: Math.round(kr.width),
        knappNaturlig: Math.round(knappNaturlig),
        dodyta: Math.round(artInnerHoger - sistaHoger),
      };
    });
    assert.ok(!m.fel, m.fel);

    const fel = [];
    if (m.hjalpBredd < 300) fel.push(`hjalptexten far ${m.hjalpBredd}px — klamd (ska ha >= 300px)`);
    if (m.hjalpHojd > m.radhojdTak) fel.push(`hjalptexten ar ${m.hjalpHojd}px hog — bruten pa manga rader (tak ${m.radhojdTak}px)`);
    if (m.dodyta > 100) fel.push(`${m.dodyta}px dodyta till hoger om radens innehall (ska vara <= 100px)`);
    if (m.knappBredd < m.knappNaturlig - 1) fel.push(`knappen far ${m.knappBredd}px men innehallet behover ${m.knappNaturlig}px — texten klipps`);

    assert.deepEqual(fel, [], 'tomma scenraden:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 2 · A1 fyllt lage -------------------------------------------------------------------
// Fyllt lage SIMULERAS: markupen ar exakt den link(n) i action-scenes.js returnerar nar
// sceneUrl(n) ger en URL. En riktig token kraver servern — verifiera mot riktig token fore merge.
test('A1: fyllda scenraden ger URL-faltet plats och radbryter inte Oppna', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillAutomatik(page);
    const m = await page.evaluate(() => {
      const art = document.querySelector('.ae-scene-links article');
      art.querySelector('.ae-scene-needs-token')?.remove();
      art.querySelector('[data-create-scene-link]')?.remove();
      art.insertAdjacentHTML('beforeend',
        '<input readonly value="https://vyralive.app/overlay.html?access=demo-token-scen-1">' +
        '<button type="button" data-copy-scene="1">Kopiera</button>' +
        '<button type="button" data-open-scene="1">Öppna ↗</button>');

      const url = art.querySelector('input[readonly]');
      const kopiera = art.querySelector('[data-copy-scene]');
      const oppna = art.querySelector('[data-open-scene]');
      // Samma klonmatt som i prov 1: knappar far inte vara smalare an sitt innehall.
      const naturlig = el => {
        const k = el.cloneNode(true);
        k.style.cssText = 'position:absolute;left:-9999px;display:inline-block;width:auto;white-space:nowrap';
        document.body.appendChild(k);
        const w = k.getBoundingClientRect().width;
        k.remove();
        return w;
      };
      return {
        urlBredd: Math.round(url.getBoundingClientRect().width),
        kopieraHojd: Math.round(kopiera.getBoundingClientRect().height),
        oppnaHojd: Math.round(oppna.getBoundingClientRect().height),
        kopieraBredd: Math.round(kopiera.getBoundingClientRect().width),
        kopieraNaturlig: Math.round(naturlig(kopiera)),
        oppnaBredd: Math.round(oppna.getBoundingClientRect().width),
        oppnaNaturlig: Math.round(naturlig(oppna)),
      };
    });

    const fel = [];
    if (m.urlBredd < 200) fel.push(`URL-faltet far ${m.urlBredd}px (ska ha >= 200px)`);
    // Radbrytningsmatt: Kopiera ar samma sorts knapp med en rad text. Ar Oppna markbart hogre
    // har dess innehall brutits.
    if (m.oppnaHojd > m.kopieraHojd + 2) fel.push(`Oppna-knappen ar ${m.oppnaHojd}px hog mot Kopieras ${m.kopieraHojd}px — innehallet radbryter`);
    if (m.kopieraBredd < m.kopieraNaturlig - 1) fel.push(`Kopiera far ${m.kopieraBredd}px men behover ${m.kopieraNaturlig}px — texten klipps`);
    if (m.oppnaBredd < m.oppnaNaturlig - 1) fel.push(`Oppna far ${m.oppnaBredd}px men behover ${m.oppnaNaturlig}px — texten klipps`);

    assert.deepEqual(fel, [], 'fyllda scenraden:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 3 · A9 glapp ------------------------------------------------------------------------
test('A9: etikett och falt ligger pa rimligt avstand', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillInstallningar(page);
    const rader = await page.evaluate(() =>
      [...document.querySelectorAll('.settings-page label')].map(l => {
        const tn = [...l.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        const falt = l.querySelector('input,select,textarea') || l.querySelector('[data-status]');
        if (!tn || !falt) return null;
        const r = document.createRange(); r.selectNodeContents(tn);
        return {
          text: tn.textContent.trim(),
          glapp: Math.round(falt.getBoundingClientRect().left - r.getBoundingClientRect().right),
        };
      }).filter(Boolean));

    assert.ok(rader.length >= 1, 'hittade inga formrader att mata');
    const fel = rader.filter(r => r.glapp >= 40).map(r => `${r.text}: ${r.glapp}px glapp`);
    assert.deepEqual(fel, [],
      'etikett och falt ska hora ihop visuellt (< 40px), men:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 4 · A9 harlinjen --------------------------------------------------------------------
test('A9: harlinjen slutar dar formraden slutar', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillInstallningar(page);
    const rader = await page.evaluate(() =>
      [...document.querySelectorAll('.settings-page label')].map(l => {
        const cs = getComputedStyle(l);
        if (cs.borderBottomWidth === '0px') return null;
        const barn = [...l.querySelectorAll('*')];
        if (!barn.length) return null;
        const sistaHoger = Math.max(...barn.map(b => b.getBoundingClientRect().right));
        return {
          text: l.textContent.trim().slice(0, 20),
          linjeHoger: Math.round(l.getBoundingClientRect().right),
          innehallHoger: Math.round(sistaHoger),
        };
      }).filter(Boolean));

    const fel = rader.filter(r => r.linjeHoger - r.innehallHoger > 8)
      .map(r => `${r.text}: linjen gar till x=${r.linjeHoger}, innehallet slutar x=${r.innehallHoger}`);
    assert.deepEqual(fel, [],
      'harlinjen far ga hogst 8px forbi radens sista element, men:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 5 · A9 Spara-knappen ----------------------------------------------------------------
test('A9: Spara-knappen har andning fran raden ovan', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillInstallningar(page);
    const m = await page.evaluate(() => {
      const knapp = document.querySelector('#ss');
      const rader = document.querySelectorAll('.settings-page label');
      if (!knapp || !rader.length) return null;
      const sista = rader[rader.length - 1].getBoundingClientRect();
      return { avstand: Math.round(knapp.getBoundingClientRect().top - sista.bottom) };
    });
    assert.ok(m, 'hittar inte Spara-knappen eller formraderna');
    assert.ok(m.avstand >= 16,
      `Spara ligger ${m.avstand}px fran raden ovan — float-inneslutningen ater upp andningen (ska vara >= 16px)`);
  } finally { await page.close() }
});

// ---- Prov 6 · A9 TikTok-status ----------------------------------------------------------------
test('A9: TikTok-status ar text, inte ett input-falt', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillInstallningar(page);
    const m = await page.evaluate(() => {
      const rad = [...document.querySelectorAll('.settings-page label, .settings-page [data-rad]')]
        .find(l => /tiktok/i.test(l.textContent));
      if (!rad) return { fel: 'hittar ingen TikTok-rad i formen' };
      return { harInput: !!rad.querySelector('input,select,textarea') };
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m.harInput, false,
      'TikTok-status renderas som ett input-falt — ser redigerbart ut fast det ar disabled. ' +
      'Statusen ska vara ren text med indikator.');
  } finally { await page.close() }
});

// ---- Prov 7 · A10 sidofaltet ------------------------------------------------------------------
test('A10: alla synliga navval gar att na vid 1440x900', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillAutomatik(page);
    const fel = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const cs = getComputedStyle(aside);
      const kanSkrolla = ['auto', 'scroll'].includes(cs.overflowY);
      const ut = [];
      for (const b of document.querySelectorAll('[data-view],[data-extra]')) {
        if (b.getBoundingClientRect().width === 0) continue; // dolda (Automationer) raknas inte
        let r = b.getBoundingClientRect();
        if (r.bottom <= window.innerHeight && r.top >= 0) continue;
        if (kanSkrolla) {
          b.scrollIntoView({ block: 'nearest' });
          r = b.getBoundingClientRect();
          if (r.bottom <= window.innerHeight && r.top >= 0) continue;
        }
        const namn = b.dataset.view || b.dataset.extra;
        ut.push(`${namn}: bottom=${Math.round(r.bottom)} i ${window.innerHeight}px fonster` +
          (kanSkrolla ? ' (aven efter skroll)' : ' — och aside har overflow-y:' + cs.overflowY + ', gar inte att skrolla'));
      }
      return ut;
    });

    assert.deepEqual(fel, [],
      'varje synligt navval ska rymmas eller ga att skrolla fram, men:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});
