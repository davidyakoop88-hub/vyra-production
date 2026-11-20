'use strict';
// STARTRUTANS VERSION (David 2026-11-20: "varför min deskapp uppdatera inte sig det står v1, 0 0").
//
// splash.html hade texten "Desktop App · v1.0.0" inskriven för hand. Den följde aldrig med när
// versionen höjdes, så rutan sa v1.0.0 i varje version fram till 1.2.7 — och såg ut som en app som
// aldrig uppdaterats. Nu skickar huvudprocessen app.getVersion() till rutan, och rutan har ingen
// egen uppfattning om versionen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROT = path.join(__dirname, '..');
const splash = fs.readFileSync(path.join(ROT, 'splash.html'), 'utf8');
const main = fs.readFileSync(path.join(ROT, 'main.js'), 'utf8');
const utanKommentarer = splash.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

// Kör rutans eget skript mot en minimal sida och ger tillbaka versionstexten.
function visad(sok) {
  const skript = /<script>([\s\S]*?)<\/script>/.exec(splash);
  assert.ok(skript, 'startrutan saknar skriptet som sätter versionen');
  const nod = { textContent: '' };
  vm.runInNewContext(skript[1], {
    URLSearchParams,
    location: { search: sok },
    document: { getElementById: id => (id === 'version' ? nod : null) },
  });
  return nod.textContent;
}

test('ingen version står inskriven i startrutan', () => {
  assert.doesNotMatch(utanKommentarer, /v\d+\.\d+\.\d+/, 'en fast version i splash.html blir fel vid nästa höjning');
  assert.match(utanKommentarer, /<span id="version"><\/span>/);
});

test('huvudprocessen skickar appens riktiga version till rutan', () => {
  assert.match(main, /splash\.loadFile\(path\.join\(__dirname, 'splash\.html'\), \{ query: \{ v: app\.getVersion\(\) \} \}\)/);
});

test('rutan visar den version den får', () => {
  const { version } = require(path.join(ROT, 'package.json'));
  assert.equal(visad('?v=' + version), ' · v' + version);
  assert.equal(visad('?v=2.0'), ' · v2.0');
});

test('utan version, eller med något som inte är en version, visas ingen alls', () => {
  for (const sok of ['', '?v=', '?v=<b>1</b>', '?v=1', '?v=1.2.7-beta', '?x=1.2.7']) {
    assert.equal(visad(sok), '', `"${sok}" gav en versionstext`);
  }
});
