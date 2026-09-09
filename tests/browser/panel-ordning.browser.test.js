'use strict';
// Egenskapspanelen har SAMMA ordning oavsett widget — kontraktet efter vyra-panelordning.js.
//
// LÄGET FÖRE (uppmätt 2026-09-09): elva filer bygger var sin property-group utan att veta om
// varandra, så "POSITION & STORLEK" låg på plats 4 i Top Gift, plats 3 i Fan Level och plats 8 i
// Top Like. Samma block, tre olika ställen. Panelen gick inte att lära sig.
//
// KONTRAKTET: grupperna sorteras i en fast följd — innehåll, design, live/test, position, ram,
// animation, bakgrund, verktyg. Provet kollar inte exakta platsnummer (en widget som saknar DESIGN
// ska inte falla på det) utan att den RELATIVA ordningen håller: allt som hör till en tidigare
// kategori kommer före allt som hör till en senare, i varje widget.
//
// PRESET & PRESTANDA ligger sist med flit. Dess två kontroller skriver inte till widgeten alls
// (mätt: de gäller scenen), så de hör inte hemma bland widgetens egna inställningar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

const WIDGETS = [
  'catalog:topgift:premium:royal', 'catalog:topgift', 'catalog:topstreak:premium:liquid',
  'catalog:toplike:clean', 'catalog:fanlevel:gold', 'catalog:lastx:card',
  'catalog:heartgoal:classic', 'catalog:followeralert', 'catalog:gifterlevel:orbitlevel',
];

// Samma trappa som VIKT i vyra-panelordning.js, uttryckt en gång till här. Provet ska falla när
// filen ändras utan att kontraktet ändras med — därför är den medvetet skriven av, inte importerad.
const TRAPPA = [
  [/^INNEHÅLL|^ALLMÄNT|VILKA SKA VISAS|^GÅVA|^TEXT$|^KÄLLA|^STORLEK/, 10, 'innehåll'],
  [/^DESIGN|^TEMA|FÄRG|^UTSEENDE|TEXTEFFEKT|^PRAKT|PRESET-TEMAN|^LISTA/, 30, 'design'],
  [/^TRIGGER|LIVE-DATA|VISNINGSTID|^TESTA|TEST OCH RESET|WEBHOOK/, 40, 'live/test'],
  [/POSITION\s*·\s*TEXTELEMENT|^FINJUSTERING/, 45, 'finjustering'],
  [/^POSITION|^SKALA/, 50, 'position'],
  [/AVATAR-RAM|PROFILRAM/, 60, 'ram'],
  [/^ANIMATION|RÖRELSESTIL|PREMIUM RÖRELSE/, 70, 'animation'],
  [/^BAKGRUND/, 80, 'bakgrund'],
  [/PRESET\s*&\s*PRESTANDA/, 90, 'verktyg'],
];

function kategori(rubrik) {
  const r = (rubrik || '').toUpperCase().trim();
  // Ordningen här måste vara den omvända trappan: PRESET & PRESTANDA innehåller "PRESET" men är
  // inte PRESET-TEMAN, och BAKGRUND ska inte fångas av något tidigare mönster.
  for (const [m, v, namn] of [...TRAPPA].reverse()) if (m.test(r)) return { v, namn };
  return { v: 20, namn: 'widgetens egen' };
}

for (const nyckel of WIDGETS) {
  test(`${nyckel}: panelens grupper står i rätt ordning`, { skip }, async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    try {
      await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
        { timeout: 30000, polling: 100 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
      await page.waitForTimeout(400);
      await page.evaluate(n => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(n);
        w.x = 200; w.y = 200;
        state.widgets.push(w);
        selected = w.id;
        render();
      }, nyckel);
      await page.waitForTimeout(800);

      const rubriker = await page.evaluate(() =>
        [...document.querySelectorAll('.properties > .property-group')]
          .map(g => (g.querySelector('h4, .pg-toggle')?.textContent || '').replace(/[▸▾›]/g, '').trim()));

      assert.ok(rubriker.length >= 3, `${nyckel}: bara ${rubriker.length} grupper — panelen byggdes inte`);

      const trappa = rubriker.map(r => ({ rubrik: r, ...kategori(r) }));
      const fel = [];
      for (let i = 1; i < trappa.length; i++) {
        if (trappa[i].v < trappa[i - 1].v) {
          fel.push(`"${trappa[i].rubrik}" (${trappa[i].namn}) ligger EFTER "${trappa[i - 1].rubrik}" (${trappa[i - 1].namn})`);
        }
      }
      assert.deepEqual(fel, [], `${nyckel} har grupper i fel ordning:\n  - ${fel.join('\n  - ')}\n  panelen: ${rubriker.join(' → ')}`);

      // Verktygsgruppen gäller scenen, inte widgeten, och ska alltid ligga sist av grupperna.
      const preset = rubriker.findIndex(r => /PRESET\s*&\s*PRESTANDA/i.test(r));
      if (preset >= 0) {
        assert.equal(preset, rubriker.length - 1,
          `${nyckel}: "PRESET & PRESTANDA" ligger på plats ${preset + 1} av ${rubriker.length}, inte sist`);
      }

      // "TA BORT" LIGGER NEDERST. Sorteringen flyttar noder, och första försöket flyttade grupperna
      // med append() utan att ta hänsyn till panelens lösa element — då sköts den röda raderaknappen
      // upp till toppen, precis där handen är på väg när man byter inställning. Rubrik, märke och
      // flikrad hör överst; radera och åtgärdsraden hör sist.
      const plats = await page.evaluate(() => {
        const p = document.querySelector('.properties');
        const barn = [...p.children];
        const svans = barn.filter(el => el.matches('.property-actions, .delete, .delete-at-bottom'));
        const sistaGruppen = barn.map(el => el.classList.contains('property-group')).lastIndexOf(true);
        const forstaGruppen = barn.findIndex(el => el.classList.contains('property-group'));
        return {
          svansFore: svans.some(el => barn.indexOf(el) < sistaGruppen),
          etiketter: svans.map(el => (el.textContent || '').trim().slice(0, 20)),
          huvudEfter: barn.slice(forstaGruppen).some(el =>
            el.matches('.panel-title, .template-badge, .ws-tabs')),
        };
      });
      assert.equal(plats.svansFore, false,
        `${nyckel}: "${plats.etiketter.join('", "')}" ligger bland grupperna i stället för nederst`);
      assert.equal(plats.huvudEfter, false,
        `${nyckel}: rubrik, märke eller flikrad hamnade nedanför en grupp`);
    } finally {
      await page.close();
    }
  });
}
