'use strict';
// OBS-LÄNKEN FÅR VISA WIDGETAR — INGENTING ANNAT.
//
// Davids buggrapport 2026-08-22, med skärmbild från TikTok LIVE Studio: overlay-länken renderade
// Studions länkrad mitt i sändningen — rullgardinen "Hela overlayn", statusen "Sparat i molnet",
// URL-fältet och en svart kontrollpanel. Ovanpå hans egen scen, synligt för tittarna.
//
// DET ÄR OCKSÅ EN SÄKERHETSFRÅGA. Fältet innehåller access-länken. En token som syns i en
// sändning är en token som är läckt — vem som helst kan pausa, läsa av och öppna overlayn.
//
// UPPMÄTT ORSAK (studio.html?overlay=1&access=…):
//   html-klassen `overlay-output`  SATT
//   .overlay-link-bar              FINNS i DOM
//   computed display               flex        <- syns
//   förälder                       .workarea
//
// Döljregeln FINNS redan i studio.css:239 —
//   html.overlay-output …,html.overlay-output .overlay-link-bar,…{display:none!important}
// men den FÖRLORAR. Båda reglerna matchar, mätt i webbläsaren, och `display:flex!important`
// vinner. Kontrollmätt mot filerna FÖRE PR #260 (0 träffar på .workarea-regeln): raden var synlig
// även då. Det är alltså INTE en regress — #260 flyttade den bara från sidans botten till toppen,
// där David såg den.
//
// Roten är inte CSS. media.js monterar raden när `view === 'editor'`, och overlay-utdata KÖR med
// view === 'editor'. Att dölja med CSS är ett andra försvar; att inte montera är det första — och
// bara det senare håller adressen borta ur DOM:en.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

// En token som GÅR ATT KÄNNA IGEN i en textsökning. Med en kort localhost-adress hade provet
// kunnat vara grönt av misstag.
const TOKEN = 'hemlig-access-token-abc123';
const OVERLAY_ID = 'OV-1';
const STATE = { widgets: [{ id: 'w1', type: 'templateTopLike', x: 40, y: 40, width: 320, height: 240 }] };

let browser, server, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, overlay: { id: OVERLAY_ID, version: 1, state: STATE } }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write(': hej\n\n');
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function oppnaOverlay(extra) {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}${extra || ''}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!document.querySelector('[data-id]'), null, { timeout: 30000 });
  await sida.waitForTimeout(1500);
  return sida;
}

// Allt Studio-chrome som ALDRIG får nå en sändning.
const CHROME = ['.overlay-link-bar', 'aside', '.editor-toolbar', '.properties', '.elements',
  '.vy-kontroll', '.toast', '.oa-open'];

const SYNLIGA = (valjare) => valjare.map(v => {
  const el = document.querySelector(v);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (cs.display === 'none' || cs.visibility === 'hidden' || r.height === 0) return null;
  return v + ' (display:' + cs.display + ' hojd:' + Math.round(r.height) + ')';
}).filter(Boolean);

test('OBS-lanken visar INGET Studio-chrome', { skip, timeout: 90000 }, async () => {
  const sida = await oppnaOverlay();
  try {
    const synliga = await sida.evaluate(SYNLIGA, CHROME);
    assert.deepEqual(synliga, [],
      'Studio-chrome renderas i OBS-utdata: ' + JSON.stringify(synliga)
      + '. Det hamnar ovanpa streamerns scen, synligt for tittarna.');
  } finally { await sida.close() }
});

test('lankraden FINNS INTE i DOM — inte bara dold', { skip, timeout: 90000 }, async () => {
  // Skillnaden ar hela poangen. `display:none` doljer for ogat men lamnar adressen kvar i DOM:en,
  // dar den gar att lasa med ett hogerklick eller en skarmlasare. Kravet ar att den aldrig byggs.
  const sida = await oppnaOverlay();
  try {
    const antal = await sida.evaluate(() => document.querySelectorAll('.overlay-link-bar').length);
    assert.equal(antal, 0,
      `${antal} .overlay-link-bar i DOM. Att dolja racker inte — noden bar access-adressen.`);
  } finally { await sida.close() }
});

test('access-token och adress finns ALDRIG i DOM-texten', { skip, timeout: 90000 }, async () => {
  // Hardaste kravet, och skalet till att provet finns: en token som syns i en sandning ar lackt.
  // Mater texten OCH varje falts varde — ett falt kan bara adressen utan att den star i innerText.
  const sida = await oppnaOverlay();
  try {
    const fynd = await sida.evaluate((token) => {
      const text = document.body.innerText || '';
      const falt = [...document.querySelectorAll('input,select,textarea')].map(e => e.value || '');
      // ATTRIBUTEN OCKSA. En adress kan bo i value, title, href, data-* eller placeholder utan
      // att synas i innerText — och ett hogerklick i OBS visar den anda.
      const attr = [];
      for (const el of document.querySelectorAll('*')) {
        for (const a of el.attributes || []) {
          const v = String(a.value || '');
          if (v.indexOf(token) >= 0 || v.indexOf('/overlay') >= 0 || v.indexOf('access=') >= 0) {
            attr.push(el.tagName.toLowerCase() + '[' + a.name + ']=' + v.slice(0, 60));
          }
        }
      }
      return {
        iText: text.indexOf(token) >= 0 || /access=/.test(text) || /overlay-access/.test(text),
        iFalt: falt.filter(v => v.indexOf(token) >= 0 || v.indexOf('/overlay') >= 0 || v.indexOf('http') >= 0),
        iAttribut: attr.slice(0, 6),
      };
    }, TOKEN);
    assert.equal(fynd.iText, false, 'access-adressen star i sidans text — den syns i sandningen');
    assert.deepEqual(fynd.iFalt, [],
      'ett falt bar adressen: ' + JSON.stringify(fynd.iFalt)
      + '. Det racker att nagon pausar sandningen och laser av den.');
    assert.deepEqual(fynd.iAttribut, [],
      'ett ATTRIBUT bar adressen: ' + JSON.stringify(fynd.iAttribut)
      + '. Osynligt i bild, men lasbart med ett hogerklick.');
  } finally { await sida.close() }
});

test('widgetarna syns och bakgrunden ar transparent', { skip, timeout: 90000 }, async () => {
  // Vakten far inte bli "dolj allt". Det som SKA synas maste fortfarande synas, och bakgrunden
  // maste vara genomskinlig — annars lagger sig en svart platta over scenen i OBS.
  const sida = await oppnaOverlay();
  try {
    const m = await sida.evaluate(() => {
      const w = document.querySelector('[data-id]');
      const r = w ? w.getBoundingClientRect() : null;
      const genomskinlig = (f) => !f || f === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(f);
      const bodyF = getComputedStyle(document.body).backgroundColor;
      const htmlF = getComputedStyle(document.documentElement).backgroundColor;
      return {
        widgetSynlig: !!r && r.width > 0 && r.height > 0,
        bodyF, htmlF,
        bodyTransparent: genomskinlig(bodyF),
        htmlTransparent: genomskinlig(htmlF),
      };
    });
    assert.equal(m.widgetSynlig, true, 'widgeten syns inte — vakten har dolt for mycket');
    assert.equal(m.bodyTransparent, true, `body har bakgrund ${m.bodyF} — tacker scenen i OBS`);
    assert.equal(m.htmlTransparent, true, `html har bakgrund ${m.htmlF} — tacker scenen i OBS`);
  } finally { await sida.close() }
});

test('en ENSKILD widgetlank ar lika ren', { skip, timeout: 90000 }, async () => {
  // `?widget=` filtrerar rendern men gar genom samma sida. Fixen maste galla bada vagarna,
  // annars ar halva funktionen fortfarande lackande.
  const sida = await oppnaOverlay('&widget=w1');
  try {
    const synliga = await sida.evaluate(SYNLIGA, CHROME);
    assert.deepEqual(synliga, [],
      'Studio-chrome i den enskilda widgetlanken: ' + JSON.stringify(synliga));
    assert.equal(await sida.evaluate(() => document.querySelectorAll('[data-id]').length > 0), true,
      'widgeten syns inte i den enskilda lanken');
  } finally { await sida.close() }
});
