'use strict';
// SAMMA DESIGN I ALLA STORLEKAR — granskningen 2026-10-25 (176 modeller, 39 bytte utseende), i riktig Chrome.
//
// Förr valde storleken design: topplistorna (ranking-sixpack.js), Gifter/Fan Level Up (level-lasbar.js),
// Battle MVP med ram, Fan Level 50 och Top Streak Flip (container queries) bytte till ett kompaktutseende
// när widgeten gjordes liten — kronor, profilramar, ringar, glöd och dekorationer försvann. Regeln nu:
// en förminskning skalar hela kompositionen likformigt, och kompaktläget är bara ett uttryckligt val.
//
// DESIGNIDENTITET mäts på två sätt, för varje katalognyckel och varje steg:
//   · rotens klasser (utan tillfälliga som `selected`) — inga kompakt-/läsbarhetsklasser tillkommer;
//   · vilka designdelar som MÅLAS: varje element under roten som inte är display:none/visibility:hidden,
//     som tagg + klasser. Mängden ska vara exakt densamma som i full storlek.
// Stegen är granskningens: Storlek 100 → 75 → 50 → 30 → 20 → 100 %, plus Bredd-fältet till halva, ett
// handtagsdrag, sparning + omladdning och OBS-utgången. Egen text/bild/video (riktiga mått) är undantagna.
//
// ISOLERAD LAYOUT: ny webbläsarkontext, tom localStorage, egen lokal session — ingen sparad layout rörs.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const NYCKLAR = kravNycklar();
const EGET = new Set(['templateCustomText', 'templateCustomImage', 'templateCustomVideo', 'video']);
const SKALOR = [1, 0.75, 0.5, 0.3, 0.2, 1];
// Granskningens repro och de tre container-familjerna den inte nådde.
const REPRO = ['catalog:toplike:metall', 'catalog:toplike:voltage', 'catalog:fanlevel:layout:hero'];

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

// Mäter i sidan: designklasser och målade designdelar för en widget i ett givet läge.
const LIB = () => {
  const TILLFALLIGA = /^(selected|resize-|is-|ws-anim|wsPop|vyra-aktiv|lfp-still|hm-pa|playing|animating)/;
  window.__signatur = id => {
    const rot = document.querySelector(`.canvas [data-id="${id}"]`) || document.querySelector(`[data-id="${id}"]`);
    if (!rot) return null;
    const klasser = [...rot.classList].filter(k => !TILLFALLIGA.test(k)).sort();
    const delar = {};
    for (const el of rot.querySelectorAll('*')) {
      if (el.matches('.resize-handle,[data-vyra-handle],.vyra-handle,.vyra-handtag,script,style')) continue;
      let syns = true;
      for (let n = el; n && n !== rot.parentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') { syns = false; break; }
      }
      if (!syns) continue;
      const namn = el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].filter(k => !TILLFALLIGA.test(k)).sort().join('.') : '');
      delar[namn] = (delar[namn] || 0) + 1;
    }
    const r = rot.getBoundingClientRect();
    return { klasser, delar, bredd: r.width, hojd: r.height };
  };
  // vyra-rotation.js ger zoomen till familjer vars renderare inte ritar skalan själv (fyrverkerier,
  // Goal/Podium/Streak Pro …) i en observer efter render — samma steg körs här innan det mäts.
  const tillamp = () => { try { window.VyraTransform && window.VyraTransform.appliceraAlla && window.VyraTransform.appliceraAlla(); } catch (_) {} };
  window.__lagg = (nyckel, over) => {
    const w = Object.assign(window.VyraWidgets.create(nyckel), { id: 'dvs', x: 20, y: 20 }, over || {});
    state.widgets.length = 0; state.widgets.push(w); selected = null; render(); tillamp();
    return JSON.parse(JSON.stringify(w));
  };
  window.__steg = (over) => { const w = state.widgets[0]; Object.assign(w, over); render(); tillamp(); return window.__signatur('dvs'); };
};

// Skillnaden mellan två signaturer, i läsbar form. Tom = samma design.
function skillnad(a, b) {
  const ut = [];
  const kl = new Set([...a.klasser, ...b.klasser]);
  for (const k of kl) if (a.klasser.includes(k) !== b.klasser.includes(k)) ut.push(`${b.klasser.includes(k) ? '+' : '−'}klass ${k}`);
  for (const d of new Set([...Object.keys(a.delar), ...Object.keys(b.delar)])) {
    if ((a.delar[d] || 0) !== (b.delar[d] || 0)) ut.push(`${d}: ${a.delar[d] || 0} → ${b.delar[d] || 0}`);
  }
  return ut;
}

let server, browser, bas, editor;
const skip = hoppaOver();
test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function sida(url, viewport = { width: 1600, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.__fel = [];
  p.on('pageerror', e => p.__fel.push(String(e && e.message).slice(0, 160)));
  await p.goto(`${bas}${url}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets && !!window.VyraKompaktLage, null, { timeout: 60000, polling: 100 });
  await p.waitForTimeout(2500);
  await p.evaluate(LIB);
  return p;
}
async function editorn() {
  if (editor && !editor.isClosed()) return editor;
  editor = await sida('/studio.html?open=layout');
  await editor.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); view = 'editor'; render(); });
  return editor;
}

test('hela katalogen: Storlek 100 → 75 → 50 → 30 → 20 → 100 % byter aldrig design', { skip, timeout: 900000 }, async () => {
  const p = await editorn();
  const fel = [];
  for (const nyckel of NYCKLAR) {
    const ut = await p.evaluate(([k, skalor, eget]) => {
      const w = window.__lagg(k);
      if (eget.includes(w.type)) return { hoppa: true };
      const bas = window.__steg({ widgetScale: 1 });
      return { bas, steg: skalor.map(z => ({ z, s: window.__steg({ widgetScale: z }) })) };
    }, [nyckel, SKALOR, [...EGET]]);
    if (ut.hoppa) continue;
    if (!ut.bas) { fel.push(`${nyckel}: ingen widgetrot`); continue; }
    for (const { z, s } of ut.steg) {
      const d = s ? skillnad(ut.bas, s) : ['ingen widgetrot'];
      // Likformig: lådan följer skalan åt båda hållen (2 px avrundning). En text som har ett golv i
      // synliga pixlar växer relativt resten och gör lådan bredare — då är kompositionen inte densamma.
      // Toleransen är 4 skärmpixlar plus 2 %: en 1 px kant eller ett 1 px mellanrum kan inte ritas tunnare
      // än en pixel, så vid 20 % blir några pixlar kvar — det är rastreringen, inte en annan komposition.
      if (s && ut.bas.bredd > 4 && ut.bas.hojd > 4) {
        const fb = s.bredd / ut.bas.bredd, fh = s.hojd / ut.bas.hojd;
        const avB = Math.abs(s.bredd - ut.bas.bredd * z), avH = Math.abs(s.hojd - ut.bas.hojd * z);
        if (avB > 4 + 0.02 * ut.bas.bredd * z || avH > 4 + 0.02 * ut.bas.hojd * z) d.push(`inte likformig: bredd ×${fb.toFixed(3)}, höjd ×${fh.toFixed(3)}`);
      }
      if (d.length) fel.push(`${nyckel} vid ${z * 100} %: ${d.slice(0, 6).join(', ')}`);
    }
    if (ut.bas.klasser.some(k => /kompakt/.test(k)) && !/topgift.*neon|:neon/.test(nyckel)) fel.push(`${nyckel}: kompakt redan i full storlek (${ut.bas.klasser.join(' ')})`);
  }
  assert.deepEqual(fel, [], `${fel.length} lägen bytte design:\n  ` + fel.join('\n  '));
  assert.deepEqual(p.__fel, []);
});

test('Bredd-fältet till halva bredden byter inte design (utom egen text/bild/video)', { skip, timeout: 900000 }, async () => {
  const p = await editorn();
  const fel = [];
  for (const nyckel of NYCKLAR) {
    const ut = await p.evaluate(([k, eget]) => {
      const w = window.__lagg(k);
      if (eget.includes(w.type) || !(Number(w.width) > 0)) return { hoppa: true };
      const bas = window.__steg({});
      return { bas, smal: window.__steg({ width: Math.round(w.width / 2) }) };
    }, [nyckel, [...EGET]]);
    if (ut.hoppa) continue;
    const d = skillnad(ut.bas, ut.smal);
    if (d.length) fel.push(`${nyckel} vid halva bredden: ${d.slice(0, 6).join(', ')}`);
  }
  assert.deepEqual(fel, [], `${fel.length} widgetar bytte design av Bredd-fältet:\n  ` + fel.join('\n  '));
});

test('granskningens repro: Guld/Silver/Brons 50 %, Voltage 75 %, Fan Level Hero 75 % — kronor, ramar och vingar kvar', { skip, timeout: 240000 }, async () => {
  const p = await editorn();
  const ut = await p.evaluate(nycklar => nycklar.map(k => {
    window.__lagg(k);
    const syns = sel => { const rot = document.querySelector('.canvas [data-id="dvs"]'); const el = rot.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const delar = () => ({ krona: syns('.rk6-metallkrona, .rk6-krona'), ram: syns('.toplike-row img, .rk6-foto, .fan-profile'), ring: syns('.fan-ring'), vinge: syns('.fan-wing'), hjartan: syns('.fan-rising-hearts'), banner: syns('.fan-ribbon'), puls: syns('.fan-pulse-line') });
    const fore = window.__steg({ widgetScale: 1 }), del1 = delar();
    const z = k.includes('metall') ? 0.5 : 0.75;
    const efter = window.__steg({ widgetScale: z }), del2 = delar();
    return { k, z, fore, efter, del1, del2, zoom: getComputedStyle(document.querySelector('.canvas [data-id="dvs"]')).zoom };
  }), REPRO);
  for (const r of ut) {
    assert.deepEqual(skillnad(r.fore, r.efter), [], `${r.k} vid ${r.z * 100} % bytte design`);
    assert.ok(!r.efter.klasser.some(c => /kompakt/.test(c)), `${r.k}: ${r.efter.klasser.join(' ')}`);
    assert.equal(+r.zoom, r.z, `${r.k}: skalan ska vara likformig zoom ${r.z}, var ${r.zoom}`);
    // Varje designdel som syns i full storlek syns också förminskad — och tvärtom.
    assert.deepEqual(r.del2, r.del1, `${r.k}: designdelarna skiljer sig mellan 100 % och ${r.z * 100} %`);
    if (r.k.includes('metall')) assert.equal(r.del2.krona, true, 'Guld/Silver/Bronsens krona syns inte vid 50 %');
    // Likformig skalning: lådan krymper i samma proportion åt båda hållen.
    assert.ok(Math.abs(r.efter.bredd / r.fore.bredd - r.z) < 0.03 && Math.abs(r.efter.hojd / r.fore.hojd - r.z) < 0.03,
      `${r.k}: inte likformig — ${JSON.stringify({ b: r.efter.bredd / r.fore.bredd, h: r.efter.hojd / r.fore.hojd, z: r.z })}`);
  }
});

test('kompaktläget finns kvar som uttryckligt val i panelen, för varje berörd familj', { skip, timeout: 240000 }, async () => {
  const p = await editorn();
  const prov = [['catalog:toplike:voltage', 'rk6-kompakt'], ['catalog:ranking:templateTopCoins:signal-orbit', 'rk-kompakt'],
    ['catalog:gifterlevel:profile', 'lv-kompakt'], ['catalog:fanlevel:layout:hero', 'lv-kompakt']];
  for (const [nyckel, klass] of prov) {
    const r = await p.evaluate(([k]) => {
      const w = window.__lagg(k); selected = w.id; render();
      const ruta = document.querySelector('#vyraKompaktLage');
      if (!ruta) return { ruta: false };
      const fore = window.__signatur('dvs').klasser;
      ruta.checked = true; ruta.dispatchEvent(new Event('change'));
      return { ruta: true, fore, efter: window.__signatur('dvs').klasser, falt: state.widgets[0].kompaktLage };
    }, [nyckel]);
    assert.ok(r.ruta, `${nyckel}: panelen saknar kryssrutan Kompakt läge`);
    assert.ok(!r.fore.includes(klass), `${nyckel}: kompakt innan valet`);
    assert.ok(r.efter.includes(klass), `${nyckel}: valet gav inte ${klass}: ${r.efter.join(' ')}`);
    assert.equal(r.falt, true);
  }
  // Container-familjerna får rotklassen när valet är gjort, och CSS:en har ingen storleksfråga kvar.
  for (const [fil, fraga] of [['battle-mvp-celebrations.css', '@container (max-width:240px)'], ['fan-level-50.css', '@container (width < 190px)'], ['playground-widgets.css', '@container pgstreak (max-width:220px)']])
    assert.ok(!fs.readFileSync(path.join(ROOT, fil), 'utf8').includes(fraga), `${fil} väljer fortfarande utseende efter storlek`);
});

test('handtagsdrag, sparning och omladdning behåller designen', { skip, timeout: 240000 }, async () => {
  const p = await sida('/studio.html?open=layout');
  await p.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); view = 'editor'; render(); });
  const fore = await p.evaluate(() => { const w = window.__lagg('catalog:toplike:metall', { x: 120, y: 80 }); selected = w.id; save(); render(); return window.__signatur('dvs'); });
  const handtag = p.locator('.canvas [data-id="dvs"] .resize-handle').first();
  const box = await handtag.boundingBox();
  assert.ok(box, 'sydöstra handtaget syns inte');
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x - fore.bredd * 0.45, box.y - fore.hojd * 0.45, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const efterDrag = await p.evaluate(() => ({ s: window.__signatur('dvs'), z: state.widgets[0].widgetScale }));
  assert.ok(efterDrag.z < 0.75, `handtaget krympte inte widgeten (widgetScale ${efterDrag.z})`);
  assert.deepEqual(skillnad(fore, efterDrag.s), [], `handtagsdraget till ${efterDrag.z} bytte design`);
  await p.evaluate(() => save());
  await p.waitForTimeout(800);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets && !!window.VyraKompaktLage, null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  await p.evaluate(LIB);
  const omladdad = await p.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession(); view = 'editor'; render();
    const w = state.widgets.find(x => x.id === 'dvs');
    return w ? { z: w.widgetScale, s: window.__signatur('dvs') } : null;
  });
  assert.ok(omladdad, 'widgeten fanns inte efter omladdningen');
  assert.equal(omladdad.z, efterDrag.z, 'skalan sparades inte');
  assert.deepEqual(skillnad(fore, omladdad.s), [], 'designen efter omladdning skiljer sig från full storlek');
  assert.deepEqual(p.__fel, []);
});

test('OBS-utgången: samma design i liten storlek som i full', { skip, timeout: 300000 }, async () => {
  const p = await sida('/studio.html?overlay=1', { width: 1280, height: 900 });
  const nycklar = [...REPRO, 'catalog:toplike:celestial', 'catalog:ranking:templateTopPoints:royal-rose', 'catalog:gifterlevel:flip', 'catalog:fanlevel:layout:duo', 'catalog:ranking:templateTopCoins:signal-orbit'];
  const fel = [];
  for (const nyckel of nycklar) {
    const r = await p.evaluate(k => { window.__lagg(k); return { fore: window.__steg({ widgetScale: 1 }), efter: window.__steg({ widgetScale: 0.4 }) }; }, nyckel);
    if (!r.fore || !r.efter) { fel.push(`${nyckel}: ingen rot i overlay`); continue; }
    const d = skillnad(r.fore, r.efter);
    if (d.length) fel.push(`${nyckel} i OBS vid 40 %: ${d.slice(0, 6).join(', ')}`);
  }
  assert.deepEqual(fel, [], fel.join('\n'));
});
