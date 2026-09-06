'use strict';
// EN KÄLLA FÖR MOLNETS FÄLTNAMN.
//
// Bakgrunden är en riktig bugg, inte en princip: översättningen molnfält -> widgetfält fanns i TVÅ
// kopior — live-client.js för Studions overlay-utdata, public/widgets/base-widget.js för de
// fristående OBS-sidorna. NFKC-fixen (#342, `fc5235b`) lades i den ena. Den andra fortsatte visa
// rutor i stället för namn, i tre veckor, medan fixen räknades som levererad i docs/lansering.md.
//
// Ingen provsvit sa emot, för varje kopia provades mot sitt eget antagande.
//
// Proven här faller om någon återinför en kopia — antingen genom att skriva om fälten på nytt i en
// konsument, eller genom att glömma <script>-taggen på en av sidorna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const MODUL = 'cloud-fields.js';
// Konsumenterna: filen, och den sida som laddar den (null = laddas av media.js injektionskedja).
const KONSUMENTER = [
  { fil: 'live-client.js', sida: null },
  { fil: 'public/widgets/base-widget.js', sida: 'public/widgets/last-x-alerts.html' },
  { fil: 'public/widgets/base-widget.js', sida: 'public/widgets/goal-image-frame.html' },
];

test('modulen finns och exporterar bada funktionerna', () => {
  const m = require(path.join(ROOT, MODUL));
  assert.equal(typeof m.normalizeCloudFields, 'function');
  assert.equal(typeof m.plattaNamn, 'function');
});

test('modulen gor alla TRE omskrivningarna — det var den tredje som saknades i kopian', () => {
  const { normalizeCloudFields } = require(path.join(ROOT, MODUL));
  const e = normalizeCloudFields({ profileUrl: 'https://x/a.jpg', value: 42, name: '𝓙𝓸𝓴𝓮𝓻𝓸' });
  assert.equal(e.profileImage, 'https://x/a.jpg', 'profileUrl -> profileImage');
  assert.equal(e.coins, 42, 'value -> coins');
  assert.equal(e.name, 'Jokero', 'NFKC pa visningsnamnet — den omskrivning kopian saknade');
});

test('handtaget ror modulen ALDRIG, aven nar det ar dekorativt', () => {
  const { normalizeCloudFields } = require(path.join(ROOT, MODUL));
  const e = normalizeCloudFields({ username: '𝓙𝓸𝓴𝓮𝓻𝓸', name: '𝓙𝓸𝓴𝓮𝓻𝓸' });
  assert.equal(e.username, '𝓙𝓸𝓴𝓮𝓻𝓸', 'username ar IDENTITETEN — normaliseras den slas tva personer ihop');
  assert.equal(e.name, 'Jokero');
});

// Textvakten. Den mater FRANVARO av egen logik, inte narvaro av ett anrop: en konsument kan anropa
// modulen OCH ha kvar sin gamla kopia, och da ar vi tillbaka i tva sanningar.
for (const { fil } of [...new Map(KONSUMENTER.map(k => [k.fil, k])).values()]) {
  test(`${fil} har ingen EGEN normalisering kvar`, () => {
    const src = las(fil);
    assert.match(src, /VyraCloudFields/, `${fil} anropar inte den delade modulen`);
    assert.doesNotMatch(src, /normalize\(\s*['"]NFKC['"]\s*\)/,
      `${fil} har en egen NFKC-normalisering — det ar den andra kopian som gav #351`);
    assert.doesNotMatch(src, /profileImage\s*=\s*\w+\.profileUrl/,
      `${fil} skriver om profileUrl sjalv i stallet for att anvanda ${MODUL}`);
    assert.doesNotMatch(src, /\.coins\s*=\s*\w+\.value/,
      `${fil} skriver om value sjalv i stallet for att anvanda ${MODUL}`);
  });
}

// Laddningsvakten. En delad modul som inte laddas ar sämre an en kopia: kopian fungerade i alla
// fall halva vagen, medan live-client.js och base-widget.js bada KASTAR om modulen saknas.
for (const { sida } of KONSUMENTER.filter(k => k.sida)) {
  test(`${sida} laddar ${MODUL} FORE base-widget.js`, () => {
    const html = las(sida);
    const modul = html.indexOf('cloud-fields.js');
    const bas = html.indexOf('base-widget.js');
    assert.ok(modul > -1, `${sida} laddar inte ${MODUL} — sidan kastar pa forsta eventet`);
    assert.ok(bas > -1, `${sida} laddar inte base-widget.js`);
    assert.ok(modul < bas, `${sida} laddar ${MODUL} EFTER base-widget.js — for sent`);
  });
}

test('media.js kedjar modulen fore live-client.js', () => {
  const src = las('media.js');
  // Citattecknet ar med i monstret med flit: utan det matchar aven 'zzz-cloud-fields.js?v=',
  // och vakten hade da godkant en fil som inte finns. Uppmatt — mutationen overlevde forst.
  const modul = src.indexOf("'cloud-fields.js?v=");
  const klient = src.indexOf("'live-client.js?v=");
  assert.ok(modul > -1, 'media.js injicerar inte cloud-fields.js — Studion kastar pa forsta eventet');
  assert.ok(modul < klient, 'cloud-fields.js injiceras efter live-client.js — for sent');
});
