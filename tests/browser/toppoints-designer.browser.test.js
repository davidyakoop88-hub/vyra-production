'use strict';
// TOP POINTS I RIKTIG WEBBLASARE — DET HAR PROVET FINNS FOR ATT jsdom-PROVET INTE RACKTE.
//
// tests/toppoints-v2.test.js var gront medan widgeten var trasig i produktion. Det laser HTML och
// CSS som TEXT, och kan darfor inte se vilken regel som VINNER. Uppmatt 2026-09-21 i riktig
// Chromium, tva fel i rad som bada var osynliga for kallkodsprovet:
//
//   1. SPECIFICITET. Widgeten bar `vyra-toplike` (livedata hittas via `.vyra-toplike[data-id]`),
//      sa approved-rankings.js klammer in `skin-clean-bar` (okand skin -> clean-bar). Det tandde
//      toplike-studio.css `.widget.vyra-toplike.skin-clean-bar .toplike-row` (0,4,0), som slog
//      mina `html body .widget.vyra-toppoints-new ...` (0,3,2) TROTS !important. Raden ritades som
//      clean-bars rutnat: display blev `grid`, inte `flex`, och bakgrunden en gradient.
//      Grannregeln `... .toplike-row > span:not(.pro-avatar)` ar (0,5,1) och stal dessutom
//      bredden med `width:100%!important` — en deklaration utan !important forlorar mot en med,
//      oavsett specificitet.
//   2. FARGEN. Riggen skapar widgeten med `VyraWidgets.create(nyckel)` rakt ur fabriken och kor
//      aldrig katalogknappens handler. Fabrikens generiska lila `accent` vann darfor over
//      designens egen, och podiets trappsteg och neons brickor blev lila.
//
// Provet mater alltsa BERAKNADE varden, inte kallkod: vad webblasaren faktiskt kom fram till.
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

const NYCKEL = d => 'catalog:ranking:templateTopPoints:' + d;
const DESIGNER = ['clean', 'center', 'podium', 'neon'];
// Samma varden som DESIGNS i toppoints-v2.js. EN EGENSKAP LASES RA: getPropertyValue pa en
// CSS-variabel ger strangen som star dar (#c9a227), inte en losT farg — till skillnad fran
// `color`, som webblasaren raknar om till rgb(). Darfor hex har och rgb i kontrollen nedan.
const ACCENT = { clean: '#c9a227', center: '#c9a227', podium: '#ffc94d', neon: '#45e7ff' };

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

async function matUpp(design) {
  const foto = await V.fotografera(sida, NYCKEL(design), ALERTS);
  if (foto.fel) return { fel: foto.fel };
  return sida.evaluate(() => {
    const el = document.querySelector('.vyra-toppoints-new');
    if (!el) return { fanns: false };
    const rad = el.querySelector('.toplike-row');
    const chip = el.querySelector('.tp-chip');
    const por = el.querySelector('.tp-portratt');
    const cs = n => (n ? getComputedStyle(n) : null);
    const r = cs(rad), c = cs(chip), p = cs(por);
    const bredd = n => (n ? n.getBoundingClientRect().width : 0);
    return {
      fanns: true,
      display: r.display,
      bakgrund: r.backgroundImage,
      accent: getComputedStyle(el).getPropertyValue('--tp-accent').trim(),
      chipBredd: Math.round(bredd(chip)), chipHojd: Math.round(chip.getBoundingClientRect().height),
      portrattBredd: Math.round(bredd(por)), radBredd: Math.round(bredd(rad)),
      chipFarg: c.backgroundImage, stegFarg: (() => {
        const s = el.querySelector('.tp-podium-steg');
        return s ? getComputedStyle(s).backgroundImage : '';
      })(),
      emFarg: getComputedStyle(el.querySelector('em')).color,
      steg: el.querySelectorAll('.tp-podium-steg').length,
      glod: el.querySelectorAll('.tp-glod').length,
      rader: el.querySelectorAll('.toplike-row').length
    };
  });
}

// FALLA 1. Raden maste vara var egen flexrad, inte clean-bars rutnat.
test('raden ar flex och utan gradientbakgrund i alla fyra designerna', { skip, timeout: 180000 }, async () => {
  for (const d of DESIGNER) {
    const m = await matUpp(d);
    assert.ok(!m.fel, `${d}: ${m.fel}`);
    assert.ok(m.fanns, `${d}: widgeten renderades inte alls`);
    assert.equal(m.display, 'flex', `${d}: raden ar ${m.display} — toplike-studio.css skin-clean-bar vann igen`);
    assert.equal(m.bakgrund, 'none', `${d}: raden har ${m.bakgrund} — clean-bars gradient vann igen`);
  }
});

// FALLA 1b. Brickan och portrattet far inte stracka sig over hela raden.
test('brickan ar kvadratisk och smal, inte utstrackt till hela raden', { skip, timeout: 180000 }, async () => {
  for (const d of DESIGNER) {
    const m = await matUpp(d);
    assert.ok(!m.fel && m.fanns, `${d}: ${m.fel || 'renderades inte'}`);
    assert.ok(Math.abs(m.chipBredd - m.chipHojd) <= 2,
      `${d}: brickan ar ${m.chipBredd}x${m.chipHojd} — width:100%!important fran toplike-studio.css vann`);
    assert.ok(m.chipBredd < m.radBredd * 0.5,
      `${d}: brickan ar ${m.chipBredd} px av radens ${m.radBredd} px`);
    assert.ok(m.portrattBredd > 0 && m.portrattBredd < m.radBredd * 0.6,
      `${d}: portrattet ar ${m.portrattBredd} px av radens ${m.radBredd} px`);
  }
});

// FALLA 2. Designens farg ska galla aven nar widgeten skapas rakt ur fabriken.
test('accenten kommer ur designen aven utan katalogknappens defaultvarden', { skip, timeout: 180000 }, async () => {
  for (const d of DESIGNER) {
    const m = await matUpp(d);
    assert.ok(!m.fel && m.fanns, `${d}: ${m.fel || 'renderades inte'}`);
    assert.equal(m.accent, ACCENT[d],
      `${d}: --tp-accent ar ${m.accent}, vantade ${ACCENT[d]} — fabrikens generiska accent vann`);
  }
  // Och att fargen faktiskt NAR fram dit den syns, inte bara star i variabeln.
  const neon = await matUpp('neon');
  assert.match(neon.emFarg, /69, 231, 255/, `neons varde ar ${neon.emFarg}`);
  const podium = await matUpp('podium');
  assert.match(podium.stegFarg, /255, 201, 77/, `podiets trappsteg ar ${podium.stegFarg}`);
});

// Strukturen: podium har trappsteg, neon har glod, och ingen annan har det.
test('podium har tre trappsteg och neon har glod per rad — ingen annan har nagot', { skip, timeout: 180000 }, async () => {
  const m = {};
  for (const d of DESIGNER) m[d] = await matUpp(d);
  assert.equal(m.podium.steg, 3, `podium har ${m.podium.steg} trappsteg`);
  assert.equal(m.neon.steg, 0);
  assert.equal(m.clean.steg, 0);
  assert.equal(m.center.steg, 0);
  assert.equal(m.neon.glod, m.neon.rader, `neon har ${m.neon.glod} glod pa ${m.neon.rader} rader`);
  assert.equal(m.podium.glod, 0);
  assert.equal(m.clean.glod, 0);
});
