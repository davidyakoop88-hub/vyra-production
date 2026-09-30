'use strict';
// Genererar de handplockade katalog-förhandsbilderna i assets/previews/ för de kort vars motiv är
// för glest/dekorativt för att den automatiska omramningen i overlay-preview.js ska få dem att
// läsa i den lilla kortrutan (Clean Flip, Top Coins Halo/Signal Orbit, premium-Top Gifter).
//
// Varje widget renderas i FULL storlek ur sin egen design (samma wh() som live), ramas in på en
// mörk kortbakgrund (2:1) och fångas i en riktig webbläsare. Kör om detta om någon av designerna
// ändras: `node scripts/generera-katalog-forhandsbilder.js`. Nycklarna nedan speglar
// OWG_CATALOG_PREVIEW i overlay-preview.js.
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { startaWebblasare } = require(path.join(ROOT, 'tests', 'helpers', 'webblasare.js'));
const OUT = path.join(ROOT, 'assets', 'previews');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.json':'application/json','.woff2':'font/woff2','.jpg':'image/jpeg','.jpeg':'image/jpeg' };
function servera(){const s=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');const fil=path.join(ROOT,rel);if(!fil.startsWith(ROOT)||!fs.existsSync(fil)||fs.statSync(fil).isDirectory()){res.writeHead(404);res.end('no');return;}res.writeHead(200,{'content-type':MIME[path.extname(fil)]||'application/octet-stream'});fs.createReadStream(fil).pipe(res);});return new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s)));}

const JOBS = [
  ['catalog:topstreak', 'topstreak-cleanflip'],
  ['catalog:ranking:templateTopCoins:halo', 'topcoins-halo'],
  ['catalog:ranking:templateTopCoins:signal-orbit', 'topcoins-signal-orbit'],
  ['catalog:topgift:premium:royal', 'topgift-royal'],
  ['catalog:topgift:premium:neon', 'topgift-neon'],
];

(async () => {
  const browser = await startaWebblasare();
  if (!browser) { console.error('ingen webbläsare (se tests/helpers/webblasare.js)'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.wh === 'function' && typeof window.overlayPreviewWidget === 'function', null, { timeout: 20000 });
  for (const [key, name] of JOBS) {
    await page.evaluate(async (key) => {
      view = 'overlay'; selected = null; render(); bind();
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('capstage')?.remove();
      const btn = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')].find(b => b.dataset.catalogKey === key);
      const w = overlayPreviewWidget(btn); let html = ''; try { html = wh(w); } catch (e) { html = ''; }
      const stage = document.createElement('div'); stage.id = 'capstage';
      stage.style.cssText = 'position:fixed;left:0;top:0;z-index:999999;width:440px;height:220px;background:#0a0510;overflow:hidden';
      stage.innerHTML = '<div id="capinner" style="position:absolute;left:0;top:0;transform-origin:0 0">' + html + '</div>';
      document.body.appendChild(stage);
      stage.querySelectorAll('.widget, .widget *').forEach(e => { e.style.setProperty('visibility', 'visible', 'important'); e.style.setProperty('opacity', '1', 'important'); });
    }, key);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const stage = document.getElementById('capstage'), inner = document.getElementById('capinner');
      const sr = stage.getBoundingClientRect();
      let minL = 1e9, minT = 1e9, maxR = -1e9, maxB = -1e9, any = false;
      for (const el of inner.querySelectorAll('*')) { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.display === 'none') continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; const hb = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; const hi = cs.backgroundImage && cs.backgroundImage !== 'none'; const tg = el.tagName.toLowerCase(); const p = tg === 'img' || tg === 'canvas' || tg === 'svg' || hb || hi; const tx = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (p || tx) { minL = Math.min(minL, r.left); minT = Math.min(minT, r.top); maxR = Math.max(maxR, r.right); maxB = Math.max(maxB, r.bottom); any = true; } }
      if (!any) return;
      const cw = maxR - minL, ch = maxB - minT, pad = 22; const s = Math.min((sr.width - pad) / cw, (sr.height - pad) / ch, 3.2);
      const tx = (sr.width - cw * s) / 2 - (minL - sr.left) * s, ty = (sr.height - ch * s) / 2 - (minT - sr.top) * s;
      inner.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    });
    await page.waitForTimeout(200);
    const h = await page.$('#capstage');
    const file = path.join(OUT, name + '.jpg');
    await h.screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log('skrev', path.relative(ROOT, file));
  }
  await browser.close(); await new Promise(r => server.close(r));
  process.exit(0);
})().catch(e => { console.error('FEL', e && e.stack || e); process.exit(1); });
