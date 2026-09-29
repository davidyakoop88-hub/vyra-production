'use strict';
// ENTRERUTAN SKA VARA TOM PA ARBETE (#448).
//
// triggerBattleMvp korde forr `save()` och `render()` for att satta en klass pa EN nod.
// render() gor `viewRoot.innerHTML = m[view]()` -- alltsa byggs varje widget, panelen och
// katalogen om, i exakt den bildruta dar firandet tands. Det syns som ett ryck, och det
// river dessutom partikeldukarna som just forvarmats.
//
// UPPMATT, samma scen med tre widgetar:
//
//                              fore   efter
//   ombyggnader av hela vyn      1       0
//   skapade dukar                2       0
//   skrivna dukmatt              4       0
//
// Provet raknar HANDELSER, inte millisekunder. Ett tak i ms hade varit ett myntkast:
// rAF-intervall ar kvantiserade till vsync, och den lardomen kostade redan en flackig
// vakt i PR #451. Ratt svar har ar exakt noll, och noll har inget brus.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

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
let skip = hoppaOver();          // maste vara let: node:test laser { skip } vid registrering

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

test('triggern bygger varken om vyn eller allokerar dukar pa entrerutan', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForFunction(() => !!window.VyraMvpParticles, null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);

    const m = await page.evaluate(async () => {
      // Flera widgetar, som en verklig layout — annars syns inte skillnaden mellan
      // att bygga om HELA vyn och att inte rora nagot.
      state.widgets.length = 0;
      const mvp = window.VyraWidgets.create('catalog:battlemvp:celebration:coronation');
      Object.assign(mvp, { id: 'mvp1', x: 40, y: 40, width: 700, mvpName: 'X',
        mvpDuration: 9, profileImage: 'assets/images/test-profile.svg' });
      state.widgets.push(mvp);
      for (const [i, nyckel] of ['catalog:likefountain', 'catalog:battlemvp:inferno'].entries()) {
        try {
          const w = window.VyraWidgets.create(nyckel);
          Object.assign(w, { id: 'x' + i, x: 40, y: 500 + i * 40, width: 420 });
          state.widgets.push(w);
        } catch (e) {}
      }
      selected = null; render();
      await new Promise(r => setTimeout(r, 900));

      const logg = { vybygge: 0, dukar: 0, dukmatt: 0 };
      let raknar = false;
      const vyrot = document.querySelector('#view');
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true, get: d.get,
        set(v) { if (raknar && this === vyrot) logg.vybygge++; d.set.call(this, v); }
      });
      const origCreate = document.createElement.bind(document);
      document.createElement = function (t, o) {
        if (raknar && String(t).toLowerCase() === 'canvas') logg.dukar++;
        return origCreate(t, o);
      };
      for (const falt of ['width', 'height']) {
        const dd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, falt);
        Object.defineProperty(HTMLCanvasElement.prototype, falt, {
          configurable: true, enumerable: dd.enumerable, get: dd.get,
          set(v) { if (raknar) logg.dukmatt++; dd.set.call(this, v); }
        });
      }

      raknar = true;
      triggerBattleMvp({ name: 'Vinnaren', score: 1500,
        profileImage: 'assets/images/test-profile.svg' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      raknar = false;

      await new Promise(r => setTimeout(r, 500));
      const box = document.querySelector('.battle-mvp.mvp-celebration');
      return {
        ...logg,
        widgetar: state.widgets.length,
        tand: !!(box && box.classList.contains('mvp-active')),
        namn: (box && box.querySelector('h2') || {}).textContent || '-'
      };
    });

    console.log(`\n    ${m.widgetar} widgetar · vybygge ${m.vybygge} · dukar ${m.dukar}` +
                ` · dukmatt ${m.dukmatt} · tand ${m.tand} · namn "${m.namn}"\n`);

    // Firandet maste fortfarande fungera — en vakt som bara raknar arbete gar att
    // uppfylla genom att sluta gora nagot alls.
    assert.equal(m.tand, true, 'firandet tandes inte');
    assert.equal(m.namn, 'Vinnaren', 'vinnarens namn nadde inte DOM:en');

    assert.equal(m.vybygge, 0,
      'triggern byggde om HELA vyn for att satta en klass pa en nod (#448)');
    assert.equal(m.dukar, 0,
      'triggern skapade dukar pa entrerutan — forvarmningen revs mitt i firandet');
    assert.equal(m.dukmatt, 0,
      'triggern skrev dukmatt pa entrerutan; canvas.width omallokerar aven vid samma varde');
  } finally { await page.close(); }
});
