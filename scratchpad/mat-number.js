'use strict';
// Engångsmätning för PR D-byggplanen: numbers entré på MAIN, del för del.
// Kör: node scratchpad/mat-number.js
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { startaWebblasare } = require(path.join(ROOT, 'tests', 'helpers', 'webblasare.js'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.json': 'application/json' };

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

(async () => {
  const browser = await startaWebblasare();
  if (!browser) { console.error('ingen webbläsare'); process.exit(1); }
  const server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);

  const rapport = await page.evaluate(async () => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:number');
    Object.assign(w, { x: 60, y: 90 });
    state.widgets.push(w);
    selected = null;
    render();
    await new Promise(r => setTimeout(r, 600));

    const box = document.querySelector('.gifter-level-up');
    if (!box) return { fel: 'ingen låda', nyckel: null };

    // Delarna: alla element med klass, taggade med en läsbar väg
    const delar = [...box.querySelectorAll('*')].map(el => ({
      el, namn: (el.className && typeof el.className === 'string' && el.className.trim())
        ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).join('.')
        : el.tagName.toLowerCase(),
    }));

    const prov = () => delar.map(d => {
      const cs = getComputedStyle(d.el);
      return { namn: d.namn, o: +(+cs.opacity).toFixed(2), t: cs.transform === 'none' ? '' : cs.transform.slice(0, 40),
        anim: cs.animationName !== 'none' ? cs.animationName : '' };
    });

    // Tänd som en riktig alert: triggern med __test (kringgår gate, behåller vägen)
    window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Mätare', username: 'matare' });
    const serier = {};
    for (const ms of [40, 250, 500, 800, 1200]) {
      await new Promise(r => setTimeout(r, ms === 40 ? 40 : ms - Object.keys(serier).map(Number).pop()));
      serier[ms] = prov();
    }
    const aktiva = box.getAnimations({ subtree: true }).map(a => a.animationName || a.constructor.name);
    return { fel: null, klasser: box.className, serier, aktivaEfterEntre: aktiva };
  });

  console.log(JSON.stringify(rapport, null, 1));
  await page.close(); await browser.close();
  await new Promise(r => server.close(r));
})();
