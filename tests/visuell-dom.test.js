'use strict';
// PIXELVAKTENS DOM ÖVER TVÅ LÖPARE — scripts/visuell-dom.js och hur ci.yml kopplar in den.
//
// Bakgrund i skriptets huvud: GitHub servar ibland en maskin som ritar text som 0a5592fd i stället
// för referensernas 3e0f58bc. Fallen nedan är tagna ur de riktiga körningarna 23–25 november.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { doma, klassa, lasUtfall } = require('../scripts/visuell-dom.js');

const LIKA = { lagrat: '3e0f58bc', nu: '3e0f58bc', lika: true };
const AVVEK = { lagrat: '3e0f58bc', nu: '0a5592fd', lika: false };
const u = (maskin, rigg, vakt, avtryck) => ({ maskin: String(maskin), rigg, vakt, avtryck });

test('dom: en avvikande maskin tystas av en som ritar som referenserna', () => {
  // Körning 45499755004 försök 1 hade blivit grön.
  const d = doma([u(1, 'success', 'success', AVVEK), u(2, 'success', 'success', LIKA)]);
  assert.equal(d.gron, true, d.skal);
  assert.match(d.skal, /Maskin 1 avvek \(0a5592fd\)/);
});

test('dom: ett riktigt fynd på rätt maskin är rött även om den andra avvek', () => {
  const d = doma([u(1, 'success', 'success', AVVEK), u(2, 'success', 'failure', LIKA)]);
  assert.equal(d.gron, false);
  assert.match(d.skal, /föll på maskin 2/);
  assert.match(d.skal, /visuella-diffar-ci-2/);
});

test('dom: ett riktigt fynd tystas inte av att den andra löparen hängde', () => {
  const d = doma([u(1, 'skipped', 'skipped', null), u(2, 'success', 'failure', LIKA)]);
  assert.equal(d.gron, false);
});

test('dom: båda avviker — rött, och beskedet pekar på hela flottan', () => {
  const d = doma([u(1, 'success', 'success', AVVEK), u(2, 'success', 'success', AVVEK)]);
  assert.equal(d.gron, false);
  assert.match(d.skal, /Båda löparna/);
  assert.match(d.skal, /ny_rastrerare=1/);
});

test('dom: en löpare som aldrig kom fram (CJK-spegeln) tystas av en som gjorde det', () => {
  // Körningarna 45245383297 försök 2 och 45271881368 försök 1: apt stannade, inget prov kördes.
  const d = doma([u(1, 'skipped', 'skipped', null), u(2, 'success', 'success', LIKA)]);
  assert.equal(d.gron, true, d.skal);
});

test('dom: ingen kom fram — rött, inte grönt av tystnad', () => {
  const d = doma([u(1, 'skipped', 'skipped', null), u(2, 'cancelled', 'skipped', null)]);
  assert.equal(d.gron, false);
  assert.match(d.skal, /Ingen löpare kom fram/);
  assert.equal(doma([]).gron, false, 'inga utfall alls får aldrig bli grönt');
});

test('dom: riggproven fäller alltid, oavsett vad den andra löparen såg', () => {
  const d = doma([u(1, 'failure', 'skipped', null), u(2, 'success', 'success', LIKA)]);
  assert.equal(d.gron, false);
  assert.match(d.skal, /Riggproven föll på maskin 1/);
});

test('dom: grön vakt utan avtryck räknas inte som godkänd', () => {
  // Hoppade provet (ingen webbläsare) skrevs inget avtryck. Då har ingen jämförelse skett.
  assert.equal(klassa(u(1, 'success', 'success', null)), 'okant');
  assert.equal(doma([u(1, 'success', 'success', null), u(2, 'success', 'success', null)]).gron, false);
});

test('dom: läser utfallen som download-artifact lägger ut dem', () => {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'visuell-dom-'));
  for (const [n, x] of [[2, u(2, 'success', 'success', LIKA)], [1, u(1, 'success', 'success', AVVEK)]]) {
    fs.mkdirSync(path.join(kat, 'visuell-utfall-' + n));
    fs.writeFileSync(path.join(kat, 'visuell-utfall-' + n, 'utfall.json'), JSON.stringify(x));
  }
  const lista = lasUtfall(kat);
  assert.deepEqual(lista.map(x => x.maskin), ['1', '2']);
  assert.equal(doma(lista).gron, true);
  assert.deepEqual(lasUtfall(path.join(kat, 'finns-inte')), []);
});

// ---- kopplingen i workflowerna: proven ovan säger inget om ci.yml aldrig anropar skriptet ----
const flode = fil => fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', fil), 'utf8')
  .replace(/\r\n/g, '\n');
const jobb = (yml, namn) => {
  const i = yml.indexOf('\n  ' + namn + ':\n');
  assert.ok(i > -1, `jobbet ${namn} finns inte i ci.yml`);
  const nasta = yml.slice(i + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return yml.slice(i, nasta > -1 ? i + 1 + nasta : undefined);
};

test('ci.yml: vakten körs på två löpare och avvikelsen får hoppa bara där', () => {
  const m = jobb(flode('ci.yml'), 'test-visuell-maskin');
  assert.match(m, /maskin: \[1, 2\]/);
  assert.match(m, /fail-fast: false/, 'en fallen löpare får inte avbryta den andra');
  assert.match(m, /VYRA_VISUELL_TVA_MASKINER: '1'/);
  assert.match(m, /VYRA_VISUELL_AVTRYCK_FIL:/);
  assert.match(m, /id: rigg/);
  assert.match(m, /id: vakt/);
  assert.match(m, /name: visuell-utfall-\$\{\{ matrix\.maskin \}\}/);
  // Referensflödet ska ALDRIG hoppa: där är en avvikande maskin ett skäl att inte skriva något.
  assert.doesNotMatch(flode('visuell-referenser.yml'), /VYRA_VISUELL_TVA_MASKINER/);
});

test('ci.yml: domen bär det obligatoriska namnet och körs även när en löpare föll', () => {
  const d = jobb(flode('ci.yml'), 'test-visuell');
  assert.match(d, /needs: test-visuell-maskin/);
  assert.match(d, /if: always\(\)/, 'utan always() blir domen "skipped" — vilket grenskyddet godkänner');
  assert.match(d, /node scripts\/visuell-dom\.js visuell-utfall/);
});

test('ci.yml och visuell-referenser.yml: CJK-typsnittet ur samma cache och samma skript', () => {
  const nycklar = ['ci.yml', 'visuell-referenser.yml'].map(fil => {
    const y = flode(fil);
    assert.match(y, /run: bash scripts\/cjk-typsnitt\.sh/, fil + ' anropar inte skriptet');
    assert.doesNotMatch(y, /apt-get install -y --no-install-recommends fonts-noto-cjk/,
      fil + ' hämtar fortfarande direkt från spegeln');
    const k = y.match(/key: (cjk-noto-[^\n]+)/g);
    assert.ok(k && k.length === 2, fil + ' ska läsa och spara cachen med samma nyckel');
    assert.equal(k[0], k[1]);
    return k[0];
  });
  assert.equal(nycklar[0], nycklar[1], 'vakten och referenserna måste ha samma typsnittsbyggnad');
});

test('cjk-typsnitt.sh: taket gäller varje försök, inte hela steget', () => {
  const sh = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cjk-typsnitt.sh'), 'utf8');
  assert.match(sh, /timeout \d+ apt-get download fonts-noto-cjk/);
  assert.match(sh, /dpkg-deb --info/, 'en avbruten hämtning får inte cachas');
  assert.doesNotMatch(sh, /\r/, 'CRLF i ett bash-skript bryter det på löparen');
});
