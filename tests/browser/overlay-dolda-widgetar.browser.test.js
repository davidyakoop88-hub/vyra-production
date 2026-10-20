'use strict';
// EN DOLD WIDGET SYNS INTE - VARKEN I SANDNINGEN ELLER I LAYOUTEN.
//
// Davids rapport 2026-10-18: alla nio lager dolda ("Kvar i lager · dold för publiken"), men Guardian
// Emblem och Like Fountain ritades anda pa duken, och "vissa syns till och med i live".
//
// BASBETEENDET ar att en dold widget inte ritas alls, i bada lagena: media.js styledWh (rad 110)
// och liveVisibilityWh (rad 1138) lagger display:none och .widget-hidden. Familjer som laddas efter
// media.js:1138 och returnerar egen HTML gick forbi det. Uppmatt i Edge mot origin/main (54853b6):
//   overlay  65 av 173 katalognycklar syntes med hidden:true
//   editor   81 av 173
//   alerts   Last X och Guardian Emblem tandes i overlay nar de triggades
// overlay-dolda.js ar den generiska vakten. Det har provet ar det som gor den sann i morgon:
// nycklarna lases ur den genererade katalogkartan, sa en ny familj provas utan att nagon lagger till
// den har.
//
// VAD "SYNS" BETYDER HAR. Ett element raknas om det har storlek, inte ar display:none eller
// visibility:hidden nagonstans uppat, har ärvd opacity > 0.02 OCH faktiskt malar nagot (bakgrund,
// bild, canvas, text, skugga eller ram). Matningen tas FORE och EFTER widgeten skapats, och bara nya
// element raknas - sa portaler och effekter som ritas utanfor ladan fangas ocksa.
//
// KONTROLLFALLET ar obligatoriskt: samma matt ska ge utslag for en SYNLIG widget. Annars kunde
// provet bli gront av att matningen inte ser nagonting alls.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { GOLV } = require('../helpers/katalognycklar.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const NYCKLAR = [...new Set(
  fs.readFileSync(path.join(ROOT, 'docs/katalogkarta.md'), 'utf8')
    .match(/catalog:[A-Za-z0-9:._-]+/g) || [])].sort();

// En representant per alert- och effektfamilj, med sitt triggeranrop. Formen ar densamma som i
// overlay-alla-widgets.browser.test.js; effektfamiljerna (fyrverkerier, bubblor, fontan, burk,
// boostpaket) ritar pa canvas och syns bara i pixlarna.
const ALERTS = [
  ['catalog:battlemvp:frame:gold-crown', ['triggerBattleMvp', { username: '@Vakt', __test: true }]],
  ['catalog:fanlevel:layout:hero', ['triggerFanLevelUp', { username: '@Vakt', level: 12, __test: true }]],
  ['catalog:gifterlevel:stack', ['triggerGifterLevelUp', { username: '@Vakt', level: 9, __test: true }]],
  ['catalog:followeralert', ['triggerNewFollower', { username: '@Vakt', __test: true }]],
  ['catalog:lastx:card', ['triggerLastXAlert', 'gifter', { username: '@Vakt', __test: true }]],
  ['catalog:guardianemblem:4', ['triggerGuardianEmblem', { username: '@Vakt', __test: true }]],
  ['catalog:giftfireworks:royal', ['triggerGiftFireworks', { combo: 10, coins: 500, diamondCount: 500, giftName: 'Rose', __test: true }]],
  ['catalog:giftbubbles', ['triggerGiftBubbles', { combo: 10, coins: 500, diamondCount: 500, __test: true }]],
  ['catalog:heartfireworks', ['triggerHeartFireworks', { combo: 10, coins: 500, diamondCount: 500, __test: true }]],
  ['catalog:likefountain:portal:portal', ['triggerLikeFountainPop', { count: 30, __test: true }]],
  ['catalog:giftjar:dragon', ['triggerGiftJarDrop', { __amount: 5, coins: 5, __test: true }]],
  ['catalog:glovesnipe:koiPearl', ['triggerGloveSnipe', { __test: true }]],
];

// Atkomstvagen: OBS-kallan ar overlay.html?access=..., som laddar layouten fran molnet. Riggen
// svarar pa samma adress med de widgetar provet sjalv byggt.
let accessState = { widgets: [] };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (/^api\/overlay-access\/[^/]+$/.test(rel)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ overlay: { id: 'vakt', state: accessState } }));
      return;
    }
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const RIGG = `(() => {
  const malar = e => {
    const cs = getComputedStyle(e);
    return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
      || ['IMG', 'CANVAS', 'VIDEO', 'svg', 'SVG'].includes(e.tagName)
      || [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())
      || cs.boxShadow !== 'none' || cs.borderTopWidth !== '0px';
  };
  const synlig = e => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    let o = 1;
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      o *= parseFloat(cs.opacity);
    }
    return o > 0.02 && malar(e);
  };
  // Studio-chrome (lagerlistan, panelen, menyn) ar inte duken. Allt utanfor #view raknas, och
  // inuti #view bara det som ligger i .canvas-frame.
  const paDuken = e => !!e.closest('.canvas-frame') || !e.closest('#view, aside, nav, header, .sidebar, .toast');
  const sig = e => { const r = e.getBoundingClientRect(); return e.tagName + '|' + (e.getAttribute('class') || '') + '|' + [r.x, r.y, r.width, r.height].map(Math.round).join(',') };
  const alla = () => [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'LINK'].includes(e.tagName) && synlig(e));
  window.__doldBox = id => {
    const box = document.querySelector('[data-id="' + id + '"]');
    if (!box) return { finns: false, synliga: 0 };
    return { finns: true, synliga: [box, ...box.querySelectorAll('*')].filter(synlig).length };
  };
  window.__doldMat = async (nyckel, dold) => {
    state.widgets.length = 0; selected = null; render();
    await new Promise(r => setTimeout(r, 60));
    const fore = new Set(alla().map(sig));
    let w;
    try { w = window.VyraWidgets.create(nyckel) } catch (e) { return { fel: String(e && e.message || e).slice(0, 120) } }
    w.x = 40; w.y = 30; w.hidden = dold; state.widgets.push(w); selected = null; render();
    await new Promise(r => setTimeout(r, 300));
    const box = document.querySelector('[data-id="' + w.id + '"]');
    const nya = alla().filter(e => !fore.has(sig(e)));
    return { typ: w.type, finns: !!box, iLadan: nya.filter(e => box && box.contains(e)).length,
             utanfor: nya.filter(e => !(box && box.contains(e)) && paDuken(e)).length };
  };
  window.__doldTrig = (a) => {
    const n = a[0];
    if (typeof window[n] !== 'function') return 'saknas: ' + n;
    try { window[n](...a.slice(1)); return 'ok' } catch (e) { return 'FEL: ' + String(e && e.message || e).slice(0, 110) }
  };
  return true;
})()`;

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

async function oppna(url, editor) {
  const sida = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await sida.goto(`${bas}${url}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets, null, { timeout: 30000, polling: 100 });
  // Skriptsvansen i media.js laddar familjerna i parallella kedjor; vanta tills vakten och de
  // sista familjerna ar pa plats.
  await sida.waitForFunction(() => !!window.VyraDoldaWidgetar || performance.now() > 9000, null, { timeout: 30000, polling: 200 });
  await sida.waitForTimeout(2500);
  if (editor) await sida.evaluate(() => { view = 'editor'; render(); });
  await sida.evaluate(RIGG);
  return sida;
}

async function matAlla(sida, lage) {
  const lack = [];
  for (const nyckel of NYCKLAR) {
    const r = await sida.evaluate(([k]) => window.__doldMat(k, true), [nyckel]);
    if (r.fel) { lack.push(`${nyckel}: kastar - ${r.fel}`); continue }
    if (r.iLadan || r.utanfor) lack.push(`${nyckel} (${r.typ}): ${r.iLadan} synliga i ladan, ${r.utanfor} utanfor`);
  }
  return lack;
}

test('katalogen har nycklar att vakta', { skip }, () => {
  assert.ok(NYCKLAR.length >= GOLV, `bara ${NYCKLAR.length} katalognycklar i docs/katalogkarta.md`);
});

for (const [lage, url, editor] of [['overlay', '/studio.html?overlay=1', false], ['editor', '/studio.html?open=layout', true]]) {
  test(`ingen katalognyckel med hidden:true syns i ${lage}`, { skip }, async () => {
    const sida = await oppna(url, editor);
    try {
      if (!editor) {
        const m = await sida.evaluate(() => document.documentElement.className);
        assert.match(m, /overlay-output/, 'sidan ar inte i overlay-lage - provet mater editorn och kallar den overlay');
      }
      // KONTROLL: samma matt ser en synlig widget. Goal Pro ar malad i vila i bada lagena.
      const kontroll = await sida.evaluate(() => window.__doldMat('catalog:pggoal:1', false));
      assert.ok(kontroll.finns && kontroll.iLadan > 0,
        `kontrollen ser inte en SYNLIG Goal Pro i ${lage} (${JSON.stringify(kontroll)}) - matningen kan inte ge utslag`);

      const lack = await matAlla(sida, lage);
      assert.deepEqual(lack, [], `${lack.length} av ${NYCKLAR.length} dolda widgetar syns i ${lage}:\n  ` + lack.join('\n  '));
    } finally { await sida.close(); }
  });
}

test('overlay.html?access= visar inga dolda widgetar', { skip }, async () => {
  // Bygg alla nycklar i en studioflik, som dolda, och lat atkomstvagen hamta dem som molnlayout.
  const bygg = await oppna('/studio.html?overlay=1', false);
  try {
    accessState = await bygg.evaluate(nycklar => {
      const ut = [];
      nycklar.forEach((k, i) => { try { const w = window.VyraWidgets.create(k); w.x = 20 + (i % 6) * 210; w.y = 20 + Math.floor(i / 6) % 4 * 200; w.hidden = true; ut.push(JSON.parse(JSON.stringify(w))) } catch (_) {} });
      return { widgets: ut };
    }, NYCKLAR);
  } finally { await bygg.close(); }
  assert.ok(accessState.widgets.length >= GOLV, `bara ${accessState.widgets.length} widgetar byggdes`);

  const sida = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await sida.goto(`${bas}/overlay.html?access=vakt-nyckel`, { waitUntil: 'domcontentloaded' });
    await sida.waitForFunction(n => typeof state !== 'undefined' && state.widgets && state.widgets.length === n,
      accessState.widgets.length, { timeout: 30000, polling: 200 });
    await sida.waitForTimeout(3000);
    await sida.evaluate(RIGG);
    const m = await sida.evaluate(() => ({
      url: location.search,
      lack: state.widgets.map(w => ({ w, b: window.__doldBox(w.id) })).filter(x => x.b.synliga > 0)
        .map(x => `${x.w.type} (${x.w.id}): ${x.b.synliga} synliga element`),
      renderade: state.widgets.filter(w => document.querySelector('[data-id="' + w.id + '"]')).length,
    }));
    assert.match(m.url, /overlay=1/, 'overlay.html pekade inte om till studio.html?overlay=1');
    assert.ok(m.renderade > 0, 'inga widgetar renderades via atkomstvagen - provet mater ingenting');
    assert.deepEqual(m.lack, [], `${m.lack.length} dolda widgetar syns i overlay.html?access=:\n  ` + m.lack.join('\n  '));
  } finally { await sida.close(); }
});

async function pixlar(sida) {
  const b64 = (await sida.screenshot({ omitBackground: true })).toString('base64');
  return sida.evaluate(async b => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
    return n;
  }, b64);
}

test('ingen alert- eller effektfamilj med hidden:true tands i overlay nar den triggas', { skip }, async () => {
  // Pixlar och inte DOM: fyrverkerier och fontaner ritar pa canvas, och en overlay med genomskinlig
  // bakgrund ar tom precis nar inga pixlar har alfa. Det ar vad OBS och TikTok LIVE Studio ser.
  const sida = await oppna('/studio.html?overlay=1', false);
  const bygg = (k, dold) => sida.evaluate(([k, dold]) => {
    state.widgets.length = 0; selected = null;
    const w = window.VyraWidgets.create(k); w.x = 40; w.y = 30; w.hidden = dold;
    if (w.type === 'templateLastX') w.lastXPersistent = false;
    state.widgets.push(w); render();
  }, [k, dold]);
  // KON. runtime-controls.js koar fem av familjerna, och ett jobb haller sin plats i hela
  // visningstiden (upp till 8 s) - aven nar widgeten ar dold. Varje fas startar darfor mot en tom ko,
  // annars stod triggern i ko under hela pollningen och provet blev gront av att inget hann handa.
  const tomKo = () => sida.waitForFunction(() => !window.VyraAlertQueue || window.VyraAlertQueue.size() === 0,
    null, { timeout: 20000, polling: 200 });
  const fel = [];
  try {
    for (const [nyckel, anrop] of ALERTS) {
      await tomKo();
      await bygg(nyckel, true);
      await sida.waitForTimeout(400);
      const vila = await pixlar(sida);
      const svar = await sida.evaluate(a => window.__doldTrig(a), anrop);
      let max = vila;
      for (let i = 0; i < 10 && !max; i++) { await sida.waitForTimeout(250); max = Math.max(max, await pixlar(sida)); }

      // KONTROLL: samma trigger mot en synlig widget maste ge pixlar, annars mater provet ingenting.
      await tomKo();
      await bygg(nyckel, false);
      await sida.waitForTimeout(400);
      await sida.evaluate(a => window.__doldTrig(a), anrop);
      let kontroll = 0;
      for (let i = 0; i < 16 && !kontroll; i++) { await sida.waitForTimeout(250); kontroll = await pixlar(sida); }
      await sida.evaluate(() => { state.widgets.length = 0; render(); });
      await sida.waitForTimeout(1800);

      if (svar !== 'ok') { fel.push(`${nyckel}: ${anrop[0]} -> ${svar}`); continue }
      if (!kontroll) { fel.push(`${nyckel}: kontrollen tandes inte ens synlig - matningen kan inte ge utslag`); continue }
      if (max) fel.push(`${nyckel}: dold men ${max} pixlar syns i overlay efter ${anrop[0]}`);
    }
  } finally { await sida.close(); }
  assert.deepEqual(fel, [], `alert-familjer som syns trots hidden:true:\n  ` + fel.join('\n  '));
});

test('ogat visar widgeten igen och den syns i layouten', { skip }, async () => {
  // Doljandet far inte fastna: en widget som visas igen ska synas direkt, i samma flik.
  const sida = await oppna('/studio.html?open=layout', true);
  try {
    const r = await sida.evaluate(async () => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:guardianemblem:model:emerald');
      w.x = 40; w.y = 30; w.hidden = true; state.widgets.push(w); selected = w.id; render();
      await new Promise(r => setTimeout(r, 300));
      const dold = window.__doldBox(w.id).synliga;
      const rad = [...document.querySelectorAll('.live-layer-list [data-layer-id]')].find(a => a.dataset.layerId === w.id);
      rad && rad.querySelector('.layer-eye').click();
      await new Promise(r => setTimeout(r, 300));
      return { dold, rad: !!rad, hidden: w.hidden, synlig: window.__doldBox(w.id).synliga };
    });
    assert.equal(r.rad, true, 'den dolda widgeten saknas i lagerlistan - den ska finnas kvar i lagret');
    assert.equal(r.dold, 0, 'den dolda widgeten syns i layouten');
    assert.equal(r.hidden, false, 'ogat i lagerlistan andrade inte w.hidden');
    assert.ok(r.synlig > 0, 'widgeten syns inte efter att ogat visat den igen');
  } finally { await sida.close(); }
});

test('en dold fristående widget syns inte heller på sin egen länk', { skip }, async () => {
  // Beslut 2026-10-18: dold betyder dold, även på widgetens egen länk (?widget=<id>). Länken hittar
  // widgeten - selectForRender väljer den, så det blir ingen felvy för "borttagen" - men den ritas
  // aldrig. Kontrollen är en synlig fristående widget på sin länk, så att måttet kan ge utslag.
  const mat = async (id, dold) => {
    const sida = await oppna(`/studio.html?overlay=1&widget=${id}`, false);
    try {
      return await sida.evaluate(async ([id, dold]) => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create('catalog:pggoal:1', { placement: 'standalone' });
        w.id = id; w.x = 40; w.y = 30; w.hidden = dold; state.widgets.push(w); render();
        await new Promise(r => setTimeout(r, 400));
        return window.__doldBox(id);
      }, [id, dold]);
    } finally { await sida.close(); }
  };
  const kontroll = await mat('fri-synlig', false);
  assert.ok(kontroll.finns && kontroll.synliga > 0,
    `kontrollen: en synlig fristående widget syns inte på sin länk (${JSON.stringify(kontroll)}) - måttet kan inte ge utslag`);
  const dold = await mat('fri-dold', true);
  assert.equal(dold.synliga, 0, `den dolda fristående widgeten syns på sin egen länk (${JSON.stringify(dold)})`);
});
