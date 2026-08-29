'use strict';
// KÖR POSTGRES-JOBBET VERKLIGEN DE PROV DET SÄGER SIG KÖRA?
//
// 2026-08-27 upptäcktes att steget "Regelnycklar" hade legat i CI utan att någonsin köra ett enda
// prov. Raden `working-directory: server` saknades, så `node --test test/regelnycklar.test.js`
// kördes från repotroten, hittade ingen fil och föll med "Could not find". Felet uppstod när ett
// NYTT steg spleisades in mellan det gamla stegets `run:` och dess `working-directory:` — diffen
// var rent additiv, sju plusrader och noll minusrader, och såg därför korrekt ut.
//
// Två saker gör det här jobbet ovanligt lätt att gå sönder tyst:
//
//   1. INGEN JOBBNIVÅ-DEFAULT. Varje steg måste sätta `working-directory: server` själv. Glöms den
//      bort körs steget från fel katalog, och `node --test` på en fil som inte finns är ett
//      FALLERANDE steg — vilket är tur. Hade det varit ett tyst nollprov hade ingen märkt något.
//
//   2. EXPLICIT FILNAMNSLISTA. Jobbet räknar upp varje provfil vid namn i stället för att globba.
//      En ny provfil som kräver databas men glöms i listan får ALDRIG en riktig Postgres, och
//      går grön i den vanliga sviten just för att den hoppar över sig själv utan TEST_DATABASE_URL.
//      Det är den farligaste varianten: ett blockerat prov ser ut som ett godkänt.
//
// Vakten mäter flödet mot filsystemet, inte mot en lista som måste underhållas för hand.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');
const FLODE_SOKVAG = path.join(ROT, '.github/workflows/goal-runtime-postgres.yml');
const FLODE = fs.readFileSync(FLODE_SOKVAG, 'utf8');
const PROVKATALOG = path.join(ROT, 'server', 'test');

// Ett steg = från ett "- name:"-indrag till nästa. Samma delning som ci-artifact-budget.test.js.
function steg(kalla) {
  const ut = [];
  let nu = null;
  for (const rad of kalla.split('\n')) {
    if (/^      - /.test(rad)) { if (nu) ut.push(nu.join('\n')); nu = [rad]; }
    else if (nu) nu.push(rad);
  }
  if (nu) ut.push(nu.join('\n'));
  return ut;
}

const STEG = steg(FLODE);
const namnPa = s => (s.match(/- name:\s*(.+)/) || [, '(namnlöst steg)'])[1].trim();
// Stegen som kör provfiler. Det är bara de som behöver stå i server/.
const PROVSTEG = STEG.filter(s => /node --test\b/.test(s));

const provfiler = () => fs.readdirSync(PROVKATALOG).filter(f => f.endsWith('.test.js'));
const namndaFiler = new Set(
  [...FLODE.matchAll(/\btest\/([A-Za-z0-9._-]+\.test\.js)/g)].map(m => m[1]));

// ---- 1. VARJE PROVSTEG KÖR FRÅN server/ -------------------------------------------------------

test('varje steg som kör node --test står i server/', () => {
  assert.ok(PROVSTEG.length >= 20, `bara ${PROVSTEG.length} provsteg hittades — delningen är trasig`);

  const utan = PROVSTEG.filter(s => !/^\s*working-directory:\s*server\s*$/m.test(s));
  assert.deepEqual(utan.map(namnPa), [],
    'stegen ovan saknar "working-directory: server" och kör därför från repotroten, ' +
    'där test/-katalogen inte finns');
});

test('KONTROLLMÄTNING: vakten fångar en bortsplitsad working-directory', () => {
  // Exakt den skada som uppstod: ett nytt steg klämt in mellan run: och working-directory:.
  const skadat = [
    '      - name: Gammalt steg',
    '        run: node --test test/gammalt.test.js',
    '      - name: Nytt steg',
    '        run: node --test test/nytt.test.js',
    '        working-directory: server'
  ].join('\n');
  const bitar = steg(skadat);
  assert.equal(bitar.length, 2, 'delningen måste ge två steg');
  const utan = bitar.filter(s => !/^\s*working-directory:\s*server\s*$/m.test(s));
  assert.deepEqual(utan.map(namnPa), ['Gammalt steg'],
    'vakten skulle ha pekat ut det gamla steget — annars mäter den ingenting');
});

// ---- 2. LISTAN OCH FILSYSTEMET ÄR ÖVERENS -----------------------------------------------------

test('varje provfil som flödet namnger finns på disk', () => {
  const finns = new Set(provfiler());
  const saknas = [...namndaFiler].filter(f => !finns.has(f));
  assert.deepEqual(saknas, [],
    'flödet kör filer som inte finns — steget faller med "Could not find" i stället för att prova något');
});

test('varje databasberoende provfil står i flödets lista', () => {
  // Ett prov som hoppar över sig själv utan TEST_DATABASE_URL rapporterar SKIPPED, inte FAIL. Glöms
  // filen i listan går den därför grön överallt utan att någonsin ha rört en riktig databas — och
  // det som skulle bevisas förblir obevisat.
  const dbberoende = provfiler().filter(f =>
    fs.readFileSync(path.join(PROVKATALOG, f), 'utf8').includes('TEST_DATABASE_URL'));

  assert.ok(dbberoende.length >= 15,
    `bara ${dbberoende.length} databasberoende provfiler hittades — mätningen är trasig`);
  const saknas = dbberoende.filter(f => !namndaFiler.has(f));
  assert.deepEqual(saknas, [],
    'filerna ovan kräver Postgres men körs aldrig av Postgres-jobbet, så de är blockerade i alla lägen');
});

// ---- HTTP-PROV MÅSTE RIVA NER ALLT DE STARTAR -------------------------------------------------
//
// 2026-08-29 hängde Postgres-jobbet på ett nytt provsteg. Orsaken var inte ett fallande påstående
// utan en TEARDOWN som aldrig blev klar: filen gjorde `server.close()` men inte
// `closeAllConnections()`, och keep-alive-anslutningarna från dess egna fetch-anrop höll servern
// öppen — så callbacken löste aldrig ut. Redis-prenumerationen och Postgres-poolen håller dessutom
// händelseloopen vid liv efter sista provet.
//
// Felet kan INTE upptäckas lokalt: utan databas hoppar filen över sig själv, och då körs ingen
// teardown alls. Därför en källvakt i stället — den kostar ingenting och mäter rätt sak.
test('varje HTTP-prov som startar servern river ner den helt', () => {
  const dir = path.join(ROT, 'server', 'test');
  const brister = [];

  for (const fil of fs.readdirSync(dir).filter(f => f.endsWith('.test.js'))) {
    const kalla = fs.readFileSync(path.join(dir, fil), 'utf8');
    // Bara filer som faktiskt startar den riktiga servern.
    if (!/require\('\.\.\/index'\)/.test(kalla) || !/server\.listen\(/.test(kalla)) continue;

    if (!/closeAllConnections/.test(kalla)) {
      brister.push(`${fil}: saknar closeAllConnections — server.close() löser aldrig ut`);
    }
    if (!/eventBus\.close\(\)/.test(kalla)) {
      brister.push(`${fil}: stänger inte eventBus — Redis håller händelseloopen vid liv`);
    }
    if (!/pool\.end\(\)/.test(kalla)) {
      brister.push(`${fil}: stänger inte poolen — Postgres håller händelseloopen vid liv`);
    }
  }

  assert.deepEqual(brister, [], 'ett prov kan hänga hela CI-jobbet i stället för att falla');
});

test('KONTROLLMÄTNING: vakten hittar faktiskt HTTP-proven', () => {
  // Utan den här halvan går provet ovan grönt även om mönstret slutat träffa någon fil alls.
  const dir = path.join(ROT, 'server', 'test');
  const httpProv = fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => {
      const k = fs.readFileSync(path.join(dir, f), 'utf8');
      return /require\('\.\.\/index'\)/.test(k) && /server\.listen\(/.test(k);
    });
  assert.ok(httpProv.length >= 2,
    `hittade bara ${httpProv.length} HTTP-prov — mönstret mäter inte längre rätt`);
});

// ---- skip: FÅR ALDRIG FÅ ETT ICKE-BOOLESKT VÄRDE ----------------------------------------------
//
// Uppmätt i Node 2026-08-29: `skip:` tittar INTE på sanningsvärdet. Allt utom `false` markerar
// provet som överhoppat MEN KÖR KROPPEN ÄNDÅ, och kastar resultatet:
//
//   skip: null   -> kroppen körs, rapporteras SKIP
//   skip: ''     -> kroppen körs, rapporteras SKIP
//   skip: false  -> kroppen körs, rapporteras PASS
//
// Det bet i CI: tolv nyskrivna prov körde sina påståenden mot riktig Postgres och fick resultaten
// kastade. Steget blev grönt. Ett fallande påstående hade varit osynligt — den dyraste sortens
// grönt, eftersom det ser ut som bevis.
//
// Vakten letar efter kombinationen som orsakar det: en fil som både använder `skip:` och
// initierar sin grind med `null` eller tom sträng.
test('ingen provfil ger skip: ett värde som varken är true eller false', () => {
  const dir = path.join(ROT, 'server', 'test');
  const brister = [];

  for (const fil of fs.readdirSync(dir).filter(f => f.endsWith('.test.js'))) {
    const kalla = fs.readFileSync(path.join(dir, fil), 'utf8')
      .split(/\r?\n/).map(r => r.replace(/^\s*\/\/.*$/, '')).join('\n');
    if (!/\bskip:\s*[A-Za-z_$]/.test(kalla)) continue;      // bara filer som skickar en variabel

    if (/\?\s*null\s*:/.test(kalla)) {
      brister.push(`${fil}: grinden initieras med null — skip: null kör kroppen men kastar resultatet`);
    }
    if (/\?\s*''\s*:/.test(kalla) || /\?\s*""\s*:/.test(kalla)) {
      brister.push(`${fil}: grinden initieras med tom sträng — samma fälla som null`);
    }
  }

  assert.deepEqual(brister, [],
    'proven körs men resultatet kastas, och steget blir grönt utan att ha bevisat något');
});

test('KONTROLLMÄTNING: vakten hittar de filer som använder skip:', () => {
  const dir = path.join(ROT, 'server', 'test');
  const medSkip = fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => /\bskip:\s*[A-Za-z_$]/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.ok(medSkip.length >= 2, `hittade bara ${medSkip.length} filer med skip: — mönstret mäter fel`);
});
