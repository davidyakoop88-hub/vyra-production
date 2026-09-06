'use strict';
// ROTSVITEN FÅR INTE `require` KOD UR ETT ANNAT PAKET SOM HAR EGNA BEROENDEN.
//
// FYRA PAKET, FYRA `npm ci`. CI installerar varje pakets beroenden i DESS katalog. Ett prov i
// `tests/` som drar in `server/event-bus.js` får därför inte `redis`, och faller med
// `Cannot find module 'redis'` — även när logiken är helt rätt.
//
// DET VÄRSTA ÄR ATT DET PASSERAR LOKALT. En utvecklares worktree har ofta alla fyra
// `node_modules` inlänkade, så provet är grönt på maskinen och rött först i CI. Det har hänt
// TRE gånger på ett dygn: `pg` i certifieringskonto-provet, och `redis` två gånger i PR #355.
//
// Vakten läser rotsvitens filer och kräver att varje `require` över en paketgräns står i
// listan nedan — och den KONTROLLERAR sedan att den filen faktiskt är beroendefri i stället för
// att tro på kommentaren bredvid. En fil som får ett nytt beroende fäller alltså provet här,
// innan CI hinner göra det.
//
// `readFileSync` över paketgränsen är däremot helt OK och används av flera prov: att LÄSA en fil
// kräver inga beroenden. Det är bara `require` som laddar dess importkedja.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// Paket med egen package.json = egen `npm ci` i CI = egna beroenden rotsviten inte har.
const FRAMMANDE_PAKET = ['server', 'electron-app', 'tiktok-bridge'];

// Tillåtna undantag, MED SKÄL. Varje post måste vara beroendefri, vilket provet nedan mäter.
//
// Nyckeln jämförs UTAN filändelse: både `require('server/goal-sse')` och `'...goal-sse.js'`
// förekommer i sviten, och två skrivsätt för samma fil ska inte kräva två rader här.
const utanJs = s => s.replace(/\.js$/, '');
const TILLATNA = {
  'tiktok-bridge/normalizer.js':
    'ren funktionsmodul utan externa beroenden; kontraktsproven kor den mot cleanEvents form',
  'tiktok-bridge/analysera-inspelning.js':
    'lasverktyg for inspelningar; bara node-inbyggda moduler',
  'electron-app/tiktok-fields.js':
    'faltberakningen, delad form med bryggans normalizer; inga externa beroenden',
  'server/goal-sse':
    'ramformaterare for SSE; ren strangbyggare',
  'server/goal-runtime':
    'malmotorns rena rakning, utan lagring',
  'server/goal-metrics.js':
    'metriknamn och harledning; ren tabell',
};

const provfiler = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join('tests', f));

// Fångar bade require('x') och require(path.join(__dirname,'..','x','y.js')).
function korsandeRequires(src) {
  const ut = [];
  const direkt = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(direkt)) ut.push(m[1].replace(/\\/g, '/'));
  const viaJoin = /require\(\s*path\.join\(([^)]*)\)\s*\)/g;
  for (const m of src.matchAll(viaJoin)) {
    ut.push(m[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, ''))
      .filter(d => d && d !== '__dirname' && d !== '..').join('/').replace(/\\/g, '/'));
  }
  return ut;
}

const tillhorPaket = spec => FRAMMANDE_PAKET.find(
  p => spec === p || spec.startsWith(p + '/') || spec.includes('/' + p + '/'));

test('inget rotprov require:ar kod ur ett paket med egna beroenden', () => {
  const brott = [];
  for (const fil of provfiler) {
    const src = fs.readFileSync(path.join(ROOT, fil), 'utf8');
    for (const spec of korsandeRequires(src)) {
      const paket = tillhorPaket(spec);
      if (!paket) continue;
      // Normalisera till en repo-relativ sokvag.
      const rel = utanJs(spec.slice(spec.indexOf(paket)));
      if (Object.keys(TILLATNA).some(k => utanJs(k) === rel)) continue;
      brott.push(`${fil.split(path.sep).join('/')} -> ${rel}`);
    }
  }
  assert.deepEqual(brott, [],
    'rotsviten drar in kod ur ett annat pakets katalog:\n  ' + brott.join('\n  ') +
    '\nCI kor npm ci per paket, sa detta faller med MODULE_NOT_FOUND dar men INTE lokalt. ' +
    'Flytta provet till det paketets svit, eller las filen med readFileSync i stallet.');
});

// Undantagen far inte ruttna. Ett tillagt beroende i en tillaten fil ska falla HAR, inte i CI.
for (const [fil, skal] of Object.entries(TILLATNA)) {
  test(`undantaget ${fil} ar fortfarande beroendefritt (${skal})`, () => {
    const sedda = new Set();
    const start = path.join(ROOT, fil);
    const kvar = [fs.existsSync(start) ? start : start + '.js'];
    const bare = [];
    while (kvar.length) {
      const f = kvar.pop();
      if (sedda.has(f)) continue;
      sedda.add(f);
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1];
        if (spec.startsWith('.')) {
          const nasta = path.resolve(path.dirname(f), spec);
          kvar.push(fs.existsSync(nasta) ? nasta : nasta + '.js');
          continue;
        }
        // node:-prefix och de gamla obeprefixade inbyggda modulerna ar ofarliga.
        if (spec.startsWith('node:')) continue;
        if (require('module').builtinModules.includes(spec)) continue;
        bare.push(`${path.relative(ROOT, f).replace(/\\/g, '/')} -> ${spec}`);
      }
    }
    assert.deepEqual(bare, [],
      `${fil} har fatt ett externt beroende:\n  ` + bare.join('\n  ') +
      '\nDen far darfor inte langre require:as fran rotsviten. Ta bort den ur TILLATNA och ' +
      'flytta provet, eller las filen med readFileSync.');
  });
}
