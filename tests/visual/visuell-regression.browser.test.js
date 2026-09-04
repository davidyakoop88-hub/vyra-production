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

// KVITTOT PÅ ATT UPPVÄRMNINGEN KÖRDES. Provet 'uppvärmningssessionen kördes' längst ned läser den
// här — utan det kvittot går hela varmUpp() att ta bort utan att någonting faller, och då är
// uppvärmningen en kommentar och inte en vakt.
let uppvarmning = null;

/* DEN FÖRSTA SESSIONEN KASTAS — SAMMA DISCIPLIN SOM REFERENSSKRIPTET REDAN HAR.
 *
 * UPPMÄTT 2026-08-19 (står i scripts/visuell-referens.js): den FÖRSTA webbläsarsessionen på en
 * maskin skiljer sig systematiskt från alla senare. Två CI-körningar gav IDENTISKT utfall —
 * `catalog:giftjar:heart` skilde exakt 115 av 87000 pixlar, inom exakt 232x34 px vid (13,254), med
 * exakt kanalskillnad 18. Samma siffror två gånger är inte brus. En kall fontconfig-cache passar
 * både fyndet och det avgränsade textbandet. Referensskriptet kör därför TRE sessioner och kastar
 * den första.
 *
 * VAKTEN HADE INGEN SÅDAN. Motiveringen som stod i referensskriptet var att vakten "aldrig är det
 * första som startar en webbläsare på maskinen" — men det är ett ANTAGANDE, och `npm run
 * test:browser` kör 62 provfiler parallellt där VARJE fil startar sin egen webbläsare. Vilken som
 * hinner först är inte bestämt någonstans.
 *
 * UPPMÄTT 2026-09-03, PR #313, tre körningar av test-client:
 *   1. commit 0fc0e9b: 7 nycklar `battlemvp:frame:*` föll — ÄKTA, referenserna var föråldrade.
 *   2. commit ce165c0 (samma kod, bara nya referensbilder): fyra HELT ANDRA nycklar föll —
 *      `battlemvp:samurai` (1711 px i 51x58) och `socialgoal:followers:{1,2,4}:landscape`
 *      (80-88 px i ~11x14). Alla fyra var GRÖNA i körning 1.
 *   3. omkörning av EXAKT samma commit: grön.
 * Lokalt fotograferades alla fyra byteidentiskt två körningar i rad. Samma form som giftjar-fyndet:
 * liten lokal rand, bara i CI, inte reproducerbar lokalt — för lokalt är maskinen redan varm.
 *
 * EN ALTERNATIV FÖRKLARING PRÖVADES OCH FÖLL. fotografera() har två strategier ('fryst' och
 * 'levande'), och en flipp mellan dem hade kunnat ge just den här sortens lilla skillnad. Prövat
 * med CDP `Emulation.setCPUThrottlingRate {rate:20}`: alla fyra nycklarna stannade på 'fryst' och
 * gav byteidentiska bilder i båda varven. Strategiflippen är alltså INTE orsaken.
 *
 * Uppvärmningen fotograferar en riktig nyckel, inte bara sidan: den ska värma SAMMA kodväg som
 * mätningen sedan går igenom, annars värms inte det som räknas. */
// NYCKELN ÄR PINNAD, inte NYCKLAR[0]. Ordningen kommer ur docs/katalogkarta.md, som CI genererar
// om vid varje deploy — den första nyckeln kan alltså byta identitet utan att någon rör den här
// filen, och uppvärmningen skulle då värma något annat än man tror. En vanlig, stillastående widget
// utan alert-trigger är rätt val: den mäter ingenting och behöver bara rendera text.
const UPPVARMNINGSNYCKEL = 'catalog:topgift:neon';

async function varmUpp(bas) {
  const b = await startaWebblasare();
  if (!b) return { kord: false, skal: 'ingen webblasare gick att starta' };
  let resultat = { kord: false, skal: 'uppvärmningen nådde aldrig fram till ett resultat' };
  try {
    const s = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    await s.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    // SAMMA VÄNTAN SOM DEN RIKTIGA SESSIONEN. Utan overlay-kontrollen kan uppvärmningen hinna
    // rendera Studio-läget i stället, och då värms fel layout och fel typsnittsuppsättning.
    await s.waitForFunction(
      () => document.documentElement.classList.contains('overlay-output'), null,
      { timeout: 30000, polling: 100 });
    await s.waitForFunction(() => typeof window.render === 'function', null,
      { timeout: 30000, polling: 100 });
    await s.waitForTimeout(4500);
    await s.evaluate(V.RIGG);
    const finns = NYCKLAR.includes(UPPVARMNINGSNYCKEL);
    const nyckel = finns ? UPPVARMNINGSNYCKEL : NYCKLAR[0] || null;
    const foto = nyckel ? await V.fotografera(s, nyckel, ALERTS) : null;
    resultat = { kord: true, nyckel, pinnad: finns,
      fyllnad: foto && foto.fyllnad ? foto.fyllnad.procent : null,
      fel: foto && foto.fel ? foto.fel : null };
  } catch (e) {
    resultat = { kord: false, skal: String(e.message).slice(0, 160) };
  }
  // STÄNGS ALLTID, OCH STÄNGNINGEN MÄTS. Poängen är att KASTA sessionen: en som lever vidare är
  // ingen uppvärmning utan en andra webbläsare som konkurrerar om maskinen under hela mätningen.
  // Kvittot nedan läser `stangd`, så en refaktor som återanvänder huvudsessionen i stället för att
  // starta en egen faller i stället för att tyst förstöra sidans tillstånd (V.fotografera nollar
  // state.widgets och tömmer alertkön).
  await b.close().catch(() => {});
  resultat.stangd = typeof b.isConnected === 'function' ? !b.isConnected() : null;
  return resultat;
}

// TIDSGRÄNS PÅ HOOKEN. node:test låter hookar ärva Infinity, och `npm run test:visual` skickar
// inget --test-timeout. Utan gränsen hänger en uppvärmning som fastnat HELA körningen tyst — och
// ett hängande jobb är dyrare att läsa än ett rött (samma läxa som webblasare.js bär i sitt
// filhuvud). Två sessioner à ~20 s med marginal för en kall CI-maskin.
//
// ⚠️ ORDNINGEN ÄR `before(fn, options)` — INTE `before(options, fn)`. Uppmätt 2026-09-03: med
// optionsobjektet först körde hooken ALDRIG, hela filen tog 262 ms, och det enda som sa ifrån var
// att uppvärmningskvittot var null. Ingen varning, inget kast. Med den ordningen hade varje prov i
// filen mätt mot en webbläsare som aldrig startat.
test.before(async () => {
  if (skip) return;
  // Servern först: uppvärmningen behöver samma sidor som mätningen.
  server = await servera();
  const basAdress = `http://127.0.0.1:${server.address().port}`;
  uppvarmning = await varmUpp(basAdress);

  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  const bas = basAdress;
  sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  sida.__kast = [];
  sida.on('pageerror', e => sida.__kast.push(String(e.message).slice(0, 120)));
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  // VANTA UT OVERLAY-LAGET, anta det inte. Klassen satts av en inline-tagg i studio.html; kors
  // riggen innan den hunnit fotograferas Studio-lage och varenda referens blir fel utan att nagot
  // sager ifran.
  await sida.waitForFunction(
    () => document.documentElement.classList.contains('overlay-output'), null,
    { timeout: 30000, polling: 100 });
  await sida.waitForFunction(() => typeof window.render === 'function', null,
    { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(V.RIGG);
}, { timeout: 180000 });

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

test('uppvärmningssessionen kördes före mätningen', { skip }, () => {
  // KVITTOT. Utan det här provet går varmUpp() att ta bort — eller att tyst falla på ett kast —
  // utan att någonting säger ifrån, och då är uppvärmningen en kommentar i stället för en vakt.
  // Uppmätt varför den finns: se resonemanget vid varmUpp().
  assert.ok(uppvarmning, 'test.before körde aldrig uppvärmningen');
  assert.equal(uppvarmning.kord, true,
    `uppvärmningssessionen startade aldrig (${uppvarmning.skal || 'okänt skäl'}). Då mäts allt `
    + 'nedan i maskinens FÖRSTA webbläsarsession, som är känt systematiskt annorlunda.');
  assert.equal(uppvarmning.fel, null,
    `uppvärmningen kunde inte fotografera ${uppvarmning.nyckel}: ${uppvarmning.fel}. Kodvägen som `
    + 'mätningen går igenom blev då aldrig varm.');
  assert.equal(uppvarmning.pinnad, true,
    `uppvärmningen föll tillbaka på ${uppvarmning.nyckel} — den pinnade nyckeln `
    + `${UPPVARMNINGSNYCKEL} finns inte längre i katalogen. Välj en ny och skriv in den, så att `
    + 'uppvärmningen inte byter innehåll när docs/katalogkarta.md genereras om.');
  assert.equal(uppvarmning.stangd, true,
    'uppvärmningens webbläsare stängdes inte. Den ska KASTAS — annars konkurrerar den om maskinen '
    + 'under hela mätningen, och om den råkar vara samma session som mätningen använder har '
    + 'V.fotografera dessutom redan nollat state.widgets och tömt alertkön.');
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

// TREDJE TYPSNITTSKONTROLLEN, och den kom av ett fel som kostade tva blockerade PR:er.
//
// Inter och Manrope laddas av sidan och gar att kontrollera med document.fonts. Tecken som ligger
// UTANFOR dem ritas av ett SYSTEMTYPSNITT, och systemtypsnitt syns inte i document.fonts alls —
// de kommer med runner-avbildningen.
//
// UPPMATT 2026-09-03: fyra nycklar foll med identiska pixelsiffror i flera korningar utan att en
// rad kod rort dem. Skillnaden var maskinen: grona korningar hade Runner Image 20260819.586, roda
// hade 20260828.587. De fyra var de enda widgetar som ritade U+5200 (samuraiemblemet) respektive
// U+FF0B (foljarmalets ikon).
//
// ATT INSTALLERA ETT TYPSNITT LOSTE DET INTE. `playwright install-deps` drar redan in tre
// CJK-typsnitt, sa fonts-noto-cjk blev en fjarde kandidat och fontconfig avgjorde vem som vann.
// I tva korningar var Noto installerat OCH listat av fc-list medan Chromium anda ritade tofu.
//
// DARFOR RITAS DE TVA MARKENA NUMERA AV OSS, som inline-SVG. Vakten nedan bevakar inte langre
// dem — det gor `de tva marken ritas av oss` — utan U+2665, som fortfarande ar TEXT i 27 nycklar
// (heartgoal, toplike, fanlevel, socialgoal:likes). Kvarstar den flackar i CI ar det samma sorts
// fel, och da sager provet det rakt ut i stallet for att skylla pa widgetarna.
//
// METODEN ar sjalvkalibrerande: ett tecken ur privatanvandningsomradet (U+E000) finns i INGET
// typsnitt och ritas darfor alltid som en tofu-ruta. Finns hjartat i nagot typsnitt matter det
// ANNORLUNDA an tofun. Saknas det blir bada tofu — och da ar bredderna lika. Ingen hardkodad
// pixelsiffra behovs, och provet foljer med nar typsnittet byts.
const CJK_TECKEN = [['U+2665 ♥ (hjartat i heartgoal, toplike, fanlevel, socialgoal:likes)', '♥']];

test('systemtypsnittet for de textritade symbolerna finns pa maskinen', { skip, timeout: 60000 }, async () => {
  const m = await sida.evaluate((tecken) => {
    const c = document.createElement('canvas').getContext('2d');
    const matt = t => { c.font = '40px sans-serif'; return c.measureText(t).width };
    // U+E000 ligger i privatanvandningsomradet och finns i INGET typsnitt — den ritas
    // darfor garanterat som tofu och ger matningens nollpunkt. Skriven som KODPUNKT: en
    // bokstavlig privatanvandningsglyf i kallkoden ar osynlig i diffar och overlever inte
    // varje verktygskedja.
    return { tofu: matt(String.fromCodePoint(0xE000)), bredder: tecken.map(([namn, t]) => [namn, matt(t)]) };
  }, CJK_TECKEN);

  for (const [namn, bredd] of m.bredder) {
    assert.notEqual(bredd, m.tofu,
      `${namn} mater exakt lika brett som en tom platshallarglyf (${bredd} px) — tecknet ritas `
      + 'alltsa som en tofu-ruta och inte med en riktig glyf. Da faller de 27 nycklar som ritar '
      + 'symbolen som TEXT pa nagot de inte gjort sjalva. Ratt atgard ar densamma som for U+5200 '
      + 'och U+FF0B: rita market som inline-SVG i stallet for att lita pa maskinens typsnitt.');
  }
});

// DEN VAKT SOM HOR TILL FIXEN: ritas markena av oss, eller av maskinens typsnitt?
//
// EN KALLTEXTSVAKT DUGER INTE HAR. Provet "bryggan skickar glove efter fordrojningen" letade
// tidigare i natt efter ett funktionsnamn i bridge.js och forblev GRONT nar funktionen muterats
// bort — ordet fanns kvar i en kommentar intill. Samma falla galler har: ett prov som letar efter
// strangen "vyra-glyf" i studio.css uppfylls av den har kommentaren.
//
// Provet fragar darfor den RENDERADE widgeten. Tva krav, och bada behovs:
//   1. ingen CJK-kodpunkt far na skarmen — varken som text eller som ::before-content
//   2. market maste anda RITAS — annars gar hela emblemet att radera och provet forblir gront
const MARKEN = [
  { nyckel: 'catalog:battlemvp:samurai', valjare: '.mvp-emblem', sort: 'mask' },
  { nyckel: 'catalog:socialgoal:followers:1:landscape', valjare: '.goal-icon', sort: 'svg' },
];

test('de tva marken ritas av oss, inte av maskinens typsnitt', { skip, timeout: 120000 }, async () => {
  const brister = [];
  for (const { nyckel, valjare, sort } of MARKEN) {
    const foto = await fotografera(nyckel);
    if (foto.fel) { brister.push(`${nyckel}: kunde inte byggas — ${foto.fel}`); continue }
    const m = await sida.evaluate(([v, s]) => {
      const box = document.querySelector('[data-id]');
      if (!box) return { fel: 'ingen widget' };
      const el = box.matches(v) ? box : box.querySelector(v);
      if (!el) return { fel: 'hittade ingen ' + v };
      const fore = getComputedStyle(el, '::before');
      // Hela widgetens text, inte bara elementets — ett tecken som smugit in i en syskonnod ar
      // lika mycket typsnittsberoende.
      const cjk = [];
      const sok = (txt, var_) => { for (const ch of txt || '') {
        const k = ch.codePointAt(0);
        if (k >= 0x2e80 && k <= 0xfaff || k >= 0xff01 && k <= 0xff60) cjk.push(var_ + ' U+' + k.toString(16).toUpperCase());
      } };
      sok(box.textContent, 'text');
      for (const n of [box, ...box.querySelectorAll('*')]) {
        for (const p of ['::before', '::after']) sok(getComputedStyle(n, p).content, p);
      }
      return {
        cjk: [...new Set(cjk)],
        ritas: s === 'mask'
          ? (fore.maskImage || fore.webkitMaskImage || 'none')
          : (el.querySelector('svg') ? 'svg' : 'ingen'),
      };
    }, [valjare, sort]);
    if (m.fel) { brister.push(`${nyckel}: ${m.fel}`); continue }
    if (m.cjk.length) brister.push(`${nyckel}: CJK-kodpunkt nar fortfarande skarmen — ${m.cjk.join(
)}`);
    if (sort === 'mask' && !/^url\(/.test(m.ritas)) brister.push(`${nyckel}: ${valjare}::before har ingen mask-image (${m.ritas}) — market ritas inte alls`);
    if (sort === 'svg' && m.ritas !== 'svg') brister.push(`${nyckel}: ${valjare} innehaller ingen <svg> — market ritas inte alls`);
  }
  assert.deepEqual(brister, [],
    'Marken i Battle MVP · Samurai och Follower Goal ska ritas av oss som inline-SVG. Hamtas de '
    + 'ur ett systemtypsnitt igen blir de tofu-rutor pa varje maskin utan CJK-tackning — bade i '
    + 'CI och i en streamers OBS-kalla — och referensbilderna borjar flacka igen.');
});

// TVA OLIKA KRAV, och de far inte blandas ihop.
//
// Lankraden ar den ENDA noden som bar access-adressen, och den ska inte FINNAS. De ovriga ar
// strukturella och ligger kvar i DOM med display:none — for dem fungerar doljregeln, och att
// kraeva bort dem hade varit en vakt som faller pa korrekt kod. Uppmatt: forsta versionen av det
// har provet krevde att alla fyra saknades och foll direkt.
const FAR_INTE_FINNAS = ['.overlay-link-bar'];
const FAR_INTE_SYNAS = ['.editor-toolbar', '.properties', '.elements', 'aside', '.vy-kontroll'];

test('riggen kor i overlay-lage utan synligt Studio-chrome', { skip, timeout: 30000 }, async () => {
  // TREDJE KONTROLLMATNINGEN FOR FILEN, efter binaren och typsnitten. Skalet ar uppmatt:
  // lankraden monterades i overlay-utdata och skot duken 153 px ner, vilket flyttade VARJE
  // widgets rasterlage och fallde 44 nycklar — tva ganger, i bada riktningarna. Widgetarna var
  // oforandrade bada gangerna. En vakt som inte kan skilja "chrome flyttade duken" fran "widgeten
  // andrades" skickar lasaren at fel hall varje gang.
  const fynd = await sida.evaluate(([finnasEj, synasEj]) => ({
    overlay: document.documentElement.classList.contains('overlay-output'),
    finns: finnasEj.filter(v => !!document.querySelector(v)),
    syns: synasEj.filter(v => {
      const el = document.querySelector(v);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden'
        && el.getBoundingClientRect().height > 0;
    }),
  }), [FAR_INTE_FINNAS, FAR_INTE_SYNAS]);

  assert.equal(fynd.overlay, true, 'riggen kor INTE i overlay-lage');
  assert.deepEqual(fynd.finns, [],
    'lankraden finns i DOM i riggen: ' + JSON.stringify(fynd.finns)
    + '. Den bar access-adressen och skjuter dessutom duken nedat.');
  assert.deepEqual(fynd.syns, [],
    'Studio-chrome ar SYNLIGT i riggen: ' + JSON.stringify(fynd.syns)
    + '. Det flyttar duken och darmed varje widgets rasterlage.');
});

test('overlayduken borjar pa canvasTop = 0', { skip, timeout: 30000 }, async () => {
  // STRUKTURELL VAKT, inte en bild. Referenserna ar tagna med duken pa 0; borjar den nagon
  // annanstans ar varje jamforelse nedan meningslos, och da ska DEN HAR raden falla - inte 44
  // widgetar som ingen rort.
  const top = await sida.evaluate(() => {
    const c = document.querySelector('.canvas');
    return c ? Math.round(c.getBoundingClientRect().top) : null;
  });
  assert.equal(top, 0,
    `duken borjar pa ${top} px i stallet for 0. Uppmatt: med lankraden monterad blev det 153, och `
    + 'da faller 44 nycklar pa enbart rasterlaget.');
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
  const saknas = [], avviker = [], trasiga = [], tomma = [], oreproducerade = [];

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
      /* OMFOTOGRAFERA FÖRE DOMEN — en skillnad som inte kommer igen är inte en skillnad.
       *
       * Uppvärmningen ovan tar bort den kända orsaken till engångsavvikelser, men den bygger på en
       * förklaring som bara är den bästa vi har. Det här steget kräver ingen förklaring alls: det
       * frågar om skillnaden REPRODUCERAR.
       *
       * DET GÖMMER INGEN REGRESSION. En widget som faktiskt ritats om skiljer sig i BÅDA fotona —
       * andra fotot jämförs mot samma referens, så en äkta ändring rapporteras precis som förut.
       * Bara den som försvinner vid omtagning tystas, och den skrivs ut med sina siffror så att en
       * stigande flackighet syns i loggen i stället för att glida undan.
       *
       * KOSTAR BARA FÖR DE NYCKLAR SOM FALLER. Gröna nycklar fotograferas fortfarande en gång, så
       * en grön körning tar exakt lika lång tid som förut. */
      const foto2 = await fotografera(nyckel);
      const r2 = foto2.fel ? null
        : await sida.evaluate(V.JAMFOR,
          [fs.readFileSync(ref).toString('base64'), foto2.b64, V.KANALTROSKEL]);
      if (r2 && !r2.matt && !r2.olika) {
        const ruta1 = r.ruta ? `${r.ruta[2]}×${r.ruta[3]} px vid (${r.ruta[0]},${r.ruta[1]})` : 'okänd';
        oreproducerade.push(`${nyckel}: skilde ${r.olika} px (inom ${ruta1}, största kanalskillnad `
          + `${r.storsta}) i första fotot men var IDENTISK med referensen i det andra`);
        continue;
      }
      // Andra fotot skilde också: då är det siffrorna DÄRIFRÅN som gäller, för det är den mätning
      // som reproducerat. Föll omfotograferingen helt behåller vi den första.
      if (r2 && !r2.matt) { r.olika = r2.olika; r.total = r2.total; r.ruta = r2.ruta;
        r.storsta = r2.storsta; r.diff = r2.diff }
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

  // SKRIVS ALLTID UT, ÄVEN NÄR PROVET ÄR GRÖNT. En tystad avvikelse som ingen ser är en vakt som
  // slutat vakta utan att säga till. Står det noll här är sviten stabil; stiger siffran över tid
  // är det ett fynd i sig, och då finns nycklarna och talen redan i loggen.
  if (oreproducerade.length) {
    console.log(`\n${oreproducerade.length} nyckel/nycklar skilde i FÖRSTA fotot men inte i det `
      + `andra — behandlas som flackning, inte som skillnad:`);
    oreproducerade.forEach(o => console.log('   ~ ' + o));
  }
  // OCH DET FINNS ETT TAK. Utan taket är omfotograferingen precis den sortens vakt som fortsätter
  // passera men slutar mäta: blir sviten genuint icke-deterministisk kan VARJE nyckel hamna i
  // listan och provet vore fortfarande grönt.
  //
  // Taket är satt efter det uppmätta: den värsta observerade körningen (2026-09-03, PR #313) hade
  // FYRA nycklar som inte reproducerade. Tre är alltså under det som faktiskt hänt och skulle ha
  // fallit då; åtta är dubbelt så mycket som värsta fallet. Slår taket är svaret inte att höja
  // det — det är att sviten blivit instabil på ett nytt sätt, och då ska någon titta.
  const TAK = 8;
  assert.ok(oreproducerade.length <= TAK,
    `${oreproducerade.length} nycklar avvek i första fotot men inte i det andra — taket är ${TAK}.\n  `
    + oreproducerade.join('\n  ')
    + `\n  Så många icke-reproducerande nycklar är inte flackning i marginalen längre. Höj inte `
    + `taket: leta efter vad som gjort fotograferingen instabil.`);

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
