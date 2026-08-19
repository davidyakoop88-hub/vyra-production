'use strict';
// OVERLAY-UTGÅNGEN, hela katalogen. Renderas varje widget i sändningen, och tänds varje alert?
//
// VARFÖR FILEN FINNS. `widget-frameless-output.test.js` täcker EN typ (`templateTopGift`) — den är
// inte generisk, och ingen annan vakt öppnar `?overlay=1` alls. Uppmätt 2026-08-19 för hand: alla
// 181 katalognycklar renderar och alla 48 alerts spelar färdigt. Den mätningen är sann den dag den
// gjordes; den här filen är det som gör den sann i morgon också.
//
// TVÅ SORTERS PÅSTÅENDE, med flit uppdelade:
//
//   ÖVERSIKTEN  — varje katalognyckel skapas och renderas i overlay utan att kasta, och utan att
//                 lämna en trasig bild efter sig. Snabb: en sidladdning, ingen trigger, ingen väntan.
//   KOREOGRAFIN — en representant per alert-familj triggas och måste bli synlig och sedan slockna.
//                 Långsam per widget, så den provar en nyckel per familj i stället för alla 48.
//
// ATT PROVA ALLA 48 hade tagit tio minuter i CI för att bevisa samma sak som arton gör: att
// familjens koreografi når overlay-läget. Skiljer sig två nycklar i SAMMA familj åt är det
// designdata, och det vaktas av familjens egen provfil.
//
// EN VILANDE ALERT ÄR OSYNLIG MED FLIT. Att `opacity` är 0 innan triggern är rätt beteende — en
// alert ska inte synas i sändningen förrän den utlösts. Ett prov som kräver att allt är målat i
// vila hade fällt 48 friska widgets; det är skillnaden mellan "gömd" och "trasig" som mäts här.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

// Nycklarna läses ur den GENERERADE kartan, inte ur en handskriven lista. `docs/katalogkarta.md`
// byggs ur de körande katalogknapparna, så en ny familj hamnar här av sig själv — och en vakt som
// räknar upp vaktar bara det någon kom ihåg.
//
// Teckenklassen måste bära A-Z. Uppmätt: utan versaler klipptes `catalog:glovesnipe:koiPearl` till
// `koi` och `catalog:ranking:templateTopCoins` till `template`, och båda rapporterades som trasiga
// katalognycklar när det var uttrycket som var trasigt.
const NYCKLAR = [...new Set(
  fs.readFileSync(path.join(ROOT, 'docs/katalogkarta.md'), 'utf8')
    .match(/catalog:[A-Za-z0-9:._-]+/g) || [])].sort();

// En representant per alert-familj, med sitt triggeranrop. `triggerLastXAlert` tar en TYPNYCKEL som
// första argument och inte ett event — riggen skickade först ett objekt och rapporterade då fem
// friska widgets som trasiga. Anropsformen står därför utskriven per familj.
const ALERTS = [
  { nyckel: 'catalog:battlemvp:frame:gold-crown', anrop: ['triggerBattleMvp', { username: '@Vakt', __test: true }] },
  { nyckel: 'catalog:fanlevel:layout:hero', anrop: ['triggerFanLevelUp', { username: '@Vakt', level: 12, __test: true }] },
  { nyckel: 'catalog:gifterlevel:stack', anrop: ['triggerGifterLevelUp', { username: '@Vakt', level: 9, __test: true }] },
  { nyckel: 'catalog:followeralert', anrop: ['triggerNewFollower', { username: '@Vakt', __test: true }] },
  { nyckel: 'catalog:lastx:card', anrop: ['triggerLastXAlert', 'gifter', { username: '@Vakt', __test: true }] },
  { nyckel: 'catalog:guardianemblem:4', anrop: ['triggerGuardianEmblem', { username: '@Vakt', __test: true }] },
];

let server, browser, bas, sida;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  sida = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  sida.__kast = [];
  sida.on('pageerror', e => sida.__kast.push(String(e.message).slice(0, 120)));
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!window.VyraWidgets && typeof window.render === 'function'
    || !!document.querySelector('script[src*="media.js"]'), null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(RIGG_KALLA);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Mätfunktionerna, injicerade en gång. `effektiv` är produkten av `opacity` hela vägen upp — en del
// kan stå på opacity 1 och ändå vara släckt av en förälder, och det är den ärvda siffran som avgör
// vad tittaren ser.
const RIGG_KALLA = `(() => {
  window.__ovEff = () => {
    const box = document.querySelector('[data-id]');
    if (!box) return { finns: false };
    const r = box.getBoundingClientRect();
    let o = 1;
    for (let n = box; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') { o = 0; break }
      o *= parseFloat(cs.opacity);
    }
    let barn = 0;
    box.querySelectorAll('*').forEach(e => {
      const br = e.getBoundingClientRect();
      if (getComputedStyle(e).display === 'none' || br.width < 2 || br.height < 2) return;
      let bo = o;
      for (let n = e; n && n !== box; n = n.parentElement) bo *= parseFloat(getComputedStyle(n).opacity);
      if (bo > barn) barn = bo;
    });
    return { finns: true, synlig: r.width > 2 && r.height > 2 && Math.max(o, barn) > 0.02,
             b: Math.round(r.width), h: Math.round(r.height) };
  };
  window.__ovBygg = (nyckel) => {
    try {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create(nyckel);
      w.x = 40; w.y = 30; state.widgets.push(w); selected = null; render();
      const box = document.querySelector('[data-id="' + w.id + '"]');
      return { typ: w.type, renderad: !!box,
               bilder: box ? [...box.querySelectorAll('img')].map(i => i.getAttribute('src') || '') : [] };
    } catch (e) { return { fel: String(e && e.message || e).slice(0, 140) } }
  };
  window.__ovTrasiga = () => [...document.querySelectorAll('[data-id] img')]
    .filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src') || '');
  window.__ovTrig = (...a) => {
    const n = a.shift();
    if (typeof window[n] !== 'function') return 'saknas: ' + n;
    try { window[n](...a); return 'ok' } catch (e) { return 'FEL: ' + String(e && e.message || e).slice(0, 110) }
  };
  return true;
})()`;

test('overlay-läget är verkligen påslaget', { skip }, async () => {
  // Kontrollmätningen för hela filen. Utan den mäter varje prov nedan editorn och kallar den
  // overlay — och editorn visar saker sändningen aldrig får se.
  const m = await sida.evaluate(() => ({
    klass: document.documentElement.className,
    body: getComputedStyle(document.body).backgroundColor,
    chrome: ['.sidebar', '.properties', '.widget-catalog']
      .filter(s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 0 }),
  }));
  assert.match(m.klass, /overlay-output/, 'html bär inte overlay-output — sidan är i editorläge');
  assert.match(m.body, /rgba\(0, 0, 0, 0\)|transparent/, `body har bakgrund ${m.body} — overlayn ska vara genomskinlig`);
  assert.deepEqual(m.chrome, [], `studio-chrome syns i sändningen: ${m.chrome.join(', ')}`);
});

test('katalogen har nycklar att vakta', { skip }, () => {
  assert.ok(NYCKLAR.length >= 150,
    `hittade bara ${NYCKLAR.length} katalognycklar i docs/katalogkarta.md — har kartan flyttat eller inte regenererats?`);
});

test('varje katalognyckel renderas i overlay utan att kasta', { skip }, async () => {
  const fel = [];
  for (const nyckel of NYCKLAR) {
    const fore = sida.__kast.length;
    const r = await sida.evaluate(k => window.__ovBygg(k), nyckel);
    if (r.fel) { fel.push(`${nyckel}: kastar — ${r.fel}`); continue }
    if (!r.renderad) { fel.push(`${nyckel}: renderas inte`); continue }
    if (r.bilder.length) {
      await sida.waitForFunction(() => [...document.querySelectorAll('[data-id] img')].every(i => i.complete),
        null, { timeout: 8000, polling: 100 }).catch(() => {});
      const trasiga = await sida.evaluate(() => window.__ovTrasiga());
      if (trasiga.length) fel.push(`${nyckel}: bilden laddas inte — ${trasiga.join(', ')}`);
    }
    const kast = sida.__kast.slice(fore);
    if (kast.length) fel.push(`${nyckel}: kast under rendering — ${kast.join(' | ')}`);
  }
  assert.deepEqual(fel, [], `${fel.length} av ${NYCKLAR.length} nycklar är trasiga i overlay:\n  ` + fel.join('\n  '));
});

test('varje alert-familj tänds av sin trigger och slocknar igen', { skip }, async () => {
  const fel = [];
  for (const { nyckel, anrop } of ALERTS) {
    const r = await sida.evaluate(k => window.__ovBygg(k), nyckel);
    if (r.fel || !r.renderad) { fel.push(`${nyckel}: gick inte att rendera`); continue }
    await sida.waitForTimeout(150);

    // KONTROLLMÄTNING: en alert ska vara SLÄCKT i vila. Är den redan tänd mäter provet nedan
    // ingenting — då hade "blev synlig" varit sant innan triggern ens kördes.
    const vila = await sida.evaluate(() => window.__ovEff());
    if (vila.synlig) { fel.push(`${nyckel}: syns redan i vila — en alert ska vara släckt tills den utlöses`); continue }

    const svar = await sida.evaluate(a => window.__ovTrig(...a), anrop);
    if (svar !== 'ok') { fel.push(`${nyckel}: ${anrop[0]} → ${svar}`); continue }

    const tandes = await sida.waitForFunction(() => window.__ovEff().synlig, null,
      { timeout: 8000, polling: 100 }).then(() => true).catch(() => false);
    if (!tandes) { fel.push(`${nyckel}: ${anrop[0]} kördes men widgeten tändes aldrig i overlay`); continue }

    const slocknade = await sida.waitForFunction(() => !window.__ovEff().synlig, null,
      { timeout: 20000, polling: 200 }).then(() => true).catch(() => false);
    if (!slocknade) fel.push(`${nyckel}: tändes men slocknade aldrig — den blir kvar över sändningen`);
  }
  assert.deepEqual(fel, [], `alert-familjer med fel i overlay:\n  ` + fel.join('\n  '));
});
