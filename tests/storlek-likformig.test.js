'use strict';
// INGEN WIDGET I KATALOGEN KAN BLI PLATT, UTDRAGEN ELLER HOPTRYCKT AV ETT HANDTAG (2026-10-18).
//
// Granskningen samma dag: widget-handles.js lat over/under-handtaget skriva w.widgetScaleY
// (0.3-4) och vyra-rotation.js ritade transform:scaleY — oavsett w.aspectLocked. 173 av 173
// katalogmodeller kunde fa skilda X/Y-skalor. Top Like Voltage fick scaleY(0.8) med laset PA;
// Guardian i sandningen scaleY(0.3).
//
// KONTRAKTET SOM PROVAS, for VARJE katalognyckel (samma uppräkning som katalog-inom-duken):
//   * alla atta handtag, med laset pa OCH av, och aven pa en roterad widget
//   * w.widgetScaleY skrivs aldrig, och roten far aldrig en transform med scaleY
//   * fast komposition (allt utom egen text/media): bara w.widgetScale andras — bredd och hojd
//     star kvar, sa X och Y skalas med samma faktor. Motsatt kant/horn star still
//     (rotation: mitten).
//   * egen text/media: riktig bredd/hojd; med las behalls kvoten, utan las andrar sidhandtagen
//     bara sin egen axel.
//
// VARFOR JSDOM OCH INTE WEBBLASAREN HAR: logiken ar densamma for alla 220 nycklar och ska provas
// for alla. Layouten stubbas med Chromes uppmatta zoom-semantik (zoom multiplicerar bade storlek
// och left/top, offsetmatten ar ozoomade — tests/browser/storlek-proportioner.browser.test.js
// mater samma sak i riktig Chrome for Top Like Voltage och Guardian). Draget gar genom de
// RIKTIGA handtagen: pekarhandelser pa elementen som VyraHandtag.synka() satte dit.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness');
const VyraWidgets = require('../widget-factory.js');
const { CONTRACT } = require('./fixtures/catalog-variants.js');
const { kravNycklar } = require('./helpers/katalognycklar.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');

function allaNycklar() {
  const ut = new Map();
  kravNycklar().forEach(k => ut.set(k, undefined));
  CONTRACT.forEach(r => ut.set(r.key, r.values));
  [1, 2, 3, 4].forEach(s => ut.set('catalog:guardianemblem:' + s, undefined));
  Object.keys(VyraWidgets.variants('guardianemblem.model')).forEach(m => ut.set('catalog:guardianemblem:model:' + m, undefined));
  Object.keys(VyraWidgets.variants('lastx.design')).forEach(d => ut.set('catalog:lastx:' + d, undefined));
  Object.keys(VyraWidgets.variants('giftfireworks.motion')).forEach(m => ut.set('catalog:giftfireworks:' + m, undefined));
  ['neon', 'royal', 'glass', 'minimal', 'aurora', 'retro', 'goldrush', 'crystal-garden', 'gold', 'platinum', 'emerald']
    .forEach(t => ['portrait', 'landscape'].forEach(o => ut.set('catalog:giftcampaign:' + t + ':' + o, undefined)));
  return ut;
}

// Kontraktets klassning, skriven har och inte lant ur koden: ett prov som fragar implementationen
// vilken klass en widget har kan inte fanga en felklassning.
const KLASS = w => w.type === 'templateCustomText' ? 'text'
  : ['templateCustomImage', 'templateCustomVideo', 'video'].includes(w.type) ? 'media' : 'fast';

const STANDARD_HOJD = 200;   // en fast komposition utan sparad hojd far en layouthojd i stubben

// Chromes zoom-semantik, uppmatt 2026-10-18 (left 60 vid zoom 1.5 ritas pa 90, offsetWidth 200
// forblir 200): rect = left/top/bredd/hojd ganger zoom; offsetmatten ozoomade.
function stubbaLayout(window) {
  const P = window.HTMLElement.prototype;
  const matt = el => {
    const s = el.style;
    return { z: parseFloat(s.zoom) || 1, b: parseFloat(s.width) || 300, h: parseFloat(s.height) || STANDARD_HOJD,
      x: parseFloat(s.left) || 0, y: parseFloat(s.top) || 0 };
  };
  Object.defineProperty(P, 'offsetWidth', { configurable: true, get() { return this.classList.contains('widget') ? matt(this).b : 10; } });
  Object.defineProperty(P, 'offsetHeight', { configurable: true, get() { return this.classList.contains('widget') ? matt(this).h : 10; } });
  P.getBoundingClientRect = function () {
    if (!this.classList.contains('widget')) return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
    const m = matt(this);
    const left = m.x * m.z, top = m.y * m.z, width = m.b * m.z, height = m.h * m.z;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  };
  P.setPointerCapture = function () {};
}

function rigg() {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-handles.js');
  h.load('vyra-rotation.js');
  stubbaLayout(h.window);
  // render() skulle rita hela editorn per drag; provet galler handtagslogiken, inte renderarna.
  h.window.eval('render = function () {}; view = "editor";');
  return h;
}

const RIKTNINGAR = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const UT = { n: [0, -40], s: [0, 40], e: [40, 0], w: [-40, 0], ne: [40, -40], nw: [-40, -40], se: [40, 40], sw: [-40, 40] };

function rita(h, w) {
  const z = Number(w.widgetScale) > 0 ? w.widgetScale : 1;
  const hojd = w.height ? `height:${w.height}px;` : '';
  const vy = h.document.getElementById('view');
  vy.innerHTML = `<div class="canvas"><div class="widget selected" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;`
    + `width:${w.width || 300}px;${hojd}zoom:${z}"><span class="resize-handle">&#8600;</span></div></div>`;
  h.window.VyraHandtag.synka();
  return vy.querySelector('.widget');
}

function dra(h, el, riktning, rot) {
  const handtag = el.querySelector(`[data-vyra-handle="${riktning}"]`);
  assert.ok(handtag, `handtaget ${riktning} saknas`);
  let [dx, dy] = UT[riktning];
  if (rot) {                              // pekaren ror sig langs widgetens egna axlar
    const r = rot * Math.PI / 180;
    [dx, dy] = [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
  }
  const ev = (typ, x, y) => new h.window.MouseEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  // Sydostra hornet binds av renderarnas bindare (media.js/custom-widgets.js), som delegerar hit —
  // delegeringen provas for sig nedan. Utan starta() (fore 2026-10-18) finns inget att anropa.
  if (riktning === 'se') { if (h.window.VyraHandtag.starta) h.window.VyraHandtag.starta(handtag, 'se', ev('pointerdown', 500, 500)); }
  else handtag.dispatchEvent(ev('pointerdown', 500, 500));
  handtag.dispatchEvent(ev('pointermove', 500 + dx, 500 + dy));
  handtag.dispatchEvent(ev('pointerup', 500 + dx, 500 + dy));
}

function rect(el) { return el.getBoundingClientRect(); }

// Punkten som ska sta still: motsatt kant och mitten av andra axeln, motsatt horn; vid rotation mitten.
function ankarpunkt(r, riktning, mitten) {
  if (mitten) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const x = riktning.includes('w') ? r.right : riktning.includes('e') ? r.left : r.left + r.width / 2;
  const y = riktning.includes('n') ? r.bottom : riktning.includes('s') ? r.top : r.top + r.height / 2;
  return { x, y };
}

function provaNyckel(h, k, values, { las, rot }) {
  const fel = [];
  for (const riktning of RIKTNINGAR) {
    const w = VyraWidgets.create(k, values ? { values } : undefined);
    Object.assign(w, { id: 't1', x: 40, y: 50, aspectLocked: las });
    if (rot) w.rotation = rot;
    h.window.eval('state.widgets.length = 0; selected = "t1";');
    h.window.eval("state").widgets.push(w);
    const fore = JSON.parse(JSON.stringify(w));
    const el = rita(h, w);
    const r0 = rect(el);
    const klass = KLASS(w);
    dra(h, el, riktning, rot);
    const r1 = rect(el);
    const namn = `${k} ${riktning}${las ? ' last' : ' olast'}${rot ? ' rot' + rot : ''}`;
    if ('widgetScaleY' in w) fel.push(`${namn}: skrev widgetScaleY=${w.widgetScaleY}`);
    if (/scaleY|scale\(/.test(el.style.transform || '')) fel.push(`${namn}: roten fick transform ${el.style.transform}`);
    if (klass === 'fast') {
      if (w.width !== fore.width) fel.push(`${namn}: bredden andrades ${fore.width} -> ${w.width}`);
      if (w.height !== fore.height) fel.push(`${namn}: hojden andrades ${fore.height} -> ${w.height}`);
      const s0 = Number(fore.widgetScale) > 0 ? fore.widgetScale : 1;
      if (!(w.widgetScale > s0 + 0.01)) fel.push(`${namn}: skalan vaxte inte (${s0} -> ${w.widgetScale})`);
      const kx = r1.width / r0.width, ky = r1.height / r0.height;
      if (Math.abs(kx - ky) > 0.005) fel.push(`${namn}: X ${kx.toFixed(3)} mot Y ${ky.toFixed(3)}`);
      // forankringen: motsatt kant/horn (eller mitten vid rotation) star still, inom en enhet
      const tol = 1.5 * (parseFloat(el.style.zoom) || 1);
      const a0 = ankarpunkt(r0, riktning, !!rot), a1 = ankarpunkt(r1, riktning, !!rot);
      if (Math.abs(a0.x - a1.x) > tol || Math.abs(a0.y - a1.y) > tol)
        fel.push(`${namn}: ankaret flyttade sig (${(a1.x - a0.x).toFixed(1)}, ${(a1.y - a0.y).toFixed(1)})`);
    } else {
      if (w.widgetScale !== fore.widgetScale) fel.push(`${namn}: egen text/media fick widgetScale ${w.widgetScale}`);
      const b0 = fore.width || 300, h0 = fore.height || STANDARD_HOJD;
      if (las) {
        const kvot = Number(fore.aspectRatio) > 0 ? fore.aspectRatio : b0 / h0;
        if (Math.abs(w.width / w.height - kvot) > 0.02 * kvot) fel.push(`${namn}: kvoten ${(w.width / w.height).toFixed(3)} mot last ${kvot.toFixed(3)}`);
      } else if (riktning === 'e' || riktning === 'w') {
        if (w.height !== h0) fel.push(`${namn}: sidhandtaget andrade hojden ${h0} -> ${w.height}`);
        if (!(w.width > b0)) fel.push(`${namn}: bredden vaxte inte`);
      } else if (riktning === 'n' || riktning === 's') {
        if (w.width !== b0) fel.push(`${namn}: over/under andrade bredden ${b0} -> ${w.width}`);
        if (!(w.height > h0)) fel.push(`${namn}: hojden vaxte inte (riktig hojd, inte scaleY)`);
      }
    }
  }
  return fel;
}

const nycklar = allaNycklar();

test('alla katalognycklar: atta handtag, last och olast — aldrig skilda X/Y-skalor, aldrig widgetScaleY', () => {
  assert.ok(nycklar.size >= 150, `bara ${nycklar.size} nycklar att prova`);
  const h = rigg();
  const fel = [];
  const klasser = { fast: 0, text: 0, media: 0 };
  for (const [k, values] of nycklar) {
    const w = VyraWidgets.create(k, values ? { values } : undefined);
    klasser[KLASS(w)]++;
    if (h.window.VyraTransform.klass && h.window.VyraTransform.klass(w) !== KLASS(w)) fel.push(`${k}: klassad som ${h.window.VyraTransform.klass(w)}`);
    fel.push(...provaNyckel(h, k, values, { las: true }));
    fel.push(...provaNyckel(h, k, values, { las: false }));
  }
  assert.deepEqual(fel.slice(0, 40), [], `${fel.length} fel`);
  // kontrollmatning: alla tre klasserna faktiskt provade
  assert.ok(klasser.fast > 150 && klasser.text >= 1 && klasser.media >= 2, JSON.stringify(klasser));
});

test('alla katalognycklar roterade 30 grader: likformigt och mitten star still', () => {
  const h = rigg();
  const fel = [];
  for (const [k, values] of nycklar) fel.push(...provaNyckel(h, k, values, { las: false, rot: 30 }));
  assert.deepEqual(fel.slice(0, 40), [], `${fel.length} fel`);
});

test('en widget med liten sparad skala hoppar inte till golvet nar handtaget tas', () => {
  // En migrerad Guardian kan sta pa 0.19 — under handtagens golv 0.2. Ett litet drag ska ge ett
  // litet steg, inte ett hopp till 0.2.
  const { nySkala } = rigg().window.VyraHandtag;
  assert.equal(typeof nySkala, 'function', 'VyraHandtag.nySkala saknas');
  const s = nySkala('s', { skala: 0.19, visBredd: 136, visHojd: 108 }, 0, -2);
  assert.ok(s < 0.2 && s > 0.18, `fick ${s}`);
});

test('sydostra hornets bindare lamnar over till samma drag som de sju andra', () => {
  // Media.js (helskala + video) och custom-widgets.js binder .resize-handle; bada maste delegera,
  // annars raknar hornet med en annan geometri — och custom-hornet ignorerade laset.
  for (const fil of ['media.js', 'custom-widgets.js']) {
    const kalla = fs.readFileSync(path.join(ROOT, fil), 'utf8');
    assert.match(kalla, /handle\.onpointerdown=e=>\{if\(window\.VyraHandtag&&typeof window\.VyraHandtag\.starta==='function'\)return window\.VyraHandtag\.starta\(handle,'se',e\)/,
      `${fil}: sydostra hornet delegerar inte till VyraHandtag.starta`);
  }
});

test('handtagsmodulen skriver aldrig widgetScaleY och ritar aldrig scaleY', () => {
  for (const fil of ['widget-handles.js', 'vyra-rotation.js']) {
    const kod = fs.readFileSync(path.join(ROOT, fil), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/widgetScaleY\s*=[^=]/.test(kod), `${fil} tilldelar widgetScaleY`);
    assert.ok(!/['"]scaleY\(/.test(kod), `${fil} bygger en scaleY-transform`);
  }
});
