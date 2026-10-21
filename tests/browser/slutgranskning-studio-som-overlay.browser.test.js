'use strict';
// SLUTGRANSKNINGEN 2026-10-20 (granskare A och B): STUDION RITAR DET SOM SÄNDS, OCH NOLLÄGET ÄR HELT.
//
// Provet bygger en widget i taget i studion (?open=layout) och i overlayn (?overlay=1) på två sidor
// och mäter det som granskningen fann fel — beräknade stilar och DOM, inte pixlar:
//
//   A-001  Top Gift · Design 1 (premium:neon) i overlay före första gåvan: talet blir 0 men myntet
//          (ett <i> först i <em>) står kvar. Förut skrev live-zero-state.js textContent och rev det.
//   A-002  Signal Orbit (Top Gift · Design 4): enheten finns i overlay som i studion. Förut ritades
//          '44 999 COINS' i studion och bara '0' i overlay; nu bär texten talet och CSS:en ' MYNT'.
//   A-003  Top Like/Coins/Points Voltage, Basic v2 och Prism: en rad utan namn har ingen tom namnyta.
//   A-004  Fan Level 50: "NOVA STORM" (10 tecken) klipps inte i overlay.
//   A-005–A-007 och B-004  Fan Level Up (band, hjärta), Fan Level 50 och Goal Pro: varje synligt
//          textelement har samma storlek och färg i studion som i overlay, och Goal Pros "GIFT-MÅL"
//          ärver radens storlek i stället för 8 px (≈3 px på skärmen).
//   B-017  Portal, Låtönskningar, Skattkista, Fan Level 50, Guardian och Last-X: ingen kant, glöd
//          eller bakgrund på roten i studion som inte finns i overlay.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, rigg, studio, overlay;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  rigg = await servera();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  studio = await ctx.newPage();
  await studio.goto(`${rigg.bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await studio.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister && !!window.VyraFanLevel50,
    null, { timeout: 60000, polling: 100 });
  await studio.waitForTimeout(2000);
  await studio.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  overlay = await ctx.newPage();
  await overlay.goto(`${rigg.bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await overlay.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets && !!window.VyraFanLevel50,
    null, { timeout: 60000, polling: 100 });
  await overlay.waitForTimeout(2500);
});

test.after(async () => {
  if (browser) await browser.close();
  if (rigg) await rigg.stang();
});

// En widget av nyckeln på sidan, ingen vald. Sidan väntar två bildrutor och 350 ms (zero-state och
// namnpassningen kör efter ritningen).
async function bygg(page, nyckel) {
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n); w.id = 'sg'; w.x = 40; w.y = 40;
    state.widgets.push(w); selected = null; render();
  }, nyckel);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 350)))));
}
const rot = '.canvas [data-id="sg"]:not([data-testspel-klon])';

// Varje synligt textelement (egen textnod) i widgeten: tagg, klass, storlek och färg, i DOM-ordning.
function texter(sel) {
  const box = document.querySelector(sel); if (!box) return null;
  return [...box.querySelectorAll('span,strong,em,b,small,i,div')]
    .filter(e => !e.closest('.resize-handle,.gift-resize-handle') && e.getClientRects().length
      && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()))
    .map(e => { const c = getComputedStyle(e); return `${e.tagName}.${String(e.className)} "${e.textContent.trim().slice(0, 20)}" ${c.fontSize} ${c.color}`; });
}

test('A-001: Top Gift · Design 1 behåller myntet när overlayn nollar talet', { skip }, async () => {
  await bygg(overlay, 'catalog:topgift:premium:neon');
  const v = await overlay.evaluate(s => {
    const em = document.querySelector(s + ' .topgift-copy em');
    return em && { text: em.textContent.trim(), mynt: !!em.querySelector(':scope > i.rk-mynt > svg'), forst: em.firstElementChild?.tagName };
  }, rot);
  assert.ok(v, 'värdet finns i overlayn');
  assert.equal(v.text, '0', 'talet är nollat');
  assert.ok(v.mynt, `myntet står kvar först i värdet (första barn: ${v.forst})`);
});

test('A-002: Signal Orbit visar enheten COINS i overlay, i studion och i talet som livevägen skriver', { skip }, async () => {
  for (const [page, vantat] of [[overlay, '0'], [studio, '44 999']]) {
    await bygg(page, 'catalog:ranking:templateTopCoins:signal-orbit');
    const v = await page.evaluate(s => {
      const em = document.querySelector(s + ' .tc-copy em');
      return em && { text: em.textContent.replace(/\s+/g, ' ').trim(), efter: getComputedStyle(em, '::after').content, mynt: !!em.querySelector(':scope > i.tc-mynt') };
    }, rot);
    assert.ok(v, 'värdet finns');
    assert.equal(v.text.replace(/ /g, ' '), vantat, 'texten bär bara talet');
    assert.equal(v.efter, '"COINS"', 'enheten ritas efter talet');
    assert.ok(v.mynt, 'myntet står kvar');
  }
});

test('A-003: en rankingrad utan namn har ingen tom namnyta i overlay (Voltage, Basic v2, Prism)', { skip }, async () => {
  for (const n of ['catalog:toplike:voltage', 'catalog:toplike:basic-v2', 'catalog:toplike:prism-vertical',
    'catalog:ranking:templateTopCoins:voltage', 'catalog:ranking:templateTopPoints:basic-v2']) {
    await bygg(overlay, n);
    const o = await overlay.evaluate(s => [...document.querySelectorAll(s + ' .toplike-row')].map(r => ({
      namn: r.querySelector('strong')?.textContent || '', syns: (cs => cs.display !== 'none' && cs.visibility !== 'hidden')(getComputedStyle(r.querySelector('.rk6-namn'))) })), rot);
    assert.ok(o.length >= 1, `${n}: raderna finns`);
    for (const r of o) assert.ok(r.namn !== '' || !r.syns, `${n}: tomt namn men namnytan syns`);
    await bygg(studio, n);
    const s = await studio.evaluate(s => [...document.querySelectorAll(s + ' .rk6-namn')].map(e => getComputedStyle(e).display), rot);
    assert.ok(s.length && s.every(d => d !== 'none'), `${n}: i studion syns exempelnamnen som förut`);
  }
});

test('A-004: Fan Level 50 klipper inte ett namn på tio tecken i overlay', { skip }, async () => {
  await bygg(overlay, 'catalog:fanlevel50:royal');
  const namn = await overlay.evaluate(s => [...document.querySelectorAll(s + ' .fl50-name span')]
    .filter(e => e.clientWidth > 0).map(e => ({ t: e.textContent, sw: e.scrollWidth, cw: e.clientWidth })), rot);
  assert.ok(namn.some(x => x.t === 'NOVA STORM'), 'NOVA STORM står på ett kort');
  for (const x of namn) assert.ok(x.sw <= x.cw, `${x.t}: ${x.sw} px text i ${x.cw} px banderoll`);
});

test('A-005–A-007, B-004: texten i widgeten är likadan i studion som i overlay', { skip }, async () => {
  for (const n of ['catalog:fanlevel:layout:ribbon', 'catalog:fanlevel:layout:hero', 'catalog:fanlevel50:royal',
    'catalog:pggoal:1', 'catalog:pggoal:6']) {
    await bygg(studio, n); await bygg(overlay, n);
    const s = await studio.evaluate(texter, rot), o = await overlay.evaluate(texter, rot);
    assert.ok(s && s.length, `${n}: text i studion`);
    assert.deepEqual(s.filter(x => !/^EM|^B\.(pc|mk)|^B\.big/.test(x)), o.filter(x => !/^EM|^B\.(pc|mk)|^B\.big/.test(x)),
      `${n}: samma storlek och färg i studio och overlay`);
  }
  // Goal Pro: rubriken ärver radens storlek (30 px i designen), inte 8 px.
  await bygg(overlay, 'catalog:pggoal:1');
  const g = await overlay.evaluate(s => {
    const l = [...document.querySelectorAll(s + ' .s3l')].find(e => e.getClientRects().length);
    return l && { l: getComputedStyle(l).fontSize, rad: getComputedStyle(l.parentElement).fontSize };
  }, rot);
  assert.ok(g, 'Goal Pros rubrik syns');
  assert.equal(g.l, g.rad, 'GIFT-MÅL har radens storlek');
});

test('B-017: ingen redigeringskant, glöd eller bakgrund på familjer som ritar hela sin yta', { skip }, async () => {
  const stil = s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e);
    return [c.borderTopWidth, c.backgroundColor, c.boxShadow].join(' | '); };
  for (const n of ['catalog:likefountain:portal:aurora', 'catalog:latonskningar:spotify', 'catalog:skattkista:kista',
    'catalog:fanlevel50:royal', 'catalog:guardianemblem:1', 'catalog:lastx:card']) {
    await bygg(studio, n); await bygg(overlay, n);
    const s = await studio.evaluate(stil, rot), o = await overlay.evaluate(stil, rot);
    assert.ok(s && o, `${n}: widgeten finns`);
    assert.equal(s, o, `${n}: roten ser likadan ut i studio och overlay`);
  }
});

// A-008: ramväljaren visar bara riktiga ramar. De 19 SVG-platshållarna visas inte som val — utom den
// som en sparad widget redan har vald, som står kvar (aktiv) och ritas som förut.
test('A-008: ramväljaren gömmer platshållarramarna men behåller en redan vald', { skip }, async () => {
  for (const [n, ram, vantat] of [['catalog:fanlevel:layout:hero', null, 0], ['catalog:topgift:premium:neon', null, 0],
    ['catalog:fanlevel:layout:hero', 'bronze', 1]]) {
    await studio.evaluate(([n, ram]) => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create(n); w.id = 'sg'; w.x = 40; w.y = 40; if (ram) w.profileFrame = ram;
      state.widgets.push(w); selected = 'sg'; render();
    }, [n, ram]);
    await studio.waitForTimeout(500);
    const v = await studio.evaluate(() => ({
      alla: document.querySelectorAll('.properties .ws-frame-swatch').length,
      plats: [...document.querySelectorAll('.properties .ws-frame-swatch.placeholder')].map(b => b.dataset.wsFrame + (b.classList.contains('active') ? '*' : '')),
      text: [...document.querySelectorAll('.properties .ws-frame-swatch small')].filter(s => /platshållare/.test(s.textContent)).length
    }));
    assert.ok(v.alla > 5, `${n}: ramväljaren finns i panelen (${v.alla} rutor)`);
    assert.equal(v.plats.length, vantat, `${n}${ram ? ' med ' + ram : ''}: platshållare i väljaren: ${v.plats.join(', ')}`);
    if (ram) assert.deepEqual(v.plats, [ram + '*'], 'den valda platshållaren står kvar och är markerad');
  }
});
