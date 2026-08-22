'use strict';
// SLAPP IN — dorren oppnas, gubben gar in, kortet blir gront (Davids onskan 2026-08-21).
//
// DET SOM KAN GA RIKTIGT FEL AR INTE ATT ANIMATIONEN AR FUL. Det ar att en LYCKAD inloggning
// fastnar i den. Anvandaren har redan angett ratt uppgifter, servern har redan svarat ja, sessionen
// ar redan satt — och sa star hen kvar pa framsidan for att en dekoration inte blev klar. Darfor
// mater provet FRAMKOMLIGHETEN forst och utseendet sen.
//
// Tre lagen:
//   normalt              dorren visas, och studion laddas anda inom rimlig tid
//   reduced-motion       INGEN dorr och INGEN vantan — rakt in
//   trasig festyta       om sekvensen kastar ska redirecten anda ske (fail-open, som resten av huset)
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

// Servern svarar JA pa inloggning. Vi provar sekvensen efter ett lyckat svar, inte auth-kedjan —
// den har egna prov.
function servera() {
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/api/auth/login') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, csrfToken: 'prov-token' }));
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// `reducedMotion` sätts ALLTID explicit, aldrig underforstatt.
//
// UPPMATT i CI 2026-08-21: provet "sekvensen spelas" foll efter 32 sekunder — den vantade pa en
// dorr som aldrig kom. Headless Chromium rapporterar `prefers-reduced-motion: reduce` som
// standard, och da hoppar slappIn() over hela steget med flit. Provet antog tyst att rorelse var
// tillaten; lokalt var den det, i CI inte.
//
// Att sanka provets krav vore fel svar: bada lagena ar riktiga och bada ska provas. De sags nu
// bara ut i klartext i stallet for att arvas fran vilken maskin som rakar kora.
//
// RATTELSE, uppmatt i CI samma kvall: contextvalet `reducedMotion` i newPage() RACKTE INTE.
// Dorren uteblev i tva varv till, och forst nar `page.emulateMedia()` sattes pa den oppnade sidan
// spelade sekvensen i CI. Bada satts nu, och laget MATS efterat — ett antagande om vad en
// riggflagga gor ar precis lika osakert som ett antagande om maskinen.
async function loggaIn(opts = {}, fore = null) {
  const page = await browser.newPage(Object.assign(
    { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }, opts));
  // ANDRA VAGEN ATT SATTA LAGET. Contextvalet ovan RACKTE INTE i CI 2026-08-21: dorren kom
  // aldrig, och slappIn() har bara en enda vag ut — `prefers-reduced-motion: reduce`. Att satta
  // det pa sidan ocksa ar en annan kodvag i Playwright (Emulation.setEmulatedMedia mot en redan
  // oppnad sida) och kostar ingenting nar contextvalet redan tagit.
  await page.emulateMedia({ reducedMotion: opts.reducedMotion || 'no-preference' });
  // Samla det sidan sjalv sager. En timeout i CI berattar bara att nagot INTE hande; ett
  // konsolfel eller ett kastat undantag berattar varfor. slappIn() ar fail-open (try/catch ->
  // ga vidare anda), sa ett kast dar ser utifran ut EXAKT som ett medvetet overhopp.
  page.__konsol = [];
  // Markt med VILKEN sida felet kom fran: efter ett fail-open-hopp star vi i studio.html, och
  // dess egna fel sager ingenting om varfor dorren uteblev pa framsidan.
  const var_ = () => (page.url().split('/').pop() || '?').split('?')[0];
  page.on('console', m => { if (m.type() === 'error') page.__konsol.push(`konsol@${var_()}: ${m.text()}`) });
  page.on('pageerror', e => page.__konsol.push(`sidfel@${var_()}: ${e && e.message}`));
  await page.goto(`${bas}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#loginEmail', { timeout: 15000 });
  // Hook for prov som behover andra sidan INNAN inloggningen (t.ex. sla av alla animationer).
  if (fore) await fore(page);
  // MAT FORUTSATTNINGEN, ANTA DEN INTE. Nar den har inte holl vantade provet 50 sekunder pa en
  // dorr som med flit aldrig byggdes, och loggen sa bara "timeout" — den dyraste sortens rott.
  page.__rorelselage = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference');
  await page.fill('#loginEmail', 'prov@vyra.test');
  await page.fill('#loginPassword', 'ettlangtlosenord123');
  // Haka pa svaret INNAN klicket, annars kan det hinna komma medan vi staller oss i ko.
  page.__inloggningssvar = page
    .waitForResponse(r => /\/api\/auth\/login/.test(r.url()), { timeout: 40000 })
    .catch(() => null);

  // LAT SIDAN ANTECKNA SJALV, MEDAN DET HANDER.
  //
  // Dorren lever 1500 ms och forsvinner nar redirecten sker. Att leta efter den EFTERAT ar en
  // kapplopning mot den egna riggen: uppmatt i CI 2026-08-21 tog en enda sidladdning over 20
  // sekunder pa samma maskin, och da hinner hela sekvensen spelas fardigt innan provet ens
  // borjar titta. Samma commit kordes tva ganger och fallde pa TVA OLIKA prov — kvittot pa att
  // det ar miljon och inte koden.
  //
  // Observatoren installeras darfor FORE klicket och skriver sin iakttagelse till sessionStorage,
  // som overlever navigeringen till studio.html (samma ursprung). Da spelar det ingen roll hur
  // langsam maskinen ar: anteckningen finns kvar nar vi kommer fram.
  page.__sekvens = page.evaluate(() => new Promise(klar => {
    const NYCKEL = 'vyra-prov-slapp-in';
    sessionStorage.removeItem(NYCKEL);
    const las = () => {
      const dorr = document.querySelector('.login-dorr');
      if (!dorr) return false;
      const kort = document.querySelector('.login-kort');
      const ord = document.querySelector('.login-valkommen');
      sessionStorage.setItem(NYCKEL, JSON.stringify({
        gront: !!kort && kort.classList.contains('login-klar'),
        gubbe: !!document.querySelector('.login-gubbe'),
        dold: dorr.getAttribute('aria-hidden'),
        besked: ord ? ord.textContent : null,
        roll: ord ? ord.getAttribute('role') : null,
      }));
      return true;
    };
    if (las()) return klar(true);
    const obs = new MutationObserver(() => { if (las()) { obs.disconnect(); klar(true) } });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    setTimeout(() => { obs.disconnect(); klar(false) }, 30000);
  })).catch(() => null);   // navigeringen river kontexten — anteckningen ar redan skriven

  // MAT DEN FORDROJNING APPLIKATIONEN BEGAR — inte den maskinen levererar.
  //
  // TVA MATT HAR REDAN MISSLYCKATS, bada for att de klockade vaggtid:
  //   1. fran svaret tills nasta sida var uppe   -> CI gav 7222, 7769, 8592 ms (grans 6000)
  //   2. fran svaret tills navigeringen INITIERAS -> CI gav 6173 och 9294 ms
  // Det andra mattet var arligt: fordrojningen VAR sex sekunder dar. `setTimeout(fn, 1500)` fyrar
  // fyra sekunder for sent nar huvudtraden ar utsvulten. Sekvensen ar alltsa inte 1500 ms i
  // verkligheten, och inget vaggtidsmatt kan bli stabilt pa en delad larare.
  //
  // Darfor mats REGISTRERINGEN i stallet: vilken fordrojning slappIn() BER om. Den ar exakt 1500
  // oavsett hur belastad maskinen ar, for den ar en konstant i koden. Att anvandaren sedan slapps
  // vidare mats separat, och da bara som "det HANDER" - ett strandat lage ar oandligt, sa vilken
  // generos grans som helst fangar det.
  //
  // landing-login.js har EN enda setTimeout (rad 60), sa registreringen ar entydig.
  await page.evaluate(() => {
    const NYCKEL = 'vyra-prov-navigering';
    sessionStorage.removeItem(NYCKEL);
    window.__prov = { svarVid: null, timrar: [] };

    const origFetch = window.fetch;
    window.fetch = async function (...a) {
      const r = await origFetch.apply(this, a);
      try {
        const url = String((a[0] && a[0].url) || a[0] || '');
        if (url.indexOf('/api/auth/login') >= 0 && r.ok) window.__prov.svarVid = performance.now();
      } catch (e) {}
      return r;
    };

    // Bara timrar som registreras EFTER det lyckade svaret raknas - allt fore hor till sidans
    // vanliga liv och sager ingenting om sekvensen.
    const origSetTimeout = window.setTimeout;
    window.setTimeout = function (fn, ms, ...rest) {
      try { if (window.__prov.svarVid != null) window.__prov.timrar.push(Number(ms) || 0) } catch (e) {}
      return origSetTimeout.call(this, fn, ms, ...rest);
    };

    const notera = () => {
      if (sessionStorage.getItem(NYCKEL) != null) return;   // forst till kvarn, aldrig skriv om
      sessionStorage.setItem(NYCKEL, JSON.stringify({
        timrar: window.__prov.timrar,
        svarSett: window.__prov.svarVid != null,
      }));
    };
    // pagehide ar den tillforlitliga i Chromium, beforeunload den som fyrar tidigast.
    addEventListener('beforeunload', notera);
    addEventListener('pagehide', notera);
  });

  await page.click('.login-knapp');
  return page;
}

// Anteckningen som skrevs i det ogonblick navigeringen initierades. `null` betyder att den ALDRIG
// initierades - alltsa att anvandaren blev kvar pa framsidan.
//
// 30 s ar generost med flit: det som ska fangas ar ett STRANDAT lage, och det ar oandligt. En snal
// grans hade i stallet matt hur belastad lararen ar - felet som fallde de tva forra matten.
async function navigeringsAnteckning(page) {
  try {
    await page.waitForURL(/studio\.html/, { timeout: 30000, waitUntil: 'commit' });
  } catch (e) {
    return null;
  }
  const rad = await page.evaluate(() => sessionStorage.getItem('vyra-prov-navigering'));
  return rad == null ? null : JSON.parse(rad);
}

// Sekvensens avsedda langd, sa som koden ber om den.
const SEKVENS_MS = 1500;

test('sekvensen spelas: kortet blir gront och dorren visas', { skip, timeout: 60000 }, async () => {
  const page = await loggaIn();
  try {
    // VANTAN MATER RATT SAK NU. Forut stod har `timeout: 4000` raknat fran klicket — en gissning
    // om hur snabb maskinen ar, inte om hur produkten beter sig. UPPMATT I CI 2026-08-21: samma
    // fils granntest tog 22 s dar mot 2,2 s lokalt, sa fyra sekunder rackte inte ens fram till
    // inloggningssvaret och provet foll pa korrekt kod.
    //
    // Egenskapen som ska bevisas ar att dorren kommer NAR SVARET KOMMIT, inte inom en viss tid
    // fran klicket. Vi vantar darfor ut svaret forst och mater sedan dorren i ett eget fonster.
    // Att sekvensen inte far bli en grind mats av nasta prov, som klockar redirecten.
    assert.equal(page.__rorelselage, 'no-preference',
      'webblasaren rapporterar fortfarande prefers-reduced-motion: reduce trots att bade '
      + 'contextvalet och page.emulateMedia sagt no-preference. Da hoppar slappIn() over hela '
      + 'steget med FLIT och det finns ingen dorr att vanta pa — felet ligger i riggen, inte i '
      + 'produkten.');
    const svar = await page.__inloggningssvar;
    await page.__sekvens;
    // Anteckningen, inte elementet. Den skrevs i samma ogonblick dorren fanns och ligger kvar i
    // sessionStorage aven efter att redirecten tagit oss till studio.html.
    const rad = await page.evaluate(() => sessionStorage.getItem('vyra-prov-slapp-in'));
    if (!rad) {
      // GOR TYSTNADEN TILL EN MATNING. Tre CI-varv har fallit har och loggen sa bara "Timeout",
      // vilket utesluter ingenting.
      const lage = await page.evaluate(() => ({
        url: location.href,
        rorelse: matchMedia('(prefers-reduced-motion: reduce)').matches,
        fel: document.querySelector('#loginError')?.textContent || null,
      })).catch(e => ({ kunde_inte_lasa: String(e && e.message) }));
      assert.fail('sekvensen antecknade aldrig nagon dorr (inloggningssvar '
        + (svar ? svar.status() : 'uteblev') + '). Lage: ' + JSON.stringify(lage) + ' · '
        + (page.__konsol.length ? page.__konsol.join(' ; ') : 'inga konsolfel'));
    }
    const m = JSON.parse(rad);
    assert.equal(m.gront, true, 'kortet blev inte gront');
    assert.equal(m.gubbe, true, 'ingen gubbe att ga in genom dorren');
    assert.equal(m.dold, 'true',
      'scenen ar inte aria-hidden — en skarmlasare skulle lasa upp tomma element som inte betyder nagot');
    assert.equal(m.besked, 'Välkommen in', `beskedet var "${m.besked}"`);
    assert.equal(m.roll, 'status',
      'beskedet har ingen role=status; den som inte SER animationen far da inget besked alls');
  } finally { await page.close() }
});

test('normallaget ber om sekvensens fordrojning innan navigeringen', { skip, timeout: 90000 },
  async () => {
  const page = await loggaIn();
  try {
    const a = await navigeringsAnteckning(page);
    assert.notEqual(a, null, 'navigeringen initierades aldrig — anvandaren blev kvar');
    assert.ok(a.svarSett, 'inloggningssvaret sags aldrig, sa matningen bevisar ingenting');
    assert.ok(a.timrar.includes(SEKVENS_MS),
      `slappIn() begarde ingen ${SEKVENS_MS} ms fordrojning. Registrerade timrar: `
      + JSON.stringify(a.timrar) + '. Utan den slapps anvandaren igenom utan att sekvensen spelats');
  } finally { await page.close() }
});

test('en lyckad inloggning fastnar ALDRIG — aven om ingen animation spelar', { skip, timeout: 90000 },
  async () => {
  // HELA POANGEN. Sessionen ar redan satt nar sekvensen borjar — blir anvandaren kvar har ar hen
  // inloggad men star still pa framsidan, och det ser ut som att inloggningen inte fungerade.
  //
  // ALL rorelse slas av. Redirecten sker anda, for overlamningen hanger pa en TIMER och inte pa
  // ett animationsevent. Ett prov som bara loggade in hade inte kunnat skilja de tva at.
  const page = await loggaIn({}, async (sida) => {
    await sida.addStyleTag({ content: '*,*::before,*::after{animation:none!important;'
      + 'transition:none!important}' });
  });
  try {
    const a = await navigeringsAnteckning(page);
    assert.notEqual(a, null,
      'navigeringen initierades ALDRIG utan animationer. Da hanger redirecten pa ett '
      + 'animationsevent, och en anvandare vars webblasare inte spelar animationen blir kvar '
      + 'inloggad pa framsidan for alltid');
    assert.ok(a.timrar.includes(SEKVENS_MS),
      'sekvensen hoppades over helt utan animationer — den ska spelas, bara utan rorelse');
  } finally { await page.close() }
});

test('en LANGSAM navigering paverkar inte matningen', { skip, timeout: 90000 }, async () => {
  // Malsidan gors konstgjort langsam: tre extra sekunder innan studio.html ens svarar. Det som
  // mats — vilken fordrojning koden BER om — ar oberoende av det, och ska sta orort.
  //
  // Det gamla mattet hade fallit har. Det nya kan inte falla av den anledningen, och det ar precis
  // poangen med att sluta klocka vaggtid.
  const page = await loggaIn({}, async (sida) => {
    await sida.route(/studio\.html/, async (rutt) => {
      await new Promise(r => setTimeout(r, 3000));
      await rutt.continue();
    });
  });
  try {
    const a = await navigeringsAnteckning(page);
    assert.notEqual(a, null, 'navigeringen initierades aldrig');
    assert.ok(a.timrar.includes(SEKVENS_MS),
      `en fordrojd malsida andrade den begarda sekvensen till ${JSON.stringify(a.timrar)}`);
  } finally { await page.close() }
});

test('en TRASIG festyta slapper anda in anvandaren (fail-open)', { skip, timeout: 90000 },
  async () => {
  // slappIn() bygger dorren inne i try/catch och gar vidare i catch. Den grenen ar OSYNLIG i ett
  // normalt prov — uppmatt: muterar man bort `return gaVidare()` i catch passerar alla ovriga prov
  // anda, for ingenting kastar i lyckat lage. En fallback utan prov ar en fallback man inte vet
  // om man har.
  //
  // Felet injiceras dar sekvensen faktiskt bygger: document.createElement.
  const page = await loggaIn({}, async (sida) => {
    await sida.evaluate(() => {
      const orig = document.createElement.bind(document);
      document.createElement = (namn, ...rest) => {
        if (String(namn).toLowerCase() === 'div') throw new Error('PROV: festytan ar trasig');
        return orig(namn, ...rest);
      };
    });
  });
  try {
    const a = await navigeringsAnteckning(page);
    assert.notEqual(a, null,
      'sekvensen kastade och anvandaren blev KVAR pa framsidan. Hen ar redan inloggad — sessionen '
      + 'ar satt innan sekvensen borjar — sa en trasig dekoration far aldrig sta i vagen');
    assert.ok(!a.timrar.includes(SEKVENS_MS),
      'sekvensens timer registrerades trots att bygget kastade — da gick vi inte via fail-open '
      + 'utan vantade ut en sekvens som inte finns');
  } finally { await page.close() }
});

test('prefers-reduced-motion slapper igenom UTAN sekvensens fordrojning', { skip, timeout: 90000 },
  async () => {
  // Den som bett om mindre rorelse ska inte betala 1,5 sekunder for en animation hen inte ser.
  // landing-login.js hoppar darfor over HELA steget, inte bara keyframes.
  const page = await loggaIn({ reducedMotion: 'reduce' });
  try {
    const a = await navigeringsAnteckning(page);
    assert.notEqual(a, null, 'navigeringen initierades aldrig');
    assert.ok(!a.timrar.includes(SEKVENS_MS),
      `sekvensens ${SEKVENS_MS} ms begardes trots reduced-motion. Registrerade timrar: `
      + JSON.stringify(a.timrar) + '. Steget ska hoppas over HELT, inte bara animeras bort');
  } finally { await page.close() }
});
