'use strict';
// FAN LEVEL 50 OCH GLOVE SNIPE FÅR SINA RIKTIGA HÄNDELSER SOM FÖRUT (PR 14 i panelspecifikationen).
//
// PR 14 flyttade Fan Level 50 (vyra-fl50-panel.js) och Glove Snipe-paketen (vyra-glove-panel.js) in i panelramen med
// ▶ Testa widget, bröt ut gloveSpelaPa/battlePaketPaNod ur triggerGloveSnipe och spelaBattlePaket (media.js) och
// slideshowens kortbyte (bytKort) ur swap() i fan-level-50.js. Händelserna skickas som live-client.js och media.js gör
// (`vyra-live-battle` → routeLiveBattleEvent), alltså samma väg som TikToks battle- och nivåhändelser. Provet kräver:
//   * Fan Level 50: en tittare som når nivå 50 läggs till i rostern och syns i BÅDA tavlorna, som förut. Slideshowen
//     byter kort i editorn (swap läser studions state — rättningen #642), och en händelse mitt i ett test når de
//     riktiga tavlorna men inte klonen,
//   * Fan Level 50:s deltagarlista: Lägg till namn (utan servern), Hämta från TikTok (mot en uppsnappad
//     /api/tiktok-profile), namnbyte, bild via mediaväljaren (Använd automatisk), Ta bort och Bytestid som bandets
//     fart — alla syns i widgeten, och ingen sökväg syns i panelen,
//   * Glove Snipe: battle-motorn (battle-fx-auto.js, laddad i studion som i overlayn) spelar Tap Tap vid matchstart och
//     X3/Snipe vid uttryckliga händelser i alla synliga paket, aldrig i ett dolt, och Snipe bara där klippet finns.
//     Triggern direkt (triggerGloveSnipe utan live) spelar i den sist tillagda paketwidgeten via gloveSpelaPa, utan att
//     skriva på widgeten. En händelse mitt i ett test når den riktiga widgeten men inte klonen.
// Headless Chromium avkodar inte H.264 (MP4-paketen): provet läser källa, klasser och autoplay, inte bildrutor.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

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

async function oppna(fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraFanLevel50 && !!window.VyraFanLevel50Session && !!window.VyraBattlePaket,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.toast = () => {}; });
  return page;
}

// Widgetarna: nycklar och id:n; den första blir vald.
async function lagg(page, lista, extra) {
  await page.evaluate(([lista, extra]) => {
    state.widgets.length = 0;
    lista.forEach(([n, id, x, y]) => { const w = Object.assign(window.VyraWidgets.create(n), (extra && extra[id]) || {}); w.id = id; w.x = x; w.y = y; state.widgets.push(w); });
    selected = lista[0][1];
    render();
  }, [lista, extra || null]);
  await page.waitForTimeout(1200);
}

const live = (page, detail) => page.evaluate(d => window.dispatchEvent(new CustomEvent('vyra-live-battle', { detail: d })), detail);
const namnPa = (page, id) => page.evaluate(id => [...document.querySelectorAll(`.canvas [data-id="${id}"]:not([data-testspel-klon]) .fl50-name span`)].map(n => n.textContent.trim()).join('|'), id);
const klonNamn = page => page.evaluate(() => [...document.querySelectorAll('.canvas [data-testspel-klon] .fl50-name span')].map(n => n.textContent.trim()).join('|'));

// ---- Fan Level 50 -------------------------------------------------------------------------------------------------
test('Fan Level 50: en tittare som når nivå 50 syns i båda tavlorna, även mitt i ett test, men inte i klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await page.evaluate(() => window.VyraFanLevel50.clear());
    await lagg(page, [['catalog:fanlevel50:royal', 'fa', 60, 120], ['catalog:fanlevel50:royal', 'fb', 420, 120]],
      { fa: { fanl50Mode: 'band', fanl50Source: 'both' }, fb: { fanl50Mode: 'band', fanl50Source: 'auto' } });
    assert.equal(await namnPa(page, 'fa'), 'MICHELLY|GARY B.|NOVA STORM|MICHELLY|GARY B.|NOVA STORM', 'kontrollmätning: editorns exempelfans före händelsen');
    // En nivåhändelse under nivå 50 lägger inte till någon.
    await live(page, { type: 'fan_level', username: 'Liten', teamLevel: 12 });
    await page.waitForTimeout(600);
    assert.deepEqual(await page.evaluate(() => window.VyraFanLevel50.roster().map(m => m.name)), [], 'nivå 12 är ingen milstolpe');
    await live(page, { type: 'fan_level', username: 'Nova', teamLevel: 50, profileImage: 'assets/gifts/events/0001_Rose.png' });
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => window.VyraFanLevel50.roster()), [{ name: 'Nova', avatar: 'assets/gifts/events/0001_Rose.png', team: '' }]);
    assert.equal(await namnPa(page, 'fa'), 'Nova|Nova', 'tavla A visar den riktiga deltagaren');
    assert.equal(await namnPa(page, 'fb'), 'Nova|Nova', 'tavla B visar den riktiga deltagaren');

    // Mitt i ett test: den riktiga händelsen når tavlorna, klonen visar fortfarande exempeldeltagarna.
    await page.click('#pr-testspel');
    await page.waitForTimeout(400);
    assert.equal(await klonNamn(page), 'Alex|Mia|Leo|Sara|Alex|Mia|Leo|Sara');
    await live(page, { type: 'fan_level', username: 'Zed', fanLevelUp: { from: 49, to: 50 } });
    await page.waitForTimeout(700);
    // Rostern ritar om (render), vilket stoppar testet först — klonen fick aldrig Zed.
    assert.deepEqual(await page.evaluate(() => window.VyraFanLevel50.roster().map(m => m.name)), ['Nova', 'Zed']);
    assert.equal(await namnPa(page, 'fb'), 'Nova|Zed|Nova|Zed');
    assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render', 'omritningen stoppade testet');
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    await page.evaluate(() => window.VyraFanLevel50.clear());
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Fan Level 50: slideshowen byter kort i editorn (swap läser studions state)', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await page.evaluate(() => window.VyraFanLevel50.clear());
    await lagg(page, [['catalog:fanlevel50:royal', 'fs', 60, 120]], { fs: { fanl50Mode: 'slideshow', fanl50Interval: 2, fanl50Source: 'manual',
      fanl50Manual: [{ name: 'Ett', avatar: '' }, { name: 'Två', avatar: '' }] } });
    const sett = new Set();
    for (let i = 0; i < 16; i++) { sett.add(await namnPa(page, 'fs')); await page.waitForTimeout(300); }
    assert.ok(sett.has('Ett') && sett.has('Två'), 'slideshowen visade båda korten: ' + [...sett].join(','));
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Fan Level 50: deltagarlistan i panelen — lägg till, hämta, byt namn, ingen bildväljare, ta bort och bandets fart', { skip, timeout: 150000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  const hamtningar = [];
  await page.route(/\/api\/tiktok-profile/, r => {
    hamtningar.push(r.request().url());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, nickname: 'Hamtad', avatar: 'assets/gifts/events/7460_Cap.png' }) });
  });
  try {
    await page.evaluate(() => window.VyraFanLevel50.clear());
    await lagg(page, [['catalog:fanlevel50:royal', 'fd', 60, 120]], { fd: { fanl50Mode: 'band', fanl50Source: 'manual' } });
    const panel = () => page.evaluate(() => {
      const p = document.querySelector('.properties');
      const s2 = p.querySelector('[data-panelram-sektion="2"]');
      return { ram: p.dataset.panelram, rader: [...s2.querySelectorAll('.fl50-rad')].map(r => r.querySelector('.fl50-rad-namn').value),
        valjare: s2.querySelectorAll('.fl50-rad .vyra-mediaval').length, status: [...s2.querySelectorAll('.fl50-rad .vm-status')].map(n => n.textContent),
        text: [...p.querySelectorAll('[data-panelram-sektion]')].map(s => s.innerText).join('\n'),
        lagnamn: !!p.querySelector('[data-panelram-sektion] #fl50Team'), textruta: !!p.querySelector('[data-panelram-sektion] #fl50Manual') };
    });
    const fore = await panel();
    assert.equal(fore.ram, '1');
    assert.deepEqual([fore.lagnamn, fore.textruta], [false, false], 'Lagnamn och textrutan är borta ur panelen');
    assert.deepEqual(fore.rader, []);

    // Lägg till namn: utan servern.
    await page.fill('#fl50AddUser', '@Ett, Två');
    await page.click('#fl50AddNamn');
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => liveWidget('fd').fanl50Manual), [{ name: 'Ett', avatar: '' }, { name: 'Två', avatar: '' }]);
    assert.equal(await namnPa(page, 'fd'), 'Ett|Två|Ett|Två', 'widgeten visar deltagarna');
    assert.deepEqual(hamtningar, [], 'Lägg till namn frågar inte servern');

    // Hämta från TikTok: en riktig åtgärd mot servern (här uppsnappad).
    await page.fill('#fl50AddUser', '@hamtad');
    await page.click('#fl50AddBtn');
    await page.waitForTimeout(900);
    assert.equal(hamtningar.length, 1, 'Hämta frågar /api/tiktok-profile en gång');
    assert.match(hamtningar[0], /username=hamtad$/);
    assert.deepEqual(await page.evaluate(() => liveWidget('fd').fanl50Manual[2]), { name: 'Hamtad', avatar: 'assets/gifts/events/7460_Cap.png', hamtad: true });
    let p = await panel();
    assert.deepEqual(p.rader, ['Ett', 'Två', 'Hamtad']);
    // Ingen bildväljare per deltagare (David 2026-10-20: ingen panel väljer profilbild). Den hämtade
    // bilden kommer från TikTok och ritas i widgeten.
    assert.equal(p.valjare, 0, 'ingen mediaväljare i deltagarraderna');
    assert.deepEqual(p.status, []);
    assert.doesNotMatch(p.text, /Välj bild|Använd automatisk|Profilbild/, 'ingen bildväljare i panelen');
    assert.doesNotMatch(p.text, /assets\/|\.png|\.svg|URL/, 'ingen sökväg i panelen');
    assert.match(await page.evaluate(() => document.querySelector('.canvas [data-id="fd"] .fl50-card:nth-child(3) .fl50-photo img').getAttribute('src')), /7460_Cap\.png/, 'den hämtade bilden i widgeten');

    // Namnbyte på en rad.
    await page.fill('#fl50Namn0', 'Ettan');
    await page.dispatchEvent('#fl50Namn0', 'change');
    await page.waitForTimeout(700);
    assert.equal(await namnPa(page, 'fd'), 'Ettan|Två|Hamtad|Ettan|Två|Hamtad');

    // En egen bild som redan är sparad på en deltagare (data:, från den gamla väljaren) ritas inte:
    // standardbilden visas (vyraReservbild i media.js). Fältet i state står kvar.
    await page.evaluate(() => { const w = liveWidget('fd'); w.fanl50Manual = w.fanl50Manual.map((m, i) => i === 0 ? Object.assign({}, m, { avatar: 'data:image/png;base64,iVBORw0KGgo=' }) : m); render(); });
    await page.waitForTimeout(700);
    assert.match(await page.evaluate(() => document.querySelector('.canvas [data-id="fd"] .fl50-card:nth-child(1) .fl50-photo img').getAttribute('src')), /test-profile\.svg/);
    assert.match(await page.evaluate(() => liveWidget('fd').fanl50Manual[0].avatar), /^data:/, 'det sparade fältet raderas inte');

    // Ta bort.
    await page.click('#fl50Del1');
    await page.waitForTimeout(700);
    assert.equal(await namnPa(page, 'fd'), 'Ettan|Hamtad|Ettan|Hamtad');
    p = await panel();
    assert.deepEqual(p.rader, ['Ettan', 'Hamtad']);

    // Bytestid är bandets fart (Tempo i bandet): change ritar om, och farten står i rotens stil.
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="6"]')?.classList.add('open'));
    const etikett = await page.evaluate(() => { const l = document.querySelector('.properties [data-panelram-sektion] #fl50Interval').closest('label'); const c = l.cloneNode(true); c.querySelectorAll('input, b, small').forEach(n => n.remove()); return c.textContent.trim(); });
    assert.equal(etikett, 'Tempo');
    await page.evaluate(() => { const el = document.querySelector('#fl50Interval'); el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => document.querySelector('.canvas [data-id="fd"]').style.getPropertyValue('--fl50-speed')), '3s');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="fd"] .fl50-track')).animationDuration), '12s', 'ett varv tar fyra gånger värdet');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// ---- Glove Snipe --------------------------------------------------------------------------------------------------
const paketLage = page => page.evaluate(() => [...document.querySelectorAll('.canvas .battle-pack-full:not([data-testspel-klon])')].map(n => {
  const v = n.querySelector('video');
  return n.dataset.id + ':' + (n.classList.contains('pack-active') ? (n.dataset.klipp || '?') + ':' + String(v && v.getAttribute('src')).split('/').pop() : '-');
}).join(' '));
const stangAlla = page => page.evaluate(() => ['ga', 'gb', 'gc', 'prov-a', 'prov-b'].forEach(id => window.VyraBattlePaket.stang(id)));

test('Glove Snipe: battlehändelser spelar klippet i paketet som förut', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await lagg(page, [['catalog:glovesnipe:pinkPrincess:pack:2', 'ga', 0, 120], ['catalog:glovesnipe:koiPearl:pack:2', 'gb', 0, 420],
      ['catalog:glovesnipe:royalRuby:pack:2', 'gc', 0, 720]], { gc: { hidden: true } });
    assert.equal(await paketLage(page), 'ga:- gb:- gc:-', 'kontrollmätning: inget spelar i vila');
    assert.ok(await page.evaluate(() => !!window.VyraBattleFx), 'battle-motorn (battle-fx-auto.js) är laddad i studion, som i sändningen');
    // Matchstart → Tap Tap i alla synliga paket (motorn spelar genom VyraBattlePaket.spela), aldrig i det dolda.
    await live(page, { type: 'battle', battleStatus: 'started', battleId: 'b1', id: 'h1' });
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'ga:tap:tap.webm gb:tap:tap.mp4 gc:-', 'matchstarten spelar Tap Tap');
    let v = await page.evaluate(() => { const x = document.querySelector('.canvas [data-id="ga"] video'); return { autoplay: x.hasAttribute('autoplay'), muted: x.muted, loop: x.loop }; });
    assert.deepEqual(v, { autoplay: true, muted: true, loop: false }, 'samma startväg som förut');
    await stangAlla(page);
    // Uttryckliga klipp: X3 i båda, Snipe bara i WebM-paketet (MP4-paketet har inget Snipe-klipp).
    await live(page, { type: 'x3', id: 'h2' });
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'ga:boost-x3:x3.webm gb:boost-x3:boost-x3.mp4 gc:-');
    await stangAlla(page);
    await live(page, { type: 'snipe', id: 'h3' });
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'ga:snipe:snipe.webm gb:- gc:-', 'Snipe bara där klippet finns');
    await stangAlla(page);
    // Triggern direkt (Stream Deck, riggar): den sist tillagda synliga paketwidgeten, klippet ur händelsen — via
    // gloveSpelaPa, utan att skriva på widgeten.
    const fore = await page.evaluate(() => JSON.stringify(state.widgets));
    await page.evaluate(() => window.triggerGloveSnipe({ kind: 'glove', multiplier: 3 }));
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'ga:- gb:boost-x3:boost-x3.mp4 gc:-', 'Glove ×3 → X3 i den sist tillagda');
    assert.equal(await page.evaluate(() => JSON.stringify(state.widgets)), fore, 'paketvägen skriver inget på widgetarna');
    await stangAlla(page);
    await page.evaluate(() => window.triggerGloveSnipe({ kind: 'snipe' }));
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'ga:- gb:- gc:-', 'MP4-paketet spelar ingen Snipe, som förut');
    assert.deepEqual(await page.evaluate(() => window.VyraBattlePaket.aktiva()), []);
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Glove Snipe: en battlehändelse mitt i ett test når den riktiga widgeten men inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await lagg(page, [['catalog:glovesnipe:cloudFox:pack:2', 'prov-a', 0, 120]]);
    await page.selectOption('#pr-testspel-typ', 'snipe');
    await page.click('#pr-testspel');
    await page.waitForTimeout(400);
    const klon = () => page.evaluate(() => { const k = document.querySelector('.canvas [data-testspel-klon]'); return k ? k.dataset.klipp + ':' + k.classList.contains('pack-active') : null; });
    assert.equal(await klon(), 'snipe:true');
    await live(page, { type: 'x2', id: 'm1' });
    await page.waitForTimeout(300);
    assert.equal(await paketLage(page), 'prov-a:boost-x2:x2.webm', 'den riktiga widgeten spelar händelsens klipp');
    assert.equal(await klon(), 'snipe:true', 'klonen spelar fortfarande testets klipp');
    assert.deepEqual((await page.evaluate(() => window.VyraBattlePaket.aktiva())).sort(), ['prov-a', 'prov-a__prov']);
    await page.click('#pr-testspel');
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.VyraBattlePaket.aktiva()), ['prov-a'], '■ stänger bara klonens klipp');
    await stangAlla(page);
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
