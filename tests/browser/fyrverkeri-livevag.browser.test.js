'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR FYRVERKERIERNA, OCH VARJE KONTROLL GÖR NÅGOT (PR 12 i panelspecifikationen).
//
// Gift Fireworks, Heart Fireworks och Gift Bubbles har sedan PR 12 panelramens panel och ▶ Testa widget, som
// spelar familjens per-nod-funktion (fwSpelaPa, hfSpelaPa, gbSpelaPa) på en klon. Triggerna anropar samma
// per-nod-funktion för varje synlig widget. Provet kräver att
//   * en riktig gåva genom routeLiveBattleEvent tänder ALLA synliga widgetar av typen (två av varje), men inte
//     en dold, och att Gift Fireworks går genom kön som förut: ett fyrverkeri i taget, nästa när det förra nått
//     sin topp (cirka 3,2 s för en enkel gåva),
//   * en riktig gåva MITT I ett test når de riktiga widgetarna men inte klonen, och ■ rör inte det som spelar
//     live,
//   * varje kontroll som panel-krav räknar som tidsstyrd (den syns bara när något spelar) verkligen gör något.
//     Gift Fireworks duk mäts deterministiskt: samma väg som livet (fwSpelaPa → VyraSupernova.mount →
//     rendererFor) ger festivalmotorns inställningar, och motorn ritas sedan om med ett FAST FRÖ med och utan
//     ändringen — samma frö två gånger ger exakt samma bild (kontrollmätningen), en kontroll med verkan ger en
//     annan. Granskningen kunde inte avgöra Glöd, Namneffekt, Textfärg, Typsnitt och Entré med skärmbilder
//     (motorn hade en annan slumpkälla); med fröet går det. Resten mäts på det motorerna faktiskt läser:
//     gruppens stil, nivå och speltid, grindarna (Minsta gåva, anonyma), filerna, ljudet, guldskottet och
//     räknaren i Heart Fireworks, och bubblornas innehåll i Gift Bubbles,
//   * Rundning 0 går att välja (förut sparades den som 50), och Dölj namnet döljer namnet (förut skrev
//     avsändarens namn över valet),
//   * Ärv färgschema når duken: accentfärgen, den andra färgen och typsnittet för namnet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg' };

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

// widgets: [id, katalognyckel, extra]. Alla synliga utom de med extra.hidden.
async function oppna(fel, widgets, vald) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraFireworks
    && !!window.VyraHeartFireworksFx && !!window.VyraGiftBubblesFx && !!window.VyraGiftFireworks, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([lista, vald]) => {
    state.widgets.length = 0;
    lista.forEach(([id, n, extra], i) => {
      const w = Object.assign(window.VyraWidgets.create(n), extra || {});
      w.id = id; w.x = 10 + (i % 3) * 140; w.y = 40 + Math.floor(i / 3) * 320;
      state.widgets.push(w);
    });
    selected = vald;
    save();
    render();
  }, [widgets, vald]);
  await page.waitForTimeout(1200);
  return page;
}

const gava = (id, extra) => Object.assign({ id, type: 'gift', username: 'Ana', giftName: 'Rose', coins: 1, combo: 1,
  giftImage: 'assets/gifts/events/0001_Rose.png', profileImage: 'assets/images/test-profile.svg' }, extra || {});
// Fyrverkerier i en widget (riktiga noden, inte klonen).
const fwI = (page, id) => page.evaluate(id => document.querySelectorAll(`.canvas [data-id="${id}"]:not([data-testspel-klon]) .fw-event`).length, id);

test('Gift Fireworks: en riktig gåva tänder alla synliga, och kön spelar ett i taget', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['fw-a', 'catalog:giftfireworks:festival'], ['fw-b', 'catalog:giftfireworks:festival'],
    ['fw-dold', 'catalog:giftfireworks:festival', { hidden: true }]], 'fw-a');
  try {
    await page.evaluate(g => window.routeLiveBattleEvent(g), gava('live-1'));
    await page.waitForTimeout(150);
    assert.deepEqual([await fwI(page, 'fw-a'), await fwI(page, 'fw-b'), await fwI(page, 'fw-dold')], [1, 1, 0], 'båda synliga tänds, inte den dolda');
    // Två gåvor till från andra avsändare: kön håller dem tills det första fyrverkeriet nått sin topp.
    const t0 = Date.now();
    await page.evaluate(([g2, g3]) => { window.routeLiveBattleEvent(g2); window.routeLiveBattleEvent(g3); },
      [gava('live-2', { username: 'Bo' }), gava('live-3', { username: 'Cia' })]);
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => [window.VyraGiftFireworks.koLangd(), window.VyraGiftFireworks.aktiva()]), [2, 1], 'två väntar, ett spelar');
    assert.equal(await fwI(page, 'fw-a'), 1, 'fortfarande ett fyrverkeri i taget');
    await page.waitForFunction(() => window.VyraGiftFireworks.koLangd() === 1, null, { timeout: 8000, polling: 50 });
    const vantat = Date.now() - t0;
    // Festivalens enkla gåva når toppen efter 3,09 s; kön lägger 100 ms marginal.
    assert.ok(vantat > 2600 && vantat < 4600, `nästa startade efter ${vantat} ms (väntat cirka 3,2 s)`);
    assert.equal(await page.evaluate(() => window.VyraGiftFireworks.aktiva()), 1, 'fortfarande ett i taget');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Gift Fireworks: en riktig gåva mitt i ett test når de riktiga widgetarna men inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['fw-a', 'catalog:giftfireworks:royal'], ['fw-b', 'catalog:giftfireworks:royal']], 'fw-a');
  try {
    await page.click('#pr-testspel');
    await page.waitForTimeout(200);
    const fore = await page.evaluate(() => document.querySelectorAll('.canvas [data-testspel-klon] .fw-event').length);
    assert.equal(fore, 1, 'klonen spelar sitt test');
    await page.evaluate(g => window.routeLiveBattleEvent(g), gava('mitt-1'));
    await page.waitForTimeout(200);
    assert.deepEqual([await fwI(page, 'fw-a'), await fwI(page, 'fw-b')], [1, 1], 'gåvan tände båda riktiga widgetarna');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.canvas [data-testspel-klon] .fw-event').length), 1, 'klonen fick inget från gåvan');
    await page.click('#pr-testspel');
    await page.waitForTimeout(200);
    assert.deepEqual([await fwI(page, 'fw-a'), await fwI(page, 'fw-b')], [1, 1], '■ rör inte det som spelar live');
    assert.equal(await page.evaluate(() => window.VyraSupernova.active()), 2, 'de två livefyrverkerierna ritar vidare');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Heart Fireworks och Gift Bubbles: en riktig gåva tänder alla synliga av typen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['hf-a', 'catalog:heartfireworks'], ['hf-b', 'catalog:heartfireworks'], ['hf-dold', 'catalog:heartfireworks', { hidden: true }],
    ['gb-a', 'catalog:giftbubbles'], ['gb-b', 'catalog:giftbubbles'], ['gb-dold', 'catalog:giftbubbles', { hidden: true }]], 'hf-a');
  try {
    await page.evaluate(g => window.routeLiveBattleEvent(g), gava('hjarta-1', { combo: 20, coins: 20 }));
    await page.waitForTimeout(300);
    const lage = await page.evaluate(() => {
      const spelar = (id, sel, klass) => { const h = document.querySelector(`.canvas [data-id="${id}"] ${sel}`); return !!(h && h.classList.contains(klass)); };
      return { hf: ['hf-a', 'hf-b', 'hf-dold'].map(id => spelar(id, '.heart-fireworks-fx', 'hf-play')),
        gb: ['gb-a', 'gb-b', 'gb-dold'].map(id => spelar(id, '.gift-bubbles-fx', 'gb-play')),
        koer: [window.VyraHeartFireworks.aktiva(), window.VyraGiftBubbles.aktiva()] };
    });
    assert.deepEqual(lage.hf, [true, true, false], 'Heart Fireworks: båda synliga, inte den dolda');
    assert.deepEqual(lage.gb, [true, true, false], 'Gift Bubbles: båda synliga, inte den dolda');
    assert.deepEqual(lage.koer, [1, 1], 'gåvan gick genom familjernas köer');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// ---- Gift Fireworks: kontroll för kontroll ------------------------------------------------------
//
// I sidan: spela widgeten (med ändringen) genom fwSpelaPa på en egen nod, fånga festivalmotorns
// inställningar, rita dem med ett fast frö vid t = 2,0 s (solen har slagit ut, namnet står under gåvan) och
// jämför pixlarna med en ritning utan ändringen.
async function installeraMatning(page) {
  await page.evaluate(() => {
    const F = window.VyraFestival, orig = F.create;
    window.__fang = [];
    F.create = function (inp) { window.__fang.push(inp); return orig.apply(this, arguments); };
    window.__spela = (w, ev) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-2000px;top:0;width:360px';
      box.innerHTML = wh(w);
      document.body.append(box);
      const fore = window.__fang.length;
      const grupp = window.VyraFireworks.spelaPa(box.firstElementChild, w, ev);
      const inp = window.__fang[fore] || null;
      const ut = { inp: inp && JSON.parse(JSON.stringify(inp)), skala: grupp && grupp.style.scale, animation: grupp && grupp.style.animation,
        niva: grupp && grupp.dataset.fwLevel, langd: grupp ? Number(grupp.dataset.expires) - Date.now() : null };
      box.querySelectorAll('.fw-event').forEach(g => window.VyraSupernova.dispose(g));
      window.VyraSupernova.glom(w.id);
      box.remove();
      return ut;
    };
    window.__rita = async (inp, t) => {
      const r = orig(Object.assign({}, inp, { seed: 4242, variantIndex: 1 }));
      await r.ready;
      const c = document.createElement('canvas'); c.width = 480; c.height = 400;
      const ctx = c.getContext('2d');
      r.render(ctx, 480, 400, t);
      return Array.from(ctx.getImageData(0, 0, 480, 400).data);
    };
    window.__skillnad = async (a, b, t) => {
      const [x, y] = [await window.__rita(a, t), await window.__rita(b, t)];
      let n = 0;
      for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) + Math.abs(x[i + 3] - y[i + 3]) > 24) n++;
      return n;
    };
  });
}

const BAS_W = () => ({ id: 'matt', type: 'templateGiftFireworks', x: 0, y: 0, width: 360, fwTheme: 'festival', fwColor: '#ffd99a', fwColor2: '#1f6bff', fwSound: false });
const EV = { username: 'Alex', giftName: 'Rose', combo: 1, giftImage: 'assets/gifts/events/0001_Rose.png', profileImage: 'assets/images/test-profile.svg' };

// [fält, nytt värde, vad som ska skilja i motorns inställningar]
const DUKKONTROLLER = [
  ['fwGlow', 0, 'glow'],
  ['fwRadius', 0, 'radius'],
  ['fwNameFx', 'aurora', 'nameFx'],
  ['fwNameFx', 'hide', 'name'],
  ['fwTextColor', '#00ff00', 'nameColor'],
  ['fwFont', "Consolas,'Courier New',monospace", 'nameFont'],
  ['fwColor', '#ff3b3b', 'primary'],
  ['fwColor2', '#3dff8a', 'secondary'],
];

test('Gift Fireworks: duken — varje stil- och textkontroll når motorn och ändrar bilden (fast frö)', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['fw-a', 'catalog:giftfireworks:festival']], 'fw-a');
  try {
    await installeraMatning(page);
    const bas = await page.evaluate(([w, ev]) => window.__spela(w, ev), [BAS_W(), EV]);
    assert.ok(bas.inp, 'festivalmotorn skapades genom fwSpelaPa');
    assert.equal(bas.inp.name, 'Alex', 'namnet visas utan något val');
    // Kontrollmätning: samma inställningar och samma frö ger exakt samma bild — och bilden är inte tom.
    assert.equal(await page.evaluate(([a, t]) => window.__skillnad(a, a, t), [bas.inp, 2.0]), 0, 'samma frö ger samma bild');
    const tand = await page.evaluate(async ([a, t]) => (await window.__rita(a, t)).filter((v, i) => i % 4 === 3 && v > 0).length, [bas.inp, 2.0]);
    assert.ok(tand > 5000, `ritningen har innehåll (${tand} px)`);
    const utan = [];
    for (const [falt, varde, inst] of DUKKONTROLLER) {
      const ny = await page.evaluate(([w, ev]) => window.__spela(w, ev), [Object.assign(BAS_W(), { [falt]: varde }), EV]);
      if (JSON.stringify(ny.inp[inst]) === JSON.stringify(bas.inp[inst])) { utan.push(`${falt}=${varde}: motorns ${inst} ändrades inte`); continue; }
      const px = await page.evaluate(([a, b, t]) => window.__skillnad(a, b, t), [bas.inp, ny.inp, 2.0]);
      if (px < 200) utan.push(`${falt}=${varde}: bara ${px} px skillnad`);
    }
    assert.deepEqual(utan, [], 'kontroller utan verkan på duken');
    // Dölj namnet: inget namn i motorn.
    const dolj = await page.evaluate(([w, ev]) => window.__spela(w, ev), [Object.assign(BAS_W(), { fwNameFx: 'hide' }), EV]);
    assert.equal(dolj.inp.name, '', 'Dölj namnet döljer namnet');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Gift Fireworks: storlek, entré, hastighet, final, grindar, filer och ljud', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['fw-a', 'catalog:giftfireworks:festival', { fwSound: false }]], 'fw-a');
  try {
    await installeraMatning(page);
    const spela = (patch, ev) => page.evaluate(([w, ev]) => window.__spela(w, ev), [Object.assign(BAS_W(), patch), Object.assign({}, EV, ev || {})]);
    const bas = await spela({});
    assert.equal((await spela({ fwScale: 1.5 })).skala, '1.5', 'Effektstorlek skalar fyrverkeriet');
    assert.equal(bas.skala, '1', 'kontrollmätning: standardstorlek');
    assert.match((await spela({ fwEnter: 'bounce' })).animation, /fw-en-bounce/, 'Entré / utgång spelar entrén');
    assert.doesNotMatch(bas.animation, /fw-en-/, 'kontrollmätning: ingen entré utan val');
    const snabb = await spela({ fwPlaySpeed: 2.5 });
    assert.ok(Math.abs(snabb.langd - 7000 / 2.5) < 150 && Math.abs(bas.langd - 7000) < 150, `Rörelsehastighet kortar programmet (${bas.langd} → ${snabb.langd} ms)`);
    // Final vid: en gåva på 500 mynt är ett firande med standardgränsen 1000 och en final med gränsen 500.
    assert.equal((await spela({}, { coins: 500 })).niva, 'burst', 'kontrollmätning: 500 mynt med Final vid 1000');
    assert.equal((await spela({ fwFinal: 500 }, { coins: 500 })).niva, 'show', 'Final vid 500 gör samma gåva till en final');

    // Grindarna, filerna och ljudet går genom livetriggern (en widget i layouten).
    const live = (patch, gavor) => page.evaluate(([patch, gavor]) => {
      window.dispatchEvent(new Event('vyra-session-ended'));
      // Varje mätning utgår från samma läge: standardgränserna, en fil och inget ljud, plus ändringen.
      const w = liveWidget('fw-a'); Object.assign(w, { fwMin: 1, fwExcludeAnon: false, fwLanes: 1, fwSound: false }, patch);
      render();
      const ljud = [];
      const A = window.Audio;
      window.Audio = function (src) { const a = new A(src); a.play = () => Promise.resolve(); ljud.push(a); return a; };
      try {
        const svar = gavor.map(g => window.triggerGiftFireworks(g));
        return { svar, tanda: document.querySelectorAll('.canvas [data-id="fw-a"] .fw-event').length, vantar: window.VyraFireworks.pending(),
          ljud: ljud.map(a => Math.round(a.volume * 100)) };
      } finally { window.Audio = A; window.dispatchEvent(new Event('vyra-session-ended')); }
    }, [patch, gavor]);
    assert.deepEqual((await live({ fwMin: 1 }, [gava('m1', { coins: 5 })])).tanda, 1, 'kontrollmätning: 5 mynt tänder med Minsta gåva 1');
    assert.deepEqual((await live({ fwMin: 10 }, [gava('m2', { coins: 5 })])).tanda, 0, 'Minsta gåva 10 släpper inte igenom 5 mynt');
    assert.deepEqual((await live({ fwExcludeAnon: false }, [gava('a1', { isAnonymous: true })])).tanda, 1, 'kontrollmätning: en anonym gåva tänder');
    assert.deepEqual((await live({ fwExcludeAnon: true }, [gava('a2', { isAnonymous: true })])).tanda, 0, 'Exkludera anonyma stoppar den');
    const en = await live({ fwLanes: 1 }, [gava('f1'), gava('f2', { username: 'Bo' })]);
    const tva = await live({ fwLanes: 2 }, [gava('f3'), gava('f4', { username: 'Bo' })]);
    assert.deepEqual([en.tanda, en.vantar], [1, 1], 'Samtidiga fyrverkerier 1: den andra gåvan väntar');
    assert.deepEqual([tva.tanda, tva.vantar], [2, 0], 'Samtidiga fyrverkerier 2: båda spelar');
    assert.deepEqual((await live({ fwSound: true, fwVolume: 20 }, [gava('l1')])).ljud, [20], 'Ljud på med Volym 20 %');
    assert.deepEqual((await live({ fwSound: false, fwVolume: 20 }, [gava('l2')])).ljud, [], 'Ljud av: inget ljud');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Gift Fireworks: panelen — Rundning 0, paletten och Ärv färgschema når duken', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['fw-a', 'catalog:giftfireworks:festival', { fwSound: false }]], 'fw-a');
  try {
    await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
    await page.evaluate(() => document.querySelectorAll('.properties [data-panelram-sektion].collapsible').forEach(s => s.classList.add('open')));
    // Rundning 0 (förut sparades 0 som 50).
    await page.evaluate(() => { const el = document.querySelector('#fwRadius'); el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => liveWidget('fw-a').fwRadius), 0, 'Rundning 0 sparas som 0');
    assert.match(await page.evaluate(() => document.querySelector('.properties #fwRadiusVal').textContent), /^0 px$/, 'reglaget visar 0 px');

    await installeraMatning(page);
    const spela = () => page.evaluate(() => window.__spela(liveWidget('fw-a'), { username: 'Alex', combo: 1 }));
    assert.equal((await spela()).inp.radius, 0, 'motorn får rundningen 0');
    // Paletten fyller Färg 1 och 2, och motorn får dem.
    await page.evaluate(() => document.querySelectorAll('.properties [data-panelram-sektion].collapsible').forEach(s => s.classList.add('open')));
    await page.click('.properties [data-fwsw="#ff3b3b|#ff9a3d"]');
    await page.waitForTimeout(500);
    const pal = (await spela()).inp;
    assert.deepEqual([pal.primary, pal.secondary], ['#ff3b3b', '#ff9a3d'], 'paletten når motorn');

    // Ärv färgschema: accent, andra färgen och typsnittet för namnet.
    await page.evaluate(() => { state.brandKit = { background: '#123456', highlight: '#12ab34', text: '#edcba9', secondaryText: '#a1b2c3', fontFamily: 'Impact' }; render(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.properties [data-panelram-sektion].collapsible').forEach(s => s.classList.add('open')));
    assert.equal(await page.textContent('.properties .pr-arv-lista'), 'Ärver: accentfärg, andra färgen och typsnitt.');
    const fore = (await spela()).inp;
    assert.notEqual(fore.primary, '#12ab34', 'kontrollmätning: arvet är av');
    await page.click('#pr-inheritBrandKit');
    await page.waitForTimeout(600);
    const arv = (await spela()).inp;
    assert.deepEqual([arv.primary, arv.secondary, arv.nameFont], ['#12ab34', '#a1b2c3', 'Impact'], 'färgschemat når duken');
    const px = await page.evaluate(([a, b]) => window.__skillnad(a, b, 2.0), [fore, arv]);
    assert.ok(px > 200, `arvet ändrar bilden (${px} px)`);
    const inaktiva = await page.evaluate(() => ['#fwColor', '#fwColor2', '#fwFont'].map(s => document.querySelector('.properties ' + s).disabled)
      .concat([...document.querySelectorAll('.properties [data-fwsw]')].every(b => b.disabled)));
    assert.deepEqual(inaktiva, [true, true, true, true], 'Färg 1, Färg 2, Typsnitt och paletten är inaktiva när de ärvs');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// ---- Heart Fireworks och Gift Bubbles: kontroll för kontroll -----------------------------------
test('Heart Fireworks: guldskott, combo-räknare och grindar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['hf-a', 'catalog:heartfireworks']], 'hf-a');
  try {
    // Per nod, på en egen nod: direkt efter fire() är bara guldskottet i luften (hjärtana skjuts med fördröjning).
    const spela = patch => page.evaluate(patch => {
      const w = Object.assign({ id: 'matt', type: 'templateHeartFireworks', width: 320 }, patch);
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-2000px;top:0'; box.innerHTML = wh(w); document.body.append(box);
      const motor = window.hfSpelaPa(box.firstElementChild, w, { combo: 20 });
      const ut = Object.assign(motor.inspect(), { raknare: box.querySelectorAll('.hf-combo').length });
      motor.destroy(); box.remove();
      return ut;
    }, patch);
    assert.equal((await spela({ hfGold: true })).raketer, 1, 'Guldskott: guldraketen stiger direkt vid combo 20');
    assert.equal((await spela({ hfGold: false })).raketer, 0, 'utan guldskott: ingen raket direkt');
    assert.equal((await spela({ hfShowCombo: true })).raknare, 1, 'Combo-räknare visas');
    assert.equal((await spela({ hfShowCombo: false })).raknare, 0, 'Combo-räknare av');
    const live = (patch, g) => page.evaluate(([patch, g]) => {
      window.dispatchEvent(new Event('vyra-session-ended'));
      const w = liveWidget('hf-a'); Object.assign(w, { hfMin: 1, hfExcludeAnon: false }, patch); render();
      const svar = window.triggerHeartFireworks(g);
      const h = document.querySelector('.canvas [data-id="hf-a"] .heart-fireworks-fx');
      const ut = { svar, spelar: !!(h && h.classList.contains('hf-play')) };
      window.dispatchEvent(new Event('vyra-session-ended'));
      return ut;
    }, [patch, g]);
    assert.equal((await live({ hfMin: 1 }, gava('h1', { coins: 5 }))).spelar, true, 'kontrollmätning: 5 mynt med Minsta gåvovärde 1');
    assert.equal((await live({ hfMin: 10 }, gava('h2', { coins: 5 }))).spelar, false, 'Minsta gåvovärde 10 stoppar 5 mynt');
    assert.equal((await live({ hfExcludeAnon: true }, gava('h3', { isAnonymous: true }))).spelar, false, 'Exkludera anonyma stoppar en anonym gåva');
    assert.equal((await live({ hfExcludeAnon: false }, gava('h4', { isAnonymous: true }))).spelar, true, 'kontrollmätning: utan valet tänder den');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Gift Bubbles: gåva i bubblorna, hjärtbubblor, combo-räknare, reservgåva och grindar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['gb-a', 'catalog:giftbubbles']], 'gb-a');
  try {
    // Slumpen styrs i mätningen (0,1 < hjärtandelen 0,3), så att hjärtbubblorna är deterministiska.
    const spela = (patch, ev) => page.evaluate(([patch, ev]) => {
      const w = Object.assign({ id: 'matt', type: 'templateGiftBubbles', width: 320 }, patch);
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-2000px;top:0'; box.innerHTML = wh(w); document.body.append(box);
      const slump = Math.random; Math.random = () => 0.1;
      let ut;
      try {
        const motor = window.gbSpelaPa(box.firstElementChild, w, Object.assign({ combo: 10 }, ev));
        ut = { hjartan: box.querySelectorAll('.gb-heart').length, gavor: box.querySelectorAll('.gb-gift').length,
          bild: (box.querySelector('.gb-gift img') || {}).getAttribute?.('src') || null, raknare: box.querySelectorAll('.gb-combo').length };
        motor.destroy();
      } finally { Math.random = slump; box.remove(); }
      return ut;
    }, [patch, ev || {}]);
    const utanHjartan = { gbHearts: false };
    assert.ok((await spela(Object.assign({ gbGiftIn: true }, utanHjartan))).gavor > 0, 'Gåva i bubblorna');
    assert.equal((await spela(Object.assign({ gbGiftIn: false }, utanHjartan))).gavor, 0, 'utan gåva i bubblorna');
    assert.ok((await spela({ gbHearts: true })).hjartan > 0, 'Hjärtbubblor');
    assert.equal((await spela({ gbHearts: false })).hjartan, 0, 'utan hjärtbubblor');
    assert.equal((await spela({ gbShowCombo: true })).raknare, 1, 'Combo-räknare visas');
    assert.equal((await spela({ gbShowCombo: false })).raknare, 0, 'Combo-räknare av');
    // Reservgåvan används när gåvan saknar bild; en skickad gåva vinner.
    const reserv = 'assets/gifts/events/7578_Crown.png';
    assert.equal((await spela({ gbHearts: false, gbGiftImage: reserv })).bild, reserv, 'Egen reservgåva när gåvan saknar bild');
    assert.equal((await spela({ gbHearts: false, gbGiftImage: reserv }, { giftImage: 'assets/gifts/events/7460_Cap.png' })).bild,
      'assets/gifts/events/7460_Cap.png', 'den skickade gåvan vinner över reserven');
    const live = (patch, g) => page.evaluate(([patch, g]) => {
      window.dispatchEvent(new Event('vyra-session-ended'));
      const w = liveWidget('gb-a'); Object.assign(w, { gbMin: 1, gbExcludeAnon: false }, patch); render();
      window.triggerGiftBubbles(g);
      const h = document.querySelector('.canvas [data-id="gb-a"] .gift-bubbles-fx');
      const ut = !!(h && h.classList.contains('gb-play'));
      window.dispatchEvent(new Event('vyra-session-ended'));
      return ut;
    }, [patch, g]);
    assert.equal(await live({ gbMin: 1 }, gava('b1', { coins: 5 })), true, 'kontrollmätning: 5 mynt med Minsta gåvovärde 1');
    assert.equal(await live({ gbMin: 10 }, gava('b2', { coins: 5 })), false, 'Minsta gåvovärde 10 stoppar 5 mynt');
    assert.equal(await live({ gbExcludeAnon: true }, gava('b3', { isAnonymous: true })), false, 'Exkludera anonyma stoppar en anonym gåva');
    assert.equal(await live({ gbExcludeAnon: false }, gava('b4', { isAnonymous: true })), true, 'kontrollmätning: utan valet tänder den');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
