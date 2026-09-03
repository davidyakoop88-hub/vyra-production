'use strict';
// Battle MVP · de sju rammodellerna. Davids spec 2026-08-13:
//   MVP-etikett, profilbild och anvandarnamn — inget annat. Inga coins, poang eller giftdata.
//
// LAGET FORE, uppmatt i media.js battleMvpHtml (ramgrenen):
//   <small>  MVP-etiketten   visas som standard        (mvpShowLabel===false doljer)
//   <strong> anvandarnamnet  DOLT som standard         (kravde mvpShowName===true)
//   <b>      coins           dolt som standard         (kravde mvpShowCoins===true)
// Alltsa: namnet syns inte, och coins ligger kvar i DOM bakom display:none.
//
// KONTRAKTET som det har provet later:
//   * ramkonsten laddar for var och en av de sju
//   * MVP-etikett, profilbild och namn ar SYNLIGA — inte bara narvarande i DOM
//   * coins/poang finns INTE i DOM. Ett falt som bara ar dolt kan tandas igen av en gammal
//     sparad layout eller ett panelklick; ett falt som inte finns kan det inte.
//   * ett uttryckligt mvpShowName:false i en sparad layout doljer fortfarande namnet
//
// VARFOR RIKTIG WEBBLASARE: skillnaden mellan "finns i DOM" och "syns for anvandaren" gar
// inte att mata i jsdom, som saknar layout och svarar 0 pa varje rect.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
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

const RAMAR = ['gold-crown', 'royal-ribbon', 'laurel-star', 'dark-wings',
               'dragon-fire', 'nautical-helm', 'shadow-star'];

async function matRam(ram, extra) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(({ ram, extra }) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:battlemvp:frame:' + ram);
    w.x = 24; w.y = 60;
    if (extra) Object.assign(w, extra);
    state.widgets.push(w); selected = w.id; render();
    const el = document.querySelector(`[data-id="${w.id}"]`);
    if (!el) return { fel: 'widgeten renderades inte' };
    const syns = n => { const e = el.querySelector(n); if (!e) return null;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { bredd: r.width, hojd: r.height, display: cs.display,
               synlig: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
               text: (e.textContent || '').trim() } };
    const konst = el.querySelector('.mvpf-art');
    return {
      klass: el.className,
      konstSrc: konst ? konst.getAttribute('src') : null,
      etikett: syns('.mvpf-plate small'),
      foto: syns('.mvpf-photo img'),
      namn: syns('.mvpf-plate strong'),
      // allt som skulle kunna bara coins/poang
      coinsIDom: el.querySelectorAll('.mvpf-plate b').length,
      hittaScore: (el.textContent || '').includes('1500'),
      hittaMynt: /[◉◆♦💎]/.test(el.textContent || ''),
      helText: (el.textContent || '').trim().slice(0, 80)
    };
  }, { ram, extra });
  // vanta in bilderna och las om konstens laddning
  await page.waitForTimeout(700);
  const konstLaddad = await page.evaluate(() => {
    const i = document.querySelector('.mvpf-art');
    return !!i && i.complete && i.naturalWidth > 0;
  });
  await page.close();
  return { ...m, konstLaddad };
}

for (const ram of RAMAR) {
  test(`Battle MVP · ${ram}: ramkonsten laddar`, { skip }, async () => {
    const m = await matRam(ram);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.konstSrc, `assets/mvp-frames/${ram}.png`, 'fel bildsokvag');
    assert.ok(m.konstLaddad, `${ram}.png laddade inte i webblasaren`);
  });

  test(`Battle MVP · ${ram}: MVP, profilbild och namn syns`, { skip }, async () => {
    const m = await matRam(ram);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.etikett && m.etikett.synlig, 'MVP-etiketten syns inte');
    assert.match(m.etikett.text.toUpperCase(), /MVP/, `etiketten sager "${m.etikett && m.etikett.text}"`);
    assert.ok(m.foto && m.foto.synlig, 'profilbilden syns inte');
    assert.ok(m.namn && m.namn.synlig,
      `anvandarnamnet syns inte (display: ${m.namn && m.namn.display}) — det ska vara pa som standard`);
  });

  test(`Battle MVP · ${ram}: inga coins eller poang i DOM`, { skip }, async () => {
    const m = await matRam(ram);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.coinsIDom, 0,
      'coinselementet finns kvar i DOM — dolt racker inte, det kan tandas av gammal state');
    assert.ok(!m.hittaScore, `poangvardet syns i texten: "${m.helText}"`);
    assert.ok(!m.hittaMynt, `en myntsymbol syns i texten: "${m.helText}"`);
  });
}

test('ett uttryckligt mvpShowName:false doljer fortfarande namnet', { skip }, async () => {
  const m = await matRam('gold-crown', { mvpShowName: false });
  assert.ok(!m.fel, m.fel);
  assert.ok(!m.namn || !m.namn.synlig,
    'en sparad layout som medvetet stangt av namnet ska inte fa det patvingat tillbaka');
});

// ---- ALLA SJUTTON DESIGNERNA: namnet far aldrig spilla ut ur widgeten -------------------------
//
// Filen hette fran borjan bara "ramar", men fran 2026-09-03 visar ALLA sjutton Battle MVP-designer
// vinnarens namn, och da galler klippkravet alla. Provet ligger kvar HAR i stallet for i en ny fil
// med flit: browsersviten kor 62 filer parallellt med varsin webblasare och ligger pa gransen — en
// ny fil kan tippa den (se tests/browser/README eller CI-historiken for #300).
//
// VARFOR PROVET FINNS. Ramgrenen klippte redan namnet (.mvpf-row strong: nowrap/hidden/ellipsis
// inuti en .mvpf-plate med overflow:hidden). Stilmodellerna gjorde det INTE. Sa lange namnet var
// slackt for dem spelade det ingen roll; nar det tandes blev asymmetrin ett fel pa skarmen.
//
// UPPMATT 2026-09-03 i riktig Chromium, fore fixen: ett obrutet nickname pa 48 tecken gav ett h2
// pa 475 px i en 192 px lada — 111 px ut at vanster och 171 px ut at hoger, rakt over sandningen.
//
// NAMNET MASTE VARA OBRUTET. Ett testnamn med mellanslag radbryter i stallet for att spilla, och
// da ar provet gront pa trasig CSS — forsta versionen av det har provet gjorde precis det misstaget.
// Riktiga TikTok-nick ar ofta ett enda ord, och bryggan slapper igenom 120 tecken
// (tiktok-bridge/normalizer.js: text(b?.nickname,120)).
const LANGT_NAMN = 'Karleksbomben_MegaGifterXOXO_2026_bastasupportern';

test('inget Battle MVP-namn spiller ut ur sin widget', { skip, timeout: 180000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);

  const matt = await page.evaluate((namn) => {
    const V = window.VyraWidgets;
    const nycklar = [
      ...Object.keys(V.variants('battlemvp.style')).map(s => ['catalog:battlemvp:' + s, '.mvp-copy h2']),
      ...Object.keys(V.variants('battlemvp.frame')).map(f => ['catalog:battlemvp:frame:' + f, '.mvpf-row strong']),
    ];
    const ut = [];
    for (const [key, valj] of nycklar) {
      state.widgets.length = 0;
      const w = V.create(key);
      w.x = 24; w.y = 60; w.mvpName = namn;
      state.widgets.push(w); selected = w.id; render();
      const box = document.querySelector(`[data-id="${w.id}"]`);
      const el = box && box.querySelector(valj);
      if (!el) { ut.push({ key, fel: 'namnelementet finns inte i DOM' }); continue }
      const bb = box.getBoundingClientRect(), eb = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      ut.push({ key,
        // Positivt tal = texten sticker ut utanfor widgetens egen låda.
        spillVanster: Math.round(bb.left - eb.left),
        spillHoger: Math.round(eb.right - bb.right),
        klipp: `${cs.whiteSpace}/${cs.overflow}/${cs.textOverflow}`,
        synlig: eb.width > 0 && eb.height > 0 && cs.display !== 'none' });
    }
    return ut;
  }, LANGT_NAMN);
  await page.close();

  assert.equal(matt.length, 17, `matte ${matt.length} designer, inte 17`);
  assert.deepEqual(matt.filter(m => m.fel), [], 'namnelement saknas: ' + JSON.stringify(matt.filter(m => m.fel)));

  const spiller = matt.filter(m => m.spillVanster > 1 || m.spillHoger > 1);
  assert.deepEqual(spiller, [],
    'namnet spiller ut ur widgeten pa ' + spiller.length + ' design(er): '
    + spiller.map(m => `${m.key} (${m.spillVanster} px vanster, ${m.spillHoger} px hoger)`).join(', ')
    + '. Ett langt nickname maste klippas med ellips, inte ritas over sandningen.');

  const oklippta = matt.filter(m => m.klipp !== 'nowrap/hidden/ellipsis');
  assert.deepEqual(oklippta, [],
    'dessa designer klipper inte namnet: '
    + oklippta.map(m => `${m.key} [${m.klipp}]`).join(', '));

  assert.deepEqual(matt.filter(m => !m.synlig), [],
    'namnet ar inte synligt pa: ' + matt.filter(m => !m.synlig).map(m => m.key).join(', '));
});
