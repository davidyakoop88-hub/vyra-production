'use strict';
// KOI-PAKETETS FORHANDSVISNING AR INTE SVART.
//
// Granskning 2026-10-17 F07: ▶ Förhandsvisa pa Koi Pearl Lagoon oppnade en stor svart yta som
// forblev svart. Uppmatt 2026-10-20: paketwidgeten (media.js battlePaketHtml) vilar slackt —
// visibility:hidden tills den ar vald i editorn eller ett klipp spelar — och affischen
// (.pack-fx-poster) visas bara nar ett spelande klipp har fastnat. I Overlay-vyns previewyta ar
// widgeten varken vald eller spelande, sa ytan var bara bakgrund. Koi Pearl ar dessutom H.264-MP4,
// som inte alla webblasare kan avkoda.
//
// Kravet: previewytan visar paketets affisch direkt, spelar klippet ovanpa nar det gar, och star
// kvar pa affischen nar videon inte kan avkodas. Paketet i layouten/sandningen ror vi inte: dar
// vilar det slackt som forut.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function overlayKatalog(page) {
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession();
    let forra = -1, n = 0;
    for (let t = 0; t < 40; t++) {
      go('overlay'); await new Promise(r => setTimeout(r, 250));
      n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
      if (n > 100 && n === forra) break; forra = n;
    }
  });
}
async function forhandsvisaKoi(page) {
  const ok = await page.evaluate(() => {
    const kort = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')]
      .find(b => !b.closest('.owg-thumb') && /Koi Pearl Lagoon · hela paketet/.test(b.textContent));
    const p = kort && kort.querySelector('.owg-preview');
    if (!p) return false;
    p.click();
    return true;
  });
  assert.ok(ok, 'provet mater inget: Koi Pearl-paketets Förhandsvisa finns inte');
}
// Syns NAGOT av paketet i ytan: affischbilden laddad och synlig, eller en video som visar en ruta.
const matYta = () => {
  const nod = document.querySelector('.overlay-live-preview-stage .battle-pack-full');
  if (!nod) return { nod: false };
  const cs = getComputedStyle(nod), r = nod.getBoundingClientRect();
  const bild = nod.querySelector('img.pack-fx-poster'), v = nod.querySelector('video.pack-fx-video');
  const bildSyns = !!bild && getComputedStyle(bild).display !== 'none' && bild.complete && bild.naturalWidth > 0 && bild.getBoundingClientRect().height > 0;
  const videoSyns = !!v && getComputedStyle(v).visibility === 'visible' && v.readyState >= 2 && !v.error && v.currentTime > 0;
  return { nod: true, synlig: cs.visibility === 'visible' && Number(cs.opacity) > 0 && r.height > 0, bildSyns, videoSyns, fel: v && v.error ? v.error.code : null };
};

test('Koi-paketets preview visar affischen eller klippet, aldrig en svart yta', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
    await overlayKatalog(page);
    await forhandsvisaKoi(page);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(matYta);
    assert.ok(m.nod, 'paketet ritades inte i previewytan');
    assert.ok(m.synlig, 'paketwidgeten ar osynlig i previewytan (visibility/opacity)');
    assert.ok(m.bildSyns || m.videoSyns, 'varken affisch eller videoruta syns: ' + JSON.stringify(m));
  } finally { await page.close(); }
});

test('nar videon inte kan avkodas star affischen kvar', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
    // Samma fil, men bytes ingen avkodare forstar — som H.264 i en webblasare utan codec.
    await page.route('**/*.mp4', r => r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('inte en video') }));
    await overlayKatalog(page);
    await forhandsvisaKoi(page);
    await page.waitForFunction(() => {
      const v = document.querySelector('.overlay-live-preview-stage video.pack-fx-video');
      return v && v.error;
    }, null, { timeout: 15000, polling: 100 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(matYta);
    assert.ok(m.fel, 'provet mater inget: videon gick att avkoda');
    assert.ok(m.synlig, 'paketwidgeten ar osynlig i previewytan');
    assert.ok(m.bildSyns, 'affischen syns inte nar videon inte kan avkodas: ' + JSON.stringify(m));
  } finally { await page.close(); }
});

test('paketet pa duken vilar slackt som forut', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
    await overlayKatalog(page);
    await forhandsvisaKoi(page);
    await page.waitForTimeout(500);
    // Samma widget pa den riktiga duken, ovald och utan klipp: osynlig, ingen affisch, inget autoplay.
    const m = await page.evaluate(async () => {
      const w = window.VyraWidgets.create('catalog:glovesnipe:koiPearl:pack:2');
      state.widgets.push(w); selected = null; go('editor');
      await new Promise(r => setTimeout(r, 500));
      const nod = document.querySelector(`.canvas .battle-pack-full[data-id="${w.id}"]`);
      const ut = nod && { vis: getComputedStyle(nod).visibility, klass: nod.className, autoplay: nod.querySelector('video').autoplay };
      state.widgets = state.widgets.filter(x => x.id !== w.id);
      return ut;
    });
    assert.ok(m, 'paketet ritades inte pa duken');
    assert.equal(m.vis, 'hidden');
    assert.ok(!/pack-stilla|pack-active|pack-preview/.test(m.klass), 'previewns klasser lackte till duken: ' + m.klass);
    assert.equal(m.autoplay, false);
  } finally { await page.close(); }
});
