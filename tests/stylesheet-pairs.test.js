'use strict';
// Laddar media.js ett skript ska den ladda skriptets stilmall också.
//
// state-backup.js laddades (media.js: `state-backup.js?v=1`) men state-backup.css laddades aldrig
// av någon. Filen ligger i repot, deployas av Dockerfilens ändelseloop, och stylar precis de
// klasser skriptet bygger: .vb-modal, .vb-settings, .vb-actions, .vb-versions. Säkerhetskopie- och
// återställningsdialogen renderades alltså helt ostylad — en fixed overlay utan bakgrund, knappar
// utan ramar — och ingenting i koden såg fel ut, eftersom felet var en RAD SOM SAKNADES.
//
// Samma sorts fel som Last-X en gång hade: `.last-x-card` hade ingen stilmall alls och renderades
// som råa element, för att media.js laddade skriptet på två ställen och stilmallen på noll.
//
// Konventionen finns redan i filen — grannarna laddar par:
//
//   ['gift-fireworks.css?v=...','action-event.css']  följt av  ['gift-fireworks.js?v=...', ...]
//
// Regeln här är den svagaste som fångar felet: finns <namn>.css i repot och media.js laddar
// <namn>.js, så måste media.js ladda stilmallen också. Den säger inget om stilmallar utan skript
// eller tvärtom — bara att ett par som finns ska laddas helt.
//
// RÖTT NU: state-backup.js laddas, state-backup.css gör det inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

// Varje 'namn.js' / 'namn.css' i en strängliteral, med eller utan ?v=-markör.
function laddade(ändelse) {
  const träffar = [...MEDIA.matchAll(/['"]([a-z0-9-]+\.(?:js|css))(?:\?[^'"]*)?['"]/g)]
    .map(m => m[1]).filter(f => f.endsWith(ändelse));
  return new Set(träffar.map(f => f.slice(0, -ändelse.length)));
}

test('varje skript media.js laddar får med sin egen stilmall', () => {
  const skript = laddade('.js'), stilmallar = laddade('.css');
  assert.ok(skript.size > 20, `hittade bara ${skript.size} skript — mönstret har ändrat form`);

  const halva = [...skript]
    .filter(stam => fs.existsSync(path.join(ROOT, stam + '.css')) && !stilmallar.has(stam))
    .sort();

  assert.deepEqual(halva, [], 'dessa skript laddas utan sin stilmall och renderas ostylade:\n'
    + halva.map(s => `  ${s}.js laddas, ${s}.css gör det inte`).join('\n'));
});

test('stilmallen som saknades finns kvar och stylar det skriptet bygger', () => {
  // Utan det här blir testet ovan grönt av att någon raderar stilmallen i stället för att ladda den.
  const css = fs.readFileSync(path.join(ROOT, 'state-backup.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'state-backup.js'), 'utf8');
  for (const klass of ['vb-modal', 'vb-actions', 'vb-versions']) {
    assert.match(css, new RegExp(`\\.${klass}\\b`), `state-backup.css stylar inte .${klass}`);
    assert.match(js, new RegExp(klass), `state-backup.js bygger inte .${klass} längre`);
  }
});
