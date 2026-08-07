'use strict';
// GIFT CAMPAIGN ska rendera fritt — och editorn ska visa samma sak som tittaren far.
//
// Matt i RIKTIG Chrome. Fragan ar en ren kaskadfraga: `html.overlay-output .widget` vager (0,2,1)
// och slar varje `.vyra-campaign.campaign-*` som vager (0,2,0). `!important` star pa bada sidor och
// tar ut sig sjalv, sa vikten avgor. jsdom har ingen kaskad och kan inte stalla fragan alls.
//
// UPPMATT LAGE FORE FIXEN
//
//   i sandningen   alla 8 designer ramfria — overlay-regeln vinner redan
//   i editorn      neon 1px, glass 1px, aurora 1px, retro 3px dashed, goldrush 2px double
//
// Editorn visade alltsa en ram som tittaren aldrig ser. Det ar inte ett kosmetiskt problem: man
// designar mot en forhandsvisning som ljuger om resultatet.
//
// VAD SOM PROVAS
//
//   1. Regressionsvakt — alla 8 forblir ramfria i overlay
//   2. WYSIWYG — ingen design ramar in sig sjalv i editorn heller
//   3. Editorn har kvar EN neutral markering sa widgeten gar att se och dra
//   4. Kaskaden ar stadad — premium-final.css aterinfor inte det studio.css nollstaller
//
// ROTT NU: 2 och 4. 1 och 3 ar vaktar och ska vara grona bade fore och efter.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

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

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Katalogen lases ur media.js i stallet for att handskrivas — en handskriven lista slutar stamma
// den dag nagon lagger till en design, och da blir testet tyst gront for just den.
function designer() {
  const src = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const start = src.indexOf('<select id="campaignTheme">');
  assert.ok(start > 0, 'hittade inte designmenyn i media.js');
  const block = src.slice(start, start + src.slice(start).indexOf('</select>'));
  const lista = [...block.matchAll(/value="([a-z-]+)"/g)].map(m => m[1]);
  assert.ok(lista.length >= 8, `forvantade minst 8 designer, hittade ${lista.length}`);
  return lista;
}

// Widgetarna byggs syntetiskt: vi mater KASKADEN, och da ar markupen inte det intressanta.
// Klassen bar bade tema och orientering med samma prefix (campaign-neon campaign-landscape),
// precis som campaignHtml() i media.js bygger den.
async function mat(overlaylage) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.styleSheets.length > 5, null, { timeout: 20000 });
  const ut = await page.evaluate(([lista, overlay]) => {
    document.documentElement.classList.toggle('overlay-output', overlay);
    const host = document.createElement('div');
    host.innerHTML = lista.map(d =>
      `<div class="widget vyra-campaign campaign-${d} campaign-landscape" data-d="${d}" style="--campaign:#ff3ea5"></div>`).join('');
    document.body.append(host);
    const rad = d => {
      const cs = getComputedStyle(host.querySelector(`[data-d="${d}"]`));
      const bredder = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width']));
      return {
        design: d,
        bredd: Math.max(...bredder),
        stil: cs.borderTopStyle,
        farg: cs.borderTopColor,
        skugga: cs.boxShadow,
        bakgrund: cs.backgroundImage !== 'none' ? 'gradient' : cs.backgroundColor
      };
    };
    const svar = lista.map(rad);
    host.remove();
    return svar;
  }, [designer(), overlaylage]);
  await page.close();
  return ut;
}

// ---- 1. Regressionsvakt: sandningen ------------------------------------------------------------

test('alla designer är ramfria i sändningen', { skip }, async () => {
  const rader = await mat(true);
  const medRam = rader.filter(r => r.bredd > 0 || r.skugga !== 'none');
  assert.deepEqual(medRam.map(r => r.design), [],
    `ram eller skugga läckte ut i overlay: ${medRam.map(r => `${r.design} (${r.bredd}px ${r.stil})`).join(', ')}`);
});

// ---- 2. WYSIWYG: ingen design ramar in sig sjalv i editorn --------------------------------------

test('ingen design ritar sin egen ram i editorn', { skip }, async () => {
  const rader = await mat(false);
  // Kravet ar inte "noll ram" — editorn far ha EN neutral markering (test 3). Kravet ar att ingen
  // design skiljer ut sig med sin egen: da ar det designens ram, och den syns aldrig i sandningen.
  const unika = [...new Set(rader.map(r => `${r.bredd}|${r.stil}|${r.farg}|${r.skugga}`))];
  assert.equal(unika.length, 1,
    'designerna ritar olika ramar i editorn — dessa syns aldrig hos tittaren:\n' +
    rader.map(r => `  ${r.design}: ${r.bredd}px ${r.stil} ${r.farg}`).join('\n'));
});

// ---- 3. Editorn maste ga att greppa ------------------------------------------------------------

test('editorn har kvar en synlig markering att klicka och dra i', { skip }, async () => {
  const rader = await mat(false);
  const osynliga = rader.filter(r => r.bredd === 0 && r.skugga === 'none'
    && (r.bakgrund === 'rgba(0, 0, 0, 0)' || r.bakgrund === 'transparent'));
  assert.deepEqual(osynliga.map(r => r.design), [],
    'widgeten har varken ram, skugga eller bakgrund i editorn — då finns inget att se eller greppa');
});

// ---- 5. Overtagna kontrakt fran tva kallkodsskanningar ------------------------------------------
//
// Dessa tva prov fanns forut som strangsokningar:
//
//   catalog-truth.test.js          letade efter `.vyra-campaign{…backdrop-filter:none!important…}`
//                                  och kravde att `glass` inte listades dar
//   crystal-garden-campaign.test.js letade efter den bokstavliga strangen `background:transparent`
//
// Bada forankrade en MEKANISM, inte ett utfall. Nar mekanismen togs bort foll de — trots att det de
// skyddade fortfarande holl. En strangsokning kan inte se en kaskad: den vet inte om regeln vann.
// Har mats i stallet det som faktiskt betyder nagot for tittaren.

test('sändningen har transparent bakgrund, och glass behåller sin identitet i editorn', { skip }, async () => {
  const iSandningen = await mat(true);
  const opaka = iSandningen.filter(r => r.bakgrund !== 'rgba(0, 0, 0, 0)' && r.bakgrund !== 'transparent');
  assert.deepEqual(opaka.map(r => r.design), [],
    `dessa ritar en solid ruta över sändningen: ${opaka.map(r => `${r.design} (${r.bakgrund})`).join(', ')}`);

  // Andra halvan av det gamla kontraktet: den ramlosa stadningen far inte slacka glasets panel.
  const glassIEditorn = (await mat(false)).find(r => r.design === 'glass');
  assert.equal(glassIEditorn.bakgrund, 'gradient',
    'glass tappade sin gradient — da har stadningen tagit designens identitet, inte bara ramen');
});

test('crystal-garden är transparent i sändningen', { skip }, async () => {
  const rad = (await mat(true)).find(r => r.design === 'crystal-garden');
  assert.ok(rad, 'crystal-garden finns inte i designkatalogen langre');
  assert.ok(rad.bakgrund === 'rgba(0, 0, 0, 0)' || rad.bakgrund === 'transparent',
    `en opak bakgrund blir en solid ruta over sandningen i OBS — matt: ${rad.bakgrund}`);
});

// ---- 4. Kaskaden ar stadad ---------------------------------------------------------------------

test('premium-final.css återinför inte ramar som studio.css nollställer', { skip: false }, () => {
  const css = fs.readFileSync(path.join(ROOT, 'premium-final.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const brott = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    // Bara WRAPPERN. Barn (t.ex. glassets egna gavokort) ar innehall och ska sta kvar.
    if (!/^\.vyra-campaign[.a-z-]*$/.test(sel)) continue;
    if (/(^|;)\s*(border(?!-radius)[a-z-]*|box-shadow)\s*:/.test(m[2])) brott.push(sel);
  }
  assert.deepEqual(brott, [],
    `dessa regler ger tillbaka en ram som studio.css just tagit bort: ${brott.join(', ')}`);
});
