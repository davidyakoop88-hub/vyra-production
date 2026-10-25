'use strict';
// STORLEKSMÄTNINGEN, TREDJE SJÄTTEDELEN (2026-10-19), i riktig Chrome.
//
// Verifieringen 2026-10-18 (storlek-verifiering.browser.test.js) hann inte mäta varje nyckel genom
// hela kedjan. Det här provet tar katalognycklarna med index % 6 === 3 ur tests/helpers/katalognycklar.js
// (samma uppräkning och ordning som de andra vakterna) och driver var och en genom det en streamer
// faktiskt gör med storleken:
//
//   1. Storlek-reglaget liten / normal / stor (50, 100, 150 %) — likformigt, mitten står still.
//   2. Alla åtta handtagen med låset på och av — formen står kvar, motsatt kant står still.
//   3. Bredd-, Höjd- och Storleksfälten — fasta kompositioner visar den ritade lådan skrivskyddat,
//      egen text får riktiga mått.
//   4. Rotation 15° via panelfältet.
//
// Efter VARJE steg: ingen scaleX ≠ scaleY på roten eller dess förfäder, runda profilbilder är runda
// (2 %), bilder behåller sin kvot, handtagen (markeringsramen) sitter på widgetens kant (2 px), och
// ingen text klipps som inte redan var klippt i normalläget. Varje mätt läge ritas också i den
// riktiga sändningen (studio.html?overlay=1) och ska ha samma låda, zoom och transform där. Alerts
// som är släckta i vila utlöses först, och koreografin fryses före mätningen.
//
// ISOLERAD LAYOUT: varje sida är en ny webbläsarkontext med tom localStorage, och widgeten läggs i en
// tömd state.widgets — ingen sparad layout läses eller skrivs utanför provets egen flik.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar, ALERTS } = require('../helpers/katalognycklar.js');

const NYCKLAR = kravNycklar().filter((_, i) => i % 6 === 3);

// TVÅ DJUP. Hela genomgången (alla åtta handtag låsta och olåsta, varje läge i sändningen) tog
// 23,5 min för 29 nycklar på utvecklarmaskinen 2026-10-19 — mer än en hel CI-skarva. Standard är
// därför ett urval som ändå täcker båda låslägena, sidor och hörn, och sändningen i normalläge och
// roterad. VYRA_STORLEK_ALLA=1 kör hela genomgången (det som mättes 2026-10-19, alla gröna).
const ALLA = !!process.env.VYRA_STORLEK_ALLA;
const HANDTAG = ALLA
  ? [true, false].flatMap(las => ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => [d, las]))
  : [['n', true], ['e', false], ['se', true], ['sw', false]];
const OVERLAY_LAGEN = ALLA ? null : new Set(['normal', 'rotation 15°']);

// Mätningen kan inte avgöras för de här, med skäl. De mäts ändå i allt som går (låda, transform,
// handtag) — undantaget gäller bara den del som står här.
const OMATBART = {
  'catalog:likefountain': { text: true, overlay: true,
    skal: 'fontänens hjärtan flyger ut ur lådan i ständig rörelse (UTAN_REFERENS i katalognycklar.js) — text och sändningens bild har inget stilla ögonblick' },
  'catalog:giftfireworks:comet': { overlay: true,
    skal: 'partiklarna ritas på en Pixi-duk med egen ticker; i sändningen finns ingen låda att jämföra förrän en gåva skjuter, och då är den i rörelse' },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.gif': 'image/gif' };

function servera() {
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const fil = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  for (const p of Object.values(sidor)) { try { await p.close() } catch (_) {} }
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// ---- MÄTVERKTYGEN, inne i sidan ------------------------------------------------------------------
const LIB = () => {
  const vanta = ms => new Promise(r => setTimeout(r, ms));
  const ramar = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__vanta = vanta;
  window.__kanvas = () => document.querySelector('.editor-shell .canvas') || document.querySelector('.canvas');
  window.__nod = id => (window.__kanvas() || document).querySelector(`[data-id="${id}"]`);
  // Koreografin fryses: ändliga animationer spelas klart, oändliga pausas. Hela dokumentet, eftersom
  // en alert kan animera noder utanför sin rot (fyrverkerier, portaler).
  window.__frys = () => {
    for (const a of document.getAnimations()) {
      try {
        const it = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : 1;
        if (it === Infinity) a.pause(); else a.finish();
      } catch (_) { try { a.pause() } catch (__) {} }
    }
  };
  window.__lagg = async (k, p, vald) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(k);
    Object.assign(w, { x: 40, y: 40 }, p || {});
    if (w.type === 'templateLastX') w.lastXPersistent = true;
    state.widgets.push(w); selected = vald ? w.id : null; render();
    await vanta(450); window.__frys(); await ramar();
    if (vald && typeof bind === 'function') { bind(); await vanta(200); }
    window.__frys(); await ramar();
    return w.id;
  };
  window.__trig = async (anrop) => {
    if (!anrop) return 'ingen';
    const n = anrop[0];
    if (typeof window[n] !== 'function') return 'saknas: ' + n;
    try { window[n](...anrop.slice(1)); } catch (e) { return 'FEL: ' + String(e && e.message || e).slice(0, 100) }
    // PAUSA, AVSLUTA INTE. finish() på ett larms koreografi skickar animationend, och flera larm
    // släcker sig själva på den händelsen (Battle MVP var 0x0 efteråt). Entrén är klar efter 1,5 s.
    await vanta(1500);
    for (const a of document.getAnimations()) { try { a.pause() } catch (_) {} }
    await ramar();
    return 'ok';
  };
  // Storlek: panelens #propScale tar procent; Follower Alert har sitt eget #followScale (faktor) och
  // då visar vyra-proportioner inget andra reglage (tests/browser/panel-inga-dubbletter).
  window.__skala = pct => document.querySelector('#propScale') ? window.__falt('#propScale', String(pct))
    : window.__falt('#followScale', String(pct / 100));
  window.__falt = (sel, v) => {
    const f = document.querySelector(sel); if (!f) return false;
    f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const matris = t => {
    const m = /matrix\(([^)]+)\)/.exec(t || '');
    if (m) { const v = m[1].split(',').map(Number); return { sx: Math.hypot(v[0], v[1]), sy: Math.hypot(v[2], v[3]) }; }
    const m3 = /matrix3d\(([^)]+)\)/.exec(t || '');
    if (m3) { const v = m3[1].split(',').map(Number); return { sx: Math.hypot(v[0], v[1], v[2]), sy: Math.hypot(v[4], v[5], v[6]) }; }
    return { sx: 1, sy: 1 };
  };
  const olika = (a, b, tol) => Math.abs(a - b) > tol * Math.max(Math.abs(a), Math.abs(b), 1e-6);
  // EN 3D-VINKEL ÄR INGEN STRÄCKNING (2026-10-25). Guld · Silver · Brons vinklar profilbilden med
  // perspective(240px) rotateY(28deg) — designens medaljong. Det ger en matrix3d med perspektivterm
  // (m14/m24/m34 ≠ 0), och dess kolumnlängder skiljer per axel utan att något sträcks: bilden står
  // rund i sitt eget plan och vrids mot betraktaren. En platt skalning har aldrig de termerna.
  const perspektiv = t => { const m3 = /matrix3d\(([^)]+)\)/.exec(t || ''); if (!m3) return false; const v = m3[1].split(',').map(Number); return [v[3], v[7], v[11]].some(x => Math.abs(x) > 1e-6); };
  const dold = e => {
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02) return true;
    }
    return false;
  };
  const sig = (root, e) => { const v = []; for (let n = e; n && n !== root; n = n.parentElement) v.unshift([...n.parentElement.children].indexOf(n)); return v.join('.'); };
  const harText = e => [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
  const klipp = ['hidden', 'clip', 'scroll', 'auto'];
  // Rotens text utan handtagen (renderarens .resize-handle bär tecknet "↘" bara i Layout).
  const synligText = el => {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let ut = '';
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.parentElement && n.parentElement.closest('.resize-handle,.vyra-handle,[data-vyra-handle]')) continue;
      ut += n.textContent;
    }
    return ut.split(/\s+/).join(' ').trim();
  };
  // Mätningen av EN rot. bas = samma mätning i normalläget (för bildkvot och redan klippt text).
  window.__matning = (id, bas) => {
    const el = window.__nod(id);
    if (!el) return { finns: false };
    const w = state.widgets.find(x => x.id === id) || {};
    const fel = [], info = [];
    const k = (() => { const c = window.__kanvas(); const r = c.getBoundingClientRect(); return c.offsetWidth ? r.width / c.offsetWidth : 1; })();
    // 1. ingen skala per axel på roten eller förfäderna
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n), s = matris(cs.transform);
      if (olika(s.sx, s.sy, 0.001)) fel.push(`skala per axel på ${n === el ? 'roten' : n.tagName.toLowerCase() + '.' + String(n.className).split(' ')[0]}: ${cs.transform}`);
      if (cs.scale && cs.scale !== 'none') { const p = cs.scale.split(' ').map(parseFloat); if (p.length > 1 && olika(p[0], p[1], 0.001)) fel.push(`scale ${cs.scale} på ${n === el ? 'roten' : n.tagName}`); }
    }
    const r = el.getBoundingClientRect();
    const z = parseFloat(getComputedStyle(el).zoom) || 1;
    const T = window.VyraTransform;
    const ts = T && T.cssSkala ? T.cssSkala(el) : 1;
    const bilder = {}, klippt = {}, fonter = {};
    for (const c of el.querySelectorAll('*')) {
      if (c.closest('.vyra-handle,.resize-handle,[data-vyra-handle]')) continue;
      if (dold(c)) continue;
      const cs = getComputedStyle(c);
      // 2. runda profilbilder
      const rad = cs.borderTopLeftRadius;
      const rund = /^50%/.test(rad) || (parseFloat(rad) > 0 && !/%/.test(rad) && parseFloat(rad) >= Math.min(c.offsetWidth, c.offsetHeight) / 2 - 0.5 && Math.min(c.offsetWidth, c.offsetHeight) > 0);
      // En PILLER med en bild i (skattkistans sk-pill, 316x52) är ingen profilbild: rundad i ändarna,
      // inte en cirkel. Bara det som är ungefär kvadratiskt mäts — en oval profilbild är aldrig 2:1.
      const ungefarKvadrat = c.tagName === 'IMG' || Math.max(c.offsetWidth, c.offsetHeight) <= 2 * Math.min(c.offsetWidth, c.offsetHeight);
      if (rund && ungefarKvadrat && (c.tagName === 'IMG' || c.querySelector('img')) && c.offsetWidth >= 16 && c.offsetHeight >= 16) {
        const kv = c.offsetWidth / c.offsetHeight;
        if (Math.abs(kv - 1) > 0.02 && rad !== '50% / 50%' ) fel.push(`oval profilbild ${c.tagName.toLowerCase()}.${String(c.className).split(' ')[0]} ${c.offsetWidth}x${c.offsetHeight}`);
        for (let n = c; n && n !== el; n = n.parentElement) {
          if (perspektiv(getComputedStyle(n).transform)) continue;
          const s = matris(getComputedStyle(n).transform);
          if (olika(s.sx, s.sy, 0.02)) { fel.push(`profilbilden sträcks av ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}: ${getComputedStyle(n).transform}`); break; }
        }
      }
      // 3. bildkvot mot normalläget
      if (c.tagName === 'IMG' && c.offsetWidth >= 8 && c.offsetHeight >= 8) {
        const s = sig(el, c), kv = c.offsetWidth / c.offsetHeight;
        bilder[s] = kv;
        if (bas && bas.bilder[s] && olika(kv, bas.bilder[s], 0.02)) fel.push(`bilden ${s} bytte kvot ${bas.bilder[s].toFixed(3)} -> ${kv.toFixed(3)}`);
      }
      // 5. text som klipps
      if (harText(c)) {
        const s = sig(el, c);
        fonter[s] = parseFloat(cs.fontSize) || 0;
        let skuren = '';
        // Radlådan får sticka ut 0,15 em: scrollHeight räknar radhöjden, inte bläcket, och en
        // radhöjd på 1,08 ger 2 px "överflöd" vid 28 px utan att en enda nedstapel klipps (uppmätt
        // med "Jaggy Qpj" i Signal Orbit vid 50 %, fyrdubbel upplösning).
        const tolT = Math.max(1, 0.15 * (parseFloat(cs.fontSize) || 10));
        if ((klipp.includes(cs.overflowX) && c.scrollWidth > c.clientWidth + 1) || (klipp.includes(cs.overflowY) && c.scrollHeight > c.clientHeight + tolT)) skuren = `${c.scrollWidth}x${c.scrollHeight} i ${c.clientWidth}x${c.clientHeight}${cs.textOverflow === 'ellipsis' ? ', ellips' : ''}`;
        if (!skuren) {
          const b = c.getBoundingClientRect();
          for (let n = c.parentElement; n && n !== el.parentElement; n = n.parentElement) {
            const ns = getComputedStyle(n);
            if (!(klipp.includes(ns.overflowX) || klipp.includes(ns.overflowY))) continue;
            const a = n.getBoundingClientRect();
            if (b.left < a.left - 1.5 || b.right > a.right + 1.5 || b.top < a.top - 1.5 || b.bottom > a.bottom + 1.5) { skuren = `utanför ${n === el ? 'roten' : n.tagName.toLowerCase() + '.' + String(n.className).split(' ')[0]}`; break; }
          }
        }
        if (skuren) {
          klippt[s] = skuren;
          // En ELLIPS är designens egen kortning (namnplattan i nowrap), inte en avklippt glyf — den
          // redovisas, men fäller inte. En klippning utan ellips gör det.
          if (bas && !bas.klippt[s]) {
            if (/ellips$/.test(skuren)) info.push(`texten "${c.textContent.trim().slice(0, 24)}" kortas med ellips (${skuren})`);
            else fel.push(`texten "${c.textContent.trim().slice(0, 24)}" klipps (${skuren})`);
          }
        }
      }
    }
    // 4. markeringsramen: varje handtag på widgetens (roterade) kant
    const handtag = {};
    if (el.classList.contains('selected') && !document.documentElement.classList.contains('overlay-output')) {
      const rot = (Number(w.rotation) || 0) * Math.PI / 180;
      const hw = el.offsetWidth * z * ts * k / 2, hh = el.offsetHeight * z * ts * k / 2;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const D = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
      for (const d of Object.keys(D)) {
        const h = el.querySelector(`:scope > [data-vyra-handle="${d}"]`);
        if (!h) { fel.push(`handtaget ${d} saknas`); continue; }
        const b = h.getBoundingClientRect();
        const lx = D[d][0] * hw, ly = D[d][1] * hh;
        const ex = cx + lx * Math.cos(rot) - ly * Math.sin(rot), ey = cy + lx * Math.sin(rot) + ly * Math.cos(rot);
        const dx = b.left + b.width / 2 - ex, dy = b.top + b.height / 2 - ey;
        handtag[d] = [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
        // Sidhandtagen markerar ramens kanter: mitten på kanten, 2 px. Hörnen ritas av två olika
        // ägare (renderarens .resize-handle i sydost, 22 px; VyraHandtag 14 px i övriga) — där räcker
        // det att hörnpunkten ligger i handtaget, för det är vad ögat läser som ramens hörn.
        const tol = d.length === 1 ? 2 : Math.max(2, Math.min(b.width, b.height) / 2 - 1);
        // Handtagen har samma storlek i varje skala (motzoomen i widget-handles.js): n är 26x11.
        if (d === 'n' && !rot && (Math.abs(b.width - 26 * k) > 1.5 || Math.abs(b.height - 11 * k) > 1.5)) fel.push(`handtaget n är ${b.width.toFixed(1)}x${b.height.toFixed(1)}, inte 26x11 — det följer widgetens skala`);
        if (Math.hypot(dx, dy) > tol) fel.push(`handtaget ${d} sitter (${dx.toFixed(1)}, ${dy.toFixed(1)}) px från ramen`);
      }
      if (getComputedStyle(el).outlineStyle === 'none') info.push('ingen streckad outline när den är vald — designen nollar den; handtagen är ramen');
    }
    const t = matris(getComputedStyle(el).transform);
    return { finns: true, fel, info, bilder, klippt, fonter, handtag, text: synligText(el), cls: String(el.className),
      kompakt: /\b(rk-kompakt|rk6-kompakt|lv-kompakt)\b/.test(el.className),
      rk6vb: /\brk6-kompakt\b/.test(el.className) ? parseFloat(getComputedStyle(el).getPropertyValue('--rk6-vb')) || 0 : 0,
      v: r.left, h: r.right, o: r.top, u: r.bottom, b: r.width / k, hh: r.height / k, mx: r.left + r.width / 2, my: r.top + r.height / 2,
      ow: el.offsetWidth, oh: el.offsetHeight, z, ts, sx: t.sx, sy: t.sy, visB: el.offsetWidth * z * ts, visH: el.offsetHeight * z * ts,
      pw: +((document.querySelector('#propWidth') || {}).value), ph: +((document.querySelector('#propHeight') || {}).value),
      pwDis: !!(document.querySelector('#propWidth') || {}).disabled, phDis: !!(document.querySelector('#propHeight') || {}).disabled,
      harSkala: !!document.querySelector('#propScale, #followScale'),
      w: JSON.parse(JSON.stringify(w)) };
  };
};

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraWidgets, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(LIB);
  return page;
}

async function overlayn() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(LIB);
  return page;
}

// En editorflik och en sändningsflik för hela filen — varje nyckel läggs i en tömd state.widgets.
// En ny flik per nyckel kostade 8 s styck i laddning.
const sidor = {};
async function delad(typ) {
  if (!sidor[typ] || sidor[typ].isClosed()) sidor[typ] = await (typ === 'editor' ? editorn() : overlayn());
  return sidor[typ];
}

async function dra(page, riktning, dx, dy) {
  const h = await page.evaluate(r => {
    const e = document.querySelector(`.widget.selected > [data-vyra-handle="${r}"]`);
    if (!e) return null;
    const b = e.getBoundingClientRect(), w = e.closest('.widget').getBoundingClientRect();
    let x = b.left + b.width / 2, y = b.top + b.height / 2;
    const ar = p => { const t = document.elementFromPoint(p[0], p[1]); return t === e || e.contains(t); };
    const traff = ar([x, y]);
    // Egen text/bild/video har overflow:hidden och klipper handtagens yttre halva — greppa den inre.
    if (!traff) {
      x += Math.sign((w.left + w.width / 2) - x) * Math.min(3, b.width / 3);
      y += Math.sign((w.top + w.height / 2) - y) * Math.min(3, b.height / 3);
    }
    return { x, y, traff, inre: !traff && ar([x, y]) };
  }, riktning);
  if (!h) return null;
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + dx / 2, h.y + dy / 2, { steps: 4 });
  await page.mouse.move(h.x + dx, h.y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.evaluate(async () => { window.__frys(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  return h;
}

const UT = { n: [0, -40], s: [0, 40], e: [40, 0], w: [-40, 0], ne: [40, -40], nw: [-40, -40], se: [40, 40], sw: [-40, 40] };
const ANKARE = { n: ['mx', 'u'], s: ['mx', 'o'], e: ['v', 'my'], w: ['h', 'my'], ne: ['v', 'u'], nw: ['h', 'u'], se: ['v', 'o'], sw: ['h', 'o'] };
const alertFor = typ => ALERTS[typ] || null;
// LÄSBARHETSGOLVET. Flera designer håller namn och värden på minst 12 SYNLIGA px (font-size:
// max(designstorlek, calc(12px / zoom)) — Top Streak, rk6, Level-larmen, Top Coins). Under golvet
// växer texten i förhållande till resten, och då är formen en annan komposition, inte en sträckning.
// Det syns på att en texts layoutstorlek ändrades — en ren skalning ändrar den aldrig.
const golv = (f, e) => Object.keys(e.fonter || {}).some(s => f.fonter && f.fonter[s] && Math.abs(f.fonter[s] - e.fonter[s]) > 0.05);

// Mäter EN nyckel genom hela kedjan. Returnerar { fel: [...], blockerat: [...], steg: n }.
async function matNyckel(nyckel) {
  const fel = [], blockerat = [], info = new Set(), omatbart = OMATBART[nyckel] || {};
  if (omatbart.skal) blockerat.push(omatbart.skal);
  const notera = (steg, m, vidText = true) => {
    if (!m || !m.finns) { fel.push(`${steg}: widgeten ritades inte`); return; }
    for (const f of m.fel) {
      if (!vidText && /^texten /.test(f)) continue;
      fel.push(`${steg}: ${f}`);
    }
    for (const i of m.info || []) info.add(i);
  };
  const tillOverlay = [];   // [steg, widget-JSON, editorns mätning]
  const page = await delad('editor');
  let steg = 0;
  try {
    const start = await page.evaluate(async k => {
      const id = await window.__lagg(k, { x: 40, y: 40 }, true);
      const m = window.__matning(id, null);
      return { id, m, klass: window.VyraTransform.klass(m.w), typ: m.w.type };
    }, nyckel);
    const { klass } = start;
    const text = !omatbart.text;
    if (!start.m.finns) { fel.push('ritades inte i Layout'); return { fel, blockerat, info: [], steg }; }

    // ---- 1. Storlek-reglaget: liten, normal, stor ------------------------------------------------
    if (klass === 'fast') {
      const r = await page.evaluate(async k => {
        const ut = {};
        let normal = null;
        for (const pct of [100, 50, 150]) {
          const id = await window.__lagg(k, { x: 140, y: 140 }, true);
          const f = window.__matning(id, null);
          if (!window.__skala(pct)) return { saknas: true };
          await window.__vanta(700); window.__frys();
          if (!normal) normal = window.__matning(id, null);
          ut[pct] = { f, e: window.__matning(id, normal) };
        }
        return ut;
      }, nyckel);
      if (r.saknas) fel.push('Storlek: reglaget saknas');
      else {
        for (const pct of [50, 100, 150]) {
          steg++;
          const { f, e } = r[pct];
          const namn = `Storlek ${pct} %`;
          notera(namn, e, text);
          if (e.w.widgetScale !== pct / 100) fel.push(`${namn}: widgetScale ${e.w.widgetScale}`);
          // Läsbarhetsläget (rk-kompakt/rk6-kompakt/lv-kompakt, Davids beslut 2026-10-12) byter layout
          // under en synlig tröskel: ornamenten bort, större foto. Då är höjden en annan komposition —
          // bredden och den likformiga skalan mäts ändå.
          if (e.kompakt && !f.kompakt) {
            info.add(`${namn}: läsbarhetsläget slår till (avsiktlig layout) — höjden x${(e.hh / f.hh).toFixed(3)}`);
            // Rankinglistornas kompaktläge ritar listan i designens uppmätta grundbredd gånger skalan
            // (ranking-sixpack.js GEOMETRI, --rk6-vb, golv 112 px) — inte i innehållets bredd. Med
            // exempelnamnen är listan i full storlek smalare än grundbredden, så kvoten mot den blev
            // 0,59 för Voltage vid 50 %. Det som lovas är --rk6-vb; det mäts.
            if (e.rk6vb) { if (Math.abs(e.b - e.rk6vb) > 0.03 * e.rk6vb) fel.push(`${namn}: kompaktlistan är ${e.b.toFixed(0)} px, --rk6-vb lovar ${e.rk6vb}`); }
            else if (Math.abs(e.b / f.b - pct / 100) > 0.02) fel.push(`${namn}: bredden x${(e.b / f.b).toFixed(3)}, väntade ${pct / 100}`);
          } else if (golv(f, e)) {
            info.add(`${namn}: textens läsbarhetsgolv (12 synliga px) ändrar layouten — X ${(e.b / f.b).toFixed(3)} Y ${(e.hh / f.hh).toFixed(3)}`);
            if (Math.sign(e.b - f.b) !== Math.sign(pct - 100)) fel.push(`${namn}: storleken gick åt fel håll (${f.b.toFixed(0)} -> ${e.b.toFixed(0)})`);
          } else if (Math.abs(e.b / f.b - pct / 100) > 0.02 || Math.abs(e.hh / f.hh - pct / 100) > 0.02) fel.push(`${namn}: X ${(e.b / f.b).toFixed(3)} Y ${(e.hh / f.hh).toFixed(3)}, väntade ${pct / 100} (kompakt ${f.kompakt}->${e.kompakt} ${e.cls})`);
          if (Math.abs(e.mx - f.mx) > 2 || (!e.kompakt && !golv(f, e) && Math.abs(e.my - f.my) > 2)) fel.push(`${namn}: mitten flyttade sig (${(e.mx - f.mx).toFixed(1)}, ${(e.my - f.my).toFixed(1)})`);
          if (Math.abs(e.pw - e.visB) > 1 || Math.abs(e.ph - e.visH) > 1) fel.push(`${namn}: fälten ${e.pw}x${e.ph}, ritat ${e.visB.toFixed(0)}x${e.visH.toFixed(0)}`);
          if (pct !== 100) tillOverlay.push([namn, e.w, e]);
          else tillOverlay.push(['normal', e.w, e]);
        }
      }
    } else {
      blockerat.push(`Storlek-reglaget: gäller inte ${klass} (riktiga mått, inget skalreglage) — mätt via fälten i stället`);
      if (start.m.harSkala) fel.push(`${klass} har ett skalreglage`);
    }

    // ---- 2. Åtta handtag, låst och olåst --------------------------------------------------------
    // Bas-skalan väljs så att widgeten plus draget ryms i fönstret.
    const bas0 = await page.evaluate(async k => {
      const id = await window.__lagg(k, { x: 60, y: 60 }, true);
      const m = window.__matning(id, null);
      return Math.min(1, 300 / Math.max(m.b, 1), 330 / Math.max(m.hh, 1));
    }, nyckel);
    const s0 = Math.max(0.2, Math.floor(bas0 * 100) / 100);
    const normalBas = await page.evaluate(async ([k, s0, klass]) => {
      const id = await window.__lagg(k, klass === 'fast' ? { x: 110, y: 170, widgetScale: s0 } : { x: 60, y: 170, width: 260, height: 100 }, true);
      return window.__matning(id, null);
    }, [nyckel, s0, klass]);
    for (const [d, las] of HANDTAG) {
      {
        steg++;
        const namn = `handtag ${d} ${las ? 'låst' : 'olåst'}`;
        const props = klass === 'fast' ? { x: 110, y: 170, widgetScale: s0, aspectLocked: las } : { x: 60, y: 170, width: 260, height: 100, aspectLocked: las };
        await page.evaluate(([k, p]) => window.__lagg(k, p, true), [nyckel, props]);
        const f = await page.evaluate(n => window.__matning(state.widgets[0].id, n), normalBas);
        const h = await dra(page, d, ...UT[d]);
        if (!h) { fel.push(`${namn}: handtaget saknas`); continue; }
        if (!h.traff && !h.inre) fel.push(`${namn}: handtaget går inte att greppa`);
        else if (!h.traff) info.add(`handtagens yttre halva klipps av rotens overflow — greppas på den inre`);
        const e = await page.evaluate(n => window.__matning(state.widgets[0].id, n), normalBas);
        notera(namn, e, text);
        if ('widgetScaleY' in e.w) fel.push(`${namn}: widgetScaleY ${e.w.widgetScaleY}`);
        if (klass === 'fast') {
          if (e.w.width !== f.w.width || e.w.height !== f.w.height) fel.push(`${namn}: w.width/height skrevs ${f.w.width}x${f.w.height} -> ${e.w.width}x${e.w.height}`);
          if (golv(f, e)) info.add(`handtagen: textens läsbarhetsgolv ändrar layouten vid skala ${s0} — formen jämförs inte`);
          else if (Math.abs((e.b / e.hh) / (f.b / f.hh) - 1) > 0.02) fel.push(`${namn}: formen ${(f.b / f.hh).toFixed(3)} -> ${(e.b / e.hh).toFixed(3)}`);
          if (!(e.b > f.b + 4 || e.hh > f.hh + 8)) fel.push(`${namn}: växte inte (${f.b.toFixed(0)} -> ${e.b.toFixed(0)})`);
          for (const kant of ANKARE[d]) if (!(golv(f, e) && (kant === 'mx' || kant === 'my')) && Math.abs(e[kant] - f[kant]) > 3) fel.push(`${namn}: ${kant} flyttade sig ${(e[kant] - f[kant]).toFixed(1)} px`);
        } else {
          const horisontell = d.includes('e') || d.includes('w'), lodratt = d.includes('n') || d.includes('s');
          if (horisontell && !(e.w.width > (f.w.width || f.ow) + 8)) fel.push(`${namn}: bredden växte inte (${f.w.width} -> ${e.w.width})`);
          if (lodratt && !((e.w.height || e.oh) > (f.w.height || f.oh) + 8)) fel.push(`${namn}: höjden växte inte (${f.w.height} -> ${e.w.height})`);
          if (las && f.w.width && f.w.height && e.w.height && Math.abs((e.w.width / e.w.height) / (f.w.width / f.w.height) - 1) > 0.03) fel.push(`${namn}: låst men kvoten ${(f.w.width / f.w.height).toFixed(3)} -> ${(e.w.width / e.w.height).toFixed(3)}`);
          if (!las && horisontell && !lodratt && e.w.height !== f.w.height) fel.push(`${namn}: olåst sidhandtag ändrade höjden`);
          if (!las && lodratt && !horisontell && e.w.width !== f.w.width) fel.push(`${namn}: olåst sidhandtag ändrade bredden`);
        }
      }
    }

    // ---- 3. Bredd-, Höjd- och Storleksfälten ----------------------------------------------------
    steg++;
    if (klass === 'fast') {
      const r = await page.evaluate(async ([k, s0, n]) => {
        const id = await window.__lagg(k, { x: 110, y: 170, widgetScale: s0 }, true);
        const f = window.__matning(id, n);
        for (const sel of ['#propWidth', '#propHeight']) { const el = document.querySelector(sel); if (el && !el.disabled) window.__falt(sel, '999'); }
        await window.__vanta(300);
        const mellan = window.__matning(id, n);
        window.__skala(Math.round(s0 * 130));
        await window.__vanta(700); window.__frys(); bind(); await window.__vanta(200);
        return { f, mellan, e: window.__matning(id, n) };
      }, [nyckel, s0, normalBas]);
      notera('fälten', r.e, text);
      if (!r.f.pwDis || !r.f.phDis) fel.push('fälten: Bredd/Höjd är redigerbara på en fast komposition');
      if (r.mellan.w.width !== r.f.w.width || r.mellan.w.height !== r.f.w.height) fel.push('fälten: Bredd/Höjd skrev w.width/w.height');
      if (Math.abs(r.f.pw - r.f.visB) > 1 || Math.abs(r.f.ph - r.f.visH) > 1) fel.push(`fälten visar ${r.f.pw}x${r.f.ph}, ritat ${r.f.visB.toFixed(0)}x${r.f.visH.toFixed(0)}`);
      const kx = r.e.visB / r.f.visB, ky = r.e.visH / r.f.visH, mal = Math.round(s0 * 130) / 100 / s0;
      if (golv(r.f, r.e)) { info.add(`fälten: textens läsbarhetsgolv ändrar layouten — X ${kx.toFixed(3)} Y ${ky.toFixed(3)}`); if (!(kx > 1)) fel.push(`fälten: Storlek växte inte (X ${kx.toFixed(3)})`); }
      else if (Math.abs(kx - mal) > 0.03 || Math.abs(ky - mal) > 0.03) fel.push(`fälten: Storlek gav X ${kx.toFixed(3)} Y ${ky.toFixed(3)}, väntade ${mal.toFixed(3)}`);
      if (Math.abs(r.e.pw - r.e.visB) > 1 || Math.abs(r.e.ph - r.e.visH) > 1) fel.push(`fälten efter Storlek ${r.e.pw}x${r.e.ph}, ritat ${r.e.visB.toFixed(0)}x${r.e.visH.toFixed(0)}`);
    } else {
      const r = await page.evaluate(async ([k, n]) => {
        const id = await window.__lagg(k, { x: 110, y: 170, width: 300, height: 100, aspectLocked: false }, true);
        window.__falt('#propWidth', '420'); await window.__vanta(400);
        const a = window.__matning(id, n);
        bind(); await window.__vanta(150);
        window.__falt('#propHeight', '140'); await window.__vanta(400);
        return { a, e: window.__matning(id, n) };
      }, [nyckel, normalBas]);
      notera('fälten', r.e, text);
      if (r.a.w.width !== 420) fel.push(`fälten: Bredd 420 gav ${r.a.w.width}`);
      if (r.e.w.height !== 140) fel.push(`fälten: Höjd 140 gav ${r.e.w.height}`);
      if (Math.abs(r.e.ow - 420) > 1 || Math.abs(r.e.oh - 140) > 1) fel.push(`fälten: lådan ${r.e.ow}x${r.e.oh}, väntade 420x140`);
    }

    // ---- 4. Rotation 15° via panelfältet --------------------------------------------------------
    steg++;
    const rot = await page.evaluate(async ([k, s0, klass, n]) => {
      const id = await window.__lagg(k, klass === 'fast' ? { x: 110, y: 170, widgetScale: s0 } : { x: 60, y: 170, width: 260, height: 100 }, true);
      const f = window.__matning(id, n);
      if (!window.__falt('#propRotation', '15')) return { saknas: true };
      await window.__vanta(600); window.__frys(); await window.__vanta(50);
      return { f, e: window.__matning(id, n) };
    }, [nyckel, s0, klass, normalBas]);
    if (rot.saknas) fel.push('rotation: fältet #propRotation saknas');
    else {
      notera('rotation 15°', rot.e, text);
      if (rot.e.w.rotation !== 15) fel.push(`rotation: w.rotation ${rot.e.w.rotation}`);
      if (Math.abs(rot.e.mx - rot.f.mx) > 2 || Math.abs(rot.e.my - rot.f.my) > 2) fel.push(`rotation: mitten flyttade sig (${(rot.e.mx - rot.f.mx).toFixed(1)}, ${(rot.e.my - rot.f.my).toFixed(1)})`);
      if (Math.abs(rot.e.visB - rot.f.visB) > 1 || Math.abs(rot.e.visH - rot.f.visH) > 1) fel.push(`rotation: lådan ${rot.f.visB.toFixed(0)}x${rot.f.visH.toFixed(0)} -> ${rot.e.visB.toFixed(0)}x${rot.e.visH.toFixed(0)}`);
      if (Math.abs(rot.e.sx - rot.f.sx) > 0.005) fel.push(`rotation: transformskalan ${rot.f.sx.toFixed(3)} -> ${rot.e.sx.toFixed(3)}`);
      tillOverlay.push(['rotation 15°', rot.e.w, rot.e]);
      if (klass !== 'fast') tillOverlay.push(['normal', rot.f.w, rot.f]);
    }
  } finally { /* sidan delas mellan nycklarna */ }

  // ---- 5. Samma lägen i sändningen --------------------------------------------------------------
  if (!omatbart.overlay) {
    const ov = await delad('overlay');
    try {
      const lage = await ov.evaluate(() => document.documentElement.classList.contains('overlay-output'));
      if (!lage) fel.push('overlay: sidan gick inte in i overlay-läge');
      for (const [namn, w, ed] of tillOverlay.filter(([n]) => !OVERLAY_LAGEN || OVERLAY_LAGEN.has(n))) {
        steg++;
        const typ = w.type;
        // KÖN. runtime-controls.js köar larmen och ett jobb håller sin plats hela visningstiden (upp
        // till 8 s) — utan att vänta ut den står nästa utlösning i kö och roten är 0x0 vid mätningen.
        if (alertFor(typ)) {
          await ov.evaluate(() => { state.widgets.length = 0; render(); });
          await ov.waitForFunction(() => !window.VyraAlertQueue || window.VyraAlertQueue.size() === 0, null, { timeout: 20000, polling: 200 }).catch(() => {});
        }
        const m = await ov.evaluate(async ([w, anrop]) => {
          state.widgets.length = 0; selected = null;
          const kopia = JSON.parse(JSON.stringify(w)); delete kopia.hidden;
          if (kopia.type === 'templateLastX') kopia.lastXPersistent = true;
          state.widgets.push(kopia); render();
          await window.__vanta(450); window.__frys();
          const svar = anrop ? await window.__trig(anrop) : 'ingen';
          return { svar, m: window.__matning(kopia.id, null) };
        }, [w, alertFor(typ)]);
        if (m.svar !== 'ok' && m.svar !== 'ingen') { blockerat.push(`overlay ${namn}: triggern svarade ${m.svar}`); continue; }
        if (!m.m.finns) { fel.push(`overlay ${namn}: widgeten ritades inte`); continue; }
        for (const f of m.m.fel) if (!/^texten /.test(f) || !omatbart.text) fel.push(`overlay ${namn}: ${f}`);
        // Sändningen ritar nollformen (inga demonamn) i flera topplistor — då är höjden en annan text.
        const sammaText = m.m.text === ed.text;
        if (!sammaText) info.add(`overlay ritar annan text än Layout (nollform/livedata) — höjden jämförs inte`);
        if (Math.abs(m.m.visB - ed.visB) > 2 || (sammaText && Math.abs(m.m.visH - ed.visH) > 2)) fel.push(`overlay ${namn}: lådan ${m.m.visB.toFixed(0)}x${m.m.visH.toFixed(0)}, i Layout ${ed.visB.toFixed(0)}x${ed.visH.toFixed(0)}`);
        if (Math.abs(m.m.z - ed.z) > 0.001) fel.push(`overlay ${namn}: zoom ${m.m.z}, i Layout ${ed.z}`);
        if (Math.abs(m.m.sx - ed.sx) > 0.005 || Math.abs(m.m.sy - ed.sy) > 0.005) fel.push(`overlay ${namn}: transformskala ${m.m.sx.toFixed(3)}/${m.m.sy.toFixed(3)}, i Layout ${ed.sx.toFixed(3)}/${ed.sy.toFixed(3)}`);
        if ('widgetScaleY' in m.m.w) fel.push(`overlay ${namn}: widgetScaleY`);
      }
    } finally { /* sidan delas mellan nycklarna */ }
  }
  return { fel, blockerat, info: [...info], steg };
}

test('rätt nycklar: index % 6 === 3 ur katalognycklar.js', { skip }, () => {
  assert.ok(NYCKLAR.length >= 16, `bara ${NYCKLAR.length} nycklar`);
  assert.ok(NYCKLAR.every(k => k.startsWith('catalog:')));
});

const RAPPORT = process.env.VYRA_STORLEK_RAPPORT;
for (const nyckel of NYCKLAR) {
  test(`storleken genom hela kedjan: ${nyckel}`, { skip, timeout: 300000 }, async () => {
    const r = await matNyckel(nyckel);
    if (RAPPORT) fs.appendFileSync(RAPPORT, JSON.stringify({ nyckel, ...r }) + '\n');
    assert.ok(r.steg >= (ALLA ? 20 : 8), `${nyckel}: bara ${r.steg} steg mättes`);
    assert.deepEqual(r.fel, [], `${nyckel}:\n  ${r.fel.join('\n  ')}`);
  });
}
