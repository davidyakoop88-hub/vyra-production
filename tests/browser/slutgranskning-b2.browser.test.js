'use strict';
// SLUTGRANSKNING B (2026-10-20): DE LÅGA FYNDEN, ETT PROV PER FYND SOM GÅR ATT MÄTA.
//
// Varje prov nedan föll mot ee7091ba (grenen med de höga och medelhöga fynden rättade):
//   B-018  Top Streak utan data: "×0 STREAK" i sändningen, och Top Streak Flip "Ingen streak än" + "STREAK 0".
//   B-022  Gift Campaign liggande: undertext, gåvonamn och "… kvar till målet" på 6–7 px i sändningen.
//   B-023  Social Goal: snedstrecket i "0 / 1 000" var 8 px i sändningen och 11 px i studion.
//   B-024  Talformat i panelen: decimalpunkt, "100%" bredvid "62 %", "0px", "2000 mynt".
//   B-025  Sektion 1:s rubrik "▶ Testa widget" upprepade knappen direkt under.
//   B-026  Testets typväljare låg kant i kant under Testa-knappen.
//   B-027  Heart Me: "Fast bredd …" stod efter Lager, tre rader under Bredd.
//   B-028  Goal Pro: "Färgpalett" större och blekare än panelens andra etiketter.
//   B-029  Fyrverkerier och bubblor var en tom ruta på duken i vila.
//   B-031  Låtönskningar: källetiketten YOUTUBE nästan osynlig.
//   B-033  Social Goal: tidslinjen visade "Entré" fast entrén är 0 ms.
//   B-036  Egen text: "Ta bort bakgrund" gjorde ingenting utan bakgrund.
//   B-037  Fan Level 50: fältet för deltagare saknade synlig etikett.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function studio() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister && typeof VyraWidgets !== 'undefined'
    && !!window.VyraGoalMotion, null, { timeout: 40000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  return page;
}
async function overlay() {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function' && !!window.VyraGoalMotion, null, { timeout: 40000, polling: 100 });
  return page;
}
async function valj(page, nyckel, falt) {
  await page.evaluate(([n, f]) => {
    state.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; Object.assign(w, f || {});
    state.widgets.push(w); selected = 'prov'; render();
  }, [nyckel, falt]);
  await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(400);
}
async function iOverlay(page, nyckel, falt) {
  await page.evaluate(async ([n, f]) => {
    const st = window.eval('state'); st.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; Object.assign(w, f || {});
    st.widgets.push(w); render();
    await new Promise(r => setTimeout(r, 800));
  }, [nyckel, falt]);
}
// Synlig text i widgeten, utan dolda grenar.
const synligText = () => {
  const n = document.querySelector('[data-id="prov"]');
  return n ? n.innerText.replace(/\s+/g, ' ').trim() : null;
};

test('B-018: Top Streak utan data visar vilan "Ingen streak än" utan nolla i sändningen', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    for (const n of ['catalog:topstreak', 'catalog:topstreak:design:1', 'catalog:topstreak:design:2', 'catalog:topstreak:design:3']) {
      await iOverlay(page, n);
      const t = await page.evaluate(synligText);
      assert.match(t, /Ingen streak än/, n + ': vilan saknas');
      assert.doesNotMatch(t, /×\s*0|STREAK/, n + ': "×0 STREAK" syns i sändningen: ' + t);
    }
    await iOverlay(page, 'catalog:pgstreak:royal-wings');
    const flip = await page.evaluate(synligText);
    assert.match(flip, /Ingen streak än/);
    assert.doesNotMatch(flip, /\b0\b/, 'Top Streak Flip visar fortfarande "STREAK 0": ' + flip);
  } finally { await page.close(); }
});

test('B-022: Gift Campaign liggande har undertexter på minst 8 px i sändningen, stående är orörd', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    const matt = () => {
      const n = document.querySelector('[data-id="prov"]'), lay = n.querySelector('.campaign-aura-layout');
      const z = parseFloat(lay.style.zoom) || 1;
      // Höjden på textens radruta delat med radhöjdens kvot ger den ritade storleken oberoende av hur
      // webbläsaren redovisar zoom i getComputedStyle.
      const px = el => { const r = document.createRange(); r.selectNodeContents(el); const h = r.getBoundingClientRect().height;
        const cs = getComputedStyle(el); return { ritad: h, css: parseFloat(cs.fontSize), z }; };
      return { under: px(n.querySelector('.event-heading span')), namn: px(n.querySelector('.name')), z };
    };
    await iOverlay(page, 'catalog:giftcampaign:gold:landscape');
    const l = await page.evaluate(matt);
    assert.ok(l.z < 1, 'liggande ska vara nedskalad i standardstorlek (riggens antagande)');
    for (const [k, v] of Object.entries({ under: l.under, namn: l.namn })) assert.ok(v.css * l.z >= 8, `${k}: ${(v.css * l.z).toFixed(1)} px i sändningen`);
    await iOverlay(page, 'catalog:giftcampaign:gold:portrait');
    const p = await page.evaluate(matt);
    assert.equal(p.under.css, 10, 'stående undertext ska vara orörd');
  } finally { await page.close(); }
});

test('B-023: snedstrecket i Social Goal följer talen, i overlayn och i studion', { skip, timeout: 120000 }, async () => {
  const fraga = () => {
    const s = document.querySelector('[data-id="prov"] .goal-motion-copy strong');
    return { strong: getComputedStyle(s).fontSize, span: getComputedStyle(s.querySelector('span')).fontSize };
  };
  const ov = await overlay();
  try {
    await iOverlay(ov, 'catalog:socialgoal:likes:heart-rail:landscape');
    const o = await ov.evaluate(fraga);
    assert.equal(o.span, o.strong, 'overlay');
  } finally { await ov.close(); }
  const st = await studio();
  try {
    await valj(st, 'catalog:socialgoal:likes:heart-rail:landscape');
    const s = await st.evaluate(() => {
      const el = document.querySelector('.canvas [data-id="prov"] .goal-motion-copy strong');
      return { strong: getComputedStyle(el).fontSize, span: getComputedStyle(el.querySelector('span')).fontSize };
    });
    assert.equal(s.span, s.strong, 'studio');
  } finally { await st.close(); }
});

test('B-024: panelens värden har decimalkomma och mellanslag före enheten, även efter ett drag', { skip, timeout: 160000 }, async () => {
  const page = await studio();
  const fel = () => [...document.querySelectorAll('.properties label > b')].map(b => b.textContent.trim())
    .filter(t => /^-?\d+\.\d/.test(t) || /^-?[\d,]+(%|px|s|ms|×)$/.test(t));
  try {
    for (const n of ['catalog:pggoal:1', 'catalog:giftfireworks:royal', 'catalog:likefountain', 'catalog:custom:text', 'catalog:heartgoal:classic']) {
      await valj(page, n);
      assert.deepEqual(await page.evaluate(fel), [], n);
    }
    await valj(page, 'catalog:pggoal:1');
    const glod = await page.evaluate(async () => {
      const mal = document.querySelector('.properties [data-pgv="pgg_target"], .properties b[data-pgv$="target"]');
      const el = document.querySelector('#pgg_glow');
      el.value = '0.85'; el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      return { glod: el.closest('label').querySelector('b').textContent, mal: mal && mal.textContent };
    });
    assert.equal(glod.glod, '0,85 ×', 'Glöd efter drag');
    if (glod.mal) assert.match(glod.mal, /^\d{1,3}( \d{3})* /, 'Goal Pros mål med tusentalsmellanslag: ' + glod.mal);
  } finally { await page.close(); }
});

test('B-025–B-028, B-033, B-036, B-037: panelens rubriker, ordning och etiketter', { skip, timeout: 200000 }, async () => {
  const page = await studio();
  try {
    // B-025: sektion 1:s rubrik ritas inte, men finns för skärmläsare.
    await valj(page, 'catalog:heartgoal:classic');
    const rub = await page.evaluate(() => {
      const h = document.querySelector('.properties [data-panelram-sektion="1"] h4');
      const r = h && h.getBoundingClientRect();
      return { text: h && h.textContent, w: r && r.width, h: r && r.height };
    });
    assert.equal(rub.text, '▶ Testa widget');
    assert.ok(rub.w <= 1 && rub.h <= 1, 'rubriken "▶ Testa widget" syns fortfarande ovanför knappen');

    // B-027: hjälpraden om fast bredd står direkt under Bredd.
    const fast = await page.evaluate(() => {
      const bredd = document.querySelector('.properties #propWidth').closest('label');
      return bredd.nextElementSibling && bredd.nextElementSibling.id;
    });
    assert.equal(fast, 'prFastBredd');

    // B-026: typväljaren före knappen, med luft.
    await valj(page, 'catalog:giftfireworks:royal');
    const typ = await page.evaluate(() => {
      const val = document.querySelector('#pr-testspel-typ').closest('label'), knapp = document.querySelector('#pr-testspel');
      return { fore: !!(val.compareDocumentPosition(knapp) & Node.DOCUMENT_POSITION_FOLLOWING), luft: knapp.getBoundingClientRect().top - val.getBoundingClientRect().bottom };
    });
    assert.equal(typ.fore, true, 'typväljaren ska stå före knappen');
    assert.ok(typ.luft >= 8, 'luft mellan typväljaren och knappen: ' + typ.luft);

    // B-028: Färgpalett har panelens etikettstil.
    await valj(page, 'catalog:pggoal:1');
    const pal = await page.evaluate(() => {
      const r = getComputedStyle(document.querySelector('.properties .pg-pal-rubrik'));
      const l = getComputedStyle(document.querySelector('.properties [data-pr-kontroll="falt:pg.x.skin"]'));
      return { r: [r.fontSize, r.fontWeight, r.color], l: [l.fontSize, l.fontWeight, l.color] };
    });
    assert.deepEqual(pal.r, pal.l);

    // B-033: tidslinjen visar inte ett steg på 0 ms.
    await valj(page, 'catalog:socialgoal:likes:heart-rail:landscape');
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    const steg = await page.evaluate(() => ({
      faser: window.VyraTestspel && window.VyraTestspel.status ? window.VyraTestspel.status().faser : null,
      entre: getComputedStyle(document.querySelector('.pr-tidslinje li[data-fas="entre"]')).display,
    }));
    if (steg.faser) assert.equal(steg.faser.entre, 0, 'riggens antagande: Social Goal har ingen entré');
    assert.equal(steg.entre, 'none', 'Entré visas i tidslinjen fast den är 0 ms');
    await page.click('#pr-testspel').catch(() => {});

    // B-036: Egen text utan bakgrund.
    await valj(page, 'catalog:custom:text');
    await page.waitForTimeout(200);
    const egen = await page.evaluate(() => {
      document.querySelector('.properties [data-panelram-sektion="5"]').classList.add('open');
      const r = document.querySelector('.properties #wbHide'), not = document.querySelector('.properties .pr-egen-utan-bakgrund');
      return { av: r.disabled, not: not && not.textContent, synlig: !!not && not.getClientRects().length > 0 };
    });
    assert.equal(egen.av, true, '"Ta bort bakgrund" ska vara inaktiv utan bakgrund');
    assert.equal(egen.synlig, true);
    await valj(page, 'catalog:custom:text', { bgColor: '#202020', bgStrength: 60 });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.querySelector('.properties #wbHide').disabled), false, 'med bakgrund går den att använda');

    // B-037: Fan Level 50, etikett för deltagarfältet.
    await valj(page, 'catalog:fanlevel50:royal');
    const fl = await page.evaluate(() => {
      const l = document.querySelector('.properties label[for="fl50AddUser"]');
      return { text: l && l.textContent.trim(), synlig: !!l && l.getClientRects().length > 0, namn: document.querySelector('#fl50AddUser').labels.length };
    });
    assert.equal(fl.text, 'Användarnamn att lägga till');
    assert.equal(fl.synlig, true);
    assert.equal(fl.namn, 1);
  } finally { await page.close(); }
});

test('B-029: effektwidgetar i vila har en etikett på duken, aldrig i overlayn', { skip, timeout: 120000 }, async () => {
  const st = await studio();
  try {
    for (const n of ['catalog:giftfireworks:royal', 'catalog:heartfireworks', 'catalog:giftbubbles']) {
      await valj(st, n);
      const e = await st.evaluate(() => {
        const v = document.querySelector('.canvas [data-id="prov"] > .vyra-effekt-vila');
        return v && { text: v.innerText.replace(/\s+/g, ' ').trim(), synlig: v.getClientRects().length > 0 };
      });
      assert.ok(e && e.synlig, n + ': ingen etikett på duken');
      assert.match(e.text, /Syns i sändningen vid en gåva/);
    }
  } finally { await st.close(); }
  const ov = await overlay();
  try {
    await iOverlay(ov, 'catalog:giftfireworks:royal');
    assert.equal(await ov.evaluate(() => !!document.querySelector('.vyra-effekt-vila')), false, 'etiketten läcker in i overlayn');
  } finally { await ov.close(); }
});

test('B-031: källetiketten i Låtönskningar har läsbar kontrast', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    await iOverlay(page, 'catalog:latonskningar:youtube');
    const k = await page.evaluate(() => {
      const s = document.querySelector('[data-id="prov"] header small'), cs = getComputedStyle(s);
      const [r, g, b] = cs.color.match(/\d+/g).map(Number);
      return { text: s.textContent.trim(), ljus: (r + g + b) / 3, opacitet: Number(cs.opacity) };
    });
    assert.ok(k.text.length > 0, 'källetiketten saknas');
    assert.ok(k.ljus * k.opacitet >= 180, `källetiketten är för svag: ljus ${k.ljus} × opacitet ${k.opacitet}`);
  } finally { await page.close(); }
});
