'use strict';
// VISUELL REGRESSIONSVAKT — ser widgetarna fortfarande ut som de ska?
//
// LUCKAN DEN STÄNGER. Varje annan vakt i repot frågar om något RENDERAS, inte om det ser rätt ut.
// `overlay-alla-widgets` mäter att en widget målas, har yta och ärvd opacitet över noll — men
// överlappande text, en avklippt kant eller en etikett som spiller ut ur sin platta passerar den
// utan att någon märker något. Uppmätt och utskrivet i checkpoint 40 som den största kvarvarande
// luckan: **"målas" är inte "är korrekt"**.
//
// NOLLTOLERANS. Uppmätt 2026-08-19: samma widget fotograferad två gånger gav 0 olika pixlar av
// 224 000, och 0 igen efter en ny webbläsarstart. Determinismen finns, så en procenttolerans hade
// bara dolt exakt de små förskjutningar vakten finns för att hitta.
//
// PÅ SAMMA BINÄR. Två Chromium-builds rastrerar typsnitt olika. Referenserna bär därför ett
// manifest med den binär de gjordes på, och vakten säger ifrån om den körs någon annanstans i
// stället för att skylla 181 fel på widgetarna. CI installerar den pinnade binären ur
// package-lock.json (`npx playwright install --with-deps chromium`).
//
// FOTOT TAS MED `omitBackground` — transparensen bevarad, precis som OBS ser den. Utan flaggan
// komponerar Chromium mot vitt, och då rapporterar även en HELT TOM bild 100 % fyllnad.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar, ALERTS, UTAN_REFERENS, utanReferens } = require('../helpers/katalognycklar.js');
const V = require('../helpers/visuell.js');

const ROOT = V.ROOT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

const ALLA = kravNycklar();
const NYCKLAR = ALLA.filter(k => !utanReferens(k));

let server, browser, sida;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  sida.__kast = [];
  sida.on('pageerror', e => sida.__kast.push(String(e.message).slice(0, 120)));
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => typeof window.render === 'function', null,
    { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(V.RIGG);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Fotograferingen bor i tests/helpers/visuell.js — samma kod som uppdateringsskriptet kör, så
// referens och jämförelse aldrig kan tas under olika villkor.
const fotografera = nyckel => V.fotografera(sida, nyckel, ALERTS);

test('vakten kör på den binär referenserna gjordes på', { skip }, () => {
  // KONTROLLMÄTNINGEN FÖR HELA FILEN. Utan den skyller varje prov nedan på widgetarna när det i
  // själva verket är webbläsaren som bytts, och 181 röda prov pekar åt fel håll samtidigt.
  const krock = V.motorKrock();
  assert.equal(krock, null, krock || '');
});

// De typsnitt referensbilderna togs med. Vikterna ar de studio.css faktiskt begar pa rad 1.
const TYPSNITT = ['400 13px Inter', '600 13px Inter', '700 16px Inter',
  '600 16px Manrope', '700 16px Manrope'];

test('typsnitten referenserna togs med finns pa plats', { skip, timeout: 60000 }, async () => {
  // ANDRA KONTROLLMATNINGEN FOR HELA FILEN, av samma skal som binarkontrollen ovan.
  //
  // studio.css rad 1 hamtar Inter och Manrope fran fonts.googleapis.com med `display=swap`.
  // Vakten hanger alltsa pa att en TREDJEPARTSHAMTNING lyckas inne i CI. Kommer den inte fram
  // ritas all text i reservtypsnittet, och da faller widget efter widget pa nagot de sjalva inte
  // gjort. UPPMATT 2026-08-21: 44 nycklar foll i tva korningar, och diffbilderna visade text
  // markerad med full kanalskillnad 255 medan avatarer, plattor och gloria var pixelidentiska.
  //
  // `document.fonts.ready` racker INTE som vakt: den loser ut nar sidans BEGARDA typsnitt ar
  // klara, och har @import:en aldrig kommit fram finns ingen @font-face att begara — da loser den
  // ut direkt, pa reservtypsnittet. Darfor laddas de uttryckligen och kontrolleras med check().
  // OCH check() DUGER INTE HELLER. Forsta versionen av det har provet anvande
  // `document.fonts.check()`. Muterat med en pahittad familj blev det GRONT anda — check() svarar
  // "kan den har texten ritas", inte "ar just den familjen laddad", sa ett reservtypsnitt racker
  // for att fa ja. En vakt som mater fel sak ar samre an ingen vakt.
  //
  // Tva oberoende signaler i stallet:
  //   1. FontFace-posterna: finns familjen alls i document.fonts, och ar den `loaded`?
  //   2. BREDDEN: samma strang matt i familjen mot en pahittad familj med samma reserv. Ar de
  //      lika pa pixeln anvands reserven — det ar beteendet som faktiskt paverkar fotot.
  const m = await sida.evaluate(async (spec) => {
    await Promise.all(spec.map(s => document.fonts.load(s).catch(() => null)));
    try { await document.fonts.ready } catch (e) {}
    const familjer = new Set([...document.fonts]
      .filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
    const matt = (fam) => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = `700 40px ${fam}, monospace`;
      return c.measureText('Handgloves 12345 VYRA').width;
    };
    const reserv = matt("'IngenSadanFamiljFinnsHar'");
    const namn = [...new Set(spec.map(s => s.split('px ')[1]))];
    return {
      saknas: namn.filter(n => !familjer.has(n)),
      reserv,
      bredder: Object.fromEntries(namn.map(n => [n, matt(`'${n}'`)])),
      antal: document.fonts.size,
    };
  }, TYPSNITT);
  assert.deepEqual(m.saknas, [],
    `typsnitten nadde aldrig fram (${m.antal} laddade ansikten). Da ritas all text i `
    + 'reservtypsnittet och jamforelsen nedan faller pa widgetar som inte andrats. Orsaken ligger '
    + 'da i natet mot fonts.googleapis.com fran den har maskinen — inte i katalogen.');
  for (const [namn, bredd] of Object.entries(m.bredder)) {
    assert.notEqual(bredd, m.reserv,
      `${namn} mater exakt lika brett som en pahittad familj (${bredd} px) — texten ritas alltsa `
      + 'med reserven trots att FontFace-posten sager laddad. Fotona nedan visar da inte den '
      + 'typografi referenserna togs med.');
  }
});

test('katalogen har nycklar att fotografera', { skip }, () => {
  assert.ok(NYCKLAR.length >= 150, `bara ${NYCKLAR.length} katalognycklar`);
});

test('undantagslistan är kort, och varje post har ett skäl', { skip: skip || undefined }, () => {
  // Varje undantag är ett hål i täckningen. Listan får inte växa tyst, och ett undantag utan skäl
  // är exakt vad man lägger till för att slippa ett rött prov.
  const poster = Object.entries(UTAN_REFERENS);
  // Taket finns for att listan ska gora ont att vaxa, inte for att fem ar ett magiskt tal. Hojs det
  // ska skalet till varje ny post sta i UTAN_REFERENS — och det ska vara en MATNING, inte "gick inte".
  assert.ok(poster.length <= 6,
    `${poster.length} nycklar är undantagna från visuell jämförelse — varje post är ett hål`);
  const utanSkal = poster.filter(([, skal]) => !skal || skal.length < 25).map(([k]) => k);
  assert.deepEqual(utanSkal, [], `undantag utan begripligt skäl: ${utanSkal.join(', ')}`);
  // En post som inte träffar någon nyckel är död kod som ser levande ut — och den döljer att
  // täckningen tyst blivit större än listan påstår.
  const traffar = poster.map(([p]) => [p, ALLA.filter(k => k === p || k.startsWith(p)).length]);
  const utanTraff = traffar.filter(([, n]) => n === 0).map(([p]) => p);
  assert.deepEqual(utanTraff, [],
    `undantag som inte träffar någon katalognyckel: ${utanTraff.join(', ')}`);
  assert.equal(ALLA.length - NYCKLAR.length, traffar.reduce((s, [, n]) => s + n, 0),
    'undantagen täcker inte exakt de nycklar som faktiskt hoppas över');
});

// KONTROLLEN FÖR TRÖSKELN (§7). En tolerans är ett hål tills någon har mätt hur stort det är.
//
// Provet bygger två par bilder i webbläsaren och kör dem genom exakt samma JAMFOR som vakten:
// ett par som skiljer 6 av 255 på varje kanal, och ett par som skiljer 7 på EN enda pixel.
// Det första ska räknas som identiskt, det andra ska falla. Utan det här provet vore
// KANALTROSKEL bara en siffra någon kunde höja till 40 utan att något blev rött.
test('tröskeln släpper igenom 6 av 255 och fäller 7 — på en enda pixel', { skip }, async () => {
  const svar = await sida.evaluate(async ([JAMFOR_KALLA, troskel]) => {
    const JAMFOR = eval(JAMFOR_KALLA);
    const gor = (mala) => {
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40;
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(100,150,200)'; g.fillRect(0, 0, 40, 40);
      mala(g);
      return c.toDataURL('image/png').split(',')[1];
    };
    const bas = gor(() => {});
    const allaSex = gor(g => { g.fillStyle = 'rgb(106,156,206)'; g.fillRect(0, 0, 40, 40) });
    const enSju = gor(g => { g.fillStyle = 'rgb(107,150,200)'; g.fillRect(7, 9, 1, 1) });
    return {
      sexPaAlla: await JAMFOR([bas, allaSex, troskel]),
      sjuPaEn: await JAMFOR([bas, enSju, troskel]),
    };
  }, [V.JAMFOR.toString(), V.KANALTROSKEL]);

  assert.equal(svar.sexPaAlla.olika, 0,
    `6 av 255 på varje kanal ska räknas som samma färg (CI:s uppmätta brusgolv), men `
    + `${svar.sexPaAlla.olika} pixlar rapporterades som olika — då är tröskeln inte den som `
    + 'står i koden');
  assert.equal(svar.sjuPaEn.olika, 1,
    `en enda pixel som skiljer 7 ska fälla provet, men jämförelsen rapporterade `
    + `${svar.sjuPaEn.olika} olika pixlar. Tröskeln är en avrundning, inte en budget: det finns `
    + 'ingen mängd avvikande pixlar som ska få passera.');
  assert.equal(svar.sjuPaEn.storsta, 7, 'största kanalskillnaden ska rapporteras rätt');
});

test('varje katalognyckel ser ut som sin referens', { skip }, async () => {
  fs.mkdirSync(V.DIFFKAT, { recursive: true });
  const saknas = [], avviker = [], trasiga = [], tomma = [];

  for (const nyckel of NYCKLAR) {
    const foto = await fotografera(nyckel);
    if (foto.fel) { trasiga.push(`${nyckel}: ${foto.fel}`); continue }

    // §7: en referens som är en tom ruta matchar allt. Kontrollen gäller BÅDA sidor — den nya
    // bilden här, och referensen när den skrevs.
    if (foto.fyllnad.procent < 3) {
      tomma.push(`${nyckel}: bara ${foto.fyllnad.procent} % av bilden är målad `
        + `(${foto.fyllnad.bredd}×${foto.fyllnad.hojd}) — en tom referens matchar allt`);
      continue;
    }

    const ref = V.refvag(nyckel);
    if (!fs.existsSync(ref)) { saknas.push(nyckel); continue }

    const r = await sida.evaluate(V.JAMFOR,
      [fs.readFileSync(ref).toString('base64'), foto.b64, V.KANALTROSKEL]);
    if (r.matt) { avviker.push(`${nyckel}: måtten ändrades, referens ${r.ref} mot ny ${r.ny}`); continue }
    if (r.olika) {
      const diffil = path.join(V.DIFFKAT, V.filnamn(nyckel));
      fs.writeFileSync(diffil, Buffer.from(r.diff, 'base64'));
      // Siffrorna före filnamnet, inte efter: diffbilden ligger på en löpare som försvinner, och i
      // CI är meddelandet allt man har. En skillnad på 26 pixlar med största kanalskillnad 1 i en
      // ruta om 6×4 är kantutjämning; 5000 pixlar över hela ytan är en omritning. Utan talen ser de
      // två likadana ut.
      const ruta = r.ruta ? `${r.ruta[2]}×${r.ruta[3]} px vid (${r.ruta[0]},${r.ruta[1]})` : 'okänd';
      avviker.push(`${nyckel}: ${r.olika} av ${r.total} pixlar skiljer `
        + `(${(r.olika / r.total * 100).toFixed(2)} %), inom ${ruta}, största kanalskillnad `
        + `${r.storsta} av 255 — se ${path.relative(ROOT, diffil)}`);
    }
  }

  assert.deepEqual(trasiga, [], `kunde inte fotograferas:\n  ${trasiga.join('\n  ')}`);
  assert.deepEqual(tomma, [], `fotograferades som i praktiken tomma:\n  ${tomma.join('\n  ')}`);
  assert.deepEqual(saknas, [],
    `${saknas.length} av ${NYCKLAR.length} nycklar saknar referensbild.\n`
    + `  Kör en gång för att skapa dem:\n`
    + `    VYRA_VISUELL_MOTIV="varför" npm run test:visual:update\n`
    + `  Saknas: ${saknas.slice(0, 8).join(', ')}${saknas.length > 8 ? ` … +${saknas.length - 8}` : ''}`);
  assert.deepEqual(avviker, [],
    `${avviker.length} nycklar ser inte längre ut som sin referens:\n  ${avviker.join('\n  ')}\n`
    + `  Är ändringen avsedd? Uppdatera med motivering:\n`
    + `    VYRA_VISUELL_MOTIV="…" npm run test:visual:update`);
});
