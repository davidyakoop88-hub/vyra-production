'use strict';
// LADDNINGEN MED ALLA WIDGETAR I LAYOUTEN (David 2026-11-08: "lägg alla widget och testa dem så det
// händer inte så som det hände idag med layouten").
//
// Det som hände: studion visade en tom duk i upp till 22 s och huvudtråden var blockerad 32 av de
// första 50 sekunderna under en sändning. Orsaken var fyra filer (approved-rankings, ranking-sixpack,
// spellayout, vyra-bildrad) som ritade om HELA studion efter varje sent skript — ~200 skript, och
// varje ny widget lade till fler. Ingen enskild ändring var fel; kostnaden växte tyst tills den syntes.
//
// Provet lägger EN widget per katalognyckel (docs/katalogkarta.md — en ny widgetfamilj ärver
// täckningen utan att någon behöver minnas det), laddar om studions layoutvy och mäter:
//   1. hur många gånger render() kördes under laddningen — deterministiskt, inte maskinberoende
//   2. att alla widgetar faktiskt ritades på duken, inom en generös tidsgräns
// Talet i 1 är det som växte med varje skript. Taket ska ligga kvar även när katalogen växer.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.gif': 'image/gif' };

// TAKET. Uppmätt 2026-11-08 lokalt med alla 163 katalognycklar: main före #747 byggde om hela vyn 171
// gånger under laddningen, med #747 52. En enda ny fil med samma mönster (rita om allt efter varje
// sent skript) lägger till ~70 — taket 80 fäller den direkt men lämnar plats för vanlig variation.
const TAK_RITNINGAR = Number(process.env.VYRA_TAK_RITNINGAR || 80);
const TAK_RITAD_MS = 30000;

let browser, server, bas, skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = http.createServer((req, res) => {
    // Lokalt läge (som desktopappen): authRequired:false -> vyra-auth-local -> projectLocalSession(),
    // så att studion läser layouten ur lagringen vid omladdning. Övriga /api svarar 404.
    if (req.url.split('?')[0] === '/api/auth/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"authRequired":false}'); return; }
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fil)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(fil).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

test('alla widgetar i layouten: få omritningar under laddningen, och alla ritas', { skip, timeout: 240000 }, async () => {
  const nycklar = kravNycklar();
  const ctx = await browser.newContext({ viewport: { width: 1568, height: 900 } });
  const sida = await ctx.newPage();
  const sidfel = [];
  sida.on('pageerror', e => sidfel.push(String(e && e.message || e).slice(0, 200)));
  try {
    // 1. Bygg layouten: en widget per katalognyckel, sparad i localStorage som studion läser vid start.
    await sida.goto(`${bas}/studio.html`, { waitUntil: 'load', timeout: 120000 });
    await sida.waitForFunction(() => window.VyraWidgets && typeof save === 'function', null, { timeout: 60000 });
    const byggda = await sida.evaluate(async lista => {
      await window.VyraSessionState.projectLocalSession();   // skrivbar session, annars sparar save() ingenting
      state.widgets.length = 0;
      const fel = [];
      lista.forEach((k, i) => {
        try { const w = VyraWidgets.create(k); if (!w || !w.type) { fel.push(k); return; } w.x = 10 + (i % 4) * 100; w.y = 20 + Math.floor(i / 4) * 40; state.widgets.push(w); }
        catch (e) { fel.push(k); }
      });
      await save();   // asynkron: utan await laddades sidan om innan layouten låg i lagringen
      let sparade = 0; try { sparade = (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length; } catch (_) {}
      return { antal: state.widgets.length, sparade, fel };
    }, nycklar);
    assert.equal(byggda.sparade, byggda.antal, 'layouten låg inte i lagringen före omladdningen');
    assert.ok(byggda.antal >= nycklar.length * 0.9, `bara ${byggda.antal} av ${nycklar.length} nycklar gick att bygga: ${byggda.fel.slice(0, 8).join(', ')}`);

    // 2. Räkna HELA OMRITNINGAR från första stund. render() i studio.js skriver om #view med
    //    `viewRoot.innerHTML = …` varje gång — en sådan omskrivning är exakt det som kostade. Räknas
    //    i DOM:en i stället för genom att linda render(): lindningskedjan byts flera gånger under
    //    laddningen, och en räknare i den räknade 0 fast vyn byggdes om.
    // Samma observatör noterar när antalet widgetar på duken senast ändrades: då är duken färdigritad.
    // (Layoutvyns duk visar inte alla 160+ samtidigt — måttet är när den slutat ändras, inte ett antal.)
    await sida.addInitScript(() => {
      window.__ritningar = 0; window.__senastAndrad = 0; let forra = -1;
      new MutationObserver(lista => {
        for (const m of lista) if (m.target && m.target.id === 'view' && m.removedNodes.length + m.addedNodes.length > 0) { window.__ritningar++; window.__raknar = true; }
        const n = document.querySelectorAll('.widget[data-id]').length;
        if (n !== forra) { forra = n; window.__senastAndrad = performance.now(); }
      }).observe(document, { childList: true, subtree: true });
    });
    await sida.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // Vänta tills duken stått still i 4 s (eller tidsgränsen gått).
    await sida.waitForFunction(() => window.__senastAndrad > 0 && performance.now() - window.__senastAndrad > 4000 && document.querySelectorAll('.widget[data-id]').length > 0,
      null, { timeout: TAK_RITAD_MS + 10000, polling: 250 }).catch(() => {});
    const r = await sida.evaluate(() => ({ ritningar: window.__ritningar, raknade: !!window.__raknar, pa_duken: document.querySelectorAll('.widget[data-id]').length,
      ritadMs: Math.round(window.__senastAndrad), vy: typeof view !== 'undefined' ? view : '?', i_state: typeof state !== 'undefined' ? state.widgets.length : -1 }));
    console.log(`[laddning] ${byggda.antal} widgetar, ${r.ritningar} omritningar, ${r.pa_duken} på duken (vy ${r.vy}, state ${r.i_state}), färdigritad efter ${r.ritadMs} ms; sidfel: ${sidfel.slice(0, 3).join(' | ') || 'inga'}`);

    assert.ok(r.raknade && r.ritningar > 0, 'vyn byggdes aldrig — provet mäter ingenting');
    assert.equal(r.i_state, byggda.antal, 'layouten lästes inte in efter omladdningen — provet mäter en tom studio');
    assert.ok(r.pa_duken >= 20, `bara ${r.pa_duken} widgetar på duken — layouten ritades inte`);
    assert.ok(r.ritadMs <= TAK_RITAD_MS, `duken blev färdigritad först efter ${r.ritadMs} ms (tak ${TAK_RITAD_MS})`);
    assert.ok(r.ritningar <= TAK_RITNINGAR,
      `${r.ritningar} omritningar av hela studion under laddningen (tak ${TAK_RITNINGAR}). En fil ritar troligen om allt `
      + `efter varje sent skript — använd window.VyraRitaSnart (se approved-rankings.js ritaSnart).`);
  } finally { await ctx.close(); }
});
