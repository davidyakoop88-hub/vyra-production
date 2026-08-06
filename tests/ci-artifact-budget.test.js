'use strict';
// Windows-installern far byggas pa varje PR, men inte laddas upp.
//
// 2026-08-06 slog GitHubs artefaktkvot i taket och FALLDE tva PR:er som inte hade nagot med
// desktop-appen att gora. Uppmatt da: 97 levande artefakter, 24,6 GB, alla Windows-installers pa
// 268 MB styck. Varje CI-korning lade till en till.
//
// Bygget ar beviset — steget "Build NSIS installer" visar att installern gar att bygga. Artefakten
// ar bara nagot en manniska laddar ner, och pa en PR laddar ingen ner den. De riktiga installerna
// bor dessutom som RELEASE-ASSETS (v1.2.1-v1.2.3), en separat lagring som inte rors av det har,
// och "Publish GitHub release" laser filerna fran DISK, inte fran artefakten.
//
// Den osignerade uppladdningen har ett andra skal: dess enda konsument ar SignPath-steget, som bara
// kor pa taggar. Pa en PR laddades 268 MB upp for att sedan aldrig lasas av nagon.
//
// ROTT NU: bada uppladdningarna kor pa varje PR.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const FLODE = fs.readFileSync(
  path.join(__dirname, '..', '.github/workflows/desktop-release.yml'), 'utf8');

// Ett steg = fran ett "- " med samma indrag till nasta.
function steg(kalla) {
  const rader = kalla.split('\n');
  const ut = [];
  let nu = null;
  for (const rad of rader) {
    if (/^      - /.test(rad)) { if (nu) ut.push(nu.join('\n')); nu = [rad] }
    else if (nu) nu.push(rad);
  }
  if (nu) ut.push(nu.join('\n'));
  return ut;
}

const STEG = steg(FLODE);
const uppladdningar = STEG.filter(s => /uses:\s*actions\/upload-artifact/.test(s));
const taggvillkor = s => /if:[^\n]*startsWith\(github\.ref,\s*'refs\/tags\/v'\)/.test(s);
const namnet = s => (s.match(/name:\s*([A-Za-z0-9._-]+)/) || [, '(namnlos)'])[1];

test('flodet laddar upp artefakter alls', () => {
  assert.ok(uppladdningar.length >= 2,
    `hittade ${uppladdningar.length} upload-artifact-steg — flodet har andrat form och testet mater fel`);
});

test('ingen artefakt laddas upp pa en pull request', () => {
  const utan = uppladdningar.filter(s => !taggvillkor(s)).map(namnet);
  assert.deepEqual(utan, [],
    `dessa laddas upp pa varje PR och fyller kvoten med 268 MB per korning: ${utan.join(', ')}`);
});

test('installern byggs fortfarande pa en PR — det ar beviset', () => {
  const bygg = STEG.find(s => /name:\s*Build NSIS installer/.test(s));
  assert.ok(bygg, 'byggsteget finns inte langre');
  assert.doesNotMatch(bygg, /if:/,
    'bygget villkorades bort — da bevisar en PR inte langre att installern gar att bygga');
});

test('testerna kors fortfarande i desktop-jobbet', () => {
  assert.match(FLODE, /run:\s*npm test/, 'desktop-jobbets egna tester togs bort');
});

test('den osignerade uppladdningen har samma villkor som sin enda konsument', () => {
  // SignPath-steget ar det enda som laser artifact-id fran uppladdningen. Skiljer sig villkoren at
  // laddas 268 MB upp for att aldrig lasas — eller sa saknas artefakten nar signeringen behover den.
  const upp = uppladdningar.find(s => /VYRA-Windows-Installer-Unsigned/.test(s));
  const sign = STEG.find(s => /uses:\s*signpath\//.test(s));
  assert.ok(upp && sign, 'hittade inte bada stegen');
  const villkor = s => (s.match(/if:\s*(.+)/) || [, ''])[1].trim();
  assert.equal(villkor(upp), villkor(sign),
    'uppladdningen och signeringen kan komma i otakt — den ena utan den andra ar alltid fel');
});

test('releasen laser fran disk, inte fran artefakten', () => {
  // Det ar det som gor taggvillkoret ofarligt: publiceringen behover ingen artefakt.
  const publicera = STEG.find(s => /name:\s*Publish GitHub release/.test(s));
  assert.ok(publicera, 'publiceringssteget saknas');
  assert.match(publicera, /dist2\/VYRA-Setup\.exe/,
    'publiceringen laser inte langre filerna fran disk — da kan artefakten behovas');
  assert.doesNotMatch(publicera, /download-artifact/);
});
