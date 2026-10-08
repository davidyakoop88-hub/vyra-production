'use strict';
// Radavståndet i Top Like-listan med profilram får inte växa för varje placeringspass — skrivet
// RÖTT FÖRST (2026-09-08), mot Davids skärmbild: tre rader med amethyst-oracle och ett gap mellan
// dem nästan lika stort som raden själv.
//
// UPPMÄTT FÖRE, like-clean + amethyst-oracle (foto 58 px, konst 119,7 px):
//   konsten sticker ut 40,8 px över raden och 11,0 px under — men raden fick margin-top 81,5 och
//   margin-bottom 21,9, exakt DUBBELT, och varje extra anrop av vyraPlaceraTopLikeRamar lade på
//   ytterligare 40,8 + 11,0. Radavståndet blev 177,5 px i stället för 125,7, och 229 / 281 / 333
//   efter ett, två, tre pass till.
//
// ORSAKEN: steg 2 i vyraPlaceraTopLikeRamar (media.js) ADDERADE utsticket till radens befintliga
// marginal. Konstens läge i raden beror inte på radens marginal, så varje pass mäter samma utstick
// och adderar det igen — och passet körs minst två gånger per render: en gång från render() och en
// gång från ResizeObserverns första anrop vid observe().
//
// KONTRAKTET: marginalen SÄTTS till utsticket. Grannramarna ska stå listans gap (6 px) från
// varandra, konst mot konst, oavsett hur många pass som körts.
//
// VARFÖR RIKTIG WEBBLÄSARE: pixelmått av getBoundingClientRect efter async-injicerade ramfiler.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Samma rigg som ram-ror-inte-bildmatt: editorn direkt, 2500 ms för de injicerade ramfilerna,
// animationer av så att måtten är vilolägen.
async function editorMedToplike(tema, ram) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([tema, ram]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:toplike:' + tema);
    w.x = 100; w.y = 60; w.likeCount = 3; w.profileFrame = ram;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, [tema, ram]);
  // Både render() och observerns första anrop ska ha hunnit köra — det är just dubbelkörningen provet mäter.
  await page.waitForTimeout(1500);
  return page;
}

// Konstens och radernas rutor, i skärm-px.
const mat = page => page.evaluate(() => {
  const px = el => el.getBoundingClientRect();
  return [...document.querySelectorAll('.canvas .widget.vyra-toplike .toplike-row')].map(rad => {
    const art = rad.querySelector('img.tl-frame-art, img.rk6-profilram');
    const r = px(rad), a = art ? px(art) : null;
    return { top: r.top, bottom: r.bottom, art: a && { top: a.top, bottom: a.bottom, height: a.height } };
  });
});


// SEDAN 2026-09-24 ritas varje Top Like i en av de sex ranking-sixpack-designerna (de gamla
// layouterna like-clean/center/right/... är pensionerade, se docs/ranking-gallringen.md). En vald
// profilram ersätter designens egen ram (ranking-sixpack.js profilram), och avataren får en marginal
// lika stor som ramens utstick. Kontraktet från 2026-09-08 gäller fortfarande, mätt på de nya:
// grannramarna möts inte i listorna, och namn och värde ligger aldrig på ramkonsten.
const LISTOR = ['voltage', 'basic-v2', 'prism-vertical'];
const RADER = ['prism-horizontal', 'celestial', 'royal-rose'];

for (const design of LISTOR) {
  test(`${design} + amethyst-oracle: grannramarna i listan går inte in i varandra`, { skip }, async () => {
    const page = await editorMedToplike(design, 'amethyst-oracle');
    const rader = await mat(page);
    assert.equal(rader.length, 3, 'tre rader');
    assert.ok(rader.every(r => r.art), 'varje rad har ramkonst');
    for (let i = 1; i < rader.length; i++) {
      const luft = rader[i].art.top - rader[i - 1].art.bottom;
      assert.ok(luft >= -0.5, `${design} rad ${i}→${i + 1}: ramarna går ${(-luft).toFixed(1)} px in i varandra`);
    }
    await page.close();
  });
}

test('voltage + amethyst-oracle: tre extra placeringspass flyttar inte en enda rad', { skip }, async () => {
  const page = await editorMedToplike('voltage', 'amethyst-oracle');
  const fore = await mat(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => vyraPlaceraTopLikeRamar(false));
    await page.waitForTimeout(100);
  }
  const efter = await mat(page);
  fore.forEach((r, i) => {
    assert.ok(Math.abs(efter[i].top - r.top) <= 0.5,
      `rad ${i + 1} flyttade ${(efter[i].top - r.top).toFixed(1)} px efter tre extra pass`);
  });
  await page.close();
});

// ---- Davids andra krav 2026-09-08: "namn och nr ska inte vara klistrade på listan". Kontraktet, mätt
// på de sex nya designerna med amethyst-oracle: namn och värde skär inte ramkonsten, och ingen text
// från en rad går in i en annan rads text.
const matRader = page => page.evaluate(() => {
  const px = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const kors = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  return [...document.querySelectorAll('.canvas .widget.vyra-toplike .toplike-row')].map(rad => {
    const art = rad.querySelector('img.rk6-profilram');
    const a = art && px(art);
    const delar = {};
    for (const [namn, el] of [['namn', rad.querySelector('.rk6-namn strong')], ['värde', rad.querySelector(':scope>em')]]) {
      if (!el) continue;
      const r = px(el); if (!r.width || !r.height) continue;
      delar[namn] = { ...r, text: (el.textContent || '').trim().slice(0, 12), skarArt: !!a && kors(r, a) };
    }
    return { art: a, delar };
  });
});

for (const design of [...LISTOR, ...RADER]) {
  test(`${design} + amethyst-oracle: namn och värde skär inte ramen, och ingen rads text går in i en annans`, { skip }, async () => {
    const page = await editorMedToplike(design, 'amethyst-oracle');
    const rader = await matRader(page);
    assert.equal(rader.length, 3, 'tre rader');
    rader.forEach((rad, i) => {
      assert.ok(rad.art, `${design} rad ${i + 1} har ramkonst`);
      for (const [namn, d] of Object.entries(rad.delar)) {
        assert.ok(!d.skarArt, `${design} rad ${i + 1}: ${namn} "${d.text}" ligger på ramkonsten`);
      }
    });
    const kors = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const texter = rader.flatMap((r, i) => Object.entries(r.delar).map(([n, d]) => [n, d, i + 1]));
    for (let a = 0; a < texter.length; a++) for (let b = a + 1; b < texter.length; b++) {
      if (texter[a][2] === texter[b][2]) continue;
      assert.ok(!kors(texter[a][1], texter[b][1]), `${design}: ${texter[a][0]} på rad ${texter[a][2]} går in i ${texter[b][0]} på rad ${texter[b][2]}`);
    }
    await page.close();
  });
}

// ---- Bågpodiet (like-center), Davids referensbild 2026-09-08: fem platser i en båge, ettan högst
// och i mitten, tvåan/trean ett steg ned åt var sida, fyran/femman ytterst och lägst. Ramarna FÅR
// överlappa där (ettan överst), men namn och värde från olika platser får aldrig gå in i varandra —
// varken med eller utan ram — och placeringen ska stå stilla över extra pass.
async function podium(page) {
  return page.evaluate(() => {
    const px = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2 }; };
    const w = document.querySelector('.canvas .widget.vyra-toplike');
    const wb = px(w);
    return [...w.querySelectorAll('.toplike-row')].map(rad => {
      const foto = rad.querySelector('img:not(.pro-frame-art)'), s = rad.querySelector('span:not(.pro-avatar-frame)'), e = rad.querySelector('em');
      const synlig = getComputedStyle(rad).display !== 'none';
      return { synlig, foto: foto && px(foto), namn: s && px(s), varde: e && px(e), widget: wb };
    });
  });
}
const kors = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

// ---- "Siffror matchar ramarna" (David 2026-09-08): med en ram vald tar rangbrickan ramens accent,
// mätt ur PNG:n (window.vyraFrameAccent). Utan ram: designens egen färg per placering.
async function brickfarger(page) {
  return page.evaluate(() => {
    const w = document.querySelector('.canvas .widget.vyra-toplike');
    const acc = getComputedStyle(w).getPropertyValue('--ram-accent').trim();
    const rgb = v => { const t = document.createElement('i'); t.style.color = v; document.body.append(t); const c = getComputedStyle(t).color; t.remove(); return c; };
    const brickor = [...w.querySelectorAll('.toplike-row .rk6-rang')].map(b => getComputedStyle(b).backgroundColor);
    return { egenRam: w.classList.contains('rk6-egen-ram'), accRgb: acc ? rgb(acc) : null, brickor };
  });
}
test('voltage: med ruby-velvet tar alla brickor ramens accent, utan ram har de designens färg per placering', { skip }, async () => {
  const utan = await editorMedToplike('voltage', 'none');
  const f0 = await brickfarger(utan);
  await utan.close();
  const med = await editorMedToplike('voltage', 'ruby-velvet');
  const f1 = await brickfarger(med);
  await med.close();
  assert.ok(!f0.egenRam && !f0.accRgb, 'utan ram: ingen ramaccent på roten');
  assert.equal(new Set(f0.brickor).size, 3, `utan ram: tre placeringar, tre färger (${f0.brickor.join(' / ')})`);
  assert.ok(f1.egenRam && f1.accRgb, 'med ram: rk6-egen-ram och --ram-accent på roten');
  assert.deepEqual(f1.brickor, [f1.accRgb, f1.accRgb, f1.accRgb], 'varje bricka har ramens accent');
  // ruby-velvet är röd: accenten ska ligga i det röda hörnet, inte på guldkanten (mätfällan 253° före).
  const [r, g, b] = f1.accRgb.match(/\d+/g).map(Number);
  assert.ok(r > g + 60 && r > b + 60, `ruby-velvets accent ${f1.accRgb} är inte röd`);
});

// ---- Dukens gräns (riktig OBS 32.2.1, 2026-09-08): overlayn ritas i layoutens egna pixlar (432x768 för
// Mobil) och skalas inte till källan. Amethyst-oracle gav en gång 512 px på en 432 px bred duk. Podiet
// (Prism horisontal, fem platser i sidled) är den bredaste designen. Kontraktet: vid x=0 ryms hela
// scenen och de fem porträtten på duken, och en vald ram gör den inte bredare — ramarna får luft bara
// uppåt och nedåt (ranking-sixpack.css), så de får mötas i sidled, som i referensen.
async function podietsBredd(ram) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await page.waitForTimeout(400);
    await page.evaluate(ram => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:toplike:prism-horizontal');
      w.x = 0; w.y = 60; w.likeCount = 5; if (ram !== 'none') w.profileFrame = ram;
      state.widgets.push(w); selected = w.id; render();
    }, ram);
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      const px = el => el.getBoundingClientRect();
      const duk = px(document.querySelector('.canvas')), w = document.querySelector('.canvas .widget.vyra-toplike'), wb = px(w);
      const fotos = [...w.querySelectorAll('.toplike-row')].filter(r => getComputedStyle(r).display !== 'none').map(r => px(r.querySelector('img:not(.pro-frame-art)')));
      return { duk: { left: duk.left, right: duk.right, width: duk.width }, widget: { left: wb.left, right: wb.right, width: wb.width },
        fotoMin: Math.min(...fotos.map(f => f.left)), fotoMax: Math.max(...fotos.map(f => f.right)) };
    });
  } finally { await page.close(); }
}
test('podiet ryms på dukens 432 px, och en profilram gör det inte bredare', { skip }, async () => {
  const utan = await podietsBredd('none');
  assert.ok(Math.abs(utan.duk.width - 432) <= 1, `duken är ${utan.duk.width.toFixed(0)} px, riggen förväntar 432`);
  for (const ram of ['none', 'amethyst-oracle', 'ice-crystal']) {
    const m = ram === 'none' ? utan : await podietsBredd(ram);
    assert.ok(m.widget.left >= m.duk.left - 0.5 && m.widget.right <= m.duk.right + 0.5,
      `${ram}: widgeten ${m.widget.left.toFixed(0)}–${m.widget.right.toFixed(0)} ligger utanför duken ${m.duk.left.toFixed(0)}–${m.duk.right.toFixed(0)} (bredd ${m.widget.width.toFixed(0)})`);
    assert.ok(m.fotoMin >= m.duk.left && m.fotoMax <= m.duk.right, `${ram}: ett porträtt ligger utanför duken`);
    assert.ok(Math.abs(m.widget.width - utan.widget.width) <= 0.5, `${ram}: ramen gjorde podiet ${(m.widget.width - utan.widget.width).toFixed(1)} px bredare`);
  }
});

// ---- Cykelbytet som koreografi (Davids video IMG_1300.MOV, 2026-09-08): listan tonar ut från mitten och
// utåt, står tom en stund, nästa lista tonar in. Klasserna .tl-byt och .tl-in på roten bär faserna;
// rubriken får bara byta text INUTI ett byte. Och varje rankingwidget tonar in en gång vid första rendern.
test('cykelbytet: uttoning (.tl-byt) före bytet, intoning (.tl-in) efter, rubriken byter bara inuti bytet', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:toplike:center');
    w.x = 100; w.y = 60; w.likeCount = 5;
    w.rankingCycle = true; w.cycleLikes = true; w.cycleCoins = true; w.cyclePoints = false; w.cycleSeconds = 2;
    state.widgets.push(w); selected = w.id; render();
  });
  // Entrén: roten bär .tl-in efter första rendern, och den försvinner igen. POLLA, inte fasta väntetider:
  // DOM:en byts asynkront efter render() (bind-kedjan), och på CI:s långsamma runner kom den ombyggda
  // noden — och därmed entrén — senare än 0,7 s, så en fast 2 s-gräns föll där (main 2026-09-08) fast
  // beteendet var rätt. Och när ett prov kastar mitt i lämnas sidan öppen och sviten hänger (40 min),
  // därför try/finally runt sidan.
  try {
  const harKlass = () => page.evaluate(() => !!document.querySelector('.canvas .widget.vyra-toplike')?.classList.contains('tl-in'));
  await page.waitForFunction(() => !!document.querySelector('.canvas .widget.vyra-toplike')?.classList.contains('tl-in'), null, { timeout: 4000, polling: 50 })
    .catch(() => { throw new assert.AssertionError({ message: 'första rendern startar intoningen (.tl-in) — sågs inte inom 4 s' }); });
  await page.waitForFunction(() => !document.querySelector('.canvas .widget.vyra-toplike')?.classList.contains('tl-in'), null, { timeout: 4000, polling: 50 })
    .catch(() => { throw new assert.AssertionError({ message: 'intoningen är inte avslutad inom 4 s efter att den börjat' }); });
  assert.ok(!(await harKlass()), 'intoningen är avslutad');
  // Följ klasser och rubrik i 50 ms-steg över tre cykelsteg.
  const logg = await page.evaluate(async () => {
    const box = document.querySelector('.canvas .widget.vyra-toplike'), ut = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 6500) {
      ut.push({ t: Math.round(performance.now() - t0), byt: box.classList.contains('tl-byt'), in_: box.classList.contains('tl-in'), rubrik: box.querySelector(':scope>h3').textContent });
      await new Promise(r => setTimeout(r, 50));
    }
    return ut;
  });
  const rubriker = [...new Set(logg.map(l => l.rubrik))];
  assert.ok(rubriker.length >= 2, `rubriken bytte aldrig under 6,5 s med 2 s-steg: ${rubriker.join(' / ')}`);
  assert.ok(logg.some(l => l.byt), 'uttoningsfasen (.tl-byt) sågs aldrig');
  assert.ok(logg.some(l => l.in_), 'intoningsfasen (.tl-in) sågs aldrig');
  // Varje rubrikbyte sker medan .tl-in (bytet är just gjort) eller .tl-byt är på — aldrig som ett hugg.
  for (let i = 1; i < logg.length; i++) {
    if (logg[i].rubrik !== logg[i - 1].rubrik) {
      assert.ok(logg[i].in_ || logg[i].byt, `rubriken bytte som ett hugg vid ${logg[i].t} ms utan pågående byte`);
    }
  }
  // Uttoningen kommer före intoningen i samma byte. Mät från en STIGANDE flank: stegen är klockstyrda,
  // så ett byte kan redan pågå när loggen börjar, och en fas som fångas mitt i mäter för kort (116 ms).
  const forstaByt = logg.findIndex((l, i) => i > 0 && l.byt && !logg[i - 1].byt), forstaIn = logg.findIndex((l, i) => i > forstaByt && l.in_);
  assert.ok(forstaByt >= 0 && forstaIn > forstaByt, 'uttoning ska föregå intoning');
  // Uttoningen varar ungefär TL_BYT_MS + TL_GAP_MS (900 + 300): mellan 1,0 och 1,5 s.
  const bytSlut = logg.findIndex((l, i) => i > forstaByt && !l.byt);
  const bytLangd = logg[bytSlut].t - logg[forstaByt].t;
  assert.ok(bytLangd >= 1000 && bytLangd <= 1500, `uttoning + gap tog ${bytLangd} ms, förväntat 1200 ± 250`);
  } finally { await page.close(); }
});

// ---- Podiet (Prism horisontal, som Mini Podium pensionerades till): ettan i mitten och störst,
// tvåan/trean bredvid, fyran/femman ytterst; namn och värde från olika platser går aldrig in i varandra,
// med eller utan ram, och placeringen står stilla över extra pass.
for (const ram of ['none', 'amethyst-oracle']) {
  test(`podiet ${ram === 'none' ? 'utan ram' : '+ amethyst-oracle'}: ettan i mitten, fyran/femman ytterst, inga namn eller värden i varandra, stabilt över pass`, { skip }, async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await page.waitForTimeout(400);
    await page.evaluate(ram => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:toplike:prism-horizontal');
      w.x = 20; w.y = 60; w.likeCount = 5;
      if (ram !== 'none') w.profileFrame = ram;
      state.widgets.push(w); selected = w.id; render();
    }, ram);
    await page.waitForTimeout(1500);
    const synliga = (await podium(page)).filter(r => r.synlig);
    assert.equal(synliga.length, 5, `fem platser, inte ${synliga.length}`);
    const [p1, p2, p3, p4, p5] = synliga;
    const cx = [p4, p2, p1, p3, p5].map(p => p.foto.cx);
    assert.ok(cx.every((x, i) => i === 0 || x > cx[i - 1]), `ordningen i sidled är 4-2-1-3-5 (${cx.map(x => x.toFixed(0)).join(', ')})`);
    assert.ok(p1.foto.right - p1.foto.left > p2.foto.right - p2.foto.left + 10, 'ettan är störst');
    const texter = synliga.flatMap((r, i) => [['namn', r.namn, i + 1], ['värde', r.varde, i + 1]]).filter(t => t[1]);
    for (let a = 0; a < texter.length; a++) for (let b = a + 1; b < texter.length; b++) {
      if (texter[a][2] === texter[b][2]) continue;
      assert.ok(!kors(texter[a][1], texter[b][1]), `${texter[a][0]} på plats ${texter[a][2]} går in i ${texter[b][0]} på plats ${texter[b][2]}`);
    }
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => vyraPlaceraTopLikeRamar(false));
      await page.waitForTimeout(100);
    }
    const efter = (await podium(page)).filter(r => r.synlig);
    synliga.forEach((r, i) => {
      assert.ok(Math.abs(efter[i].foto.top - r.foto.top) <= 0.5 && Math.abs(efter[i].namn.top - r.namn.top) <= 0.5,
        `plats ${i + 1} flyttade efter tre extra pass`);
    });
    await page.close();
  });
}
