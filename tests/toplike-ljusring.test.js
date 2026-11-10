'use strict';
// TOP LIKE · NEONRAMAR (toplike-ljusring.js, skin 'ljusring'). Byggd med David på lekplatsen 2026-11-10 och
// flyttad hit "som den är". Provet vaktar det som gör designen till en Top Like och inte bara en bild:
//   * datalagret har exakt de byggstenar livedatan skriver i (strong, small, em med <i> först, ett foto),
//   * det synliga lagret följer datalagret — namn, antal, foto och dolda rader — och spelar omkörningen,
//   * kedjans öppningstagg står kvar (dold widget, position), och panelen har en egen post,
//   * alla 21 ramar och 12 fyrkantiga modeller har sina bilder och mått.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);
const ROT = path.join(__dirname, '..');

let harness = null;
function rigg() {
  if (harness) return harness;
  const h = createDom({ state: { widgets: [], projectName: 'toplike-ljusring' } });
  for (const f of ['overlay-sanitize.js', 'toplike-design.js', 'topcoins-v2.js', 'toppoints-v2.js', 'toplike-studio.js', 'ranking-sixpack.js', 'toplike-ljusring-panel.js', 'toplike-ljusring.js']) h.load(f);
  h.window.dispatchEvent(new h.window.Event('load'));
  harness = h;
  return h;
}
const W = (extra = {}) => ({ id: 'tln-1', type: 'templateTopLike', x: 10, y: 20, width: 350, likeCount: 3, skin: 'ljusring', showTitle: true, templateTitle: 'TOP LIKE', ...extra });
function nod(w) {
  const h = rigg();
  const host = h.document.createElement('div');
  h.document.body.append(host);
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls');
  return el;
}

test('skin ljusring ritas av Neonramar, utan Voltages klasser, med kedjans öppningstagg kvar', () => {
  const el = nod(W());
  assert.ok(el.classList.contains('tln') && el.classList.contains('vyra-toplike'), el.className);
  assert.ok(![...el.classList].some(k => /^(rk6|like-|skin-)/.test(k)), 'Voltages/Top Likes designklasser ska bort: ' + el.className);
  assert.equal(el.dataset.id, 'tln-1');
  assert.match(el.getAttribute('style'), /left:10px/);
  assert.ok(el.querySelector(':scope > .tl .tl-rubrik'), 'rubriken saknas');
  const dold = nod(W({ hidden: true }));
  assert.match(dold.getAttribute('style') + ' ' + dold.className, /display:\s*none|widget-hidden/, 'en dold widget ska vara dold även i den här designen');
});

test('datalagret har livedatans byggstenar: strong, small, em med <i> först och exakt ett foto per rad', () => {
  const rader = [...nod(W({ likeCount: 5 })).querySelectorAll(':scope > .tln-data > .toplike-row')];
  assert.equal(rader.length, 5);
  for (const r of rader) {
    assert.ok(r.querySelector('strong') && r.querySelector('small'), 'namn och handtag saknas');
    const em = r.querySelector('em');
    assert.equal(em.firstElementChild && em.firstElementChild.tagName, 'I', 'utan <i> först skriver skrivTal() "0 110" i stället för "110"');
    assert.equal(r.querySelectorAll('img:not(.pro-frame-art)').length, 1, 'livedatan tar radens första <img> som foto');
  }
  const syns = nod(W()).querySelectorAll(':scope > .tl img:not(.pro-frame-art):not(.tln-foto)');
  assert.equal(syns.length, 0, 'ramarnas bilder i det synliga lagret ska vara märkta pro-frame-art');
});

test('det synliga lagret följer datalagret: namn, antal, foto och dolda rader', () => {
  const h = rigg(), el = nod(W());
  const rader = el.querySelectorAll('.tln-data .toplike-row');
  rader[0].querySelector('strong').textContent = 'Anna';
  const em = rader[0].querySelector('em'); em.lastChild.nodeValue = ' 1 840';
  rader[0].querySelector('img').setAttribute('src', 'https://p16.tiktokcdn.com/anna.jpg');
  rader[2].style.setProperty('display', 'none', 'important');
  h.window.VyraTopLikeLjusring.synka(el, false);
  const p = el.querySelectorAll('.tl-plats');
  assert.equal(p[0].querySelector('.tl-namn').textContent, 'Anna');
  assert.equal(p[0].querySelector('.tl-antal').textContent, '1 840');
  assert.equal(p[0].querySelector('.tln-foto').getAttribute('src'), 'https://p16.tiktokcdn.com/anna.jpg');
  assert.equal(p[2].style.display, 'none', 'en rad utan person ska döljas även i det synliga lagret');
});

test('omkörningen syns: pil på den som klättrar och banderoll när ettan byts', () => {
  const h = rigg(), el = nod(W());
  const rader = el.querySelectorAll('.tln-data .toplike-row');
  const satt = namn => namn.forEach((n, i) => { rader[i].querySelector('strong').textContent = n; });
  satt(['Anna', 'Bo', 'Cia']); h.window.VyraTopLikeLjusring.synka(el, true);
  satt(['Cia', 'Anna', 'Bo']); h.window.VyraTopLikeLjusring.synka(el, true);
  const pil = el.querySelector('.tl-plats.p1 .tl-pil');
  assert.ok(pil, 'den som klättrade till ettan ska få en pil');
  assert.equal(pil.textContent, '▲ 2');
  assert.match(el.querySelector('.tl-banderoll').textContent, /NY ETTA!\s*Cia/);
});

test('panelens val styr utseendet: läge, ram, form, namnstil, glans, lutning och visa-rutorna', () => {
  const el = nod(W({ tlnLage: 'hoger', tlnRam: 'guld', tlnForm: 'fyrkant', tlnFyr: 'kristall', tlnNamnstil: '3d', tlnGlans: 'svep', tlnLut: 30, showRank: false }));
  const tl = el.querySelector(':scope > .tl');
  for (const k of ['lage-hoger', 'form-fyrkant', 'fyr-kristall', 'namnstil-3d', 'glans-svep', 'utan-plats']) assert.ok(tl.classList.contains(k), 'saknar ' + k);
  assert.match(tl.getAttribute('style'), /--tl-farg:#ffae1a/);
  assert.match(tl.getAttribute('style'), /--tl-lut:-30deg/, 'höger sida speglar lutningen in mot mitten');
  const okant = nod(W({ tlnLage: 'finns-inte', tlnRam: '<script>' })).querySelector(':scope > .tl');
  assert.ok(okant.classList.contains('lage-pall') && /--tl-farg:#3d7bff/.test(okant.getAttribute('style')), 'okända värden faller tillbaka på standard');
});

test('alla 21 ramar har sina bilder och ringband, och alla 12 fyrkantiga modeller har CSS', () => {
  const T = rigg().window.VyraTopLikeLjusring;
  assert.equal(Object.keys(T.RAMAR).length, 21);
  for (const [k, r] of Object.entries(T.RAMAR)) {
    assert.ok(r.band[0] > .3 && r.band[0] < r.band[1] && r.band[1] < 1, k + ': ringbandet');
    if (r.kod) continue;
    for (const del of ['', '-ring', '-golv']) assert.ok(fs.existsSync(path.join(ROT, 'assets/images/toplike-ljusring', `ram-${r.n}${del}.png`)), `${k}: ram-${r.n}${del}.png saknas`);
  }
  const css = fs.readFileSync(path.join(ROT, 'toplike-ljusring.css'), 'utf8');
  for (const m of Object.keys(T.FYRMODELLER)) if (m !== 'neon') assert.ok(css.includes('.fyr-' + m), 'CSS saknas för fyrkantig modell ' + m);
  assert.doesNotMatch(css, /@keyframes tl-/, 'animationerna ska heta tln-… så att de inte krockar');
});

test('fabriken: catalog:toplike:ljusring ger Neonramar med rubrik och topp 3 på pall', () => {
  const h = rigg();
  const w = h.window.VyraWidgets.create('catalog:toplike:ljusring');
  assert.equal(w.skin, 'ljusring');
  assert.equal(w.showTitle, true);
  assert.equal(w.likeCount, 3);
  assert.equal(w.tlnLage, 'pall');
});

test('studio.html laddar Neonramar efter ranking-sixpack.js', () => {
  const html = fs.readFileSync(path.join(ROT, 'studio.html'), 'utf8');
  const a = html.indexOf('ranking-sixpack.js?v='), b = html.indexOf('toplike-ljusring.js?v=');
  assert.ok(a > 0 && b > a, 'toplike-ljusring.js ska laddas efter ranking-sixpack.js (wh-omslaget ligger ytterst)');
  assert.ok(html.includes('toplike-ljusring.css?v='));
});
