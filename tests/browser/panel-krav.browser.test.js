'use strict';
// PANELKRAVEN FÖR MODELLER MED REGISTERPOST (panelspecifikationen 6, "Löpande").
//
// För varje modell som har en post i vyra-panelregister.js — i dag Top Gift · Design 1–3 och
// Signal Orbit (vyra-topgift-panel.js) och de elva Last-X (vyra-lastx-panel.js) — kräver provet
// att panelen
//   * har sektionerna i ordningen 1–7, med ▶ Testa widget först,
//   * inte har någon tom sektion,
//   * inte har någon etikett två gånger,
//   * inte visar någon text som matchar /assets\/|\.png|\.svg|URL/ (inte heller i fältvärden),
//   * har en enhet på varje tal: ett reglage har enheten i <b> efter värdet, ett talfält i etiketten
//     ("X (px)"); rena antal (Lager, Coins) är undantagna,
//   * bara visar kontroller som GÖR något. Mätmetoden är granskningens (scratchpad
//     wf-panel/topgrupp/granska.js): widgeten återställs, värdet sätts med input, change och blur,
//     och widgetens outerHTML, beräknade stil (upp till 600 noder, 30 egenskaper), text och bilder
//     jämförs före och efter. Animationerna tvingas till slutläget och brus (två vilobilder 900 ms
//     isär) räknas bort. Beroende kontroller mäts med förutsättningen satt (Skuggfärg med Skugga 10,
//     Konturfärg med Kontur 3). Mediaväljaren mäts genom sitt fält: ett annat giltigt värde ska synas.
//     Återställ utseende mäts för sig: den ska återställa utseendet och lämna innehåll och placering.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

// Återställ utseende provas med ett utseendefält, ett innehållsfält och placeringen.
const TOPGIFT_ATERSTALL = { utseende: 'accent', innehall: 'dataName' };
// LAST-X (vyra-lastx-panel.js, PR 5). Widgeten visar bara sin FÖRSTA typ i vila; vad en kontroll för
// en annan typ gör syns först när en händelse av den typen kommer. Sådana kontroller mäts därför
// med en händelse: samma händelse spelas före och efter ändringen (triggerLastXAlert, livevägen),
// och widgeten jämförs. Visningstiden ändrar bara hur länge kortet ligger kvar — inget som syns i
// en ögonblicksbild — och provas i stället av lastx-livevag.browser.test.js.
const LASTX_TYPER = /_(gifter|liker|sharer|subscriber|follower)$/;
const LASTX = {
  aterstall: { utseende: 'followColor', innehall: 'followName' },
  handelse: c => (LASTX_TYPER.exec(c.id) || [])[1] || (c.id === 'lastXPersistent' ? 'gifter' : null),
  tidsstyrt: { followDuration: 'visningstiden mäts i lastx-livevag.browser.test.js' },
};
// Panelkraven gäller alla elva Last-X-modellerna. Effekten per kontroll (den långsamma delen)
// mäts för en modell ur varje grupp: plattorna (card), royal och banderollerna (crownBanner) har
// olika registerposter; modellerna inom en grupp delar post.
const LASTX_MODELLER = ['card', 'stack', 'skew', 'badge', 'royal', 'crownBanner', 'royalAmethyst', 'iceKing', 'neonCyber', 'dragonFlame', 'angelGold']
  .map(d => Object.assign({ namn: 'Last-X · ' + d, nyckel: 'catalog:lastx:' + d, effekt: ['card', 'royal', 'crownBanner'].includes(d) }, LASTX));
const MODELLER = [
  { namn: 'Top Gift · Design 1 (neon)', nyckel: 'catalog:topgift:premium:neon', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 2 (royal)', nyckel: 'catalog:topgift:premium:royal', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 3 (fokus)', nyckel: 'catalog:topgift:premium:fokus', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 4 (Signal Orbit)', nyckel: 'catalog:ranking:templateTopCoins:signal-orbit', aterstall: TOPGIFT_ATERSTALL },
  ...LASTX_MODELLER,
];
const LACKA = /assets\/|\.png|\.svg|URL/;
const ENHET = /(px|%|ms|×|°|s)\s*$/;
const RENA_ANTAL = /^(Lager|Coins)$/;
const PAUS = '*,*::before,*::after{animation-duration:0.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;caret-color:transparent!important}';
// Förutsättningar för beroende kontroller (granskningens FORUTS).
const FORUTS = { vtShadowColor: { textShadowBlur: 10 }, vtOutlineColor: { textOutlineWidth: 3 } };

let server, browser, bas;
const skip = hoppaOver();

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

async function oppna(nyckel, fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n); w.id = 'krav'; w.x = 200; w.y = 200;
    state.widgets.push(w); selected = w.id; render();
  }, nyckel);
  await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(800);
  return page;
}

// ---- i sidan ---------------------------------------------------------------------------------
function sidStruktur() {
  const LACKA_SID = /assets\/|\.png|\.svg|URL/;
  const p = document.querySelector('.properties');
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
  p.querySelectorAll('[data-panelram-sektion].collapsible').forEach(s => s.classList.add('open'));
  const sektioner = [...p.querySelectorAll('[data-panelram-sektion]')].map(s => {
    const body = s.querySelector(':scope > .pg-body') || s;
    const rader = [...body.children].filter(el => !el.matches('h4'));
    return { nr: Number(s.dataset.panelramSektion), synligaRader: rader.filter(vis).length,
      forstaKontroll: (s.querySelector('button:not(.pg-toggle), input, select') || {}).id || '' };
  });
  // Etiketter: varje rads egen text (utan valens alternativ och värdet i <b>), mediaväljarens och
  // ramens rubriker, och fristående knappar. Knappar INUTI en sammansatt kontroll (mediaväljarens
  // Välj bild/Använd automatisk, ramväljarens rutor) är delar av den kontrollen.
  const etiketter = [];
  for (const s of p.querySelectorAll('[data-panelram-sektion]')) {
    s.querySelectorAll('label').forEach(l => {
      if (!vis(l) || l.closest('.vyra-mediaval')) return;
      const c = l.cloneNode(true);
      c.querySelectorAll('select, option, b, small, button, input').forEach(n => n.remove());
      const t = c.textContent.replace(/\s+/g, ' ').trim();
      if (t) etiketter.push(t);
    });
    s.querySelectorAll('.vm-etikett, .pr-etikett').forEach(n => { if (vis(n)) etiketter.push(n.textContent.trim()); });
    s.querySelectorAll('button').forEach(b => {
      if (!vis(b) || b.matches('.pg-toggle, .vyra-emoji-knapp') || b.closest('label, .vyra-mediaval, .pro-frame-picker')) return;
      etiketter.push(b.textContent.replace(/\s+/g, ' ').trim());
    });
  }
  const text = [...p.querySelectorAll('[data-panelram-sektion]')].map(s => s.innerText).join('\n');
  const varden = [...p.querySelectorAll('[data-panelram-sektion] input:not([type=file]), [data-panelram-sektion] textarea')]
    .filter(vis).map(i => i.value).filter(v => LACKA_SID.test(v));
  // Tal: reglage och talfält.
  const tal = [...p.querySelectorAll('[data-panelram-sektion] input[type=range], [data-panelram-sektion] input[type=number]')].filter(vis).map(i => {
    const l = i.closest('label');
    const b = l && l.querySelector(':scope > b');
    const c = l ? l.cloneNode(true) : null;
    if (c) c.querySelectorAll('input, b, small, button').forEach(n => n.remove());
    return { id: i.id, typ: i.type, b: b ? b.textContent.trim() : null, etikett: c ? c.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  return { sektioner, etiketter, text, varden, tal, forstaISektion1: (p.querySelector('[data-panelram-sektion="1"] button') || {}).id };
}

// Kontrollerna som ska mätas, med en selektor per kontroll.
function sidKontroller() {
  const p = document.querySelector('.properties');
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  p.querySelectorAll('[data-panelram-sektion].collapsible').forEach(s => s.classList.add('open'));
  const ut = [];
  let ramSedd = false;
  for (const s of p.querySelectorAll('[data-panelram-sektion]')) {
    const nr = Number(s.dataset.panelramSektion);
    if (nr === 7) continue;                                 // mäts för sig
    for (const el of s.querySelectorAll('input, select, button')) {
      if (!vis(el) || el.disabled || el.type === 'file') continue;
      if (el.matches('.pg-toggle, .vyra-emoji-knapp, #pr-testspel, #pr-testspel-typ')) continue;
      if (el.closest('.vyra-mediaval')) continue;           // mediaväljaren mäts genom sitt fält
      if (el.closest('.pro-frame-picker')) {
        // Ramväljaren: en ram som inte är vald räcker (flikarna Kollektion byter bara vy i väljaren).
        if (ramSedd || !el.dataset.wsFrame || el.classList.contains('active') || el.dataset.wsFrame === 'none') continue;
        ramSedd = true;
        ut.push({ sel: `.properties [data-ws-frame="${CSS.escape(el.dataset.wsFrame)}"]`, tag: 'button', typ: 'button', etikett: 'Profilram · ' + el.textContent.trim(), id: '' });
        continue;
      }
      const lab = el.closest('label');
      let etikett = '';
      if (lab) { const c = lab.cloneNode(true); c.querySelectorAll('select, option, b, small').forEach(n => n.remove()); etikett = c.textContent.replace(/\s+/g, ' ').trim(); }
      if (!etikett) etikett = el.textContent.replace(/\s+/g, ' ').trim();
      if (!el.id) continue;
      ut.push({ sel: '#' + CSS.escape(el.id), id: el.id, tag: el.tagName.toLowerCase(), typ: el.type, etikett,
        varde: el.type === 'checkbox' ? el.checked : el.value, min: el.min, max: el.max,
        alternativ: el.tagName === 'SELECT' ? [...el.options].map(o => o.value) : null });
    }
  }
  const media = [...p.querySelectorAll('[data-panelram-sektion] .vyra-mediaval')].filter(vis).map(n => n.dataset.mediaval);
  return { kontroller: ut, media };
}

function sidSnap(id) {
  const el = document.querySelector(`.canvas .widget[data-id="${id}"]`);
  if (!el) return null;
  const all = [el, ...el.querySelectorAll('*')];
  const style = all.slice(0, 600).map(n => { const c = getComputedStyle(n); return [n.tagName, typeof n.className === 'string' ? n.className : '', c.color, c.backgroundColor, c.backgroundImage.slice(0, 120), c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.opacity, c.transform, c.width, c.height, c.left, c.top, c.display, c.visibility, c.filter, c.textShadow, c.webkitTextStrokeWidth, c.webkitTextStrokeColor, c.borderTopColor, c.borderTopWidth, c.borderRadius, c.gap, c.marginTop, c.paddingTop, c.letterSpacing, c.zIndex, c.boxShadow.slice(0, 80)].join('|'); });
  const r = el.getBoundingClientRect();
  return { html: el.outerHTML.replace(/ selected/g, ''), style, rect: [r.x, r.y, r.width, r.height].map(Math.round).join(), txt: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')).join() };
}

// ---- i node ----------------------------------------------------------------------------------
function nyttVarde(c) {
  if (c.typ === 'checkbox' || c.tag === 'button') return '__klick';
  if (c.tag === 'select') { const alt = c.alternativ || []; const j = alt.indexOf(c.varde); return alt.length > 1 ? alt[(j + 1) % alt.length] : null; }
  if (c.typ === 'color') return String(c.varde).toLowerCase() === '#ff00ff' ? '#00ff00' : '#ff00ff';
  if (c.typ === 'range') { const v = +c.varde, mx = +c.max, mn = +c.min; return String(v !== mx ? mx : mn); }
  if (c.typ === 'number') {
    const v = +c.varde || 0, mx = c.max !== '' ? +c.max : null, mn = c.min !== '' ? +c.min : null;
    if (mx !== null && mn !== null) { const m = Math.round((mx + mn) / 2 + (mx - mn) / 4); return String(m !== v ? m : mn); }
    return String(v + 37);
  }
  return 'ÄNDRAD TEST';
}

async function tillampa(page, c, v) {
  return page.evaluate(([sel, v, tag]) => {
    const el = document.querySelector(sel);
    if (!el) return 'saknas';
    if (v === '__klick') { el.click(); return 'klick'; }
    const proto = tag === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'satt';
  }, [c.sel, v, c.tag]);
}

async function aterstall(page, orig, forut) {
  await page.evaluate(([o, f]) => {
    const i = state.widgets.findIndex(w => w.id === 'krav');
    state.widgets[i] = Object.assign(JSON.parse(o), f || {});
    selected = 'krav'; render();
  }, [orig, forut || null]);
  await page.waitForTimeout(450);
}

function skiljer(a, b, brus) {
  if (!a || !b) return !!a !== !!b;
  const stil = a.style.some((l, i) => l !== b.style[i] && !brus.stil.has(i)) || a.style.length !== b.style.length;
  return (a.html !== b.html && !brus.html) || stil || a.rect !== b.rect || (a.txt !== b.txt && !brus.txt) || a.imgs !== b.imgs;
}

for (const m of MODELLER) {
  test(`panelkraven: ${m.namn}`, { skip, timeout: 400000 }, async () => {
    const fel = [];
    const page = await oppna(m.nyckel, fel);
    try {
      const s = await page.evaluate(sidStruktur);

      // Ordningen 1–7 och ▶ Testa widget först.
      const nr = s.sektioner.map(x => x.nr);
      assert.equal(nr[0], 1, 'sektion 1 kommer först');
      assert.deepEqual(nr, [...nr].sort((a, b) => a - b), 'sektionerna står i ordningen 1–7');
      assert.equal(new Set(nr).size, nr.length, 'ingen sektion två gånger');
      assert.equal(s.forstaISektion1, 'pr-testspel', '▶ Testa widget är det första i sektion 1');
      // Ingen tom sektion.
      for (const x of s.sektioner) assert.ok(x.synligaRader > 0, `sektion ${x.nr} är tom`);
      // Ingen etikett två gånger.
      const dubbla = s.etiketter.filter((e, i) => s.etiketter.indexOf(e) !== i);
      assert.deepEqual(dubbla, [], 'etiketter som står två gånger');
      // Inga sökvägar eller adresser.
      assert.equal(LACKA.test(s.text), false, `panelens text visar en sökväg: ${(s.text.match(LACKA) || [])[0]}`);
      assert.deepEqual(s.varden, [], 'fältvärden som visar en sökväg');
      // Enheter.
      for (const t of s.tal) {
        if (RENA_ANTAL.test(t.etikett)) continue;
        if (t.typ === 'range') assert.ok(t.b && ENHET.test(t.b), `${t.etikett || t.id}: reglaget saknar enhet i <b> (${t.b})`);
        else assert.ok(/\((px|%|ms|°|s)\)/.test(t.etikett), `${t.etikett || t.id}: talfältet saknar enhet i etiketten`);
      }

      if (m.effekt === false) { assert.deepEqual(fel, [], 'inga sidfel'); return; }

      // Effekt per kontroll.
      await page.addStyleTag({ content: PAUS });
      const orig = await page.evaluate(() => JSON.stringify(state.widgets.find(w => w.id === 'krav')));
      await aterstall(page, orig);
      const s1 = await page.evaluate(sidSnap, 'krav');
      await page.waitForTimeout(900);
      const s2 = await page.evaluate(sidSnap, 'krav');
      const brus = { html: s1.html !== s2.html, txt: s1.txt !== s2.txt, stil: new Set() };
      s1.style.forEach((l, i) => { if (l !== s2.style[i]) brus.stil.add(i); });

      const { kontroller, media } = await page.evaluate(sidKontroller);
      assert.ok(kontroller.length >= 15, `för få kontroller hittades (${kontroller.length})`);
      const utan = [];
      const tidsstyrt = m.tidsstyrt || {};
      // En händelse genom livevägen (bara Last-X): samma händelse före och efter ändringen.
      const handelse = typ => page.evaluate(t => { window.triggerLastXAlert(t, { username: 'Händelseprov', __test: true }); }, typ)
        .then(() => page.waitForTimeout(500));
      const onodiga = [];
      for (const c of kontroller) {
        const v = nyttVarde(c);
        if (tidsstyrt[c.id]) {
          // Undantaget ska vara sant: kontrollen syns verkligen inte i en ögonblicksbild. Det visar
          // också att mätningen kan säga "ingen verkan" för den här modellen.
          await aterstall(page, orig);
          const f = await page.evaluate(sidSnap, 'krav');
          await tillampa(page, c, v);
          await page.waitForTimeout(700);
          if (skiljer(f, await page.evaluate(sidSnap, 'krav'), brus)) onodiga.push(c.id);
          // Samma sak med en händelse: händelsemätningen ovan får inte se verkan där ingen finns.
          if (m.handelse) {
            await aterstall(page, orig);
            await handelse('gifter');
            const fh = await page.evaluate(sidSnap, 'krav');
            await aterstall(page, orig);
            await tillampa(page, c, v);
            await page.waitForTimeout(700);
            await handelse('gifter');
            if (skiljer(fh, await page.evaluate(sidSnap, 'krav'), brus)) onodiga.push(c.id + ' (med händelse)');
          }
          continue;
        }
        if (v === null) { utan.push(`${c.etikett}: inget annat värde att prova`); continue; }
        await aterstall(page, orig, FORUTS[c.id]);
        let fore = await page.evaluate(sidSnap, 'krav');
        let how = await tillampa(page, c, v);
        await page.waitForTimeout(700);
        let efter = await page.evaluate(sidSnap, 'krav');
        const typ = m.handelse && m.handelse(c);
        if (how !== 'saknas' && !skiljer(fore, efter, brus) && typ) {
          await aterstall(page, orig, FORUTS[c.id]);
          await handelse(typ);
          fore = await page.evaluate(sidSnap, 'krav');
          await aterstall(page, orig, FORUTS[c.id]);
          how = await tillampa(page, c, v) + ' + händelse ' + typ;
          await page.waitForTimeout(700);
          await handelse(typ);
          efter = await page.evaluate(sidSnap, 'krav');
        }
        if (how === 'saknas' || !skiljer(fore, efter, brus)) utan.push(`${c.etikett} (${c.sel}, ${how})`);
      }
      // Mediaväljaren: ett annat giltigt värde i fältet ska synas i widgeten.
      const ANNAN = { profileImage: 'assets/gifts/events/7460_Cap.png', giftImage: 'assets/gifts/events/7578_Crown.png' };
      for (const falt of media) {
        await aterstall(page, orig);
        const fore = await page.evaluate(sidSnap, 'krav');
        await aterstall(page, orig, { [falt]: ANNAN[falt] || 'assets/gifts/events/7578_Crown.png' });
        const efter = await page.evaluate(sidSnap, 'krav');
        if (!skiljer(fore, efter, brus)) utan.push(`mediaväljaren ${falt}`);
      }
      assert.deepEqual(utan, [], 'kontroller utan synlig verkan');
      assert.deepEqual(onodiga, [], 'undantagna som tidsstyrda men syns ändå direkt — ta bort undantaget');
      for (const id of Object.keys(tidsstyrt)) assert.ok(kontroller.some(c => c.id === id), `undantaget ${id} finns inte i panelen`);

      // Återställ utseende: utseendet tillbaka, innehåll och placering kvar.
      await aterstall(page, orig);
      const fa = m.aterstall;
      const las7 = () => page.evaluate(f => { const w = liveWidget('krav'); return { accent: w[f.utseende], x: w.x, namn: w[f.innehall] }; }, fa);
      const fore7 = await las7();
      await page.evaluate(f => { const w = liveWidget('krav'); w[f.utseende] = '#ff00ff'; w.x = 333; w[f.innehall] = 'Kvar'; save(); render(); }, fa);
      await page.waitForTimeout(450);
      await page.evaluate(() => document.querySelector('.properties [data-panelram-sektion="7"]').classList.add('open'));
      await page.click('#pr-aterstall-utseende');
      await page.waitForTimeout(450);
      const efter7 = await las7();
      assert.equal(efter7.accent, fore7.accent, `Återställ utseende tar tillbaka ${fa.utseende}`);
      assert.equal(efter7.x, 333, 'placeringen rörs inte');
      assert.equal(efter7.namn, 'Kvar', 'innehållet rörs inte');

      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('en modell utan registerpost får ingen ramsektion och ingen arvsruta', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:topgift:premium:neon'); w.id = 'ram'; w.giftFrame = 'gold';
      state.widgets.push(w); selected = w.id; render();
    });
    await page.waitForTimeout(1200);
    const lage = await page.evaluate(() => ({ ram: document.querySelector('.properties')?.dataset.panelram || null,
      sektioner: document.querySelectorAll('[data-panelram-sektion]').length, arv: !!document.querySelector('#pr-inheritBrandKit') }));
    assert.deepEqual(lage, { ram: null, sektioner: 0, arv: false }, 'Top Gift med gåvoram har ingen post och får dagens panel');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// Last-X visar inte BAKGRUND för en ny widget (spec 5.17), men en sparad widget som redan har en egen
// bakgrund (widget-background.js ritar den bakom kortet) måste kunna ändra och ta bort den.
test('Last-X: en sparad widget med egen bakgrund behåller bakgrundsgruppen, en ny har den inte', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:lastx:card', fel);
  try {
    const sektion5 = () => page.evaluate(() => [...document.querySelectorAll('.properties [data-panelram-sektion="5"] #wbColor, .properties [data-panelram-sektion="5"] #wbHide')].map(e => e.id));
    assert.deepEqual(await sektion5(), [], 'en ny Last-X har ingen bakgrundsgrupp');
    await page.evaluate(() => { const w = liveWidget('krav'); w.bgColor = '#112233'; w.bgStrength = 80; save(); render(); });
    await page.waitForTimeout(800);
    assert.deepEqual((await sektion5()).sort(), ['wbColor', 'wbHide'], 'bakgrundsgruppen finns för widgeten med egen bakgrund');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
