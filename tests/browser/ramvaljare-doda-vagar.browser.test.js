'use strict';
// Ramväljarens döda vägar — kontraktet EFTER städningen, skrivet RÖTT FÖRST.
//
// LÄGET FÖRE: pickern är tre generationer kod staplade på varandra i samma synkrona bind()-pass.
// media.js:311/322 bygger 10 swatchar + ett dolt select, profile-frames-premium.js skriver över
// alltihop med sina 10 "Signature"-ramar, och toplike-studio.js skriver över IGEN med den riktiga
// 53-ramspickern. Bara den sista överlever — de två första är döda leveranser som ändå kostar
// nätverksanrop och underhåll.
//
// TVÅ AV PROVEN ÄR RÖDA I DAG, MED FLIT:
//
//   * "dubbel-bind kapar inte" — premiumProfileFramesBind vaktar INTE på widgettyp. Vid bind()
//     utan render (exakt vad rebind-lyssnaren media.js:781 gör efter varje sen skriptladdning)
//     hittar den Gift/Alert-familjens picker — gafBind:s .gaf-frame-group-vakt hoppar över
//     ombygge, wsFramesBind släpper icke-ranking-typer — och KAPAR den: användaren ser 10
//     Signature-ramar i stället för 53-ramspickern. Latent produktionsbugg, inte bara död kod.
//
//   * "inget select-element" — det dolda #proTopLikeFrame (display:none!important i
//     toplike-studio.css) har ingen onchange i någon generation och refereras av inga prov.
//     Klassisk §8-fälla: DOM-existens är inte användarsynlighet. Det enda det GÖR är att agera
//     dedupe-vakt åt media.js:311/322 — därför byts vakten till '.pro-frame-picker' i samma
//     commit som selectet raderas.
//
// DE TVÅ ANDRA ÄR GRÖNA ANKARE som ska FÖRBLI gröna genom städningen:
//
//   * gamla Profilram-dropdownen (#profileFrame) finns inte i DOM — i dag för att media.js:303
//     raderar den i samma pass som 158/159 bygger den; efter städningen för att ingen bygger den.
//   * ett swatch-klick når save()-tratten och rendern bär .pro-avatar-frame — den BÄRANDE kedjan
//     301/302/310 + FRAME_FILES (bevisad av 0aab59d) får inte gå sönder.
//     Mutationsprovad under utvecklingen: markören 'profile-frame frame-none' bruten avsiktligt
//     i 301 → provet föll; återställd → grönt.
//
// VARFÖR RIKTIG WEBBLÄSARE: display:none-bevis och de dynamiskt injicerade pickerfilerna
// (media.js laddar dem async) finns inte i jsdom — riggen där svarar 0 på all layout och saknar
// skriptens kapplöpning. §7: proven går via bind()/render()/riktiga klick, aldrig via
// pickerfunktionerna direkt.
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

// `?open=layout` går direkt till editorn. 2500 ms låter de dynamiskt injicerade pickerfilerna
// (profile-frames-premium/toplike-studio/gift-alert-frames) hinna ladda — samma väntan som
// widget-handtag-riggen mätte fram.
async function editorMedWidget(katalognyckel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // §7-fixturen: utan projicerad session svarar writeActive 'not-writable' och save() biter
  // aldrig i localStorage — provet hade då "bevisat" ett fel som inte finns. Projektionen
  // svappar in sitt state asynkront, så den måste få landa INNAN seedningen — annars äter
  // den upp den seedade widgeten och klickets skrivning hamnar i ett föräldralöst objekt.
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  const id = await page.evaluate(nyckel => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(nyckel);
    w.x = 60; w.y = 90;
    state.widgets.push(w);
    selected = w.id;
    render();
    return w.id;
  }, katalognyckel);
  await page.waitForTimeout(600);
  return { page, id };
}

// ---- RÖTT I DAG · kapningen -------------------------------------------------------------------

test('dubbel-bind utan render kapar inte gift-widgetens ramväljare', { skip }, async () => {
  // Top Gift hör till Gift/Alert-familjen: dess picker byggs av gafBind, inte av wsFramesBind.
  const { page } = await editorMedWidget('catalog:topgift');

  const fore = await page.evaluate(() => ({
    ws: document.querySelectorAll('.gaf-frame-group [data-ws-frame]').length,
    pro: document.querySelectorAll('.gaf-frame-group [data-pro-frame]').length,
  }));
  assert.ok(fore.ws > 20, `väntade ramrutnätet (en kollektion + Ingen) efter render, fick ${fore.ws} ws-swatchar`);
  assert.equal(fore.pro, 0, 'Signature-markup i pickern redan efter render');

  // Rebind-lyssnaren (media.js:781) gör exakt detta vid varje sen skriptladdning: bind() utan
  // render. Två anrop täcker även att första ombindningen inte förändrar förutsättningarna.
  await page.evaluate(() => { bind(); bind(); });
  await page.waitForTimeout(200);

  const efter = await page.evaluate(() => ({
    ws: document.querySelectorAll('.gaf-frame-group [data-ws-frame]').length,
    pro: document.querySelectorAll('.gaf-frame-group [data-pro-frame]').length,
    rubrik: document.querySelector('.gaf-frame-group .pro-frame-picker>span')?.textContent || '',
  }));
  await page.close();
  assert.equal(efter.pro, 0,
    `pickern kapades av premium-bindaren: ${efter.pro} data-pro-frame-knappar, rubrik "${efter.rubrik}"`);
  assert.ok(efter.ws > 20,
    `53-ramspickern överlevde inte ombindningen: ${efter.ws} ws-swatchar kvar`);
});

// ---- RÖTT I DAG · det dolda selectet ----------------------------------------------------------

test('ramväljaren bär inget select-element — valet är swatcharna', { skip }, async () => {
  // Top Like: wsFramesBind-vägen.
  const topLike = await editorMedWidget('catalog:toplike:clean');
  const iToplike = await topLike.page.evaluate(() => ({
    select: !!document.querySelector('.properties .pro-frame-picker select'),
    gammaltId: !!document.querySelector('#proTopLikeFrame'),
    swatchar: document.querySelectorAll('.properties .pro-frame-picker [data-ws-frame]').length,
  }));
  await topLike.page.close();
  assert.ok(iToplike.swatchar > 20, `ramrutnätet saknas för Top Like (${iToplike.swatchar} swatchar)`);
  assert.equal(iToplike.select, false, 'ett select-element ligger kvar i Top Likes picker — dött och dolt sedan toplike-studio.css:30');
  assert.equal(iToplike.gammaltId, false, '#proTopLikeFrame finns kvar i DOM');

  // Gift/Alert-familjen: gafBind-vägen (samma byggare, samma döda select).
  const gift = await editorMedWidget('catalog:topgift');
  const iGift = await gift.page.evaluate(() => ({
    select: !!document.querySelector('.gaf-frame-group select'),
  }));
  await gift.page.close();
  assert.equal(iGift.select, false, 'ett select-element ligger kvar i gift-familjens picker');
});

// ---- GRÖNA ANKARE — ska förbli gröna genom hela städningen ------------------------------------

test('§8-vakt: den gamla Profilram-dropdownen finns inte i DOM', { skip }, async () => {
  const { page } = await editorMedWidget('catalog:topgift');
  const finns = await page.evaluate(() => ({
    dropdown: !!document.querySelector('#profileFrame'),
    pickerLabel: !!document.querySelector('.profile-frame-picker'),
  }));
  await page.close();
  assert.equal(finns.dropdown, false, 'den gamla #profileFrame-dropdownen har återuppstått');
  assert.equal(finns.pickerLabel, false, 'den gamla .profile-frame-picker-labeln har återuppstått');
});

test('ramval via swatch når save-tratten och rendern bär .pro-avatar-frame', { skip }, async () => {
  // Tre vägar genom samma bärande kedja: Top Like (wsFramesBind), Top Coins (typ-spoofen via
  // extraRankingWh) och Top Gift (gafWh:s ankare). Klicket är ett riktigt klick på swatchen.
  for (const nyckel of ['catalog:toplike:clean', 'catalog:ranking:templateTopCoins:gold', 'catalog:topgift']) {
    const { page, id } = await editorMedWidget(nyckel);
    const vald = await page.evaluate(wid => {
      const swatch = [...document.querySelectorAll('[data-ws-frame]')]
        .find(b => b.dataset.wsFrame !== 'none' && !b.classList.contains('placeholder'));
      if (!swatch) return { fel: 'ingen swatch att klicka på' };
      const ram = swatch.dataset.wsFrame;
      swatch.click();
      return { ram };
    }, id);
    assert.ok(!vald.fel, `${nyckel}: ${vald.fel}`);
    await page.waitForTimeout(400);
    const resultat = await page.evaluate(wid => ({
      iState: state.widgets.find(x => x.id === wid)?.profileFrame,
      sparat: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || [])
        .find(x => x.id === wid)?.profileFrame,
      ramINoden: !!document.querySelector('.canvas .pro-avatar-frame'),
      ramBild: document.querySelector('.canvas .pro-avatar-frame img.pro-frame-art')?.getAttribute('src') || '',
    }), id);
    await page.close();
    assert.equal(resultat.iState, vald.ram, `${nyckel}: klicket skrev inte w.profileFrame`);
    assert.equal(resultat.sparat, vald.ram, `${nyckel}: valet gick inte genom save()-tratten till localStorage`);
    assert.ok(resultat.ramINoden, `${nyckel}: rendern bär ingen .pro-avatar-frame`);
    assert.match(resultat.ramBild, /profile-frames\//, `${nyckel}: ramkonsten pekar fel: "${resultat.ramBild}"`);
  }
});
