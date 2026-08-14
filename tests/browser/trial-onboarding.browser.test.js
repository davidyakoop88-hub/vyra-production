'use strict';
// Trial-onboarding (Etapp 6D).
//
// Fas B matte forsta-motet efter "Starta 3 dagar gratis": klicket lamnar Vyra for Stripe Checkout
// och kommer tillbaka till studio.html?billing=success — och INGENTING i klienten laser den
// parametern. Man landar pa en sida som laddar som vanligt. Ingen bekraftelse, inget besked om att
// provperioden borjat, ingen nedrakning nagonstans i UI:t.
//
// PR 173 la grunden: trial_end sparas och returneras av /billing. Fore den kunde en nedrakning
// bara vila pa current_period_end, vilket ar ratt svar men bara genom en outtalad slutledning —
// och pa ett falt som blev 1 januari 1970 nar det saknades.
//
// vyra-entitlement-ok avfyras redan av entitlement-gate.js nar planen ar giltig, och INGEN lyssnar
// pa den. Det ar en ledig, ratt tajmad monteringspunkt.
//
// ROTT NU: vyra-trial-onboarding.js finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { SYNLIG, UTSEENDE } = require('../fixtures/synlighet.js');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

// Tiden matas in i sidan i stallet for att bero pa nar provet kors. Ett prov som svarar olika
// pa tisdag och sondag ar ingen matning.
const NU = Date.UTC(2026, 7, 9, 12, 0, 0);
const timmar = t => new Date(NU + t * 3600 * 1000).toISOString();

function billingSvar({ status = 'trialing', trialEnd = timmar(72), plan = 'premium' } = {}) {
  return { status: 200, kropp: { ok: true, plan,
    subscription: { status, trial_end: trialEnd, current_period_end: trialEnd,
      cancel_at_period_end: false } } };
}

async function studion({ sokvag = '/studio.html', billing = billingSvar(), fel = {} } = {}) {
  const rigg = await servera({
    backend: true,
    fel: Object.assign({ 'GET /api/workspaces/:ws/billing': billing }, fel),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // Fryser klockan INNAN sidans skript kor, sa nedrakningen raknar mot ett kant nu.
  await page.addInitScript(nu => {
    const Riktig = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends Riktig {
      constructor(...a) { super(...(a.length ? a : [nu])) }
      static now() { return nu }
    };
  }, NU);
  await page.goto(`${rigg.bas}${sokvag}`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2600)));
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

const VALKOMST = `(() => {
  const el = document.querySelector('[data-trial-valkomst]');
  if (!el) return { saknas: true };
  return { text: el.textContent.replace(/\\s+/g, ' ').trim(), synlig: (${SYNLIG})(el),
    knapp: (el.querySelector('[data-trial-start]') || {}).textContent };
})()`;

const NEDRAKNING = `(() => {
  const el = document.querySelector('[data-trial-nedrakning]');
  if (!el) return { saknas: true };
  return { text: el.textContent.replace(/\\s+/g, ' ').trim(), synlig: (${SYNLIG})(el),
    dagar: el.dataset.trialNedrakning };
})()`;

// ---- Prov 1 · valkomst efter aterkomsten fran Stripe -------------------------------------------
test('valkomstskarmen visas efter ?billing=success', { skip, timeout: 90000 }, async () => {
  const s = await studion({ sokvag: '/studio.html?billing=success' });
  try {
    const m = await s.page.evaluate(VALKOMST);
    assert.ok(!m.saknas, '[data-trial-valkomst] saknas efter aterkomsten fran Stripe');
    assert.equal(m.synlig.ok, true, `valkomsten syns inte: ${m.synlig.skal}`);
  } finally { await s.stang() }
});

// ---- Prov 2 · den sager vad som hant och nar det tar slut --------------------------------------
test('valkomsten anger att provperioden startat och nar den slutar', { skip, timeout: 90000 }, async () => {
  const s = await studion({ sokvag: '/studio.html?billing=success' });
  try {
    const m = await s.page.evaluate(VALKOMST);
    assert.match(m.text, /provperiod|trial/i, `texten: "${m.text}"`);
    // 72 timmar fram fran den frusna klockan = 12 augusti 2026.
    assert.match(m.text, /12 augusti|2026-08-12/,
      `slutdatumet ska sta ut, inte antydas: "${m.text}"`);
  } finally { await s.stang() }
});

// ---- Prov 3 · den gar att stanga, och kommer inte tillbaka -------------------------------------
test('valkomsten stangs och aterkommer inte', { skip, timeout: 90000 }, async () => {
  const s = await studion({ sokvag: '/studio.html?billing=success' });
  try {
    const m = await s.page.evaluate(async () => {
      const knapp = document.querySelector('[data-trial-valkomst] [data-trial-start]');
      if (!knapp) return { saknasKnapp: true };
      knapp.click();
      await new Promise(r => setTimeout(r, 400));
      return { kvar: !!document.querySelector('[data-trial-valkomst]'),
        sparat: localStorage.getItem('vyra-trial-welcomed') };
    });
    assert.ok(!m.saknasKnapp, 'knappen [data-trial-start] saknas');
    assert.equal(m.kvar, false, 'valkomsten ska forsvinna nar man tryckt');
    assert.ok(m.sparat, 'valet ska ligga i localStorage — den ska inte aterkomma nasta session');

    await s.page.goto(s.page.url(), { waitUntil: 'load' });
    await s.page.evaluate(() => new Promise(r => setTimeout(r, 2600)));
    const efter = await s.page.evaluate(VALKOMST);
    assert.ok(efter.saknas, 'och den ska inte komma tillbaka vid nasta laddning');
  } finally { await s.stang() }
});

// ---- Prov 4-5 · nedrakningen -------------------------------------------------------------------
test('nedrakningen visar ratt antal dagar kvar', { skip, timeout: 180000 }, async () => {
  // KONTRAKTET MOTSA SIG SJALVT har, och det gick inte att se forran siffrorna sattes in:
  // "1 dag tredje dagen" och "sista dagen nar mindre an 24 h kvar" beskriver SAMMA lage. Med 23 h
  // kvar ar bada sanna, och bara den ena kan visas.
  //
  // Valet: under ett dygn sags "sista dagen". "1 dag kvar" med tre timmar kvar ar missvisande pa
  // ett satt som kostar anvandaren pengar — hon tror att hon har imorgon pa sig.
  const fall = [
    { kvar: 71, vantat: /3 dagar/, namn: 'strax under tre dygn' },
    { kvar: 47, vantat: /2 dagar/, namn: 'strax under tva dygn' },
    { kvar: 25, vantat: /2 dagar/, namn: 'drygt ett dygn' },
    { kvar: 23, vantat: /sista dagen/i, namn: 'strax under ett dygn' },
    { kvar: 5, vantat: /sista dagen/i, namn: 'fem timmar kvar' },
  ];
  for (const f of fall) {
    const s = await studion({ billing: billingSvar({ trialEnd: timmar(f.kvar) }) });
    try {
      const m = await s.page.evaluate(NEDRAKNING);
      assert.ok(!m.saknas, `${f.namn}: [data-trial-nedrakning] saknas`);
      assert.equal(m.synlig.ok, true, `${f.namn}: nedrakningen syns inte (${m.synlig.skal})`);
      assert.match(m.text, f.vantat, `${f.namn}: texten ar "${m.text}"`);
    } finally { await s.stang() }
  }
});

// ---- Prov 6-7 · konverteringsprompten sista dygnet ---------------------------------------------
test('sista dygnet visas en prompt med tva vagar', { skip, timeout: 90000 }, async () => {
  const s = await studion({ billing: billingSvar({ trialEnd: timmar(5) }) });
  try {
    const m = await s.page.evaluate(`(() => {
      const el = document.querySelector('[data-trial-prompt]');
      if (!el) return { saknas: true };
      return { text: el.textContent.replace(/\\s+/g, ' ').trim(), synlig: (${SYNLIG})(el),
        aktivera: !!el.querySelector('[data-trial-aktivera]'),
        senare: !!el.querySelector('[data-trial-senare]') };
    })()`);
    assert.ok(!m.saknas, '[data-trial-prompt] saknas med fem timmar kvar');
    assert.equal(m.synlig.ok, true, `prompten syns inte: ${m.synlig.skal}`);
    assert.match(m.text, /overlays|arbete|sparade/i,
      `prompten ska saga vad som star pa spel, inte bara att tiden gar: "${m.text}"`);
    assert.equal(m.aktivera, true, 'knappen [data-trial-aktivera] saknas');
    assert.equal(m.senare, true,
      '[data-trial-senare] saknas — en prompt utan vag ut ar en spärr, inte en pamminnelse');
  } finally { await s.stang() }
});

test('"Paminn senare" stanger prompten for den har laddningen', { skip, timeout: 90000 }, async () => {
  const svar = billingSvar({ trialEnd: timmar(5) });
  const s = await studion({ billing: svar });
  try {
    const m = await s.page.evaluate(async billing => {
      document.querySelector('[data-trial-prompt] [data-trial-senare]').click();
      await new Promise(r => setTimeout(r, 400));
      const efterKlick = !!document.querySelector('[data-trial-prompt]');
      // Att den forsvinner vid klick bevisar bara att den togs bort. Fragan ar om den HALLER sig
      // borta: modulen ritar om vid varje entitlement-handelse och vid varje vybyte. En forsta
      // version av det har provet slutade vid raden ovan — och da overlevde en mutation som tog
      // bort hela uppskjutningskontrollen, eftersom ingenting nagonsin ritade om.
      dispatchEvent(new CustomEvent('vyra-entitlement-ok', { detail: { billing } }));
      await new Promise(r => setTimeout(r, 400));
      return { kvar: efterKlick, aterkom: !!document.querySelector('[data-trial-prompt]'),
        lokal: localStorage.getItem('vyra-trial-prompt-uppskjuten'),
        session: sessionStorage.getItem('vyra-trial-prompt-uppskjuten') };
    }, svar.kropp);
    assert.equal(m.kvar, false, 'prompten ska forsvinna');
    assert.equal(m.aterkom, false, 'och inte komma tillbaka vid nasta omritning');
    assert.ok(m.session, 'uppskjutandet ska galla den har laddningen');
    assert.equal(m.lokal, null,
      'och INTE for alltid — sista dygnet ar precis nar pamminnelsen behovs');
  } finally { await s.stang() }
});

// ---- Prov 8 · nar provperioden tagit slut ------------------------------------------------------
test('utgangen provperiod moter varmare sprak', { skip, timeout: 90000 }, async () => {
  // En AVSLUTAD provperiod: planen ar free, men prenumerationen finns kvar med sin status. Det ar
  // det som skiljer den fran en ny anvandare som aldrig borjat.
  //
  // Anvandaren maste vara VERIFIERAD har. Mockens grundlage ar overifierad — och da visar grinden
  // sin e-postgren i stallet, vilket forsta versionen av provet matte utan att marka det.
  const s = await studion({
    billing: { status: 200, kropp: { ok: true, plan: 'free',
      subscription: { status: 'canceled', trial_end: timmar(-2), cancel_at_period_end: false } } },
    fel: { 'GET /api/auth/me': { status: 200, kropp: { ok: true, csrfToken: 'mock-csrf-token',
      user: { id: 'u1', email: 'mock@vyra.test', displayName: 'Mock', emailVerified: true },
      workspaces: [{ id: 'ws-mock', name: 'Mock' }] } } },
  });
  try {
    const m = await s.page.evaluate(() => {
      const g = document.querySelector('.entitlement-gate');
      return g ? { text: g.textContent.replace(/\s+/g, ' ').trim() } : { saknas: true };
    });
    assert.ok(!m.saknas, 'kontrollmatning: grinden ska visas nar planen inte ar giltig');
    assert.doesNotMatch(m.text, /Verifiera din e-post/,
      'kontrollmatning: anvandaren ar verifierad, sa e-postgrenen ska inte visas');
    assert.match(m.text, /sparade|kvar|finns kvar/i,
      `att arbetet finns kvar ar det viktigaste beskedet i det laget: "${m.text}"`);
  } finally { await s.stang() }
});

// ---- Prov 9 · valkomsten visas INTE vid vanlig laddning ----------------------------------------
test('valkomsten visas inte utan ?billing=success', { skip, timeout: 120000 }, async () => {
  // Kontrollmatning FORST. Utan den passerar provet nar modulen inte finns alls — ett uteblivet
  // element ser likadant ut oavsett om villkoret holl eller om det aldrig fanns nagot villkor.
  const med = await studion({ sokvag: '/studio.html?billing=success' });
  let fannsMed;
  try { fannsMed = !(await med.page.evaluate(VALKOMST)).saknas } finally { await med.stang() }
  assert.equal(fannsMed, true, 'kontrollmatning: med parametern SKA valkomsten visas');

  const utan = await studion();
  try {
    const m = await utan.page.evaluate(VALKOMST);
    assert.ok(m.saknas,
      'en valkomst vid varje laddning ar inte en valkomst, den ar en pratkvarn');
  } finally { await utan.stang() }
});

// ---- Prov 10 · nedrakningen visas BARA under provperioden --------------------------------------
test('nedrakningen visas inte for aktiv prenumeration eller utgangen trial',
  { skip, timeout: 180000 }, async () => {
  // Samma sak har: utan kontrollmatningen ar provet gront sa lange modulen saknas.
  const under = await studion({ billing: billingSvar({ trialEnd: timmar(48) }) });
  let fannsUnder;
  try { fannsUnder = !(await under.page.evaluate(NEDRAKNING)).saknas } finally { await under.stang() }
  assert.equal(fannsUnder, true, 'kontrollmatning: under provperioden SKA nedrakningen visas');

  const fall = [
    { namn: 'aktiv prenumeration', billing: billingSvar({ status: 'active', trialEnd: null }) },
    { namn: 'utgangen', billing: { status: 200, kropp: { ok: true, plan: 'free', subscription: null } } },
  ];
  for (const f of fall) {
    const s = await studion({ billing: f.billing });
    try {
      const m = await s.page.evaluate(NEDRAKNING);
      assert.ok(m.saknas, `${f.namn}: nedrakningen ska inte finnas — "${m.text}"`);
    } finally { await s.stang() }
  }
});

// ---- Prov 11 · monteringen anvander befintlig infrastruktur ------------------------------------
test('modulen monterar pa vyra-entitlement-ok', { skip, timeout: 90000 }, async () => {
  const s = await studion();
  try {
    const m = await s.page.evaluate(async () => {
      if (!window.VyraTrialOnboarding) return { saknas: true };
      // Riv och avfyra handelsen igen — monteringen ska ske pa den, inte pa en timer.
      document.querySelector('[data-trial-nedrakning]')?.remove();
      dispatchEvent(new CustomEvent('vyra-entitlement-ok', {
        detail: { billing: { plan: 'premium', subscription: { status: 'trialing',
          trial_end: new Date(Date.now() + 60 * 3600 * 1000).toISOString() } } },
      }));
      await new Promise(r => setTimeout(r, 500));
      return { aterkom: !!document.querySelector('[data-trial-nedrakning]') };
    });
    assert.ok(!m.saknas, 'window.VyraTrialOnboarding saknas');
    assert.equal(m.aterkom, true,
      'handelsen vyra-entitlement-ok avfyras redan av entitlement-gate.js och ingen lyssnade — ' +
      'det ar den ratt tajmade monteringspunkten');
  } finally { await s.stang() }
});

// ---- Prov 12 · inget av det har skriver till sessionen -----------------------------------------
test('trial-onboardingen ror inte skrivmonopolet', { skip, timeout: 90000 }, async () => {
  const s = await studion({ sokvag: '/studio.html?billing=success' });
  try {
    const m = await s.page.evaluate(async () => {
      let skrivningar = 0;
      const inre = window.VyraSessionState.writeActive;
      window.VyraSessionState.writeActive = function () { skrivningar++; return inre.apply(this, arguments) };
      const klickade = [];
      for (const val of ['[data-trial-start]']) {
        const k = document.querySelector(val);
        if (!k) continue;
        klickade.push(val);
        k.click();
        await new Promise(r => setTimeout(r, 300));
      }
      window.VyraSessionState.writeActive = inre;
      return { skrivningar, klickade };
    });
    assert.deepEqual(m.klickade, ['[data-trial-start]'],
      'kontrollmatning: knappen ska ha funnits och klickats');
    assert.equal(m.skrivningar, 0,
      'onboarding ar en vyinstallning. Gar den genom save() blir varje stangd valkomst ett ' +
      'angra-steg — samma separation som zoom och H-faltets visningsvarde.');
  } finally { await s.stang() }
});

// ---- Prov 13 · teardown vid kontobyte ----------------------------------------------------------
// Widgetkontraktet kraver teardown pa vyra-session-ended. Utan den bar nasta konto foregaende
// kontos nedrakning — samma lacka som tatades i angra/gor om (#158). Provet fanns inte i forsta
// omgangen, och da overlevde en mutation som tog bort hela teardown-kroppen.
test('allt rivs nar sessionen avslutas', { skip, timeout: 90000 }, async () => {
  const s = await studion({ sokvag: '/studio.html?billing=success',
    billing: billingSvar({ trialEnd: timmar(5) }) });
  try {
    const m = await s.page.evaluate(async () => {
      const finns = () => ['[data-trial-valkomst]', '[data-trial-nedrakning]', '[data-trial-prompt]']
        .filter(v => document.querySelector(v));
      const fore = finns();
      dispatchEvent(new CustomEvent('vyra-session-ended'));
      await new Promise(r => setTimeout(r, 400));
      return { fore, efter: finns() };
    });
    assert.deepEqual(m.fore.sort(),
      ['[data-trial-nedrakning]', '[data-trial-prompt]', '[data-trial-valkomst]'],
      'kontrollmatning: alla tre ytorna ska finnas innan sessionen avslutas — annars bevisar ' +
      'provet bara att tomt forblir tomt');
    assert.deepEqual(m.efter, [],
      'kvar efter kontobyte: ' + m.efter.join(', '));
  } finally { await s.stang() }
});
