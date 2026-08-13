'use strict';
// Gifter Level Up · alla nio modeller mot Davids lila diamantreferens 2026-08-13.
//
// REFERENSEN VISAR SJU PANELER, KATALOGEN HAR NIO. Mappningen ar entydig for sju:
// Original Stack->stack, Side Badge->sidebadge, Diamond Reveal->reveal, Orbit Level->orbitlevel,
// Rising Tier->risingtier, Flip Token->flip, Compact Duo->duo. Kvar utan egen panel:
// `profile` (Profil i orbit) och `number` (Stort nivanummer). David: behall alla nio och ge
// samtliga det nya utseendet — de tva far darfor det GEMENSAMMA formspraket, inte en kopia.
//
// LAGET FORE, uppmatt: paletten ar redan lila (--gifter: #9965ff) och LEVEL UP finns. Det som
// skiljer ar fem saker som galler alla nio, plus diamantens utforande.
//
// TANDNINGEN: `gifter-active`. Widgeten ar en alert och ligger pa opacity:0 tills klassen sats.
// ENTREN: animationerna startar pa opacity 0 — mat inte i samma tick som tandningen.
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

const MODELLER = ['stack', 'sidebadge', 'reveal', 'orbitlevel', 'risingtier',
                  'flip', 'duo', 'profile', 'number'];

async function mat(layout) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(l => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:' + l);
    w.x = 60; w.y = 30; state.widgets.push(w); selected = null; render();
    const el = document.querySelector('.gifter-level-up');
    if (!el) return { fel: 'widgeten renderades inte' };
    el.classList.add('gifter-active');
    return { ok: true };
  }, layout);
  if (start.fel) { await page.close(); return start }
  await page.waitForTimeout(1400);                 // vanta ut entrean
  const m = await page.evaluate(() => {
    const el = document.querySelector('.gifter-level-up');
    if (!el) return { fel: 'widgeten forsvann' };
    const info = n => { const e = el.querySelector(n); if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { synlig: r.width > 0 && r.height > 0 && cs.display !== 'none'
                       && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05,
               text: (e.textContent || '').trim(), bredd: r.width, hojd: r.height,
               radie: cs.borderRadius, kant: cs.borderColor, opacity: cs.opacity } };
    const box = n => { const e = el.querySelector(n); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height } };
    return { rubrik: info('h2'), namn: info('h3'), under: info('p'),
             bricka: info('.gifter-level-badge'),
             diamant: info('.gifter-diamond-stack img.gd-1'),
             medaljong: info('.gifter-diamond-stack'),
             blandning: (() => { const e = el.querySelector('.gifter-diamond-stack img.gd-1');
               return e ? getComputedStyle(e).mixBlendMode : null })(),
             rMedaljong: box('.gifter-diamond-stack'),
             rProfil: box('.gifter-orbit img'),
             rBricka: box('.gifter-level-badge'),
             rNamn: box('h3'), rUnder: box('p'), rRubrik: box('h2') };
  });
  await page.close();
  return m;
}

for (const layout of MODELLER) {
  test(`${layout}: rubriken sager LEVEL UP`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.rubrik && m.rubrik.synlig, 'rubriken syns inte');
    assert.match(m.rubrik.text.toUpperCase(), /LEVEL UP/, `rubriken sager "${m.rubrik.text}"`);
  });

  test(`${layout}: anvandarnamnet bar snabel-a`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.namn && m.namn.synlig, 'namnet syns inte');
    assert.match(m.namn.text, /^@/, `namnet ar "${m.namn.text}" — referensen visar @anvandarnamn`);
  });

  test(`${layout}: undertexten sager NY NIVA UPPLAST`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.under && m.under.synlig, 'undertexten syns inte');
    assert.match(m.under.text.toUpperCase(), /NY NIV[ÅA] UPPL[ÅA]ST/,
      `undertexten sager "${m.under.text}"`);
  });

  test(`${layout}: brickan visar bara LV. och nivan`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.bricka && m.bricka.synlig, 'nivabrickan syns inte');
    assert.match(m.bricka.text.replace(/\s+/g, ' ').trim(), /^LV\.? ?\d+$/i,
      `brickan sager "${m.bricka.text}" — referensen visar "LV. 25", utan etikett och utan pil`);
  });

  test(`${layout}: diamanten ar en rund medaljong, inte en liten fyrkant`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.medaljong && m.medaljong.synlig, 'diamantmedaljongen syns inte');
    assert.ok(m.medaljong.bredd >= 44,
      `medaljongen ar ${Math.round(m.medaljong.bredd)} px bred — referensen visar en tydlig rund bricka`);
    assert.match(m.medaljong.radie, /(50%|9999px|999px)/,
      `medaljongen har border-radius "${m.medaljong.radie}" — referensen visar en RUND bricka`);
  });
}


// ---- Rattelser efter Davids granskning ---------------------------------------------------
// Overlapp mats som area, inte som "ser det ok ut" — tva rektanglar som delar yta ar en bugg
// oavsett hur det upplevs vid en viss storlek.
function overlapp(a, b) {
  if (!a || !b) return 0;
  const bredd = Math.min(a.h, b.h) - Math.max(a.v, b.v);
  const hojd = Math.min(a.u, b.u) - Math.max(a.o, b.o);
  return bredd > 0 && hojd > 0 ? Math.round(bredd * hojd) : 0;
}

for (const layout of MODELLER) {
  test(`${layout}: diamanten blandas sa den morka fyrkanten forsvinner`, { skip }, async () => {
    const m = await mat(layout);
    assert.equal(m.blandning, 'screen',
      'PNG:en har 0 % genomskinliga pixlar och 73 % nastan svarta — utan screen-blandning '
      + 'syns konstverkets inbakade morka fyrkant inuti medaljongen');
  });
}

for (const layout of ['orbitlevel', 'flip']) {
  test(`${layout}: medaljongen och profilbilden overlappar inte`, { skip }, async () => {
    const m = await mat(layout);
    const yta = overlapp(m.rMedaljong, m.rProfil);
    assert.equal(yta, 0,
      `medaljongen och profilbilden delar ${yta} px yta — de ska aldrig rora varandra`);
  });
}

// Forsta fixen for orbitlevel flyttade medaljongen ur vagen for profilbilden men lade den
// OVANPA texten i stallet — och provet var gront, for det vaktade bara mot bilden. Overlapp
// mot texten maste vaktas lika hart, annars flyttar man bara buggen.
for (const layout of MODELLER) {
  test(`${layout}: medaljongen ligger inte over texten`, { skip }, async () => {
    const m = await mat(layout);
    for (const [namn, r] of [['rubriken', m.rRubrik], ['namnet', m.rNamn], ['undertexten', m.rUnder]]) {
      const yta = overlapp(m.rMedaljong, r);
      assert.equal(yta, 0, `medaljongen och ${namn} delar ${yta} px yta`);
    }
  });
}

test('reveal: brickan krockar inte med medaljongen', { skip }, async () => {
  const m = await mat('reveal');
  const yta = overlapp(m.rBricka, m.rMedaljong);
  assert.equal(yta, 0, `brickan och medaljongen delar ${yta} px yta`);
});
