'use strict';
// Command Center: LIVE PULSE — fjarde kortet, och det enda som inte ar ett tal.
//
// RATTELSE TILL FAS A. Utredningen sa att Pulse blir enkelt eftersom VyraLiveControl.getSnapshot()
// redan finns. Filen live-control.js finns och serveras (200 i produktion) — men INGENTING laddar
// den. Varken studio.html eller media.js namner den, sa VyraLiveControl definieras aldrig i
// korningen. Pulse haller darfor sin egen buffert, precis som de tre sifferkorten.
//
// NYTT KRAV som de tre andra slapp undan: raderna innehaller ANVANDARDATA fran TikTok. Listan
// byggs darfor med createElement och textContent — aldrig innerHTML. Det ar bade
// arkitekturkontraktets regel for livevagen och det enda som gor ett anvandarnamn ofarligt.
//
// ROTT NU: alla sju.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function framsidan() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  // Grinden mater LADDNING, inte kopiatext (§6) - se tests/browser/command-center-grind.browser.test.js.
  await page.waitForFunction(
    () => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  return page;
}

const SKICKA = () => ([t, e]) => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: t }, e) }));
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};

const siffror = txt => String(txt || '').replace(/\D/g, '');
const rader = () => [...document.querySelectorAll('[data-pulse] li')].map(li => li.textContent);

// Samma vakt som i #128: utan kortet blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-pulse]'));
  assert.equal(finns, true,
    'kortet [data-pulse] finns inte — testet nedan hade blivit grönt utan att mäta något');
}

test('en händelse dyker upp i pulsen', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { username: 'streamqueen', giftName: 'Rose', count: 3 }]);
  const lista = await page.evaluate(rader);
  await page.close();
  assert.equal(lista.length, 1, `pulsen hade ${lista.length} rader`);
  assert.match(lista[0], /streamqueen/, `raden saknar avsändaren: "${lista[0]}"`);
});

// ---- SKELETTET MASTE FORSVINNA, INTE BARA FA ETT ATTRIBUT --------------------------------------
//
// UPPMATT I PRODUKTION 2026-09-01, i en sandning med riktig trafik: de fyra gra platshallarstrecken
// lag kvar OVANFOR atta riktiga handelser. malaPuls() gor sitt jobb — attributet sattes — men det
// fick ingen verkan:
//
//   skelett.hidden          true      <- koden satte det ratt
//   getComputedStyle.display "grid"   <- och ingenting hande
//   tomtextens display       "none"   <- medan <p> bredvid doldes korrekt
//
// ORSAKEN. `.puls-skelett{display:grid}` i overview-premium.css slar ut webblasarens egen
// `[hidden]{display:none}`, som ar en UA-regel med lagst prioritet. Den globala
// `[hidden]{display:none!important}` finns i styles.css — men studio.html laddar INTE styles.css.
// Enda [hidden]-regeln bland de elva laddade filerna ar scopad till .scenbakgrund-kontroll.
// Texten bredvid doldes darfor att den saknar en egen display-regel, inte for att skyddet fanns.
//
// PROVET MATER computed display, inte attributet. Ett prov som last `.hidden` hade varit gront
// hela tiden — attributet var ju satt. Det ar exakt samma blinda flack som lat fyra widgetar se
// friska ut medan de var doda: att mata att koden KORDES i stallet for att den VERKADE.
test('skelettstrecken försvinner visuellt när riktiga händelser kommit', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);

  const fore = await page.evaluate(() => {
    const s = document.querySelector('.puls-skelett');
    return s ? getComputedStyle(s).display : null;
  });
  assert.notEqual(fore, null, 'skelettet finns inte i markupen — provet mäter inget');
  assert.notEqual(fore, 'none',
    'skelettet var redan dolt innan någon händelse — provet kan inte visa att det försvinner');

  await page.evaluate(SKICKA(), ['gift', { username: 'streamqueen', giftName: 'Rose', count: 1 }]);

  const efter = await page.evaluate(() => {
    const s = document.querySelector('.puls-skelett');
    const p = document.querySelector('[data-pulse] p');
    const li = document.querySelectorAll('[data-pulse] li').length;
    return { attribut: s ? s.hidden : null, display: s ? getComputedStyle(s).display : null,
      tomtext: p ? getComputedStyle(p).display : null, rader: li };
  });
  await page.close();

  assert.equal(efter.rader, 1, 'ingen händelse målades — resten av provet mäter fel sak');
  assert.equal(efter.attribut, true, 'malaPuls() satte inte hidden på skelettet');
  assert.equal(efter.display, 'none',
    `skelettet har hidden=true men display=${efter.display} — de grå strecken ligger kvar `
    + 'ovanför riktiga händelser, precis som i produktion 2026-09-01');
  assert.equal(efter.tomtext, 'none', 'tomtexten ligger kvar under de riktiga händelserna');
});

// ---- VARFOR overview-premium LADDAS IVRIGT OCH INTE VID BEHOV (#135) ------------------------
//
// Issue #135 foreslog att paketet skulle laddas forst nar nagon oppnar Oversikt, eftersom
// `ensureHomePremiumBundle()` fanns som en lat laddare. Det HADE varit en regression, och det ar
// den har matningen som visar varfor.
//
// Lyssnaren pa `vyra-live-event` sitter pa MODULNIVA i overview-premium.js (rad 275). Bufferten
// borjar alltsa fyllas i det ogonblick skriptet laddas — inte nar kortet ritas. Laddas paketet
// forst vid besok pa Oversikt finns ingen lyssnare innan dess, och varenda handelse som kom medan
// anvandaren stod i editorn ar borta for alltid. Anvandaren skulle se en TOM puls efter en timmes
// sandning och rimligen tro att funktionen ar trasig.
//
// Provet gor precis det: skickar handelsen fran en ANNAN vy och krever att den finns kvar nar
// Oversikt oppnas. Blir laddningen lat igen faller det har.
test('en händelse som kom medan användaren var i editorn finns kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  // Lamna framsidan HELT: kortet plockas ur DOM:en nar en annan vy ritas.
  await page.evaluate(() => { view = 'editor'; render() });
  await page.waitForFunction(() => !document.querySelector('[data-pulse]'), null, { timeout: 10000 });
  await page.evaluate(SKICKA(), ['gift', { username: 'borta_fran_hemvyn', giftName: 'Rose', count: 1 }]);
  // Tillbaka till Oversikt. Bufferten ska ha fangat handelsen anda.
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  await kravKort(page);
  // VANTA UT MALNINGEN — las inte mitt i kedjan. Observern (overview-premium.js:312) fangar att
  // korten ar nya noder och anropar schemalagg(), som malar i ett requestAnimationFrame. Att lasa
  // direkt efter waitForSelector ar att synkronisera mot ena anden och mata den andra: forsta
  // versionen av det har provet gjorde precis det och rapporterade [] — ett fel som inte fanns.
  const lista = await page.evaluate(() => new Promise(klar => {
    const slut = Date.now() + 5000;
    (function kolla() {
      const rader = [...document.querySelectorAll('[data-pulse] li')].map(li => li.textContent);
      if (rader.length || Date.now() > slut) return klar(rader);
      requestAnimationFrame(kolla);
    })();
  }));
  await page.close();
  assert.ok(lista.some(r => /borta_fran_hemvyn/.test(r)),
    'handelsen som kom medan anvandaren stod i editorn saknas i pulsen — lyssnaren fanns inte da, '
    + 'vilket ar precis vad en LAT laddning av overview-premium skulle orsaka. Raderna: '
    + JSON.stringify(lista));
});

test('nyaste händelsen ligger överst', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: 'forst' }]);
  await page.evaluate(SKICKA(), ['follow', { username: 'sist' }]);
  const lista = await page.evaluate(rader);
  await page.close();
  assert.match(lista[0], /sist/, `överst låg "${lista[0]}" — ordningen är omvänd`);
});

test('listan växer inte obegränsat', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(async () => {
    for (let i = 1; i <= 40; i++) {
      window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'u' + i } }));
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const lista = await page.evaluate(rader);
  await page.close();
  assert.ok(lista.length > 0 && lista.length <= 10,
    `40 händelser gav ${lista.length} rader — bufferten är obegränsad`);
});

// Anvandarnamn kommer fran TikTok. Ett namn som ser ut som markup far aldrig bli markup.
test('ett användarnamn injiceras inte som HTML', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: '<img src=x onerror=alert(1)>ond' }]);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-pulse]');
    return { bilder: kort.querySelectorAll('img').length, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.bilder, 0, 'användarnamnet tolkades som HTML — ett <img> skapades');
  assert.match(ut.text, /ond/, 'namnet visas inte alls');
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-pulse]');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'a' } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-pulse]') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('före första händelsen står tomtexten kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-pulse]');
    return { rader: kort.querySelectorAll('li').length, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.rader, 0, 'pulsen visade rader innan något hänt');
  // Tomtexten ags av tests/fixtures/tomma-tillstand.js sedan Etapp 4 PR B — provet foljer
  // fixturen i stallet for att hardkoda en fras som sprakandringar fallde en gang redan.
  const { TOMMA } = require('../fixtures/tomma-tillstand.js');
  assert.ok(ut.text.includes(TOMMA['oversikt-puls'].text), 'den ärliga tomtexten försvann');
});

test('teardown: pulsen tystnar efter utloggning', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: 'fore' }]);
  const lista = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'efter' } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('[data-pulse] li')].map(li => li.textContent);
  });
  await page.close();
  assert.equal(lista.some(r => /efter/.test(r)), false,
    'en utloggad session fortsatte ta emot händelser');
});
