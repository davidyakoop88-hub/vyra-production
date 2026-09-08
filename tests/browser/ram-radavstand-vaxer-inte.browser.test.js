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
    const art = rad.querySelector('img.tl-frame-art');
    const r = px(rad), a = art ? px(art) : null;
    return { top: r.top, bottom: r.bottom, art: a && { top: a.top, bottom: a.bottom, height: a.height } };
  });
});

const GAP = 6; // profile-frames-premium.css: .vyra-toplike:not(.like-center)>.toplike-list{gap:6px}

test('like-clean + amethyst-oracle: grannramarna står listans gap från varandra, inte dubbla utsticket', { skip }, async () => {
  const page = await editorMedToplike('clean', 'amethyst-oracle');
  const rader = await mat(page);
  assert.equal(rader.length, 3, 'tre rader');
  assert.ok(rader.every(r => r.art), 'varje rad har ramkonst');
  for (let i = 1; i < rader.length; i++) {
    const luft = rader[i].art.top - rader[i - 1].art.bottom;
    assert.ok(Math.abs(luft - GAP) <= 1.5,
      `rad ${i}→${i + 1}: luften mellan ramarna är ${luft.toFixed(1)} px, förväntat ${GAP} ± 1,5 (konsten ${rader[i].art.height.toFixed(1)} px hög)`);
  }
  await page.close();
});

test('like-clean + amethyst-oracle: tre extra placeringspass flyttar inte en enda rad', { skip }, async () => {
  const page = await editorMedToplike('clean', 'amethyst-oracle');
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

// ---- Davids andra krav samma kväll: "namn och nr ska inte vara klistrade på listan". Uppmätt före:
// brickan 20–22 px in på vänstra vingen och namn/värde 28 px in på den högra i alla åtta listlayouter;
// i like-center låg namnet under fotot mitt i ramens nedre del (64 px). Kontraktet: ingen bricka, inget
// namn och inget värde skär ramkonsten; namn och värde skär inte varandra; och knuffen är idempotent.
const LAYOUTER = ['clean', 'list', 'right', 'row', 'studio', 'skin', 'crown', 'neon', 'center'];

const matRader = page => page.evaluate(() => {
  const px = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const kors = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  return [...document.querySelectorAll('.canvas .widget.vyra-toplike .toplike-row')].map(rad => {
    const art = rad.querySelector('img.tl-frame-art');
    const a = art && px(art);
    const delar = {};
    for (const el of rad.children) {
      if (el === art || el === art?.previousElementSibling) continue;
      const r = px(el); if (!r.width || !r.height) continue;
      delar[el.tagName.toLowerCase()] = { ...r, text: (el.textContent || '').trim().slice(0, 12), skarArt: !!a && kors(r, a) };
    }
    return { art: a, delar };
  });
});

for (const tema of LAYOUTER) {
  test(`like-${tema} + amethyst-oracle: bricka, namn och värde skär inte ramen, namn och värde skär inte varandra, och tre extra pass flyttar inget`, { skip }, async () => {
    const page = await editorMedToplike(tema, 'amethyst-oracle');
    const rader = await matRader(page);
    assert.equal(rader.length, 3, 'tre rader');
    rader.forEach((rad, i) => {
      assert.ok(rad.art, `rad ${i + 1} har ramkonst`);
      for (const [namn, d] of Object.entries(rad.delar)) {
        // Bågpodiet (center): rangbrickan sitter MED FLIT nere till vänster på ramen, som medaljen i
        // Davids referensbild. Namn och värde ska däremot ligga under ramen även där.
        if (tema === 'center' && namn === 'b') continue;
        assert.ok(!d.skarArt, `like-${tema} rad ${i + 1}: <${namn}> "${d.text}" ligger på ramkonsten`);
      }
      const s = rad.delar.span, e = rad.delar.em;
      if (s && e) {
        const kors = s.left < e.right - 0.5 && s.right > e.left + 0.5 && s.top < e.bottom - 0.5 && s.bottom > e.top + 0.5;
        assert.ok(!kors, `like-${tema} rad ${i + 1}: namnet "${s.text}" och värdet "${e.text}" ritas ovanpå varandra`);
      }
    });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => vyraPlaceraTopLikeRamar(false));
      await page.waitForTimeout(100);
    }
    const efter = await matRader(page);
    rader.forEach((rad, i) => {
      assert.ok(Math.abs(efter[i].art.top - rad.art.top) <= 0.5 && Math.abs(efter[i].art.left - rad.art.left) <= 0.5,
        `like-${tema} rad ${i + 1}: ramkonsten flyttade (${(efter[i].art.left - rad.art.left).toFixed(1)}, ${(efter[i].art.top - rad.art.top).toFixed(1)}) px efter tre extra pass`);
      for (const [namn, d] of Object.entries(rad.delar)) {
        const e2 = efter[i].delar[namn];
        assert.ok(e2 && Math.abs(e2.left - d.left) <= 0.5 && Math.abs(e2.top - d.top) <= 0.5,
          `like-${tema} rad ${i + 1}: <${namn}> flyttade efter tre extra pass`);
      }
    });
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

for (const ram of ['none', 'amethyst-oracle']) {
  test(`bågpodiet ${ram === 'none' ? 'utan ram' : '+ amethyst-oracle'}: fem platser i båge, inga namn eller värden i varandra, stabilt över pass`, { skip }, async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await page.waitForTimeout(400);
    await page.evaluate(ram => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:toplike:center');
      w.x = 100; w.y = 60; w.likeCount = 7;
      if (ram !== 'none') w.profileFrame = ram;
      state.widgets.push(w); selected = w.id; render();
    }, ram);
    await page.waitForTimeout(1500);
    const p = await podium(page);
    const synliga = p.filter(r => r.synlig);
    assert.equal(synliga.length, 5, `fem platser visas i bågen (likeCount 7 → fem), inte ${synliga.length}`);
    const [p1, p2, p3, p4, p5] = synliga;
    const mitt = p1.widget.left + (p1.widget.right - p1.widget.left) / 2;
    assert.ok(Math.abs(p1.foto.cx - mitt) <= 1.5, `ettan står i mitten (${(p1.foto.cx - mitt).toFixed(1)} px från mitten)`);
    assert.ok(p1.foto.top < p2.foto.top - 20 && p2.foto.top < p4.foto.top - 20, 'ettan högst, tvåan/trean ett steg ned, fyran/femman lägst');
    assert.ok(Math.abs((mitt - p2.foto.cx) - (p3.foto.cx - mitt)) <= 1.5, 'tvåan och trean speglade kring mitten');
    assert.ok(Math.abs((mitt - p4.foto.cx) - (p5.foto.cx - mitt)) <= 1.5, 'fyran och femman speglade kring mitten');
    assert.ok(p4.foto.cx < p2.foto.cx && p5.foto.cx > p3.foto.cx, 'fyran och femman ytterst');
    // Namn och värde: ingen text från en plats går in i någon text från en annan plats.
    const texter = synliga.flatMap((r, i) => [['namn', r.namn, i + 1], ['värde', r.varde, i + 1]]).filter(t => t[1]);
    for (let a = 0; a < texter.length; a++) for (let b = a + 1; b < texter.length; b++) {
      if (texter[a][2] === texter[b][2]) continue;
      assert.ok(!kors(texter[a][1], texter[b][1]), `${texter[a][0]} på plats ${texter[a][2]} går in i ${texter[b][0]} på plats ${texter[b][2]}`);
    }
    // Porträtten utan ram får inte gå in i varandra (med ram får RAMARNA överlappa, det är referensens form).
    if (ram === 'none') for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
      const fa = synliga[a].foto, fb = synliga[b].foto;
      assert.ok(!kors(fa, fb), `porträtt ${a + 1} (${fa.left.toFixed(1)}–${fa.right.toFixed(1)} × ${fa.top.toFixed(1)}–${fa.bottom.toFixed(1)}) och ${b + 1} (${fb.left.toFixed(1)}–${fb.right.toFixed(1)} × ${fb.top.toFixed(1)}–${fb.bottom.toFixed(1)}) går in i varandra`);
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
