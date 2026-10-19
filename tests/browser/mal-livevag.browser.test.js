'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR SOCIAL GOAL, HEART ME OCH GIFT CAMPAIGN (PR 9 i panelspecifikationen).
//
// Målen har sedan PR 9 panelramens panel och ▶ Testa widget, som spelar en klon (vyra-mal-panel.js).
// Provet kräver att de riktiga widgetarna beter sig som förut:
//   * en riktig målram (goal-client.js: snapshot och SSE-ram, samma väg som studion och OBS-länken tar)
//     uppdaterar sin Social Goal och sin Heart Me — siffran, procenten och nivån — och ingen annan
//     widget, och ett render() efteråt ritar livevärdet,
//   * Mål och Startvärde i Social Goal går fortfarande till servern (VyraGoals.patchTarget/patchBaseline);
//     utan server visas "Kunde inte spara målet" och fältet återställs,
//   * en riktig gåva (vyra-live-event, gift-event-images.js) räknar upp alla kampanjer med gåvan, i state
//     och i motorn (gift-campaign-aura-engine.js),
//   * en riktig ram eller gåva MITT I ett test når den riktiga widgeten men inte klonen,
//   * det som bara syns i tiden (panel-krav undantar det): Heart Me:s firande vid uppnått mål, kampanjens
//     Entré från, Rörelse och Ljud vid gåva med Volym, och Visa återstående som följer livevärdet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

// lv-a och lv-b: två följarmål (liggande och cirkel), lv-c: Heart Me. lv-a vald.
const MAL = { 'lv-a': 'catalog:socialgoal:followers:crown-rail:landscape', 'lv-b': 'catalog:socialgoal:followers:crown-orbit:circle',
  'lv-c': 'catalog:heartgoal:classic' };
// lv-d och lv-e: två kampanjer. lv-d vald.
const KAMPANJ = { 'lv-d': 'catalog:giftcampaign:gold:landscape', 'lv-e': 'catalog:giftcampaign:emerald:portrait' };

async function oppna(fel, nycklar, vald, snapshot) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  if (snapshot) {
    // Målens snapshot för OBS-länkens token (goal-client.js loadSnapshot), som servern hade gett.
    await page.route('**/api/overlay-access/**', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ goals: snapshot }) }));
  }
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraGoals
    && !!window.VyraGoalMotion && !!window.VyraCampaignAuraEngine, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([nycklar, vald]) => {
    state.widgets.length = 0;
    Object.entries(nycklar).forEach(([id, n], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 10 + (i % 2) * 220; w.y = 40 + Math.floor(i / 2) * 380;
      state.widgets.push(w);
    });
    selected = vald;
    save();
    render();
  }, [nycklar, vald]);
  await page.waitForTimeout(1500);
  return page;
}

const ram = (id, value, target, revision) => ({ widgetId: id, metric: 'followers', value, target, epoch: 1, at: 1, revision: String(revision), baseline: 0, progress: value });

// Kopplar målruntimen till en egen ström (samma som overlay-access.js lämnar över) och returnerar
// en funktion som skickar en SSE-ram.
async function koppla(page) {
  await page.evaluate(async () => {
    const kalla = new EventTarget();
    window.__malKalla = kalla;
    await window.VyraGoals.attachSource(kalla, { scope: { mode: 'token', token: 'prov' } });
  });
  await page.waitForTimeout(200);
  return (frame) => page.evaluate(f => { window.__malKalla.dispatchEvent(new MessageEvent('goal', { data: JSON.stringify(f) })); }, frame)
    .then(() => page.waitForTimeout(250));
}

const malLage = (page, id) => page.evaluate(id => {
  const n = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const t = sel => ((n && n.querySelector(sel)) || {}).textContent || null;
  return n ? { varde: (t('[data-goal-value]') || '').replace(/\s/g, ' '), mal: (t('[data-goal-target]') || '').replace(/\s/g, ' '), procent: t('[data-goal-pct]'),
    kvar: (t('[data-goal-remaining]') || '').replace(/\s/g, ' ') || null, fyllning: n.style.getPropertyValue('--goal-fill').trim(), klass: n.className } : null;
}, id);
const klonVarde = page => page.evaluate(() => { const k = document.querySelector('.canvas [data-testspel-klon]'); return k ? ((k.querySelector('[data-goal-value]') || {}).textContent || '').replace(/\s/g, ' ') : null; });

test('Social Goal och Heart Me: en riktig målram uppdaterar sin widget, och bara den', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, MAL, 'lv-a', [ram('lv-a', 250, 1000, 1)]);
  try {
    const skicka = await koppla(page);
    const b0 = await malLage(page, 'lv-b'), c0 = await malLage(page, 'lv-c');
    assert.deepEqual((({ varde, procent, fyllning }) => ({ varde, procent, fyllning }))(await malLage(page, 'lv-a')),
      { varde: '250', procent: '25%', fyllning: '25%' }, 'snapshotet ritas i A (procenten utan KLART, som renderaren)');

    await skicka(ram('lv-a', 640, 1000, 2));
    const a = await malLage(page, 'lv-a');
    assert.deepEqual([a.varde, a.mal, a.procent, a.fyllning], ['640', '1 000', '64%', '64%'], 'SSE-ramen uppdaterar A');
    assert.deepEqual(await malLage(page, 'lv-b'), b0, 'grannmålet B rördes inte');
    assert.deepEqual(await malLage(page, 'lv-c'), c0, 'Heart Me rördes inte');
    assert.equal(await page.evaluate(() => liveWidget('lv-a').goalCurrent), 0, 'livevärdet skrivs inte i widgeten');

    // Ett render() ritar livevärdet (renderaren läser runtimen för riktiga widgetar), och Visa
    // återstående följer med nästa ram.
    await page.evaluate(() => { liveWidget('lv-a').goalShowRemaining = true; render(); });
    await page.waitForTimeout(400);
    assert.deepEqual([(await malLage(page, 'lv-a')).varde, (await malLage(page, 'lv-a')).kvar], ['640', '360 kvar'], 'render() ritar livevärdet och återstående');
    await skicka(ram('lv-a', 900, 1000, 3));
    assert.equal((await malLage(page, 'lv-a')).kvar, '100 kvar', 'återstående följer ramen');

    // Heart Me: målet nått med firandet påslaget.
    await page.evaluate(() => { liveWidget('lv-c').heartFirande = true; save(); render(); });
    await page.waitForTimeout(400);
    await skicka(Object.assign(ram('lv-c', 50, 50, 1), { metric: 'likes' }));
    const c = await malLage(page, 'lv-c');
    assert.deepEqual([c.varde, c.mal, c.procent], ['50', '50', '100% KLART'], 'ramen uppdaterar Heart Me');
    assert.match(c.klass, /\bgoal-uppnatt\b/, 'uppnått mål märks av livepatchen');
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="lv-c"] .heart-fill-wrap')).animationName);
    assert.equal(anim, 'heartGoalFirande', 'firandet spelar när målet nås live');
    assert.equal((await malLage(page, 'lv-a')).varde, '900', 'Heart Me-ramen rörde inte följarmålet');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Social Goal: en riktig ram mitt i ett test når den riktiga widgeten, inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, MAL, 'lv-a', [ram('lv-a', 250, 1000, 1)]);
  try {
    const skicka = await koppla(page);
    await page.click('#pr-testspel');
    await page.waitForTimeout(2300);                       // klonen står på 60 %
    assert.equal(await klonVarde(page), '600');
    await skicka(ram('lv-a', 420, 1000, 2));
    assert.equal((await malLage(page, 'lv-a')).varde, '420', 'den riktiga (dolda) widgeten fick ramen');
    assert.equal(await klonVarde(page), '600', 'klonen står kvar på testets värde');
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.senaste.brott, [], 'en riktig ram under testet är inget brott');
    assert.equal((await malLage(page, 'lv-a')).varde, '420', 'efter ■ visar widgeten livevärdet');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Social Goal: Mål och Startvärde går till servern och återställs utan den', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, MAL, 'lv-a');
  try {
    await page.evaluate(() => {
      window.__patch = [];
      for (const m of ['patchTarget', 'patchBaseline']) {
        const orig = window.VyraGoals[m];
        window.VyraGoals[m] = function (id, v) { window.__patch.push([m, id, v]); return orig.apply(this, arguments); };
      }
      window.__toast = [];
      const t = window.toast;
      window.toast = function (m) { window.__toast.push(String(m)); return typeof t === 'function' ? t.apply(this, arguments) : undefined; };
    });
    for (const [id, v] of [['#pfGoalTarget', '2000'], ['#pfGoalCurrent', '75']]) {
      await page.evaluate(([id, v]) => {
        const el = document.querySelector('.properties ' + id);
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, [id, v]);
      await page.waitForTimeout(300);
    }
    const lage = await page.evaluate(() => ({ patch: window.__patch, toast: window.__toast,
      mal: document.querySelector('.properties #pfGoalTarget').value, start: document.querySelector('.properties #pfGoalCurrent').value,
      w: [liveWidget('lv-a').goalTarget, liveWidget('lv-a').goalCurrent] }));
    assert.deepEqual(lage.patch, [['patchTarget', 'lv-a', 2000], ['patchBaseline', 'lv-a', 75]], 'båda går till målruntimen');
    assert.deepEqual([lage.mal, lage.start], ['1000', '0'], 'utan server återställs fälten');
    assert.ok(lage.toast.filter(t => t === 'Kunde inte spara målet').length === 2, 'toasten säger det, med å');
    assert.deepEqual(lage.w, [1000, 0], 'widgeten rördes inte');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

const kampanjLage = page => page.evaluate(() => ['lv-d', 'lv-e'].map(id => {
  const n = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const i = n && window.VyraCampaignAuraEngine.inspect(n);
  return { state: liveWidget(id).giftCurrent0, motor: i ? i.values[0] : null };
}));
const gava = (page, namn, antal) => page.evaluate(([namn, antal]) => window.dispatchEvent(new CustomEvent('vyra-live-event',
  { detail: { type: 'gift', giftName: namn, count: antal, username: 'Prov' } })), [namn, antal]).then(() => page.waitForTimeout(300));

test('Gift Campaign: en riktig gåva räknar upp alla kampanjer med gåvan, men aldrig klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, KAMPANJ, 'lv-d');
  try {
    const fore = await kampanjLage(page);
    assert.ok(fore.every(x => x.motor !== null), 'motorn är monterad på båda');
    await gava(page, 'Rose', 3);
    const efter = await kampanjLage(page);
    assert.deepEqual(efter.map(x => x.state), fore.map(x => (x.state || 0) + 3), 'Rose räknas i båda, i state');
    assert.deepEqual(efter.map(x => x.motor), efter.map(x => x.state), 'och i motorn');

    // Mitt i ett test: den riktiga räknaren går upp, klonens står kvar på testets värden.
    await page.click('#pr-testspel');
    await page.waitForTimeout(1500);
    const klon = () => page.evaluate(() => { const k = document.querySelector('.canvas [data-testspel-klon]'); return k ? window.VyraCampaignAuraEngine.inspect(k).values[0] : null; });
    const k0 = await klon();
    await gava(page, 'Rose', 2);
    const mitt = await kampanjLage(page);
    assert.deepEqual(mitt.map(x => x.state), efter.map(x => x.state + 2), 'gåvan under testet når de riktiga kampanjerna');
    assert.equal(await klon(), k0, 'klonen tog inte emot den riktiga gåvan');
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    assert.deepEqual((await page.evaluate(() => window.VyraTestspel.status())).senaste.brott, []);
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Gift Campaign: Entré från, Rörelse och Ljud vid gåva med Volym verkar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, KAMPANJ, 'lv-d');
  try {
    // Entré från: rubriken glider in från vänster (−1, standard) eller höger (1).
    const sida = async riktning => {
      await page.evaluate(r => { liveWidget('lv-d').campaignDirection = r; render(); }, riktning);
      await page.waitForTimeout(120);
      return page.evaluate(() => {
        const m = /translateX\((-?[\d.]+)px\)/.exec(document.querySelector('.canvas [data-id="lv-d"] .event-heading').style.transform || '');
        return m ? Math.sign(Number(m[1])) : 0;
      });
    };
    assert.equal(await sida(-1), -1, 'entrén kommer från vänster');
    assert.equal(await sida(1), 1, 'entrén kommer från höger');

    // Rörelse: Mjukt lyft rör gåvan hela tiden, Stilla gåvor står still.
    const rorelse = async motion => {
      await page.evaluate(m => { liveWidget('lv-d').campaignMotion = m; render(); }, motion);
      await page.waitForTimeout(1600);
      const a = await page.evaluate(() => document.querySelector('.canvas [data-id="lv-d"] .gift .frame img').style.transform);
      await page.waitForTimeout(500);
      const b = await page.evaluate(() => document.querySelector('.canvas [data-id="lv-d"] .gift .frame img').style.transform);
      return a !== b;
    };
    assert.equal(await rorelse('lift'), true, 'Mjukt lyft rör gåvorna');
    assert.equal(await rorelse('still'), false, 'Stilla gåvor står still');

    // Ljud vid gåva: tre toner per gåva, med panelens volym (×0,13 i motorn). Av = inget ljud.
    await page.evaluate(() => {
      const r = window.__ljud = { skapad: 0, toner: 0, volym: [] };
      window.AudioContext = class {
        constructor() { r.skapad++; this.currentTime = 0; this.destination = {}; }
        resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
        createOscillator() { r.toner++; return { frequency: {}, connect() {}, disconnect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(v) { r.volym.push(Math.round(v * 1000) / 1000); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      };
    });
    await gava(page, 'Rose', 1);
    assert.deepEqual(await page.evaluate(() => window.__ljud), { skapad: 0, toner: 0, volym: [] }, 'utan Ljud vid gåva hörs ingenting');
    await page.evaluate(() => { const w = liveWidget('lv-d'); w.campaignSound = true; w.campaignVolume = 50; save(); render(); });
    await page.waitForTimeout(800);
    assert.ok(await page.$('.properties [data-panelram-sektion="6"] #campaignVolume'), 'Volym visas när ljudet är på');
    await gava(page, 'Rose', 1);
    const ljud = await page.evaluate(() => window.__ljud);
    assert.equal(ljud.toner, 3, 'en gåva ger tre toner');
    assert.deepEqual([...new Set(ljud.volym)], [0.065], 'volymen 50 % (×0,13)');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
