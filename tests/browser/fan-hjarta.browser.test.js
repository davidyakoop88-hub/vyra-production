'use strict';
// FAN LEVEL UP · HJÄRTMODELLERNA i en riktig webbläsare (fan-hjarta.js, David 2026-11-05).
//
// Det som bara går att mäta i en riktig layoutmotor och med riktig tid — inte i jsdom, och inte
// genom att skrubba en pausad tidslinje (överlämningen: "don't use scrub alone as proof"):
//   * ETT HJÄRTA I TAGET: aldrig två synliga hjärtan i samma bildruta, under hela firandet,
//   * LANDNINGEN: introhjärtat lägger sig i märkets ruta — bytet sker på samma ställe och i samma
//     storlek, och farten har avtagit (ingen inbromsning i ett enda steg),
//   * INGEN TELEPORTERING: det synliga hjärtat flyttar sig aldrig orimligt långt mellan två prov,
//   * render() MITT I: en omritning mitt i flygningen fortsätter där den var,
//   * TIDEN: märket står vid nivåsiffran innan modellens förvalda visningstid är slut,
//   * REDUCERAD RÖRELSE: slutbilden direkt, med märket och utan introhjärta,
//   * SMAL WIDGET OCH LÅNGT NAMN: namnet ryms (krymper eller får ellips), siffran och märket står kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

const MODELLER = ['ascend', 'heartreveal', 'heartgift', 'goldenstage', 'heartlift', 'luminous'];

async function sida(opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 }, reducedMotion: opt.reducerad ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraFanHjarta
    && window.VyraFanHjarta.modeller().length === 6, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; });
  return { ctx, page, fel };
}
const lagg = (page, modell, over) => page.evaluate(([m, over]) => {
  const w = Object.assign(VyraWidgets.create('catalog:fanlevel:layout:' + m), { id: 'fhm1', x: 20, y: 20 }, over || {});
  state.widgets = [w]; render();
  return { visning: w.fanDuration, def: (({ langd, flygning, landning, visning }) => ({ langd, flygning, landning, visning }))(window.VyraFanHjarta.modell(m)) };
}, [modell, over]);
const trigga = (page, niva = 12, namn = 'HeartRiser') => page.evaluate(([n, namn]) =>
  triggerFanLevelUp({ name: namn, level: n, fromLevel: n - 1, isTeamMember: true, __test: true }), [niva, namn]);
// Direkt på lådan, förbi kön: fan-level-session.js släpper EN level-up i taget, så flera triggers i
// rad i samma prov hade väntat på varandra (13 s styck) och visat förra tittarens nivå.
const spelaDirekt = (page, niva = 12, namn = 'HeartRiser') => page.evaluate(([n, namn]) =>
  fanSpelaPa(document.querySelector('.fhm'), state.widgets[0], { name: namn, level: n, fromLevel: n - 1, isTeamMember: true }), [niva, namn]);

// Läser det synliga hjärtat: vilka hjärtan som syns (synlighet × hela förfäderskedjans opacitet) och
// var det första står, i scenens egna px (oberoende av skalning i OBS-rutan).
const PROV = () => {
  const box = document.querySelector('.fhm'); if (!box) return null;
  const scen = box.querySelector('.fhm-scen'), sr = scen.getBoundingClientRect(), s = sr.width / scen.offsetWidth;
  const op = el => { const cs = getComputedStyle(el); if (cs.visibility !== 'visible' || cs.display === 'none') return 0;
    let n = el, o = 1; while (n && n !== box.parentElement) { o *= +getComputedStyle(n).opacity; n = n.parentElement; } return o; };
  const hj = [...box.querySelectorAll('img.fhm-hjarta,img.fhm-markhjarta')].map(el => ({ el, o: op(el) })).filter(x => x.o > 0.05 && x.el.getBoundingClientRect().width > 2);
  const r = hj[0] && hj[0].el.getBoundingClientRect();
  return { t: performance.now(), n: hj.length, vem: hj.map(x => x.el.classList.contains('fhm-hjarta') ? 'intro' : 'mark').join('+'),
    x: r ? (r.left + r.width / 2 - sr.left) / s : null, y: r ? (r.top + r.height / 2 - sr.top) / s : null, b: r ? r.width / s : null,
    landat: box.classList.contains('fhm-landat') };
};
async function spela(page, ms, vidMs) {
  const rader = [], t0 = Date.now();
  let gjord = false;
  while (Date.now() - t0 < ms) {
    if (vidMs && !gjord && Date.now() - t0 >= vidMs) { gjord = true; await vidMs.gor(page); }
    const r = await page.evaluate(PROV); if (r) rader.push(r);
    await page.waitForTimeout(30);
  }
  return rader;
}

for (const modell of MODELLER) {
  test(`${modell}: ett hjärta i taget, ingen teleportering, mjuk landning i märkets ruta`, { skip, timeout: 60000 }, async () => {
    const { ctx, page, fel } = await sida();
    try {
      const { def, visning } = await lagg(page, modell);
      const landar = def.flygning ? def.flygning.start + def.flygning.langd : def.landning;
      await trigga(page);
      const rader = await spela(page, Math.min(visning * 1000 - 200, Math.max(def.langd, landar) + 700));
      const dubbla = rader.filter(r => r.n > 1);
      assert.equal(dubbla.length, 0, `${modell}: två synliga hjärtan i ${dubbla.length} prov (första vid ${dubbla[0] && dubbla[0].vem})`);
      // Teleportering: samma synliga hjärta får inte hoppa mer än 2500 scen-px/s mellan två prov.
      for (let i = 1; i < rader.length; i++) {
        const a = rader[i - 1], b = rader[i];
        if (!a.n || !b.n || a.vem !== b.vem) continue;
        const fart = Math.hypot(b.x - a.x, b.y - a.y) / ((b.t - a.t) / 1000);
        assert.ok(fart < 2500, `${modell}: hjärtat hoppade ${fart.toFixed(0)} px/s (${a.vem}) — det ser ut som en teleportering`);
      }
      const sista = rader[rader.length - 1];
      assert.equal(sista.vem, 'mark', `${modell}: märket vid nivåsiffran syns inte i slutet (${sista.vem || 'inget hjärta'})`);
      assert.ok(sista.b >= 60, `${modell}: märket är bara ${sista.b.toFixed(0)} scen-px brett — det ska vara tydligt, inte en ikon`);
      if (def.flygning) {
        const byte = rader.findIndex((r, i) => i > 0 && rader[i - 1].vem === 'intro' && r.vem === 'mark');
        assert.ok(byte > 0, `${modell}: introhjärtat lämnade aldrig över till märket`);
        const fore = rader[byte - 1], efter = rader[byte];
        assert.ok(Math.hypot(efter.x - fore.x, efter.y - fore.y) < 4, `${modell}: märket står ${Math.hypot(efter.x - fore.x, efter.y - fore.y).toFixed(1)} px från där hjärtat landade`);
        assert.ok(Math.abs(efter.b - fore.b) < 4, `${modell}: hjärtat bytte storlek i landningen (${fore.b.toFixed(1)} → ${efter.b.toFixed(1)})`);
      }
      assert.deepEqual(fel, []);
    } finally { await ctx.close(); }
  });
}

test('render() mitt i flygningen: hjärtat fortsätter där det var och landar på märket', { skip, timeout: 60000 }, async () => {
  const { ctx, page, fel } = await sida();
  try {
    const { def } = await lagg(page, 'ascend');
    await trigga(page);
    const mitt = def.flygning.start + def.flygning.langd / 2;
    const rader = await spela(page, def.flygning.start + def.flygning.langd + 600, Object.assign(Number(mitt), { gor: p => p.evaluate(() => render()) }));
    for (let i = 1; i < rader.length; i++) {
      const a = rader[i - 1], b = rader[i];
      if (a.vem !== 'intro' || b.vem !== 'intro') continue;
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) / ((b.t - a.t) / 1000) < 2500, 'hjärtat hoppade när duken ritades om');
    }
    assert.equal(rader[rader.length - 1].vem, 'mark');
    assert.equal(rader.filter(r => r.n > 1).length, 0);
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});

test('en widget som tas bort mitt i firandet lämnar inga timers eller visningar efter sig', { skip, timeout: 60000 }, async () => {
  const { ctx, page, fel } = await sida();
  try {
    await lagg(page, 'ascend');
    await trigga(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { state.widgets = []; render(); });
    await page.waitForTimeout(400);
    const kvar = await page.evaluate(() => ({ lador: document.querySelectorAll('.fhm').length }));
    assert.equal(kvar.lador, 0);
    // En ny widget med samma modell ska INTE fortsätta den borttagna visningen (annat id).
    await lagg(page, 'ascend', { id: 'fhm2' });
    const ny = await page.evaluate(() => document.querySelector('.fhm').classList.contains('fan-active'));
    assert.equal(ny, false, 'en ny widget tog över en borttagen widgets visning');
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});

test('reducerad rörelse: slutbilden direkt, med märket vid siffran och utan introhjärta', { skip, timeout: 60000 }, async () => {
  const { ctx, page, fel } = await sida({ reducerad: true });
  try {
    for (const modell of MODELLER) {
      await lagg(page, modell);
      await spelaDirekt(page);
      await page.waitForTimeout(150);
      const r = await page.evaluate(PROV);
      assert.equal(r.vem, 'mark', `${modell}: med reducerad rörelse ska bara märket synas (${r.vem})`);
    }
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});

test('smal widget och långt namn: namnet ryms, nivåsiffran 1, 12 och 50 står med märket bredvid', { skip, timeout: 90000 }, async () => {
  const { ctx, page, fel } = await sida({ reducerad: true });
  try {
    for (const modell of MODELLER) {
      for (const niva of [1, 12, 50]) {
        await lagg(page, modell, { width: 220 });
        await spelaDirekt(page, niva, 'EttVäldigtLångtAnvändarnamnSomInteFårSpräcka_123');
        await page.waitForTimeout(80);
        const r = await page.evaluate(() => {
          const box = document.querySelector('.fhm'), namn = box.querySelector('[data-fhm="namn"]'), siffra = box.querySelector('[data-fhm="niva"]');
          const m = box.querySelector('.fhm-markhjarta').getBoundingClientRect(), s = siffra.getBoundingClientRect(), b = box.getBoundingClientRect();
          return { niva: siffra.textContent, namnRyms: namn.scrollWidth <= namn.clientWidth + 1 || getComputedStyle(namn).textOverflow === 'ellipsis',
            bredvid: Math.abs((m.top + m.height / 2) - (s.top + s.height / 2)) < m.height, inne: m.right <= b.right + 2 && m.left >= b.left - 2 };
        });
        assert.equal(r.niva, String(niva));
        assert.ok(r.namnRyms, `${modell}: det långa namnet spräcker sin ruta`);
        assert.ok(r.bredvid, `${modell} nivå ${niva}: märket står inte bredvid nivåsiffran`);
        assert.ok(r.inne, `${modell} nivå ${niva}: märket hamnar utanför widgeten`);
      }
    }
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});
