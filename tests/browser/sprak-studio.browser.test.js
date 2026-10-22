'use strict';
// STUDIONS CHROME PÅ ENGELSKA, i en riktig webbläsare (vyra-sprak.js steg 2, 2026-10-22).
//
// Det jsdom-provet (tests/sprak-studio.test.js) inte kan se: att HELA studion — med alla sena
// skript, observatörer och omritningar — faktiskt blir engelsk, inte låser sig i en slinga mellan
// översättningen och ett skript som skriver tillbaka sin svenska (uppmätt: Bakgrund-knappen i
// stage-background.js gick 9 866 varv innan sidan ens laddat klart), och att duken står orörd.
//
//   1. navet, sidhuvudet och huvudvyerna har ingen svensk text kvar på engelska (inloggad, med
//      riggens mock-backend),
//   2. widgetarna på duken har samma text på engelska som på svenska,
//   3. SV i sidhuvudet återställer svenskan i navet, rubriken och brödsmulan utan omladdning,
//   4. overlayläget (?overlay=1) har ingen VyraLang, även med ?lang=en i adressen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { servera } = require('../rigg/servera.js');

let browser, rigg;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  rigg = await servera({ backend: true });
});
test.after(async () => {
  if (browser) await browser.close();
  if (rigg) await rigg.stang();
});

// Kommandon och namn som är svenska med flit i båda språken (chattkommandot heter !önska).
const TILLATET = [/!önska/];

async function studio(sok) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const varningar = [];
  page.on('console', m => { if (m.text().includes('[vyra-sprak]')) varningar.push(m.text()); });
  await page.goto(`${rigg.bas}/studio.html${sok}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => typeof window.render === 'function' && !!document.querySelector('#view'), null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  // Provperiodspåminnelsen ligger som en modal över studion i riggens "sista dagen"-läge.
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  return { context, page, varningar };
}

// Synlig text och chrome-attribut med svenska tecken, utanför det sidan undantar (widgetinnehåll).
function svenskKvar(page, rotSel) {
  return page.evaluate(([rotSel, tillatet]) => {
    const utom = document.documentElement.getAttribute('data-sprak-utom') || '';
    const tillat = tillatet.map(s => new RegExp(s));
    const ut = [];
    for (const rot of document.querySelectorAll(rotSel)) {
      const tw = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = tw.nextNode())) {
        const el = n.nodeType === 3 ? n.parentElement : n;
        if (!el || el.closest('script,style,textarea') || (utom && el.closest(utom))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const texter = n.nodeType === 3 ? [n.nodeValue] : ['placeholder', 'aria-label', 'title'].map(a => n.getAttribute(a)).filter(Boolean);
        for (const t of texter) {
          const rad = t.replace(/\s+/g, ' ').trim();
          if (/[åäöÅÄÖ]/.test(rad) && !tillat.some(re => re.test(rad))) ut.push(rad.slice(0, 90));
        }
      }
    }
    return [...new Set(ut)];
  }, [rotSel, TILLATET.map(r => r.source)]);
}

test('engelska: navet, sidhuvudet och huvudvyerna har ingen svensk text kvar', { skip, timeout: 240000 }, async () => {
  const { context, page, varningar } = await studio('?lang=en');
  try {
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const fel = [];
    const chrome = await svenskKvar(page, 'aside, main > header');
    if (chrome.length) fel.push('nav/sidhuvud: ' + chrome.join(' | '));
    assert.equal(await page.evaluate(() => document.querySelector('[data-view="settings"] span').textContent), 'Settings');
    assert.equal(await page.evaluate(() => document.querySelector('[data-view="events"] span').textContent), 'Events');
    for (const vy of ['home', 'actions', 'soundAlerts', 'ttsChat', 'chatbot', 'streamdeck', 'spotify',
      'events', 'liveControl', 'analytics', 'performanceWizard', 'support', 'settings', 'guide']) {
      await page.evaluate(v => document.querySelector(`[data-view="${v}"],[data-extra="${v}"]`).click(), vy);
      await page.waitForTimeout(900);
      const kvar = await svenskKvar(page, '#view, main > header');
      if (kvar.length) fel.push(vy + ': ' + kvar.join(' | '));
    }
    assert.deepEqual(fel, [], 'svensk text kvar på engelska:\n  ' + fel.join('\n  '));
    assert.deepEqual(varningar, [], 'ingen återkopplingsslinga ska ha lösts ut');
  } finally { await context.close() }
});

test('engelska: duken och widgetarna är orörda, verktygsraden är översatt', { skip, timeout: 120000 }, async () => {
  const lasDuk = async sok => {
    const { context, page, varningar } = await studio(sok + '&open=layout');
    try {
      await page.waitForFunction(() => !!document.querySelector('.canvas .widget'), null, { timeout: 20000 });
      await page.waitForTimeout(800);
      return {
        duk: await page.evaluate(() => [...document.querySelectorAll('.canvas .widget')].map(w => w.textContent.replace(/\s+/g, ' ').trim())),
        verktyg: await page.evaluate(() => document.querySelector('.editor-toolbar').innerText.replace(/\s+/g, ' ')),
        lager: await page.evaluate(() => document.querySelector('.live-layer-panel').innerText.replace(/\s+/g, ' ')),
        varningar,
      };
    } finally { await context.close() }
  };
  const sv = await lasDuk('?lang=sv');
  const en = await lasDuk('?lang=en');
  assert.ok(sv.duk.length > 0, 'riggens layout ska ha minst en widget på duken');
  assert.deepEqual(en.duk, sv.duk, 'widgetarnas text ska vara densamma på båda språken (steg 3)');
  assert.match(sv.verktyg, /Ångra/);
  assert.match(en.verktyg, /Undo/);
  assert.doesNotMatch(en.verktyg, /Ångra|Gör om|Bakgrund|Testevent/);
  assert.match(en.lager, /LIVE LAYERS/);
  assert.deepEqual(en.varningar, []);
});

test('SV i sidhuvudet återställer svenskan utan omladdning', { skip, timeout: 120000 }, async () => {
  const { context, page } = await studio('?lang=en');
  try {
    await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.querySelector('#title').textContent.trim()), 'Settings');
    await page.click('.studio-sprakval button[data-sprak="sv"]');
    await page.waitForTimeout(300);
    const las = () => page.evaluate(() => ({
      lang: document.documentElement.lang,
      lagrat: localStorage.getItem('vyra-sprak'),
      titel: document.querySelector('#title').textContent.trim(),
      smula: document.querySelector('#crumb').textContent.trim(),
      nav: document.querySelector('[data-view="home"] span').textContent,
      grupp: document.querySelector('.nav-section-label').textContent,
      tryckt: document.querySelector('.studio-sprakval button[data-sprak="sv"]').getAttribute('aria-pressed'),
    }));
    assert.deepEqual(await las(), { lang: 'sv', lagrat: 'sv', titel: 'Inställningar', smula: 'VYRA / INSTÄLLNINGAR',
      nav: 'Översikt', grupp: 'Kärna', tryckt: 'true' });
    assert.deepEqual(await svenskKvarEngelska(page), []);
  } finally { await context.close() }
});

// Efter bytet tillbaka: inga kvarlämnade engelska navetiketter.
function svenskKvarEngelska(page) {
  return page.evaluate(() => [...document.querySelectorAll('aside [data-view] span, aside [data-extra] span, .nav-section-label')]
    .map(e => e.textContent.trim()).filter(t => /^(Overview|Settings|Events|Statistics|Core|Automation|Insights|LIVE control|Performance check)$/.test(t)));
}

test('overlayläget har ingen VyraLang, även med ?lang=en', { skip, timeout: 60000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const page = await context.newPage();
  try {
    await page.goto(`${rigg.bas}/studio.html?overlay=1&lang=en`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ lang: typeof window.VyraLang, val: localStorage.getItem('vyra-sprak'), html: document.documentElement.lang }));
    assert.deepEqual(r, { lang: 'undefined', val: null, html: 'sv' });
  } finally { await context.close() }
});
