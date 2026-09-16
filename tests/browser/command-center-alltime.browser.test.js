'use strict';
// Framsidan: "TOTALT" — historiken, inte sessionen.
//
// Davids invändning, ordagrant: "meningen med fram sidan skulle vissa mig så inte när man är live få
// det info". De fyra korten högst upp visar sessionens siffror ur minnet och står på "—" så fort man
// inte sänder. Det här är raden under: summorna som ÖVERLEVER en omladdning, med en periodväljare,
// och "All time från första dagen".
//
// TVÅ RADER, INTE EN. Korten ovanför patchas av live-vägen under sändning. Låter man historiken
// använda samma noder skriver de två över varandra och siffran betyder olika saker beroende på när
// man tittar. "NU" och "TOTALT" är skilda mätningar och får skilda platser.
//
// ROTT NU: allihop. Ingen historikrad finns.
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

const SVAR = {
  ok: true, period: 'all', fran: null, forstaDagen: '2026-06-01', konto: 'piiikabom', fel: false,
  totalt: { gifts: 128, diamonds: 45300, likes: 9820 },
  dagar: [
    { dag: '2026-06-01', gifts: 10, diamonds: 3000, likes: 500 },
    { dag: '2026-08-08', gifts: 5, diamonds: 1200, likes: 300 }
  ],
  toppGivare: [{ id: 'anna', namn: 'Anna', avatar: '', gifts: 40, diamonds: 20000, likes: 100, bastaGava: null }]
};

// Stubbarna satts EFTER att sidan laddat, inte via addInitScript.
//
// Forsta forsoket anvande addInitScript och gav tomma matningar: sidans egna auth-client.js och
// cloud-sync.js definierar window.VyraAuth och window.VyraCloudSync vid laddning och skrev rakt over
// stubbarna. Framsidan anropade da den RIKTIGA api():n, fick 404 fran filservern, och foll till sitt
// felage — utan att provet sag varfor.
async function framsidan(svar = SVAR) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  // Grinden mater LADDNING, inte kopiatext (§6) - se tests/browser/command-center-grind.browser.test.js.
  await page.waitForFunction(
    () => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(svarJson => {
    window.__begarda = [];
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'ws-1' } }) };
    window.VyraAuth = {
      api: async path => { window.__begarda.push(path); return JSON.parse(svarJson) }
    };
  }, JSON.stringify(svar));
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  return page;
}

const siffror = txt => String(txt || '').replace(/\D/g, '');

// Samma vakt som i #128: utan raden blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravRaden(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-alltime]'));
  assert.equal(finns, true,
    'historikraden [data-alltime] finns inte — provet nedan hade blivit grönt utan att mäta något');
}

test('historiken hämtas från servern', { skip }, async () => {
  const page = await framsidan();
  await page.waitForFunction(() => window.__begarda && window.__begarda.length > 0, null, { timeout: 8000 })
    .catch(() => {});
  const begarda = await page.evaluate(() => window.__begarda || []);
  await page.close();
  assert.ok(begarda.some(p => /\/api\/workspaces\/ws-1\/stats/.test(p)),
    `framsidan frågade aldrig efter historiken. Begärda sökvägar: ${JSON.stringify(begarda)}`);
});

test('totalsummorna visas', { skip }, async () => {
  const page = await framsidan();
  await page.waitForSelector('[data-alltime]', { timeout: 8000 }).catch(() => {});
  await kravRaden(page);
  await page.waitForFunction(
    () => /\d/.test(document.querySelector('[data-alltime-stat="diamonds"]')?.textContent || ''),
    null, { timeout: 8000 }).catch(() => {});
  const ut = await page.evaluate(() => ({
    diamonds: document.querySelector('[data-alltime-stat="diamonds"]')?.textContent ?? '(saknas)',
    gifts: document.querySelector('[data-alltime-stat="gifts"]')?.textContent ?? '(saknas)',
    likes: document.querySelector('[data-alltime-stat="likes"]')?.textContent ?? '(saknas)'
  }));
  await page.close();
  assert.equal(siffror(ut.diamonds), '45300', `diamanter visade "${ut.diamonds}"`);
  assert.equal(siffror(ut.gifts), '128', `gåvor visade "${ut.gifts}"`);
  assert.equal(siffror(ut.likes), '9820', `likes visade "${ut.likes}"`);
});

// Det som skiljer den har raden fran korten ovanfor: den sager NAR historiken borjar. En naken
// siffra utan startdatum gar inte att tolka.
test('första dagen skrivs ut', { skip }, async () => {
  const page = await framsidan();
  await page.waitForSelector('[data-alltime]', { timeout: 8000 }).catch(() => {});
  await kravRaden(page);
  await page.waitForFunction(
    () => /2026/.test(document.querySelector('[data-alltime]')?.textContent || ''),
    null, { timeout: 8000 }).catch(() => {});
  const text = await page.evaluate(() => document.querySelector('[data-alltime]')?.textContent || '');
  await page.close();
  assert.match(text, /2026-06-01|1 juni|juni 2026/i, `raden nämnde aldrig startdatumet: "${text.slice(0, 200)}"`);
});

test('periodväljaren begär en ny period', { skip }, async () => {
  const page = await framsidan();
  await page.waitForSelector('[data-alltime-period="30d"]', { timeout: 8000 }).catch(() => {});
  const finns = await page.evaluate(() => !!document.querySelector('[data-alltime-period="30d"]'));
  assert.equal(finns, true, 'det finns ingen periodväljare');
  await page.evaluate(() => document.querySelector('[data-alltime-period="30d"]').click());
  await page.waitForFunction(
    () => (window.__begarda || []).some(p => /period=30d/.test(p)), null, { timeout: 8000 }).catch(() => {});
  const begarda = await page.evaluate(() => window.__begarda || []);
  await page.close();
  assert.ok(begarda.some(p => /period=30d/.test(p)),
    `klicket begärde ingen ny period. Begärda: ${JSON.stringify(begarda)}`);
});

// Historiken far ALDRIG rora korten ovanfor. De mater sessionen; blandas de ihop betyder siffran
// olika saker beroende pa nar man tittar.
test('historiken rör inte live-korten', { skip }, async () => {
  const page = await framsidan();
  await page.waitForSelector('[data-alltime]', { timeout: 8000 }).catch(() => {});
  await kravRaden(page);
  // Riktades om 2026-08-20: de fyra live-korten ersattes av toppgivarraden, men fragan ar
  // OFORANDRAD — historiken och sessionen ar tva olika sanningar och far aldrig skriva i
  // varandras noder. Raden ska sta kvar i sitt tomlage tills en RIKTIG gava kommit in.
  const ut = await page.evaluate(() => {
    const rad = document.querySelector('[data-toppgivare]');
    return {
      finns: !!rad,
      kort: rad ? rad.querySelectorAll('.toppgivare-kort').length : -1,
      tomSynlig: !!rad?.querySelector('.toppgivare-tom:not([hidden])')
    };
  });
  await page.close();
  assert.equal(ut.finns, true, '[data-toppgivare] saknas — testet mätte ingenting');
  assert.equal(ut.kort, 0,
    `historiken fyllde live-raden med ${ut.kort} kort — sessionens rad ska vara tom utan gåvor`);
  assert.equal(ut.tomSynlig, true, 'tomtexten i live-raden skrevs över av historiken');
});

// En ny anvandare har ingen historik. Da ska raden saga det arligt — inte visa nollor som ser ut
// som ett resultat, och absolut inte krascha vyn.
test('utan historik står en ärlig tomtext', { skip }, async () => {
  const page = await framsidan({ ok: true, period: 'all', fran: null, forstaDagen: null,
    konto: null, fel: false, totalt: { gifts: 0, diamonds: 0, likes: 0 }, dagar: [], toppGivare: [] });
  await page.waitForSelector('[data-alltime]', { timeout: 8000 }).catch(() => {});
  await kravRaden(page);
  const text = await page.evaluate(() => document.querySelector('[data-alltime]')?.textContent || '');
  await page.close();
  assert.match(text, /ingen|inget|ännu|börjar/i, `tomläget sa ingenting: "${text.slice(0, 200)}"`);
});

test('ett serverfel fäller inte sidan', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof home === 'function', null, { timeout: 20000 });
  await page.evaluate(() => {
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'ws-1' } }) };
    window.VyraAuth = { api: async () => { throw new Error('500') } };
  });
  await page.evaluate(() => { view = 'home'; render() });
  const kvar = await page.evaluate(() => !!document.querySelector('.home-welcome'));
  await page.close();
  assert.equal(kvar, true, 'framsidan försvann när historik-anropet kastade');
});

// ---- TOPPGIVARNA UR HISTORIKEN (#361) ----------------------------------------------------------
//
// Servern har returnerat `toppGivare` sedan #136/#137 — topp 50 med namn, avatar, gavor, diamanter
// och basta gava. INGEN klient ritade dem: datan raknades, skickades och kastades.
//
// Listan hogst upp pa sidan ar en ANNAN lista. Den matas av liveflodet och star tom sa fort man inte
// sander; den svarar pa "vem ger just nu". Den har svarar pa "vem har gett mig mest" och overlever
// en omladdning. Proven nedan vaktar att de aldrig blandas ihop.
const GIVARSVAR = {
  ...SVAR,
  toppGivare: [
    { id: 'anna', namn: 'Anna', avatar: 'https://cdn.example/a.jpg', gifts: 40, diamonds: 20000, likes: 0,
      bastaGava: { namn: 'Universe', diamanter: 15000 } },
    { id: 'bo', namn: 'Bo', avatar: '', gifts: 7, diamonds: 900, likes: 0, bastaGava: null },
    { id: 'c', namn: '<img src=x onerror=1>', avatar: 'javascript:alert(1)', gifts: 1, diamonds: 5, likes: 0, bastaGava: null }
  ]
};

test('toppgivarna ur historiken ritas ut', { skip }, async () => {
  const page = await framsidan(GIVARSVAR);
  const rader = await page.$$eval('.historikgivare-lista li', noder =>
    noder.map(n => ({
      namn: n.querySelector('b')?.textContent || '',
      varde: n.querySelector('strong')?.textContent || '',
      extra: n.querySelector('em')?.textContent || ''
    })));

  assert.equal(rader.length, 3, 'alla tre givarna skulle ritats');
  assert.equal(rader[0].namn, 'Anna');
  assert.equal(siffror(rader[0].varde), '20000', 'diamanterna skrevs inte ut');
});

test('bästa gåvan skrivs som NAMN, inte som [object Object]', { skip }, async () => {
  // bastaGava ar ett OBJEKT {namn, diamanter}. Ett String() pa den ger "[object Object]" — och det
  // hade INTE fallit ett prov som bara kollar att raden finns. Felet fanns i forsta utkastet.
  const page = await framsidan(GIVARSVAR);
  const extra = await page.$$eval('.historikgivare-lista em', n => n.map(x => x.textContent));

  assert.equal(extra[0], 'Universe', 'bästa gåvans namn skulle stått här');
  assert.ok(!extra.join(' ').includes('object Object'), 'ett objekt skrevs ut rått i gränssnittet');
  // Utan basta gava visas antalet gavor — aldrig en tom rad som ser ut som att nagot inte laddat.
  assert.match(extra[1], /7/, 'utan bästa gåva skulle antalet gåvor visats');
});

test('ett namn som ser ut som markup visas som TEXT', { skip }, async () => {
  // Raderna bar anvandardata fran TikTok. Samma regel som den levande listan: createElement och
  // textContent, aldrig innerHTML.
  const page = await framsidan(GIVARSVAR);
  const html = await page.$eval('.historikgivare-lista', n => n.innerHTML);
  const namn = await page.$$eval('.historikgivare-lista b', n => n.map(x => x.textContent));

  assert.ok(namn.includes('<img src=x onerror=1>'), 'namnet skulle visats som text');
  assert.ok(!html.includes('onerror=1>'), 'namnet tolkades som markup');
});

test('en avatar som inte är http(s) blir aldrig en <img>', { skip }, async () => {
  // MATT PA ANTALET, INTE PA VARDET. Forsta utkastet jamforde src mot den URL provet skickade in
  // och foll — for runtime-controls.js:51 har en global error-lyssnare som byter en bild som inte
  // gar att ladda mot en platshallare, och cdn.example finns inte i provmiljon. Beteendet ar ratt;
  // provet var fel. Det som ska matas ar att en javascript:-URL aldrig blir en <img> ALLS.
  const page = await framsidan(GIVARSVAR);
  const bilder = await page.$$eval('.historikgivare-lista img', n => n.map(x => x.getAttribute('src') || ''));

  assert.equal(bilder.length, 1,
    'exakt en <img> skulle skapats: Anna har en https-avatar, Bo har ingen, och den tredje har en '
    + 'javascript:-URL som aldrig far na en src');
  assert.ok(!bilder.some(src => /^s*javascript:/i.test(src)), 'en javascript:-URL hamnade i en src');
});

test('utan givare döljs hela rutan — ingen rubrik över ingenting', { skip }, async () => {
  // Ett tomt avsnitt med rubrik laser sig som "du har noll givare". For ett nytt konto ar sanningen
  // att inspelningen inte borjat, och den texten star redan i notraden under.
  const page = await framsidan({ ...SVAR, toppGivare: [] });
  const dold = await page.$eval('[data-historikgivare]', n => n.hidden);
  assert.equal(dold, true, 'rutan skulle varit dold');
});

test('historiklistan är en EGEN nod, aldrig den levande toppgivarraden', { skip }, async () => {
  // Sidans egen regel: "NU" och "TOTALT" ar skilda matningar och far aldrig dela nod. Skriver de
  // over varandra betyder listan olika saker beroende pa nar man tittar.
  const page = await framsidan(GIVARSVAR);
  const delad = await page.evaluate(() => {
    const historik = document.querySelector('[data-historikgivare]');
    const live = document.querySelector('[data-toppgivare]');
    return !!(historik && live && (historik === live || live.contains(historik) || historik.contains(live)));
  });
  assert.equal(delad, false, 'historiken och liveflödet delar nod — de skriver över varandra');
});
