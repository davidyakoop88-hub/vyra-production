'use strict';
// LAGER BYTER VILKEN WIDGET SOM SYNS ÖVERST — I STUDION OCH I SÄNDNINGEN (PR 16 i panelspecifikationen).
//
// Uppmätt 2026-10-19 i Edge, alla 173 katalognycklar, två widgetar på samma plats med lager 2/1 och sedan 1/2:
// 151 nycklar hade `z-index:auto` i både studion och overlayn, så Lager i panelen gjorde ingenting och den som
// låg sist i DOM:en låg alltid överst. Basbeteendet står i media.js styledWh (z-index = w.layer || 1), men
// familjerna som ritar egen HTML gick förbi det. vyra-lager.js skriver nu z-index på den yttre lådan efter varje
// render, oavsett renderare, och panelregistret visar Lager igen för de modellerna.
//
// VAD PROVET MÄTER. För en modell per familj: två widgetar A och B på samma plats.
//   1. A i lager 2 och B i lager 1 → A syns överst.
//   2. Lagret byts — i studion GENOM PANELEN (B väljs och Lager sätts till 3 i ramens sektion 3, eller i dagens
//      panel för en modell utan registerpost), i overlayn i state
//      följt av render(), som en molnsynk gör — → B syns överst.
// "Syns överst" avgörs med document.elementsFromPoint mitt i överlappet: träffordningen är målningsordningen.
// pointer-events tvingas på i provsidan, så att även effekter som inte tar emot klick träffas. Varje steg kräver
// också att lådornas beräknade z-index är lagret.
//
// ALERTFAMILJERNA är osynliga i vila. De tänds med samma per-nod-funktion som livetriggern kör för varje widget
// (fanSpelaPa, gifterSpelaPa, followerSpelaPa, guardianSpelaPa, mvpSpelaPa, VyraBattlePaket.spelaPa), så att båda
// lådorna spelar samtidigt och kön inte väntar 6–8 s mellan stegen. Last-X tänds med sin trigger (den köas inte).
//
// LÅDOR I FLÖDET (Fan Level heartbeat, Gifter Level orbitlevel) ligger inte på sin x/y, så två på samma x/y hamnar
// under varandra. Provet flyttar B tills lådorna överlappar — lagret avgör sedan ordningen precis som för de andra.
// Guardian Emblem låg i flödet fram till 2026-10-20 (position:relative i guardian-emblem.css); nu står den absolut.
//
// DOLDA WIDGETAR rörs inte: en dold widget med lager får sitt z-index men förblir osynlig (overlay-dolda.js).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const nod = fn => ['nod', fn];   // tänd varje låda med window[fn](box, w, händelse)
const HANDELSE = { username: '@Lager', name: '@Lager', level: 12, __test: true };
// [familj, katalognyckel, tändning]. Tändningen behövs bara där widgeten är osynlig i vila.
const FAMILJER = [
  ['Top Gifter Podium', 'catalog:pgpodium:royal-phoenix'],
  ['Top Streak Flip', 'catalog:pgstreak:emerald-wings'],
  ['Goal Pro', 'catalog:pggoal:1'],
  ['Heart Me Goal', 'catalog:heartgoal:classic'],
  ['Social Goal', 'catalog:socialgoal:diamonds:diamond-rail:landscape'],
  ['Gift Campaign', 'catalog:giftcampaign:gold:landscape'],
  ['Top Like', 'catalog:toplike:basic-v2'],
  ['Top Coins (renderaren sätter z-index själv)', 'catalog:ranking:templateTopCoins:voltage'],
  ['Top Gift', 'catalog:topgift:premium:neon'],
  ['Top Streak', 'catalog:topstreak:design:1'],
  ['Battle MVP', 'catalog:battlemvp:frame:dark-wings', nod('mvpSpelaPa')],
  ['Fan Level Up', 'catalog:fanlevel:layout:hero', nod('fanSpelaPa')],
  ['Gifter Level Up', 'catalog:gifterlevel:stack', nod('gifterSpelaPa')],
  ['Follower Spotlight', 'catalog:followeralert:gold', nod('followerSpelaPa')],
  ['Guardian Emblem', 'catalog:guardianemblem:4', nod('guardianSpelaPa')],
  ['Last-X', 'catalog:lastx:card', ['lastx']],
  ['Gift Fireworks', 'catalog:giftfireworks:royal'],
  ['Heart Fireworks', 'catalog:heartfireworks'],
  ['Gift Bubbles', 'catalog:giftbubbles'],
  ['Like Fountain', 'catalog:likefountain'],
  ['Like Fountain Portal', 'catalog:likefountain:portal:portal'],
  ['Gift Jar', 'catalog:giftjar:dragon'],
  ['Glove Snipe', 'catalog:glovesnipe:pinkPrincess:pack:2', ['paket']],
  ['Fan Level 50', 'catalog:fanlevel50:royal'],
  ['Egen text', 'catalog:custom:text'],
  ['Egen bild', 'catalog:custom:image'],
  ['Egen video', 'catalog:custom:video'],
];

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

// I sidan: lådan, överlappets mittpunkt och vem som träffas där.
const RIGG = `(() => {
  const st = document.createElement('style');
  st.textContent = '*{pointer-events:auto!important}';
  document.head.append(st);
  const lada = id => [...document.querySelectorAll('[data-id="' + id + '"]')]
    .find(e => e.classList.contains('widget') || (e.parentElement && e.parentElement.classList.contains('canvas')));
  const yta = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  window.__lagerLada = lada;
  window.__lagerOverlapp = () => {
    const A = lada('lagA'), B = lada('lagB');
    if (!A || !B) return 0;
    const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
    const minst = Math.min(a.width * a.height, b.width * b.height);
    return minst ? yta(a, b) / minst : 0;
  };
  window.__lagerMat = () => {
    const A = lada('lagA'), B = lada('lagB');
    if (!A || !B) return { saknas: !A ? 'A' : 'B' };
    const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2, y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    const topp = document.elementsFromPoint(x, y).map(e => A.contains(e) ? 'A' : B.contains(e) ? 'B' : null).find(Boolean) || '-';
    return { topp, zA: getComputedStyle(A).zIndex, zB: getComputedStyle(B).zIndex };
  };
  window.__lagerTand = (t) => {
    if (!t) return 'vila';
    const lista = ['lagA', 'lagB'].map(id => state.widgets.find(w => w.id === id));
    if (t[0] === 'nod') {
      const fn = window[t[1]];
      if (typeof fn !== 'function') return 'saknas: ' + t[1];
      for (const w of lista) fn(lada(w.id), w, Object.assign({}, ${JSON.stringify(HANDELSE)}));
      return 'ok';
    }
    if (t[0] === 'lastx') { window.triggerLastXAlert('gifter', Object.assign({}, ${JSON.stringify(HANDELSE)})); return 'ok'; }
    if (t[0] === 'paket') {
      const B = window.VyraBattlePaket;
      if (!B || typeof B.spelaPa !== 'function') return 'saknas: VyraBattlePaket.spelaPa';
      for (const w of lista) B.spelaPa(lada(w.id), w, { klipp: 'tap' });
      return 'ok';
    }
    return 'okänd tändning';
  };
  return true;
})()`;

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function oppna(editor, fel) {
  const sida = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  sida.on('pageerror', e => fel.push(String(e && e.message || e)));
  await sida.goto(`${bas}${editor ? '/studio.html?open=layout' : '/studio.html?overlay=1'}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets && !!window.VyraLager && !!window.VyraDoldaWidgetar,
    null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(2500);
  if (editor) {
    await sida.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await sida.evaluate(() => { view = 'editor'; render(); });
  }
  await sida.evaluate(RIGG);
  return sida;
}

// Pollar tills någon av lådorna träffas (alerterna tänds med en entré).
async function topp(sida) {
  let m = null;
  for (let i = 0; i < 15; i++) {
    m = await sida.evaluate(() => window.__lagerMat());
    if (m.topp === 'A' || m.topp === 'B') return m;
    await sida.waitForTimeout(200);
  }
  return m;
}

async function bygg(sida, nyckel) {
  await sida.evaluate(n => {
    state.widgets.length = 0; selected = null;
    const a = window.VyraWidgets.create(n), b = window.VyraWidgets.create(n);
    a.id = 'lagA'; b.id = 'lagB';
    a.x = b.x = 120; a.y = b.y = 90;
    a.layer = 2; b.layer = 1;
    if (a.type === 'templateLastX') a.lastXPersistent = b.lastXPersistent = false;
    state.widgets.push(a, b); render();
  }, nyckel);
  await sida.waitForTimeout(400);
  // Lådor som inte ligger på sin x/y (lådor i flödet, se filhuvudet) flyttas tills de överlappar.
  if (await sida.evaluate(() => window.__lagerOverlapp()) < 0.5) {
    await sida.evaluate(async () => {
      const b = state.widgets.find(w => w.id === 'lagB');
      const ra = window.__lagerLada('lagA').getBoundingClientRect(), r0 = window.__lagerLada('lagB').getBoundingClientRect();
      b.x += 100; b.y += 100; render();
      const r1 = window.__lagerLada('lagB').getBoundingClientRect();
      const kx = (r1.left - r0.left) / 100 || 1, ky = (r1.top - r0.top) / 100 || 1;
      b.x = b.x - 100 - (r0.left - ra.left) / kx; b.y = b.y - 100 - (r0.top - ra.top) / ky; render();
    });
    await sida.waitForTimeout(300);
  }
}

for (const [lage, editor] of [['studion', true], ['overlayn', false]]) {
  test(`Lager byter vilken widget som syns överst i ${lage}, en modell per familj`, { skip, timeout: 600000 }, async () => {
    const fel = [];
    const sida = await oppna(editor, fel);
    const lack = [];
    try {
      if (!editor) assert.match(await sida.evaluate(() => document.documentElement.className), /overlay-output/, 'sidan är inte i overlay-läge');
      for (const [familj, nyckel, tand] of FAMILJER) {
        await bygg(sida, nyckel);
        const t1 = await sida.evaluate(t => window.__lagerTand(t), tand || null);
        const m1 = await topp(sida);

        // Byt lager: B upp till 3.
        let panel = null;
        if (editor) {
          await sida.evaluate(() => { selected = 'lagB'; render(); });
          await sida.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 8000, polling: 100 }).catch(() => {});
          await sida.waitForTimeout(400);
          panel = await sida.evaluate(() => {
            // Med registerpost: Lager i ramens sektion 3. Utan post (Egen bild/video): dagens panel, där Lager alltid fanns.
            const ram = window.VyraPanelram && window.VyraPanelram.ager(state.widgets.find(w => w.id === 'lagB'));
            const el = document.querySelector(ram ? '.properties [data-panelram-sektion="3"] #propLayer' : '.properties #propLayer');
            if (!el) return 'saknas';
            el.value = '3';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'satt';
          });
          await sida.waitForTimeout(400);
          await sida.evaluate(() => { selected = null; render(); });
        } else {
          await sida.evaluate(() => { state.widgets.find(w => w.id === 'lagB').layer = 3; render(); });
        }
        await sida.waitForTimeout(300);
        const lagerB = await sida.evaluate(() => state.widgets.find(w => w.id === 'lagB').layer);
        const t2 = await sida.evaluate(t => window.__lagerTand(t), tand || null);
        const m2 = await topp(sida);

        const fall = `${familj} (${nyckel})`;
        if (t1 !== 'vila' && t1 !== 'ok') { lack.push(`${fall}: tändningen ${t1}`); continue; }
        if (editor && panel !== 'satt') { lack.push(`${fall}: Lager saknas i panelen`); continue; }
        if (Number(lagerB) !== 3) { lack.push(`${fall}: Lager i panelen ändrade inte w.layer (${lagerB})`); continue; }
        if (m1.zA !== '2' || m1.zB !== '1') lack.push(`${fall}: z-index ${m1.zA}/${m1.zB} med lager 2/1`);
        if (m2.zA !== '2' || m2.zB !== '3') lack.push(`${fall}: z-index ${m2.zA}/${m2.zB} med lager 2/3`);
        if (m1.topp !== 'A') lack.push(`${fall}: med lager 2/1 syns ${m1.topp} överst, inte A`);
        if (m2.topp !== 'B') lack.push(`${fall}: med lager 2/3 syns ${m2.topp} överst, inte B`);
        await sida.evaluate(() => { state.widgets.length = 0; selected = null; render(); });
      }
    } finally { await sida.close(); }
    assert.deepEqual(lack, [], `Lager verkar inte i ${lage}:\n  ` + lack.join('\n  '));
    assert.deepEqual(fel, [], 'inga sidfel');
  });
}

test('en dold widget får sitt lager men förblir osynlig i overlayn', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const sida = await oppna(false, fel);
  try {
    const r = await sida.evaluate(async () => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:heartgoal:classic');
      w.id = 'dold'; w.layer = 7; w.hidden = true; state.widgets.push(w); render();
      await new Promise(res => setTimeout(res, 300));
      const box = window.__lagerLada('dold');
      return { finns: !!box, z: box && getComputedStyle(box).zIndex, display: box && getComputedStyle(box).display,
        kvar: state.widgets.some(x => x.id === 'dold') };
    });
    assert.deepEqual(r, { finns: true, z: '7', display: 'none', kvar: true });
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await sida.close(); }
});
