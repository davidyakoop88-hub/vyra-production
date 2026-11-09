'use strict';
// INGEN WIDGET RITAR OM HELA LAYOUTEN UNDER EN SÄNDNING (David 2026-11-09: "se till ingen klocka eller
// annat ska störa min layout, alla widgetar ska funka som vi hade ställt upp dem").
//
// Det som hände: Match 1 vs 1 (#744, borttagen 2026-11-09) hade en klocka som anropade render() varje
// sekund från sändningens första match och resten av sändningen — även i en layout utan widgeten.
// render() skriver om hela #view, så varje annan widget revs en gång i sekunden: Battle MVP syntes
// 0,8 s i stället för 10 s, Top Gifts gåvovideo kom aldrig igång och hela layouten hackade. Quiz,
// Ordjakten och Viewer Showcase gjorde samma sak när något hände i dem.
//
// Proven för de filerna stängde av klockan och bytte render() mot en tom funktion — de kunde inte se
// felet. Det här provet kör den riktiga sidan i en riktig webbläsare, med EN widget per widgettyp ur
// docs/katalogkarta.md (en ny widgetfamilj ärver täckningen utan att någon behöver minnas det), och
// spelar en sändning: tystnad, gåvor, likes, chatt, följare, delningar, medlemmar, tittarantal och en
// hel match med MVP. Under tiden får #view inte skrivas om en enda gång, i varken studion eller OBS.
//
// En ny widget som behöver uppdatera sig under sändning ska skriva på sin EGEN nod (se ritaEgna i
// quiz.js, eller triggerBattleMvp i media.js) — aldrig anropa render() från en timer eller en
// livehändelse.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.gif': 'image/gif' };

let browser, server, bas, skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = http.createServer((req, res) => {
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

// En sändning i korthet. Körs i sidan; returnerar när allt är skickat.
async function sandning() {
  const vanta = ms => new Promise(r => setTimeout(r, ms));
  const skicka = e => {
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: e }));
    if (typeof routeLiveBattleEvent === 'function') { try { routeLiveBattleEvent(e); } catch (_) {} }
  };
  const u = i => ({ username: 'u' + i, name: 'U' + i, nickname: 'U' + i, uniqueId: 'u' + i, userId: String(100 + i), tillVarden: true, at: Date.now() });
  const ORD = ['A', 'B', 'C', 'hej', '!d1', '!t', 'ja', 'katt', 'sol', 'vyra'];
  await vanta(4000);                                   // tystnad: klockor som går av sig själva
  skicka({ type: 'battle', event: 'battle', battleId: 'vakt-1', battleStatus: 'battle_started', scoreUs: 0, scoreThem: 0, remainingSec: 300 });
  for (let i = 1; i <= 24; i += 1) {
    const p = u(i % 7);
    skicka({ type: 'gift', event: 'gift', ...p, giftName: i % 6 ? 'Rose' : 'Lion', giftId: i % 6 ? '5655' : '6369', diamonds: i % 6 ? 1 : 29999, coins: i % 6 ? 1 : 29999, count: 1 + (i % 3), repeatCount: 1 + (i % 3) });
    skicka({ type: 'like', event: 'like', ...p, likeCount: 15, count: 15, totalLikes: 1000 + i * 15 });
    skicka({ type: 'chat', event: 'chat', ...p, comment: ORD[i % ORD.length] });
    if (i % 4 === 0) skicka({ type: 'follow', event: 'follow', ...p });
    if (i % 5 === 0) skicka({ type: 'share', event: 'share', ...p });
    if (i % 3 === 0) skicka({ type: 'member', event: 'member', ...p });
    if (i % 6 === 0) skicka({ type: 'roomUser', event: 'roomUser', viewerCount: 100 + i });
    if (i % 4 === 0) skicka({ type: 'battle', event: 'battle', battleId: 'vakt-1', scoreUs: i * 10, scoreThem: i * 7, remainingSec: 300 - i });
    await vanta(250);
  }
  skicka({ type: 'battle', event: 'battle', battleId: 'vakt-1', battleStatus: 'battle_finished', scoreUs: 900, scoreThem: 400 });
  skicka({ type: 'battle_mvp', event: 'battle_mvp', battleId: 'vakt-1', name: 'U1', username: 'u1', score: 900 });
  await vanta(3500);                                   // efter matchen: det var HÄR klockan fortsatte gå
  const mvp = document.querySelector('.battle-mvp');
  return { mvpFinns: !!mvp, mvpAktiv: !!(mvp && mvp.classList.contains('mvp-active')) };
}

for (const [namn, adress] of [['studion', 'studio.html'], ['OBS (overlay-läget)', 'studio.html?overlay=1']]) {
  test(`${namn}: en hel sändning med alla widgettyper skriver aldrig om hela layouten`, { skip, timeout: 240000 }, async () => {
    const nycklar = kravNycklar();
    const ctx = await browser.newContext({ viewport: { width: 1568, height: 900 } });
    const sida = await ctx.newPage();
    const sidfel = [];
    sida.on('pageerror', e => sidfel.push(String(e && e.message || e).slice(0, 200)));
    try {
      await sida.goto(`${bas}/${adress}`, { waitUntil: 'load', timeout: 120000 });
      await sida.waitForFunction(() => window.VyraWidgets && typeof render === 'function', null, { timeout: 60000 });
      await sida.waitForTimeout(8000);                 // skript-svansen i media.js laddar ~200 filer
      const lagd = await sida.evaluate(lista => {
        state.widgets.length = 0;
        const typer = new Set();
        lista.forEach(k => {
          try { const w = VyraWidgets.create(k); if (!w || !w.type || typer.has(w.type)) return; typer.add(w.type); const i = typer.size; w.x = 10 + (i % 8) * 50; w.y = 20 + Math.floor(i / 8) * 90; state.widgets.push(w); } catch (_) {}
        });
        try { view = 'editor'; selected = null; } catch (_) {}
        render();
        return { typer: typer.size, mvp: typer.has('templateBattleMvp'), topgift: typer.has('templateTopGift') };
      }, nycklar);
      assert.ok(lagd.typer >= 30, `bara ${lagd.typer} widgettyper gick att lägga i layouten — provet täcker för lite`);
      assert.ok(lagd.mvp && lagd.topgift, 'Battle MVP och Top Gift ska vara med: det var de som revs');
      await sida.waitForTimeout(3000);                 // låt den första ritningen sätta sig

      // Räknas i DOM:en, inte genom att linda render(): lindningskedjan byts under laddningen (se
      // laddning-alla-widgetar.browser.test.js). render() skriver om #view; widgetarnas egna
      // uppdateringar gör det inte.
      await sida.evaluate(() => {
        window.__omritningar = 0;
        const rot = document.getElementById('view');
        window.__vaktRot = !!rot;
        new MutationObserver(lista => { for (const m of lista) if (m.target === rot && m.removedNodes.length + m.addedNodes.length > 0) window.__omritningar += 1; })
          .observe(rot || document.body, { childList: true });
      });
      const efter = await sida.evaluate(sandning);
      const r = await sida.evaluate(async () => {
        const under = window.__omritningar;
        render();                                      // kontrollen: en riktig render() MÅSTE synas i räknaren
        await new Promise(k => setTimeout(k, 200));
        return { under, kontroll: window.__omritningar - under, rot: window.__vaktRot, widgetar: document.querySelectorAll('.widget[data-id]').length };
      });
      console.log(`[sändning · ${namn}] ${lagd.typer} widgettyper, ${r.under} omritningar under sändningen, MVP aktiv 3,5 s efter matchslut: ${efter.mvpAktiv}; sidfel: ${sidfel.slice(0, 2).join(' | ') || 'inga'}`);

      assert.ok(r.rot, '#view hittades inte — provet mäter ingenting');
      assert.ok(r.kontroll > 0, 'en riktig render() syntes inte i räknaren — provet mäter ingenting');
      assert.ok(r.widgetar >= 20, `bara ${r.widgetar} widgetar på duken — layouten ritades inte`);
      assert.equal(r.under, 0,
        `${r.under} omritningar av HELA layouten under sändningen. En widget anropar render() från en timer eller en `
        + `livehändelse — den ska skriva på sin egen nod i stället (se ritaEgna i quiz.js eller triggerBattleMvp i media.js).`);
      assert.ok(efter.mvpFinns, 'Battle MVP ritades inte');
      assert.ok(efter.mvpAktiv, 'Battle MVP var inte tänd 3,5 s efter matchslut — något rev den (den ska stå i 7–10 s)');
    } finally { await ctx.close(); }
  });
}
