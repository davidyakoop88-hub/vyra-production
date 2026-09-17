'use strict';
// [hidden] I PANELEN MASTE FAKTISKT DOLJA.
//
// `hidden` ar en UA-regel med lag specificitet, och `.properties` styrs av ett
// !important-lager: `toplike-studio.css:11-14` sattar display pa .property-group
// och dess label med !important, medvetet ("to win regardless of dynamic <link>
// injection order"). En dold etikett tog darfor plats anda.
//
// UPPMATT I CHROMIUM 2026-09-17, praktstegets etikett for en icke-klassisk modell:
//
//   regel som lades till                            laddad  display  hojd
//   ---------------------------------------------------------------------
//   (main som den var)                                -      flex     57
//   .properties [hidden]{display:none}               ja      flex     57
//   .properties [hidden]{display:none!important}     ja      flex     57
//   .properties .property-group [hidden]{...!imp}     -      none      0
//
// De tva mellersta raderna ar poangen: regeln NADDE FRAM och forlorade anda.
// `.properties .property-group label` ar (0,2,1); `.properties [hidden]` ar
// (0,2,0). Nar bada ar !important avgor specificiteten, och (0,2,0) forlorar.
// Fixen ar (0,3,0).
//
// VARFOR DET HAR PROVET KOR I EN RIKTIG WEBBLASARE. jsdom har ingen layout:
// `getBoundingClientRect()` ar alltid 0x0 och det finns ingen kaskad att fraga.
// Ett jsdom-prov kan bara se att attributet STAR dar -- vilket det gjorde hela
// tiden, medan etiketten syntes. Det provet var gront genom hela buggen.
//
// KONTROLLFALLET ar obligatoriskt. Mater man bara "dold modell -> hojd 0" kan
// provet bli gront av att etiketten saknas helt, eller av att HELA panelen ar
// tom. Darfor mats classic i samma andetag: dar ska samma etikett SYNAS, for
// praktsteget tillhor guldmodellen. Ett matt som inte kan ge utslag at bada
// hallen mater ingenting.
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

test('praktstegets etikett tar ingen plats for en icke-klassisk modell', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);

    const m = await page.evaluate(async () => {
      const bygg = async nyckel => {
        state.widgets.length = 0;
        const w = Object.assign(window.VyraWidgets.create(nyckel), { id: 'g', x: 40, y: 40 });
        state.widgets.push(w); selected = 'g'; view = 'editor'; render(); bind();
        await new Promise(r => setTimeout(r, 400));
        const panel = document.querySelector('.properties');
        const el = panel && panel.querySelector('label[data-ge-steg]');
        if (!el) return { fanns: false };
        const b = el.getBoundingClientRect();
        return {
          fanns: true,
          markt: el.hasAttribute('hidden'),
          display: getComputedStyle(el).display,
          hojd: Math.round(b.height)
        };
      };

      // Modellnamnet lases ur registret sa att provet inte bar en egen lista
      // som kan glida isar fran den riktiga.
      const modeller = Object.keys(window.VyraWidgets.variants('guardianemblem.model'));
      const annan = modeller.find(m => m !== 'classic');
      return {
        annan,
        dold: annan ? await bygg('catalog:guardianemblem:model:' + annan) : null,
        classic: await bygg('catalog:guardianemblem:model:classic')
      };
    });

    assert.ok(m.annan, 'registret har bara modellen classic -- provet kan inte visa skillnaden');

    // KONTROLLEN FORST: kan matningen ge utslag alls?
    assert.equal(m.classic.fanns, true,
      'praktstegets etikett finns inte ens for classic -- provet mater fel element');
    assert.equal(m.classic.markt, false,
      'praktsteget ar markt dolt for classic, men steget TILLHOR guldmodellen');
    assert.ok(m.classic.hojd > 0,
      `praktsteget tar ingen plats for classic (hojd ${m.classic.hojd}) -- da skulle ` +
      'provet nedan bli gront aven om regeln saknades');

    // SJALVA PASTAENDET.
    assert.equal(m.dold.fanns, true, `praktstegets etikett saknas helt for ${m.annan}`);
    assert.equal(m.dold.markt, true,
      `praktsteget ar inte markt hidden for ${m.annan} -- ersattningen i ` +
      'guardian-emblem-models.js traffade inte sitt ankare');
    assert.equal(m.dold.display, 'none',
      `praktstegets etikett har display:${m.dold.display} for ${m.annan}. ` +
      'Regeln .properties .property-group [hidden] i studio.css maste vinna over ' +
      'toplike-studio.css:14 -- den ar !important och (0,2,1), sa fixen behover (0,3,0).');
    assert.equal(m.dold.hojd, 0,
      `praktstegets etikett tar ${m.dold.hojd}px for ${m.annan} trots display:none`);
  } finally {
    await page.close();
  }
});
