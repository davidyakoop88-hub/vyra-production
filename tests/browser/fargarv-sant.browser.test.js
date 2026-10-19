'use strict';
// ÄRV FÄRGSCHEMA GÖR DET ETIKETTEN SÄGER (panelspecifikationen 4.1).
//
// Testschemat (#123456 bakgrund, #12ab34 accent, #edcba9 text, #a1b2c3 sekundär text, Impact) sätts
// i state.brandKit. För varje modell med registerpost som erbjuder arvet kräver provet att
//   * kryssrutan "Ärv färgschema" finns i sektion 5 och listar vad som ärvs ("Ärver: …"),
//   * varje del i listan hamnar i minst en synlig nods beräknade stil när arvet slås PÅ i panelen,
//     och att ingen av dem syns när arvet är AV (före och efter),
//   * de egna kontrollerna för de delarna blir inaktiva med texten "Från färgschemat" när arvet är på.
// En modell utan arv får ingen kryssruta (provas med en modell utan registerpost).
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

const SCHEMA = { background: '#123456', highlight: '#12ab34', text: '#edcba9', secondaryText: '#a1b2c3', fontFamily: 'Impact' };
// Etikettens ord → vad som ska synas i stilen.
const SPAR = {
  'accentfärg': { rgb: 'rgb(18, 171, 52)' },
  'textfärg': { rgb: 'rgb(237, 203, 169)' },
  'andra färgen': { rgb: 'rgb(161, 178, 195)' },
  'bakgrundsfärg': { rgb: 'rgb(18, 52, 86)' },
  'typsnitt': { font: 'Impact' },
};
// egna: modellens egna kontroller för det som ärvs (data-pr-kontroll), som ska bli inaktiva.
// arver: exakt vad "Ärver: …" ska säga (spec 4.2).
const TOPGIFT = { egna: ['falt:accent', 'falt:textFont'], arver: ['accentfärg', 'textfärg', 'typsnitt'] };
const MODELLER = [
  Object.assign({ namn: 'Top Gift · Design 1 (neon)', nyckel: 'catalog:topgift:premium:neon' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 2 (royal)', nyckel: 'catalog:topgift:premium:royal' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 3 (fokus)', nyckel: 'catalog:topgift:premium:fokus' }, TOPGIFT),
  Object.assign({ namn: 'Top Gift · Design 4 (Signal Orbit)', nyckel: 'catalog:ranking:templateTopCoins:signal-orbit' }, TOPGIFT),
  // Last-X (PR 5): plattorna ärver accent, text, andra färgen och typsnitt; royal och banderollerna
  // bara typsnittet — färgerna når där bara delar som designen döljer.
  { namn: 'Last-X · card', nyckel: 'catalog:lastx:card', egna: ['falt:followColor', 'falt:textFont'],
    arver: ['accentfärg', 'textfärg', 'andra färgen', 'typsnitt'] },
  { namn: 'Last-X · royal', nyckel: 'catalog:lastx:royal', egna: ['falt:textFont'], arver: ['typsnitt'] },
  { namn: 'Last-X · crownBanner', nyckel: 'catalog:lastx:crownBanner', egna: ['falt:textFont'], arver: ['typsnitt'] },
  // Alertfamiljerna (PR 6, spec 4.2): Fan och Gifter ärvde accent och andra färgen redan; textfärgen
  // (rubrik och namn) och typsnittet är inkopplade. Follower ärver accent, text och typsnitt — den
  // andra färgen når ingenting där. Guardian erbjuder inget arv (provet längst ner).
  { namn: 'Fan Level Up · hero', nyckel: 'catalog:fanlevel:layout:hero', egna: ['falt:fanColor', 'falt:fanLight', 'falt:textFont'],
    arver: ['accentfärg', 'andra färgen', 'textfärg', 'typsnitt'] },
  { namn: 'Gifter Level Up · profile', nyckel: 'catalog:gifterlevel:profile', egna: ['falt:gifterColor', 'falt:gifterLight', 'falt:textFont'],
    arver: ['accentfärg', 'andra färgen', 'textfärg', 'typsnitt'] },
  { namn: 'Follower Spotlight · gold', nyckel: 'catalog:followeralert:gold', egna: ['falt:followColor', 'falt:textFont'],
    arver: ['accentfärg', 'textfärg', 'typsnitt'] },
  // Battle MVP (PR 7, spec 4.2): de klassiska stilarna ärvde Färg 1 och Färg 2 redan; textfärgen (rubrik
  // och namn, mvpTextfarg i media.js) och typsnittet är inkopplade. Ramar och firanden erbjuder inget
  // arv (provet längst ner).
  ...['inferno', 'samurai'].map(s => ({ namn: 'Battle MVP · ' + s, nyckel: 'catalog:battlemvp:' + s,
    egna: ['falt:mvpColor', 'falt:mvpColor2', 'falt:textFont'], arver: ['accentfärg', 'andra färgen', 'textfärg', 'typsnitt'] })),
  // Ranking (PR 8, spec 4.2): accent (ring, glöd och värde), textfärg (namn och värde) och typsnitt —
  // ranking-sixpack.js läser färgschemat, och arvet ersätter Accentfärg. En modell per typ.
  ...[['Top Like · voltage', 'catalog:toplike:voltage'], ['Top Coins · prism-horizontal', 'catalog:ranking:templateTopCoins:prism-horizontal'],
    ['Top Points · celestial', 'catalog:ranking:templateTopPoints:celestial']].map(([namn, nyckel]) => ({ namn, nyckel,
    egna: ['falt:rankingAccent', 'falt:textFont'], arver: ['accentfärg', 'textfärg', 'typsnitt'] })),
  // Målen (PR 9, spec 4.2): Heart Me ärver accent (hjärtat, glöden och pillen), text (rubrik och procent) och
  // andra färgen (talet — studio.css:169 läser nu --heart-number); typsnitt och bakgrund ärvs inte. Gift
  // Campaign ärver accent (ljuset och mätarna, gift-campaign-aura-engine.js), text (rubrik, räknare och namn)
  // och typsnitt. Social Goal erbjuder inget arv (provet längst ner).
  ...['classic', 'midnight'].map(t => ({ namn: 'Heart Me Goal · ' + t, nyckel: 'catalog:heartgoal:' + t,
    egna: ['falt:heartColor', 'falt:heartTextColor', 'falt:heartNumberColor'], arver: ['accentfärg', 'textfärg', 'andra färgen'] })),
  ...['gold:landscape', 'emerald:portrait'].map(m => ({ namn: 'Gift Campaign · ' + m, nyckel: 'catalog:giftcampaign:' + m,
    egna: ['falt:textFont'], arver: ['accentfärg', 'textfärg', 'typsnitt'] })),
  // Top Streak (PR 10, spec 4.2): Clean Flip och Design 1 ärver accenten (Accentfärg/Färg 1 — ringen, glöden och
  // streaktalet), Design 2 och 3 även andra färgen (Färg 2). approved-rankings.js och topstreak-designer.js läser
  // bk(). Stilen i Design 3 fyller Färg 1 och 2 och blir därför också inaktiv. Design 2 ritar Färg 2 bara i
  // profilringens ::before (topstreak-designer.css .tsd2.ram-farg .pw::before) och läses med pseudo.
  { namn: 'Top Streak · Clean Flip', nyckel: 'catalog:topstreak', egna: ['falt:accent'], arver: ['accentfärg'] },
  { namn: 'Top Streak · Design 1', nyckel: 'catalog:topstreak:design:1', egna: ['falt:accent'], arver: ['accentfärg'] },
  { namn: 'Top Streak · Design 2', nyckel: 'catalog:topstreak:design:2', egna: ['falt:accent', 'falt:accent2'], arver: ['accentfärg', 'andra färgen'], pseudo: true },
  { namn: 'Top Streak · Design 3', nyckel: 'catalog:topstreak:design:3', egna: ['falt:accent', 'falt:accent2', 'falt:streakStil'], arver: ['accentfärg', 'andra färgen'] },
  // Playground (PR 11, spec 4.2): Färg 1 → accentfärg, Färg 2 → andra färgen, Textfärg och Typsnitt, en modell
  // per familj. playground-widgets.js cfgOf läser bk(). Paletten och Färg 1/2 är en kontroll (falt:pg.accent).
  // I Top Streak Flip ersätter arvet Färger från modellen (falt:pg.x.mcol) — Färg 1 visas där bara med egna färger,
  // och andra färgen ärvs inte (ingen stilregel för streaken läser den).
  { namn: 'Top Gifter Podium · kodad ram', nyckel: 'catalog:pgpodium:none', egna: ['falt:pg.accent', 'falt:pg.text', 'falt:pg.font'],
    arver: ['accentfärg', 'andra färgen', 'textfärg', 'typsnitt'] },
  { namn: 'Top Streak Flip · Royal Amethyst', nyckel: 'catalog:pgstreak:royal-wings', egna: ['falt:pg.x.mcol', 'falt:pg.text', 'falt:pg.font'],
    arver: ['accentfärg', 'textfärg', 'typsnitt'] },
  { namn: 'Goal Pro · Rak bar', nyckel: 'catalog:pggoal:1', egna: ['falt:pg.accent', 'falt:pg.text', 'falt:pg.font'],
    arver: ['accentfärg', 'andra färgen', 'textfärg', 'typsnitt'] },
  // Like Fountain klassisk (PR 13, spec 4.2): Färg 1 → accentfärg och Färg 2 → andra färgen i hjärtpaletten (media.js
  // lfEgnaFarger läser bk()). Med arvet på ritas hjärtana i schemats färger oavsett palett, och paletten blir inaktiv.
  // Färg 1 och 2 är redan inaktiva utanför Egna färger (de verkar bara där), så paletten är den kontroll som provas tillbaka.
  { namn: 'Like Fountain klassisk', nyckel: 'catalog:likefountain', egna: ['falt:fountainPalette', 'falt:fountainColor', 'falt:fountainColor2'],
    arver: ['accentfärg', 'andra färgen'] },
];

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

async function oppna(nyckel, fel, extra) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([n, schema, extra]) => {
    state.brandKit = schema;
    state.widgets.length = 0;
    const w = Object.assign(window.VyraWidgets.create(n), extra || {}); w.id = 'arv'; w.x = 200; w.y = 200;
    state.widgets.push(w); selected = w.id; render();
  }, [nyckel, SCHEMA, extra || null]);
  await page.waitForTimeout(1200);
  return page;
}

// Alla färger och typsnitt i widgetens synliga noder. pseudo: läs också ::before och ::after på de synliga
// noderna (bara de som ritas, content ≠ none) — för modeller där en färg bara når ett pseudoelement
// (Top Streak · Design 2: Färg 2 är profilringens ::before).
const stilar = (page, pseudo) => page.evaluate(pseudo => {
  const rot = document.querySelector('.canvas .widget[data-id="arv"]');
  const ut = { farger: new Set(), typsnitt: new Set() };
  const farger = c => {
    const text = [c.color, c.backgroundColor, c.backgroundImage, c.borderTopColor, c.borderLeftColor, c.boxShadow, c.textShadow,
      c.filter, c.webkitTextFillColor, c.outlineColor, c.fill, c.stroke].join(' ');
    (text.match(/rgba?\([^)]*\)/g) || []).forEach(x => ut.farger.add(x.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, 'rgb($1, $2, $3)')));
  };
  for (const n of [rot, ...rot.querySelectorAll('*')]) {
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const c = getComputedStyle(n);
    if (c.visibility === 'hidden' || c.display === 'none') continue;
    farger(c);
    if (pseudo) for (const p of ['::before', '::after']) {
      const pc = getComputedStyle(n, p);
      if (pc.content && pc.content !== 'none' && pc.content !== 'normal' && pc.display !== 'none' && pc.visibility !== 'hidden') farger(pc);
    }
    if ((n.textContent || '').trim() && !n.children.length) ut.typsnitt.add(c.fontFamily);
  }
  return { farger: [...ut.farger], typsnitt: [...ut.typsnitt] };
}, !!pseudo);

function syns(st, del) {
  const s = SPAR[del];
  if (s.rgb) return st.farger.some(f => f.startsWith(s.rgb.replace(')', '')));
  return st.typsnitt.some(f => f.includes(s.font));
}

for (const m of MODELLER) {
  test(`fargarv-sant: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(m.nyckel, fel);
    try {
      await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
      const ruta = await page.evaluate(() => {
        const cb = document.querySelector('.properties [data-panelram-sektion="5"] #pr-inheritBrandKit');
        const lista = document.querySelector('.properties .pr-arv-lista');
        return { finns: !!cb, pa: cb && cb.checked, lista: lista ? lista.textContent : '' };
      });
      assert.equal(ruta.finns, true, 'Ärv färgschema finns i sektion 5');
      assert.equal(ruta.pa, false, 'arvet är av från början');
      const delar = ruta.lista.replace(/^Ärver:\s*/, '').replace(/\.$/, '').split(/,\s*|\s+och\s+/).filter(Boolean);
      assert.ok(delar.length > 0, 'listan säger vad som ärvs');
      for (const d of delar) assert.ok(SPAR[d], `okänd del i listan: ${d}`);
      assert.deepEqual(delar, m.arver, 'Ärver: … listar modellens delar');

      const av = await stilar(page, m.pseudo);
      for (const d of delar) assert.equal(syns(av, d), false, `${d} syns redan innan arvet är på — provet säger då ingenting`);

      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => liveWidget('arv').inheritBrandKit), true, 'kryssrutan sparar w.inheritBrandKit');
      const pa = await stilar(page, m.pseudo);
      for (const d of delar) assert.equal(syns(pa, d), true, `${d}: arvet är på men färgschemats värde syns inte i widgeten`);

      // De egna kontrollerna för det som ärvs är inaktiva.
      const inaktiva = await page.evaluate(egna => ({
        egna: egna.map(n => { const el = [...document.querySelectorAll(`.properties [data-pr-kontroll="${n}"] input, .properties [data-pr-kontroll="${n}"] select`)];
          return [n, el.length > 0 && el.every(i => i.disabled)]; }),
        text: [...document.querySelectorAll('.properties .pr-fran-schema')].map(n => n.textContent),
      }), m.egna);
      for (const [n, av] of inaktiva.egna) assert.equal(av, true, `${n} är inaktiv när den ärvs`);
      assert.ok(inaktiva.text.length >= m.egna.length && inaktiva.text.every(t => t === 'Från färgschemat'), 'texten Från färgschemat');

      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      const avIgen = await stilar(page, m.pseudo);
      for (const d of delar) assert.equal(syns(avIgen, d), false, `${d} ligger kvar när arvet slagits av`);
      assert.equal(await page.evaluate(n => document.querySelector(`.properties [data-pr-kontroll="${n}"] input, .properties [data-pr-kontroll="${n}"] select`).disabled, m.egna[0]), false,
        'den egna kontrollen är aktiv igen');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Guardian Emblem har en registerpost men erbjuder inget arv (spec 4.2: fast bildmotiv, ett påtvingat
// arv gav 0 px). Panelen är ramens, utan arvsruta och utan den gamla rutan, och en rad i Utseende
// säger varför.
for (const nyckel of ['catalog:guardianemblem:3', 'catalog:guardianemblem:model:sapphire']) {
  test(`fargarv-sant: Guardian Emblem (${nyckel.split(':').slice(2).join(':')}) erbjuder inget arv`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => ({
        ram: document.querySelector('.properties')?.dataset.panelram || null,
        arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
        gammal: [...document.querySelectorAll('.properties #bkInherit')].some(el => !el.closest('[data-panelram-forvaring]')),
        rad: (document.querySelector('.properties [data-panelram-sektion="5"] #prFastBild') || {}).textContent || '',
      }));
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false, rad: 'Emblemet är en fast bild; texten går att ändra.' });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Battle MVP:s ramar och firanden har registerposter men erbjuder inget arv (spec 4.2: fasta bilder —
// ett påtvingat arv gav 0–0,0004 andel px). Panelen är ramens, utan arvsruta och utan den gamla rutan,
// och en rad i Utseende säger varför. Färg 1 och Färg 2 finns inte heller.
for (const [nyckel, rad] of [
  ['catalog:battlemvp:frame:royal-ribbon', 'Ramen är en fast bild och påverkas inte av färgschemat. Poängen visas inte i ramarna.'],
  ['catalog:battlemvp:celebration:coronation', 'Motivet är en fast bild och påverkas inte av färgschemat. Poängen visas inte i firandena.'],
  ['catalog:battlemvp:celebration:lion-clash', 'Lion Clash är en fast bild utan rubrik: bara namnet och profilbilden byts.'],
  ['catalog:battlemvp:celebration:gold-ribbon', 'Guldbandet är en fast bild: färgerna och ordet MVP går inte att ändra.'],
]) {
  test(`fargarv-sant: Battle MVP (${nyckel.split(':').slice(2).join(':')}) erbjuder inget arv`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => {
        const ute = sel => [...document.querySelectorAll('.properties ' + sel)].some(el => !el.closest('[data-panelram-forvaring]'));
        return {
          ram: document.querySelector('.properties')?.dataset.panelram || null,
          arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
          gammal: ute('#bkInherit'),
          farger: ute('#mvpColor') || ute('#mvpColor2'),
          rad: (document.querySelector('.properties [data-panelram-sektion="5"] #prMvpFast') || {}).textContent || '',
        };
      });
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false, farger: false, rad });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Follower/Like/Diamond Goal har en registerpost men erbjuder inget arv (spec 4.2: modellen har inga
// färgfält — konsten är fasta bilder). Panelen är ramens, utan arvsruta.
for (const nyckel of ['catalog:socialgoal:followers:crown-orbit:circle', 'catalog:socialgoal:likes:heart-rail:landscape', 'catalog:socialgoal:diamonds:diamond-tower:portrait']) {
  test(`fargarv-sant: Social Goal (${nyckel.split(':').slice(2).join(':')}) erbjuder inget arv`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => ({
        ram: document.querySelector('.properties')?.dataset.panelram || null,
        arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
        gammal: [...document.querySelectorAll('.properties #bkInherit')].some(el => !el.closest('[data-panelram-forvaring]')),
      }));
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('fargarv-sant: en modell som inte erbjuder arvet har ingen kryssruta', { skip, timeout: 120000 }, async () => {
  const fel = [];
  // Top Gift med gåvoram har ingen registerpost (klassiska renderaren) — ramen rör inte panelen.
  const page = await oppna('catalog:topgift:premium:neon', fel, { giftFrame: 'gold' });
  try {
    assert.equal(await page.$('#pr-inheritBrandKit'), null);
  } finally {
    await page.close();
  }
});

// Gift Fireworks (PR 12, spec 4.2) ritar allt på en duk, så färgerna syns inte i någon nods beräknade stil.
// Provet läser i stället det festivalmotorn får när widgeten spelar (samma väg som livet: fwSpelaPa →
// VyraSupernova.mount → rendererFor → VyraFestival.create): Färg 1 blir accentfärgen, Färg 2 den andra färgen
// och namnets typsnitt färgschemats typsnitt. Att det också ändrar bilden mäts med fast frö i
// fyrverkeri-livevag.browser.test.js.
for (const nyckel of ['catalog:giftfireworks:festival', 'catalog:giftfireworks:supernova']) {
  test(`fargarv-sant: Gift Fireworks (${nyckel.split(':').pop()}) ärver accentfärg, andra färgen och typsnitt på duken`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel, { fwSound: false });
    try {
      await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
      const ruta = await page.evaluate(() => ({ finns: !!document.querySelector('.properties [data-panelram-sektion="5"] #pr-inheritBrandKit'),
        lista: (document.querySelector('.properties .pr-arv-lista') || {}).textContent || '' }));
      assert.deepEqual(ruta, { finns: true, lista: 'Ärver: accentfärg, andra färgen och typsnitt.' });
      const motorn = () => page.evaluate(() => {
        const orig = window.VyraFestival.create; let fangad = null;
        window.VyraFestival.create = function (inp) { fangad = inp; return orig.apply(this, arguments); };
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-2000px;top:0;width:360px';
        const w = liveWidget('arv'); box.innerHTML = wh(w); document.body.append(box);
        try { window.VyraFireworks.spelaPa(box.firstElementChild, w, { username: 'Alex', combo: 1 }); }
        finally { window.VyraFestival.create = orig; box.querySelectorAll('.fw-event').forEach(g => window.VyraSupernova.dispose(g)); window.VyraSupernova.glom(w.id); box.remove(); }
        return { primary: fangad.primary, secondary: fangad.secondary, font: fangad.nameFont };
      });
      const av = await motorn();
      assert.ok(av.primary !== '#12ab34' && av.secondary !== '#a1b2c3' && !/Impact/.test(av.font), 'inget av schemat når duken innan arvet är på: ' + JSON.stringify(av));
      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => liveWidget('arv').inheritBrandKit), true, 'kryssrutan sparar w.inheritBrandKit');
      const pa = await motorn();
      assert.deepEqual([pa.primary, pa.secondary], ['#12ab34', '#a1b2c3'], 'accentfärgen och den andra färgen når duken');
      assert.match(pa.font, /Impact/, 'typsnittet når namnet i duken');
      const inaktiva = await page.evaluate(() => ['falt:fwColor', 'falt:fwColor2', 'falt:fwFont', 'id:fwPalett'].map(n => {
        const el = [...document.querySelectorAll(`.properties [data-pr-kontroll="${n}"] input, .properties [data-pr-kontroll="${n}"] select, .properties [data-pr-kontroll="${n}"] button`)];
        return [n, el.length > 0 && el.every(i => i.disabled)];
      }));
      for (const [n, ja] of inaktiva) assert.equal(ja, true, `${n} är inaktiv när den ärvs`);
      await page.click('#pr-inheritBrandKit');
      await page.waitForTimeout(900);
      assert.deepEqual(await motorn(), av, 'egna värden igen när arvet slagits av');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Heart Fireworks och Gift Bubbles har registerposter men erbjuder inget arv (spec 4.2: inga färgreglage, och
// motorerna läser aldrig färgschemat — ett påtvingat arv gav 0 px i granskningen). Panelen är ramens, utan arvsruta.
for (const nyckel of ['catalog:heartfireworks', 'catalog:giftbubbles']) {
  test(`fargarv-sant: ${nyckel.split(':').pop()} erbjuder inget arv`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => ({
        ram: document.querySelector('.properties')?.dataset.panelram || null,
        arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
        gammal: [...document.querySelectorAll('.properties #bkInherit')].some(el => !el.closest('[data-panelram-forvaring]')),
      }));
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Like Fountain Portal (PR 13, spec 4.2) ärver bara i paletten Egna färger, som nu har Färg 1–3. Duken är tom i vila;
// förhandsbilden (inline-SVG) och duken ritas med samma färger (like-fountain-portal.js farger), så provet läser
// förhandsbildens gradienter: accentfärgen blir Färg 1 och den andra färgen Färg 2. Färg 3 ärvs inte.
test('fargarv-sant: Like Fountain Portal med Egna färger ärver accentfärg och andra färgen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:likefountain:portal:aurora', fel, { fountainPalette: 'custom' });
  try {
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
    const ruta = await page.evaluate(() => ({ finns: !!document.querySelector('.properties [data-panelram-sektion="5"] #pr-inheritBrandKit'),
      lista: (document.querySelector('.properties .pr-arv-lista') || {}).textContent || '',
      farger: [...document.querySelectorAll('.properties [data-panelram-sektion="5"] input[type=color]')].map(i => i.id) }));
    assert.deepEqual(ruta, { finns: true, lista: 'Ärver: accentfärg och andra färgen.', farger: ['pr-fountainColor', 'pr-fountainColor2', 'pr-fountainColor3'] });
    const stopp = () => page.evaluate(() => [...document.querySelectorAll('.canvas [data-id="arv"] .lfp-still stop')].map(s => String(s.getAttribute('stop-color')).toLowerCase()));
    const av = await stopp();
    assert.ok(!av.includes('#12ab34') && !av.includes('#a1b2c3'), 'inget av schemat syns innan arvet är på');
    assert.ok(av.includes('#ff3c88') && av.includes('#b94cff') && av.includes('#ff86bd'), 'Egna färger ger Färg 1–3: ' + av.join());
    await page.click('#pr-inheritBrandKit');
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => liveWidget('arv').inheritBrandKit), true, 'kryssrutan sparar w.inheritBrandKit');
    const pa = await stopp();
    assert.ok(pa.includes('#12ab34') && pa.includes('#a1b2c3'), 'accentfärgen och den andra färgen når fontänen: ' + pa.join());
    assert.ok(pa.includes('#ff86bd'), 'Färg 3 ärvs inte');
    const inaktiva = await page.evaluate(() => ['falt:fountainColor', 'falt:fountainColor2', 'falt:fountainColor3'].map(n =>
      [n, !!document.querySelector(`.properties [data-pr-kontroll="${n}"] input`)?.disabled]));
    assert.deepEqual(inaktiva, [['falt:fountainColor', true], ['falt:fountainColor2', true], ['falt:fountainColor3', false]], 'Färg 1 och 2 är inaktiva när de ärvs');
    await page.click('#pr-inheritBrandKit');
    await page.waitForTimeout(900);
    assert.deepEqual(await stopp(), av, 'egna färger igen när arvet slagits av');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// Portal med en färdig palett (spec 4.2: paletterna är fasta) och Gift Jar (fasta texturer) har registerposter men
// erbjuder inget arv. Panelen är ramens, utan arvsruta och — i Portal — utan färgväljare.
for (const nyckel of ['catalog:likefountain:portal:aurora', 'catalog:likefountain:portal:fire', 'catalog:giftjar:lion', 'catalog:giftjar:peacock']) {
  test(`fargarv-sant: ${nyckel.split(':').slice(1).join(' · ')} erbjuder inget arv`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => ({
        ram: document.querySelector('.properties')?.dataset.panelram || null,
        arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
        gammal: [...document.querySelectorAll('.properties #bkInherit')].some(el => !el.closest('[data-panelram-forvaring]')),
        farger: [...document.querySelectorAll('.properties [data-panelram-sektion] input[type=color]')].length,
      }));
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false, farger: 0 });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

// Fan Level 50 och Glove Snipe (PR 14, spec 4.2) erbjuder inget arv. Fan Level 50 har inget färgfält (kortmallarna är
// fasta bilder); Glove Snipe-paketen är videoklipp, och Handskens färg och Glöd läses inte av paketets CSS (mätt 0 px,
// vyra-glove-panel.js). Provet mäter det också här: ett påtvingat arv (inheritBrandKit med testschemat) ändrar ingen
// färg och inget typsnitt i widgeten. Panelen är ramens, utan arvsruta och utan färgväljare.
for (const nyckel of ['catalog:fanlevel50:royal', 'catalog:glovesnipe:koiPearl:pack:2', 'catalog:glovesnipe:pinkPrincess:pack:2']) {
  test(`fargarv-sant: ${nyckel.split(':').slice(1, 3).join(' · ')} erbjuder inget arv, och ett påtvingat arv syns inte`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(nyckel, fel);
    try {
      const lage = await page.evaluate(() => ({
        ram: document.querySelector('.properties')?.dataset.panelram || null,
        arv: !!document.querySelector('.properties #pr-inheritBrandKit'),
        gammal: [...document.querySelectorAll('.properties #bkInherit')].some(el => !el.closest('[data-panelram-forvaring]')),
        // Textens Skuggfärg och Konturfärg (sektion 4, Fan Level 50) är textens egna, inga modellfärger.
        farger: [...document.querySelectorAll('.properties [data-panelram-sektion] input[type=color]:not(#vtShadowColor):not(#vtOutlineColor)')].length,
      }));
      assert.deepEqual(lage, { ram: '1', arv: false, gammal: false, farger: 0 });
      const av = await stilar(page);
      await page.evaluate(() => { liveWidget('arv').inheritBrandKit = true; render(); });
      await page.waitForTimeout(900);
      const pa = await stilar(page);
      assert.deepEqual(pa.farger.sort(), av.farger.sort(), 'ett påtvingat arv ändrar ingen färg');
      assert.deepEqual(pa.typsnitt.sort(), av.typsnitt.sort(), 'ett påtvingat arv ändrar inget typsnitt');
      for (const del of Object.keys(SPAR)) assert.equal(syns(pa, del), false, `${del} ur schemat syns inte`);
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}
