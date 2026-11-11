'use strict';
// GALLERIET I OVERLAY-VYN (katalog-scen.js, David 2026-11-11) — det som går att hålla fast utan
// webbläsare. Beteendet i en riktig sida provas i tests/browser/katalog-scen.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROT = path.join(__dirname, '..');
const kod = fs.readFileSync(path.join(ROT, 'katalog-scen.js'), 'utf8');

function ladda(sparat) {
  const lager = new Map(sparat ? [['vyra-katalog-vy', sparat]] : []);
  const window = {};
  const sandlada = { window, document: { querySelector: () => null },
    localStorage: { getItem: k => lager.get(k) ?? null, setItem: (k, v) => lager.set(k, String(v)) },
    console, requestAnimationFrame: f => f() };
  vm.runInNewContext(kod, sandlada);
  return { api: window.VyraKatalogScen, lager };
}

test('familjenamnet är rubriken utan räknare och utan versaler', () => {
  const { api } = ladda();
  const f = api.familjenamn;
  assert.equal(f('FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER'), 'Follower, Like & Diamond Goals');
  assert.equal(f('RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS'), 'Ranking');
  assert.equal(f('BATTLE MVP · FIRANDE · 2 KOREOGRAFIER'), 'Battle MVP · Firande');
  assert.equal(f('Battle-paket · VIDEO FX · 3 paket'), 'Battle-paket · VIDEO FX');
  assert.equal(f('VYRA TOP STREAK'), 'Top Streak');
  assert.equal(f('TOP GIFTERS PODIUM · VARJE RAM SEPARAT'), 'Top Gifters Podium');
  assert.equal(f('SKATTKISTA · LIVE'), 'Skattkista');
  assert.equal(f('HJÄRTAN & MOLN'), 'Hjärtan & Moln');
});

test('galleriet är förvalt, och valet Lista sparas per webbläsare', () => {
  assert.equal(ladda().api.vy(), 'galleri');
  assert.equal(ladda('lista').api.vy(), 'lista');
  const { api, lager } = ladda();
  assert.equal(api.vy('lista'), 'lista');
  assert.equal(lager.get('vyra-katalog-vy'), 'lista');
  assert.equal(api.vy('nonsens'), 'lista', 'ett okänt värde ändrar ingenting');
});

test('galleriet äger ingen lägg-till-logik och ritar inget själv', () => {
  // Scenen ritas av miniatyrernas egen väg, och knapparna trycker på kortets egna. Skriver någon
  // en egen väg hit — state.widgets, save() eller wh() — har katalogen fått två sanningar.
  const utanKommentarer = kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(utanKommentarer, /state\.widgets|\bsave\s*\(|\bwh\s*\(/);
  assert.match(utanKommentarer, /owgRenderCardThumb/);
  assert.match(utanKommentarer, /delete prov\.dataset\.catalogKey/, 'scenen får inte räknas som ett katalogkort');
  assert.match(utanKommentarer, /e\.isTrusted/, 'bara en riktig gest väljer; kodklick ska lägga till som förut');
});

test('laddas via skript-svansen i media.js, efter katalog-ordning.js', () => {
  const media = fs.readFileSync(path.join(ROT, 'media.js'), 'utf8');
  assert.match(media, /katalog-scen\.js\?v=/);
  assert.match(media, /katalog-scen\.css\?v=/);
  assert.ok(media.indexOf('katalog-scen.js?v=') > media.indexOf('katalog-ordning.js?v='), 'galleriet läser ordningens grupper');
});

test('testet på scenen går genom testmotorn, som har ett eget läge för katalogen', () => {
  const utanKommentarer = kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(utanKommentarer, /spelaIKatalog/);
  const motor = fs.readFileSync(path.join(ROT, 'vyra-testspel.js'), 'utf8');
  assert.match(motor, /api\.spelaIKatalog\s*=/);
  // Katalogläget finns bara i studion: det definieras EFTER overlay-grenens return.
  assert.ok(motor.indexOf('api.spelaIKatalog =') > motor.indexOf('api.kanIOverlay ='), 'spelaIKatalog får inte finnas i ?overlay=1');
  // Klonen läggs i galleriets värd — aldrig på duken, och ingen riktig nod göms.
  assert.match(motor, /if \(kat\) kat\.vard\.append\(s\.nod\);/);
});

test('fyra familjer utan registerpost testas genom katalogadaptrar, som bara rör klonen', () => {
  const fil = fs.readFileSync(path.join(ROT, 'katalog-testadaptrar.js'), 'utf8');
  const ren = fil.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const typ of ['templateEnergyBar', 'templateQuiz', 'templateViewerShowcase', 'templateHeartCloud']) assert.ok(ren.includes(typ), typ + ' saknar katalogadapter');
  // Familjernas egna motorer sparar och ritar om; det får en adapter aldrig göra.
  assert.doesNotMatch(ren, /localStorage|\brender\s*\(|state\.widgets|\bsave\s*\(|\.starta\(|\.andra\(|\.satt\(|\.spela\(/);
  const motor = fs.readFileSync(path.join(ROT, 'vyra-testspel.js'), 'utf8');
  // Uppslaget på widgettyp används bara av katalogläget: editorns och overlayns väg är adapterFor.
  assert.match(motor, /const p = kat \? katalogAdapterFor\(w\) : adapterFor\(w\);/);
  assert.match(motor, /const kan = w => !!\(iEditor\(\) && adapterFor\(w \|\| vald\(\)\)\);/);
  assert.match(motor, /api\.kanIOverlay = w => !!adapterFor\(w\);/);
  assert.ok(motor.indexOf('api.registreraKatalog =') > motor.indexOf('api.kanIOverlay ='), 'registreraKatalog får inte finnas i ?overlay=1');
  const media = fs.readFileSync(path.join(ROT, 'media.js'), 'utf8');
  assert.match(media, /katalog-testadaptrar\.js\?v=/);
});
