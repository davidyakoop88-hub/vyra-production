// scripts/fan-hjarta-matning.js — spelar en Fan Level Up-hjärtmodell i den riktiga studion (overlay-läget)
// och läser av hjärtat var 50:e ms: hur många hjärtan som syns, var det synliga står, storlek, vinkel
// och fart. Används för att granska rörelsen — ryck, hopp, dubbla hjärtan och landningen.
//
//   node scripts/fan-hjarta-matning.js <modell> [--bas http://localhost:4173] [--bilder <mapp>] [--niva 12]
//        [--namn "@HeartRiser"] [--bredd 300] [--rerender <ms>] [--ms 9000]
//
// Kräver en körande dev-server. Skärmbilder (valfritt) tas av lådan var 500:e ms i <mapp>.
'use strict';
const path = require('path');
const { startaWebblasare } = require(path.join(__dirname, '..', 'tests', 'helpers', 'webblasare.js'));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MODELL = process.argv[2];
if (!MODELL || MODELL.startsWith('--')) { console.error('ange modell'); process.exit(2); }
const BAS = arg('bas', 'http://localhost:4173'), BILDER = arg('bilder', ''), NIVA = +arg('niva', 12);
const NAMN = arg('namn', '@HeartRiser'), BREDD = +arg('bredd', 300), RERENDER = +arg('rerender', 0), MS = +arg('ms', 0);
(async () => {
  const b = await startaWebblasare();
  const page = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message)); page.on('console', m => { if (m.type() === 'error') fel.push(m.text()); });
  await page.goto(BAS + '/studio.html?overlay=1', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraFanHjarta, null, { timeout: 30000 });
  await page.waitForFunction(m => !!window.VyraFanHjarta.modell(m), MODELL, { timeout: 15000 });
  const def = await page.evaluate(async ([m, bredd]) => {
    await window.VyraSessionState.projectLocalSession(); window.toast = () => {};
    const w = VyraWidgets.create('catalog:fanlevel:layout:' + m); w.id = 'fhm1'; w.x = 20; w.y = 20; w.width = bredd;
    state.widgets = [w]; render();
    const d = window.VyraFanHjarta.modell(m);
    return { visning: d.visning, langd: d.langd, flygning: d.flygning, fanDuration: w.fanDuration };
  }, [MODELL, BREDD]);
  const total = MS || Math.max(def.langd + 600, (def.flygning ? def.flygning.start + def.flygning.langd : 0) + 600);
  await page.evaluate(([namn, niva]) => triggerFanLevelUp({ name: namn, level: niva, fromLevel: niva - 1, isTeamMember: true, __test: true }), [NAMN, NIVA]);
  const t0 = Date.now(), rader = [];
  let bild = 0, rerendrad = false;
  while (Date.now() - t0 < total) {
    const t = Date.now() - t0;
    if (RERENDER && !rerendrad && t >= RERENDER) { rerendrad = true; await page.evaluate(() => render()); }
    rader.push(await page.evaluate(() => {
      const box = document.querySelector('.fhm'); if (!box) return { ingen: true };
      const syns = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.visibility !== 'visible' || cs.display === 'none') return false;
        let n = el, op = 1; while (n && n !== box.parentElement) { op *= +getComputedStyle(n).opacity; n = n.parentElement; } const r = el.getBoundingClientRect(); return op > 0.05 && r.width > 2 ? op : false; };
      const lasa = el => { const r = el.getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(el).transform);
        return { x: +(r.left + r.width / 2).toFixed(1), y: +(r.top + r.height / 2).toFixed(1), b: +r.width.toFixed(1), v: +(Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(1) }; };
      const hj = [...box.querySelectorAll('img.fhm-hjarta,img.fhm-markhjarta')].map(el => ({ el, op: syns(el) })).filter(x => x.op);
      return { n: hj.length, vem: hj.map(x => x.el.classList.contains('fhm-hjarta') ? 'intro' : 'mark').join('+'), op: hj.map(x => x.op.toFixed(2)).join('+'),
        p: hj[0] ? lasa(hj[0].el) : null, klass: [...box.classList].filter(k => /fhm-(spelar|landat|flyger)|fan-(active|exit)/.test(k)).join(' ') };
    }));
    rader[rader.length - 1].t = t;
    if (BILDER && t >= bild * 500) { const el = await page.$('.fhm'); if (el) await el.screenshot({ path: path.join(BILDER, `${MODELL}-${String(bild * 500).padStart(5, '0')}.png`) }); bild++; }
    await page.waitForTimeout(40);
  }
  let forra = null;
  for (const r of rader) {
    let fart = '';
    if (forra && r.p && forra.p && r.vem === forra.vem) { const dt = (r.t - forra.t) / 1000; fart = (Math.hypot(r.p.x - forra.p.x, r.p.y - forra.p.y) / dt).toFixed(0) + 'px/s'; }
    console.log(String(r.t).padStart(5), r.ingen ? 'ingen låda' : `hjärtan=${r.n} ${r.vem.padEnd(10)} op=${r.op.padEnd(9)} ${r.p ? `x=${r.p.x} y=${r.p.y} b=${r.p.b} v=${r.p.v}°` : ''} ${fart} [${r.klass}]`);
    forra = r;
  }
  const dubbla = rader.filter(r => r.n > 1).length;
  console.log(`\n${MODELL}: ${rader.length} prov, ${dubbla} med två synliga hjärtan, fel i sidan: ${fel.length ? fel.join(' | ') : 'inga'}`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
