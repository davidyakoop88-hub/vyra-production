'use strict';
// Scenbakgrunden i riktig Chrome — det jsdom fysiskt inte kan bevisa.
//
// Transparensen är den enda katastrofrisken: html/body/.canvas i overlay-output ska vara
// rgba(0,0,0,0) UTAN fältet (default-kontraktet) och FÖRBLI det MED fältet — bakgrunden är en
// egen nod bakom allt, aldrig en målning på de strippade elementen. Mutationsprovet är inbyggt:
// samma sida mäts med fältet satt och efter att det tagits bort.
//
// §7: staten går in via localStorage + riktig sidladdning (overlay-booten) respektive riktiga
// klick i editorkontrollen + save-tratten — aldrig via målarfunktionen direkt.
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

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function overlaySida(stateEllerNull) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // In i overlayn samma väg som en riktig layout: localStorage + full omladdning (overlay-booten
  // läser staten själv). Ingen testgenväg genom målarfunktionen.
  await page.evaluate(s => {
    if (s === null) localStorage.removeItem('vyra-state');
    else localStorage.setItem('vyra-state', JSON.stringify(s));
  }, stateEllerNull);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // Desktopappens riktiga väg in i overlayn utan konto: lokal projektion (vyra-auth-local →
  // projectLocalSession). Token-vägen kräver en server och bevisas av overlay-access-sviten.
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(700);
  return page;
}

const matning = page => page.evaluate(() => {
  const cs = el => el ? getComputedStyle(el).backgroundColor : 'saknas';
  const nod = document.querySelector('.vyra-scenbakgrund');
  return {
    html: cs(document.documentElement), body: cs(document.body),
    canvas: cs(document.querySelector('.canvas')),
    nod: !!nod, nodFarg: nod ? getComputedStyle(nod).backgroundColor : null,
    nodIView: nod ? document.getElementById('view')?.contains(nod) ?? false : false,
  };
});

test('utan fältet: transparent rakt igenom och ingen nod', { skip }, async () => {
  const page = await overlaySida({ widgets: [] });
  const m = await matning(page);
  await page.close();
  assert.equal(m.nod, false, 'en bakgrundsnod monterades utan att layouten bett om någon');
  for (const yta of ['html', 'body', 'canvas']) {
    assert.equal(m[yta], TRANSPARENT, `${yta} är inte transparent i overlay-output`);
  }
});

test('med färgfältet: noden bär färgen — de strippade ytorna förblir transparenta', { skip }, async () => {
  const page = await overlaySida({ widgets: [], stageBackground: { mode: 'color', value: '#ff0044' } });
  const m = await matning(page);
  assert.equal(m.nod, true, 'ingen bakgrundsnod trots giltigt färgfält');
  assert.equal(m.nodFarg, 'rgb(255, 0, 68)', 'noden bär inte layoutens färg');
  assert.equal(m.nodIView, false, 'noden bor i #view — render() river den');
  for (const yta of ['html', 'body', 'canvas']) {
    assert.equal(m[yta], TRANSPARENT, `${yta} målades — bakgrunden ska vara en egen nod, inget annat`);
  }
  // Mutationsprovet: ta bort fältet, ladda om, och bevisa att allt återgår till frånvaro.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vyra-state'));
    delete s.stageBackground;
    localStorage.setItem('vyra-state', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(700);
  const efter = await matning(page);
  await page.close();
  assert.equal(efter.nod, false, 'noden står kvar efter att fältet togs bort');
  assert.equal(efter.html, TRANSPARENT, 'transparensen kom inte tillbaka');
});

test('noden överlever render() i sändningsläget med samma DOM-referens', { skip }, async () => {
  const page = await overlaySida({ widgets: [], stageBackground: { mode: 'color', value: '#102030' } });
  const overlevde = await page.evaluate(async () => {
    const fore = document.querySelector('.vyra-scenbakgrund');
    if (!fore) return { fel: 'ingen nod före render' };
    fore.dataset.provmarkering = 'samma-nod';
    render();
    await new Promise(r => setTimeout(r, 300));
    const efter = document.querySelector('.vyra-scenbakgrund');
    return { fel: null, kvar: !!efter, samma: efter?.dataset.provmarkering === 'samma-nod' };
  });
  await page.close();
  assert.equal(overlevde.fel, null, overlevde.fel || '');
  assert.ok(overlevde.kvar, 'noden försvann vid render');
  assert.ok(overlevde.samma, 'noden byttes ut vid render — en video hade startat om i sändning');
});

test('editorkontrollen: synlig knapp, riktiga klick, save-tratten och förhandsvisningen', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // §7-fixturen: utan projicerad session svarar writeActive not-writable och save() biter aldrig.
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);

  const knapp = await page.evaluate(() => {
    const k = document.querySelector('.scenbakgrund-kontroll .sb-oppna');
    // §8: synlig, inte bara i DOM.
    return { finns: !!k, synlig: !!k && k.offsetParent !== null };
  });
  assert.ok(knapp.finns, 'Bakgrund-knappen saknas i verktygsraden');
  assert.ok(knapp.synlig, 'Bakgrund-knappen finns men syns inte (§8)');

  const resultat = await page.evaluate(async () => {
    document.querySelector('.scenbakgrund-kontroll .sb-oppna').click();
    const lage = document.querySelector('.scenbakgrund-kontroll .sb-lage');
    lage.value = 'color';
    lage.dispatchEvent(new Event('change'));
    const farg = document.querySelector('.scenbakgrund-kontroll .sb-farg');
    farg.value = '#ff0044';
    document.querySelector('.scenbakgrund-kontroll .sb-anvand').click();
    await new Promise(r => setTimeout(r, 400));
    const sparat = JSON.parse(localStorage.getItem('vyra-state') || '{}').stageBackground;
    const forhandsvisning = document.querySelector('.canvas > .vyra-scenbakgrund');
    return { sparat, forhandsvisning: !!forhandsvisning,
      farg: forhandsvisning ? getComputedStyle(forhandsvisning).backgroundColor : null };
  });
  await page.close();
  assert.deepEqual(resultat.sparat, { mode: 'color', value: '#ff0044' },
    'valet gick inte genom save-tratten till localStorage');
  assert.ok(resultat.forhandsvisning, 'ingen förhandsvisningsnod i canvasen');
  assert.equal(resultat.farg, 'rgb(255, 0, 68)', 'förhandsvisningen bär inte färgen');
});
