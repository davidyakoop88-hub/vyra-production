'use strict';
// Lackagetest i en RIKTIG webblasare.
//
// VARFOR INTE JSDOM
//
// jsdom har ingen Web Locks-implementation, sa session-state faller tillbaka pa read-only och
// save() skriver aldrig. Ett lackage som gar via save() ar osynligt dar, hur ratt matningen an ser
// ut — det var precis darfor buggen i #86 kunde ligga bakom en gron vakt. jsdom har inte heller
// nagon layout: getBoundingClientRect ar alltid 0x0 och getComputedStyle ger inga kaskaderade
// varden. Fragan "syns den har widgeten?" GAR inte att stalla dar.
//
// jsdom saknar dessutom shadow DOM med konstruerbara stilmallar, vilket ar hela mekanismen som
// provas har.
//
// VAD SOM PROVAS
//
//   1. Varje katalogkort ritar sin design — noll tomma kort.
//   2. Tandningsregeln finns INTE i document.styleSheets.
//   3. En alert-widget utanfor en miniatyr ar fortfarande slackt.
//   4. Overlay-laget visar ingenting utan trigger.
//   5. Katalogen skriver ingenting till state eller localStorage.
//
// Punkt 2 och 3 ar det som gor losningen annorlunda an #84: dar var regeln ratt SCOPAD, har ar den
// inlast. Testet mater inlasningen, inte scopingen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

// Ingen webblasare -> hoppa hogljutt. En grund CI utan Chrome ska inte se ut som en gron korning,
// men den ska inte heller faila pa nagot som inte ar kodens fel.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Katalogen i overlay-vyn, med alla miniatyrer framtvingade. IntersectionObserver ritar bara det
// som ar nara vyn, och en headless-flik scrollar inte — samma matfalla som gav "0 av 136
// miniatyrer" en gang. Darfor ritas de explicit.
async function katalogsida() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.owgRenderCardThumb === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    view = 'overlay'; selected = null; render(); bind();
    await new Promise(r => setTimeout(r, 800));
    document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')
      .forEach(b => { try { owgRenderCardThumb(b) } catch (_) {} });
    await new Promise(r => setTimeout(r, 400));
  });
  return page;
}

test('varje katalogkort ritar sin design', { skip }, async () => {
  const page = await katalogsida();
  const tomma = await page.evaluate(() => {
    const ut = [];
    for (const b of document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')) {
      const thumb = b.querySelector('.owg-thumb');
      const rot = thumb && (thumb.shadowRoot || thumb);
      const inner = rot && rot.querySelector('.owg-thumb-inner');
      const alla = inner ? [inner.firstElementChild, ...inner.querySelectorAll('*')].filter(Boolean) : [];
      const syns = alla.some(el => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.display === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      if (!syns) ut.push(b.dataset.catalogKey || b.textContent.trim().slice(0, 30));
    }
    return ut;
  });
  await page.close();
  assert.deepEqual(tomma, [], `${tomma.length} kort visar en tom ruta:\n  ` + tomma.join('\n  '));
});

test('tandningsregeln finns inte i dokumentet', { skip }, async () => {
  const page = await katalogsida();
  const traffar = await page.evaluate(() => {
    const ut = [];
    for (const s of document.styleSheets) {
      let regler; try { regler = s.cssRules } catch (_) { continue }
      for (const r of regler) {
        if (!r.cssText) continue;
        // Tandningen: nagot som tvingar synlighet pa en widget ELLER dess attlingar.
        if (/visibility\s*:\s*visible\s*!important/.test(r.cssText) && /\.widget/.test(r.cssText))
          ut.push(((s.href || 'inline').split('/').pop()) + ': ' + r.cssText.slice(0, 90));
      }
    }
    return ut;
  });
  await page.close();
  assert.deepEqual(traffar, [],
    'en tandningsregel ligger i dokumentets stilmallar och kan darmed na overlayen:\n  ' +
    traffar.join('\n  '));
});

test('alerts ar slackta utanfor en miniatyr', { skip }, async () => {
  const page = await katalogsida();
  const tanda = await page.evaluate(() => {
    const nycklar = ['catalog:fanlevel:gold', 'catalog:battlemvp:inferno', 'catalog:lastx:card',
      'catalog:gifterlevel:profile', 'catalog:followeralert', 'catalog:giftfireworks:magnetic'];
    const bur = document.createElement('div');
    document.body.append(bur);
    const ut = [];
    for (const k of nycklar) {
      let w; try { w = VyraWidgets.create(k) } catch (_) { continue }
      bur.innerHTML = wh(w);
      const el = bur.firstElementChild;
      const cs = getComputedStyle(el);
      const rotSlackt = cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0;
      // Fyrverkeriet slacks pa sitt INRE effektlager, inte pa roten.
      const fx = el.querySelector('.gift-fireworks-fx');
      const fxSlackt = fx ? parseFloat(getComputedStyle(fx).opacity) === 0 : false;
      if (!rotSlackt && !fxSlackt) ut.push(k);
    }
    bur.remove();
    return ut;
  });
  await page.close();
  assert.deepEqual(tanda, [],
    'dessa alerts ar SYNLIGA utanfor en miniatyr — tandningen har lackt ut i dokumentet:\n  ' +
    tanda.join('\n  '));
});

test('overlay-laget visar ingenting utan trigger', { skip }, async () => {
  // Det David ser i OBS. En tom layout ska ge en tom scen, och katalogens miniatyrer far inte
  // ha lagt nagot dar.
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
  const scen = await page.evaluate(() => {
    const synliga = [...document.querySelectorAll('.canvas .widget, #view .widget')].filter(el => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).map(el => el.className.slice(0, 40));
    return { synliga, iMinnet: state.widgets.length,
      paDisk: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length };
  });
  await page.close();
  assert.deepEqual(scen.synliga, [], 'widgets syns i overlayen utan trigger:\n  ' + scen.synliga.join('\n  '));
  assert.equal(scen.iMinnet, 0, 'overlayen har widgets i minnet');
  assert.equal(scen.paDisk, 0, 'overlayen har widgets pa disk');
});

test('att rita katalogen skriver ingenting', { skip }, async () => {
  // #86 i en rigg som FAKTISKT kan skriva. jsdom kunde inte falla har.
  const page = await katalogsida();
  const efter = await page.evaluate(() => ({
    iMinnet: state.widgets.length,
    paDisk: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length,
    nycklar: Object.keys(localStorage).filter(k => /^vyra-(state|session-projection|extras)/.test(k))
      .map(k => k + ':' + (localStorage.getItem(k) || '').length)
  }));
  await page.close();
  assert.equal(efter.iMinnet, 0, `katalogen la ${efter.iMinnet} widgets i minnet`);
  assert.equal(efter.paDisk, 0,
    `katalogen skrev ${efter.paDisk} widgets till localStorage — det ar #86-lackan igen`);
});
