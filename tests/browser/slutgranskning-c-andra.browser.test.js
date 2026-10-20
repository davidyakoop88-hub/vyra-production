'use strict';
// SLUTGRANSKNINGEN 2026-10-20, GRANSKARE C — ANDRA OMGÅNGEN (N-C-001 ... N-C-012 och resterna av
// C-019/C-021).
//
// Varje prov mäter det kontrollgranskningen mätte, med samma storlek (d 1440, t 1024, m 390):
//   N-C-001  sökikonens mitt mot fältets mitt (var +8 px)
//   N-C-002  rankingkortets bredd i familjeytan vid 390 (var 185 av 284 px, vänsterställt)
//   N-C-003  verktygsraden i Layout: rader vid 1024/1280/1440 (var 5/3/2) och lagerraderna < 70 px
//   N-C-004  LIVE-kontrollens rutor: etiketterna på en rad och på samma höjd vid 1024
//   N-C-005  Inställningarnas kort: samma marginal, inre marginal och undertext
//   N-C-006  vid 390 ligger knappen under texten i alla kort
//   N-C-007  luft mellan radknapparna och Handling, och "Ta bort" frågar först i sidan
//   N-C-008  fokus tillbaka till knappen efter Spara och efter borttagning
//   N-C-009  kryssrutan i linje med sin text, ingen tom felrad
//   N-C-010  luft under nyckelfältet, ingen tom lucka under kodfältet
//   N-C-011  "Typsnitt" ovanför fältet, "Accentfärg" i stället för "Highlight"
//   N-C-012  gatens rubrik lika stor via studio.html och layout.html, ingen 42 px lucka, svenska
//   C-019/C-021  svenska ord i Händelser, Statistik och LIVE-kontroll; inga skelettrader
//
// VARFÖR RIKTIG WEBBLÄSARE: allt här är getBoundingClientRect och beräknad stil.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

const HOJD = { 390: 844, 1024: 768, 1280: 800, 1440: 900 };

async function studion(bredd, { sokvag = '/studio.html', vy, extra } = {}) {
  const rigg = await servera({ backend: true });
  const context = await browser.newContext({ viewport: { width: bredd, height: HOJD[bredd] || 900 } });
  const page = await context.newPage();
  page.on('dialog', d => d.dismiss());
  await page.route('**/api/auth/mfa/setup', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, uri: 'otpauth://totp/VYRA:mock?secret=ABC', secret: 'ABCDEFGH', qr: null }) }));
  await page.goto(`${rigg.bas}${sokvag}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraAuth?.currentUser?.() && typeof window.render === 'function',
    null, { timeout: 30000, polling: 100 });
  await page.addStyleTag({ content: '[data-trial-prompt]{display:none!important}' });
  await page.waitForTimeout(1500);
  if (vy) await page.evaluate(v => go(v), vy);
  if (extra) await page.evaluate(x => document.querySelector(`aside [data-extra="${x}"]`).click(), extra);
  await page.waitForTimeout(1200);
  return { page, stang: async () => { await context.close(); await rigg.stang() } };
}

async function installningar(page) {
  await page.click('aside button[data-view="settings"]');
  await page.waitForSelector('.settings-page .privacy-settings', { timeout: 10000 });
  await page.waitForTimeout(500);
}

test('N-C-001: förstoringsglaset sitter mitt i sökfältet', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440, { vy: 'overlay' });
  try {
    const d = await page.evaluate(() => {
      const i = document.querySelector('.overlay-widget-gallery .search-input .widget-search');
      const ik = i.parentElement.querySelector('svg');
      const a = i.getBoundingClientRect(), b = ik.getBoundingClientRect();
      return (b.top + b.height / 2) - (a.top + a.height / 2);
    });
    assert.ok(Math.abs(d) <= 1, `ikonens mitt ligger ${d.toFixed(1)} px från fältets mitt`);
  } finally { await stang() }
});

test('N-C-002: rankingkorten fyller katalogens bredd vid 390 px', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(390, { vy: 'overlay' });
  try {
    const m = await page.evaluate(() => {
      const sek = document.querySelector('.overlay-widget-gallery .rk6-katalog');
      const grupper = [...sek.querySelectorAll(':scope > .rk6-grupp')];
      const cs = getComputedStyle(sek), r = sek.getBoundingClientRect();
      const inner = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const kopiera = [...sek.querySelectorAll('.owg-copylink')].filter(e => e.offsetWidth).slice(0, 2)
        .map(e => Math.round(e.getBoundingClientRect().width - e.getBoundingClientRect().height));
      return { inner: Math.round(inner), bredder: grupper.slice(0, 3).map(g => Math.round(g.getBoundingClientRect().width)), kopiera,
        sidled: document.documentElement.scrollWidth };
    });
    assert.ok(m.bredder.length >= 2, 'inga rankingkort hittades — provet mäter ingenting');
    for (const b of m.bredder) assert.ok(b >= m.inner - 2, `kortet är ${b} px i en ${m.inner} px yta`);
    // Länkknappen är rund; den får inte dras ut till en oval när kortet blir bredare.
    for (const k of m.kopiera) assert.ok(Math.abs(k) <= 2, `länkknappen är ${k} px bredare än hög`);
    assert.ok(m.sidled <= 390, `sidan rullar i sidled: ${m.sidled}`);
  } finally { await stang() }
});

const VERKTYGSRAD = () => {
  const tb = document.querySelector('.editor-shell .editor-toolbar');
  const lov = [...tb.querySelectorAll('button,.layout-format-picker>span,[data-zoom-niva]')].filter(e => e.getBoundingClientRect().width > 0);
  const band = [];
  lov.forEach(e => { const t = e.getBoundingClientRect().top; if (!band.some(b => Math.abs(b - t) < 12)) band.push(t) });
  const rader = [...document.querySelectorAll('.live-layer-list article')];
  return {
    antal: lov.length, rader: band.length,
    lagerHojd: rader.map(r => Math.round(r.getBoundingClientRect().height)),
    klippta: [...document.querySelectorAll('.live-layer-list article b, .live-layer-list article strong')]
      .filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()),
    knappar: [...tb.querySelectorAll('button')].filter(b => b.offsetWidth && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()),
  };
};

test('N-C-003: verktygsraden i Layout bryts på högst 3 rader vid 1024 och 2 vid 1280/1440', { skip, timeout: 120000 }, async () => {
  const { page, stang } = await studion(1440, { sokvag: '/studio.html?open=layout' });
  try {
    await page.waitForFunction(() => !!document.querySelector('.editor-toolbar [data-vy-kontroll]')
      && !!document.querySelector('.editor-toolbar .layout-format-picker'), null, { timeout: 30000, polling: 100 });
    const max = { 1440: 2, 1280: 2, 1024: 3 };
    const fel = [];
    for (const bredd of [1440, 1280, 1024]) {
      await page.setViewportSize({ width: bredd, height: HOJD[bredd] });
      await page.waitForTimeout(300);
      const m = await page.evaluate(VERKTYGSRAD);
      if (m.antal < 10) fel.push(`${bredd}: mätningen hittade bara ${m.antal} delar`);
      if (m.rader > max[bredd]) fel.push(`${bredd}: verktygsraden har ${m.rader} rader (högst ${max[bredd]})`);
      const svallda = m.lagerHojd.filter(h => h > 70);
      if (svallda.length) fel.push(`${bredd}: lagerrader över 70 px: ${m.lagerHojd.join(', ')}`);
      if (m.klippta.length) fel.push(`${bredd}: lagernamn klipps: ${m.klippta.join(', ')}`);
      if (m.knappar.length) fel.push(`${bredd}: knapptext klipps: ${m.knappar.join(', ')}`);
    }
    assert.deepEqual(fel, [], fel.join('\n'));
  } finally { await stang() }
});

test('N-C-004: LIVE-kontrollens etiketter står på en rad och på samma höjd vid 1024 px', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1024, { extra: 'liveControl' });
  try {
    await page.waitForSelector('.lc-health article', { timeout: 10000 });
    const m = await page.evaluate(() => [...document.querySelectorAll('.lc-health article, .lc-perf-grid article')].map(a => {
      const s = a.querySelector('small'), lh = parseFloat(getComputedStyle(s).lineHeight) || parseFloat(getComputedStyle(s).fontSize) * 1.25;
      return { t: s.textContent.trim(), rad: Math.round(a.getBoundingClientRect().top), top: Math.round(s.getBoundingClientRect().top),
        bruten: s.getBoundingClientRect().height > lh * 1.5 };
    }));
    assert.ok(m.length >= 5, `bara ${m.length} rutor`);
    const brutna = m.filter(x => x.bruten).map(x => x.t);
    assert.deepEqual(brutna, [], 'etiketter bryts: ' + brutna.join(', '));
    const perRad = {};
    for (const x of m) (perRad[x.rad] = perRad[x.rad] || []).push(x);
    for (const rad of Object.values(perRad)) {
      const toppar = [...new Set(rad.map(x => x.top))];
      assert.equal(toppar.length, 1, `etiketterna i samma rad står på olika höjd: ${rad.map(x => x.t + '@' + x.top).join(', ')}`);
    }
  } finally { await stang() }
});

const KORT = '.settings-page>.vb-settings,.settings-page>.logout-settings,.settings-page>.mfa-settings,.settings-page>.desktop-nedladdning,.settings-page>.session-settings,.settings-page>.security-events,.settings-page>.privacy-settings,.settings-page>#vyra-state-sync';

test('N-C-005: Inställningarnas kort har samma avstånd, inre marginal och undertext', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await installningar(page);
    const m = await page.evaluate(sel => [...document.querySelectorAll(sel)].map(k => {
      const cs = getComputedStyle(k), s = k.querySelector('small');
      return { k: k.className || k.id, mt: cs.marginTop, pad: cs.paddingLeft + ' ' + cs.paddingTop, small: s ? getComputedStyle(s).fontSize : null };
    }), KORT);
    assert.ok(m.length >= 6, `bara ${m.length} kort`);
    for (const nyckel of ['mt', 'pad', 'small']) {
      const varden = [...new Set(m.map(x => x[nyckel]).filter(Boolean))];
      assert.equal(varden.length, 1, `${nyckel} skiljer sig mellan korten: ${m.map(x => x.k + '=' + x[nyckel]).join(', ')}`);
    }
    assert.ok(parseFloat(m[0].small) >= 11, `undertexten är ${m[0].small}`);
  } finally { await stang() }
});

test('N-C-006: på mobil ligger knappen under texten i alla kort, även Abonnemang', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(390);
  try {
    await page.evaluate(() => go('settings'));
    await page.waitForSelector('.settings-page .privacy-settings', { timeout: 10000 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(sel => [...document.querySelectorAll(sel)].map(k => {
      const b = [...k.querySelectorAll('button,a.desktop-nedladdning-knapp')].filter(x => x.offsetWidth)[0];
      const s = k.querySelector('small');
      if (!b || !s) return null;
      return { k: k.className || k.id, under: b.getBoundingClientRect().top >= s.getBoundingClientRect().bottom - 1 };
    }).filter(Boolean), KORT);
    assert.ok(m.length >= 5, `bara ${m.length} kort med knapp`);
    const bredvid = m.filter(x => !x.under).map(x => x.k);
    assert.deepEqual(bredvid, [], 'knappen står bredvid texten i: ' + bredvid.join(', '));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
  } finally { await stang() }
});

test('N-C-007/N-C-008: Automationer — luft, "Ta bort" frågar först, fokus tillbaka', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await page.evaluate(() => { state.flows = [{ trigger: 'Gåva mottagen', action: 'Visa gift alert', on: true },
      { trigger: 'Ny följare', action: 'Spela ljud + TTS', on: true }]; go('flows') });
    await page.waitForTimeout(300);
    const luft = await page.evaluate(() => [...document.querySelectorAll('#view .flow-row')].map(a => {
      const n = a.querySelectorAll('.node')[1].getBoundingClientRect(), k = a.querySelector('.flow-knappar').getBoundingClientRect();
      return Math.round(k.left - n.right);
    }));
    for (const l of luft) assert.ok(l >= 8, `knapparna ligger ${l} px från Handling-rutan`);

    // Ta bort frågar, Esc ångrar och lämnar fokus på Ta bort.
    await page.click('[data-flow-ta-bort="1"]');
    assert.ok(await page.$('[data-flow-bekrafta="1"]'), 'ingen fråga efter "Ta bort"');
    assert.equal(await page.evaluate(() => state.flows.length), 2, '"Ta bort" raderade utan att fråga');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Avbryt', 'fokus ligger inte på Avbryt');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => state.flows.length), 2, 'Esc tog bort automationen');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.flowTaBort), '1', 'fokus tillbaka till Ta bort saknas');
    // Bekräftat tas raden bort, och fokus hamnar på knappen i raden som blev kvar.
    await page.click('[data-flow-ta-bort="1"]');
    await page.click('[data-flow-bekrafta="1"]');
    await page.waitForFunction(() => state.flows.length === 1 && !document.querySelector('[data-flow-bekrafta]'), null, { timeout: 5000 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.flowTaBort), '0');

    // Spara: fokus tillbaka till "＋ Ny automation" respektive radens "Ändra".
    await page.focus('#newFlow');
    await page.keyboard.press('Enter');
    await page.fill('#flowTrigger', 'Delning');
    await page.fill('#flowAction', 'Visa animation');
    await page.click('#flowSave');
    await page.waitForFunction(() => state.flows.length === 2 && document.activeElement?.id === 'newFlow', null, { timeout: 5000 });
    await page.focus('[data-flow-andra="1"]');
    await page.keyboard.press('Enter');
    await page.fill('#flowAction', 'Visa tack i chatten');
    await page.click('#flowSave');
    await page.waitForFunction(() => state.flows[1].action === 'Visa tack i chatten', null, { timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.dataset?.flowAndra === '1', null, { timeout: 5000 });
  } finally { await stang() }
});

test('N-C-009/N-C-010: Radera konto och Tvåsteg — kryssrutan i linje, inga tomma luckor', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await installningar(page);
    await page.click('.privacy-settings .delete-account');
    await page.waitForSelector('.security-modal .delete-confirm', { timeout: 5000 });
    const r = await page.evaluate(() => {
      const l = document.querySelector('.security-modal .delete-confirm');
      const cb = l.querySelector('input').getBoundingClientRect(), t = l.querySelector('span').getClientRects()[0];
      const akt = document.querySelector('.security-modal .security-actions').getBoundingClientRect();
      return { skillnad: (cb.top + cb.height / 2) - (t.top + t.height / 2), lucka: akt.top - l.getBoundingClientRect().bottom,
        tomtFel: [...document.querySelectorAll('.security-modal .security-error')].filter(e => !e.textContent && e.offsetHeight).length };
    });
    assert.ok(Math.abs(r.skillnad) <= 2, `kryssrutan ligger ${r.skillnad.toFixed(1)} px från textraden`);
    assert.equal(r.tomtFel, 0, 'den tomma felraden tar plats');
    assert.ok(r.lucka <= 24, `${Math.round(r.lucka)} px tomt mellan kryssrutan och knapparna`);
    await page.keyboard.press('Escape');

    await page.click('.mfa-settings .enable');
    await page.waitForSelector('.security-modal .copy-secret', { timeout: 5000 });
    const m = await page.evaluate(() => {
      const s = document.querySelector('.security-modal section');
      const nyckel = s.querySelector('input[readonly]').getBoundingClientRect(), kop = s.querySelector('.copy-secret').getBoundingClientRect();
      const kod = s.querySelector('.mfa-kod').getBoundingClientRect(), akt = s.querySelector('.security-actions').getBoundingClientRect();
      return { underNyckel: kop.top - nyckel.bottom, kodTillKnappar: akt.top - kod.bottom };
    });
    assert.ok(m.underNyckel >= 8, `"Kopiera nyckeln" ligger ${Math.round(m.underNyckel)} px under nyckelfältet`);
    assert.ok(m.kodTillKnappar <= 24, `${Math.round(m.kodTillKnappar)} px tomt mellan kodfältet och knapparna`);
  } finally { await stang() }
});

test('N-C-011: Färgschema — Typsnitt ovanför fältet och inget "Highlight"', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await page.click('#openBrandKit');
    await page.waitForFunction(() => document.querySelector('#brandKitModal')?.open, null, { timeout: 5000 });
    const m = await page.evaluate(() => ({
      text: document.querySelector('#brandKitModal').innerText + ' ' + document.querySelector('#openBrandKit').title,
      platser: [...document.querySelectorAll('#brandKitModal label')].map(l => {
        const f = l.querySelector('input,select'), lr = l.getBoundingClientRect(), fr = f.getBoundingClientRect();
        return { t: l.firstChild.textContent.trim(), ovanfor: fr.top >= lr.top + 12 };
      }),
    }));
    assert.doesNotMatch(m.text, /Highlight/);
    assert.match(m.text, /Accentfärg/);
    const bredvid = m.platser.filter(p => !p.ovanfor).map(p => p.t);
    assert.deepEqual(bredvid, [], 'etiketten står bredvid fältet: ' + bredvid.join(', '));
  } finally { await stang() }
});

test('N-C-012: inloggningsgaten ser likadan ut via studio.html och layout.html', { skip, timeout: 120000 }, async () => {
  const rigg = await servera({ backend: true, fel: { 'GET /api/auth/me': { status: 401, kropp: { error: 'Ej inloggad' } } } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const ut = {};
    for (const sokvag of ['/studio.html', '/layout.html']) {
      const page = await context.newPage();
      await page.goto(`${rigg.bas}${sokvag}`, { waitUntil: 'load' });
      await page.waitForSelector('.auth-gate .forgot-password', { timeout: 20000 });
      ut[sokvag] = await page.evaluate(() => {
        const g = document.querySelector('.auth-gate');
        return { h1: getComputedStyle(g.querySelector('h1')).fontSize, text: g.innerText,
          lucka: Math.round(g.querySelector('.forgot-password').getBoundingClientRect().top - g.querySelector('#authPassword').getBoundingClientRect().bottom) };
      });
      await page.close();
    }
    const [a, b] = [ut['/studio.html'], ut['/layout.html']];
    assert.equal(b.h1, a.h1, `rubriken är ${a.h1} via studio.html men ${b.h1} via layout.html`);
    for (const [k, v] of Object.entries(ut)) {
      assert.ok(v.lucka <= 20, `${k}: ${v.lucka} px mellan lösenordet och "Glömt lösenord?"`);
      assert.doesNotMatch(v.text, /workspace/i, `${k}: "workspace" i gaten`);
    }
  } finally { await context.close(); await rigg.stang() }
});

test('C-019/C-021: svenska ord i Händelser, Statistik och LIVE-kontroll, och inga skelettrader', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await page.evaluate(() => go('events'));
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => ({ text: document.querySelector('#view').innerText, skelett: !!document.querySelector('#view .tom-lista') }));
    assert.match(h.text, /Händelsehistorik/);
    assert.doesNotMatch(h.text, /Eventhistorik/);
    assert.equal(h.skelett, false, 'skelettraderna står kvar under "Inga händelser ännu"');
    await page.evaluate(() => go('analytics'));
    await page.waitForTimeout(500);
    assert.doesNotMatch(await page.evaluate(() => document.querySelector('#view').innerText), /COMMUNITY/i);
    await page.evaluate(() => document.querySelector('aside [data-extra="liveControl"]').click());
    await page.waitForSelector('.lc-health', { timeout: 10000 });
    const live = await page.evaluate(() => document.querySelector('#view').innerText);
    for (const ord of [/connector/i, /Battle-event/, /testevent/i, /Inga event /]) assert.doesNotMatch(live, ord);
  } finally { await stang() }
});
