'use strict';
// STATISTIKDIAGRAMMET GÅR ATT LÄSA EXAKT — MED ÖGAT, MED TANGENTBORDET OCH MED SKÄRMLÄSARE.
//
// Granskningen 2026-10-17 (F27): staplarna hade varken skala eller värden. Det enda exakta talet
// låg i `title`, som bara syns när musen vilar över en stapel — aldrig med tangentbord eller
// skärmläsare — och datumen under staplarna var 7 px. Man såg att en dag var högre än en annan,
// men inte hur mycket.
//
// Proven kör den riktiga statistics-live.js i jsdom med ett påhittat API-svar och läser vad
// diagrammet faktiskt ritar: en y-axel med skala, ett värde per stapel, fokuserbara staplar med
// namn, och en tabellvy med samma tal.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'statistics-live.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'statistics-live.css'), 'utf8');

const DAGAR = [
  { dag: '2026-10-12', diamonds: 1200, gifts: 40, likes: 5000 },
  { dag: '2026-10-13', diamonds: 340, gifts: 12, likes: 2100 },
  { dag: '2026-10-14', diamonds: 0, gifts: 0, likes: 0 },
  { dag: '2026-10-15', diamonds: 5600, gifts: 150, likes: 12000 },
];

async function rita(dagar = DAGAR) {
  const sida = `<!doctype html><section data-statistics-page><p data-stats-status></p>
    <strong data-stats-total="gifts"></strong><strong data-stats-total="diamonds"></strong><strong data-stats-total="likes"></strong>
    <article class="statistics-chart-card"><div class="statistics-chart" data-stats-chart></div></article>
    <ol data-stats-supporters></ol></section>`;
  const dom = new JSDOM(sida, { runScripts: 'outside-only' });
  const w = dom.window;
  w.VyraCloudSync = { current: () => ({ workspace: { id: 'w-prov' } }) };
  w.VyraAuth = { api: async () => ({ konto: 'prov', forstaDagen: '2026-10-12',
    totalt: { gifts: 202, diamonds: 7140, likes: 19100 }, dagar, toppGivare: [] }) };
  w.eval(KALLA);
  for (let i = 0; i < 20 && !w.document.querySelector('.statistics-bar, .statistics-empty'); i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  await new Promise(r => setTimeout(r, 20));
  return w.document;
}

const siffror = s => String(s).replace(/[\s  ]/g, '');

test('diagrammet har en y-axel med skala från noll till största värdet', async () => {
  const d = await rita();
  const axel = d.querySelector('[data-stats-axis]');
  assert.ok(axel, 'diagrammet saknar y-axel — staplarnas höjd går inte att översätta till tal');
  const steg = [...axel.querySelectorAll('span')].map(s => siffror(s.textContent));
  assert.ok(steg.includes('5600'), `axeln visar inte största värdet 5 600 (steg: ${steg.join(', ')})`);
  assert.ok(steg.includes('0'), 'axeln börjar inte på 0');
  assert.ok(steg.length >= 3, 'axeln behöver minst ett mellansteg för att gå att läsa av');
});

test('varje stapel visar sitt värde och går att nå med tangentbord och skärmläsare', async () => {
  const d = await rita();
  const staplar = [...d.querySelectorAll('.statistics-bar')];
  assert.equal(staplar.length, DAGAR.length);
  staplar.forEach((stapel, i) => {
    const varde = stapel.querySelector('[data-stats-value]');
    assert.ok(varde, `stapeln för ${DAGAR[i].dag} visar inget värde`);
    assert.equal(siffror(varde.textContent), String(DAGAR[i].diamonds));
    assert.equal(stapel.getAttribute('tabindex'), '0', `stapeln för ${DAGAR[i].dag} går inte att fokusera`);
    const namn = stapel.getAttribute('aria-label') || '';
    assert.match(namn, new RegExp(DAGAR[i].dag), 'stapelns namn saknar datum');
    assert.match(siffror(namn), new RegExp(`${DAGAR[i].diamonds}diamanter`), 'stapelns namn saknar diamanter');
  });
});

test('en tabellvy visar samma tal som diagrammet', async () => {
  const d = await rita();
  const tabell = d.querySelector('[data-stats-table]');
  assert.ok(tabell, 'ingen tabellvy — exakta tal kräver att man hovrar varje stapel');
  assert.match(tabell.querySelector('summary')?.textContent || '', /tabell/i, 'tabellvyn saknar en tydlig öppnare');
  const rader = [...tabell.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => siffror(c.textContent)));
  assert.equal(rader.length, DAGAR.length);
  assert.deepEqual(rader[3], ['2026-10-15', '5600', '150', '12000']);
  const rubriker = [...tabell.querySelectorAll('thead th')].map(t => t.textContent.trim());
  assert.deepEqual(rubriker, ['Datum', 'Diamanter', 'Gåvor', 'Likes']);
});

test('utan data finns ingen tom tabell kvar', async () => {
  const d = await rita([]);
  assert.ok(d.querySelector('.statistics-empty'), 'tomläget ritades inte');
  const tabell = d.querySelector('[data-stats-table]');
  assert.ok(!tabell || tabell.hidden, 'en tom tabellvy ligger kvar när perioden saknar data');
});

test('datum och värden är läsbara, inte 7 px', () => {
  const datum = CSS.match(/\.statistics-bar span\{[^}]*font-size:(\d+(?:\.\d+)?)px/);
  assert.ok(datum, 'hittar ingen typsnittsstorlek för datumetiketterna');
  assert.ok(Number(datum[1]) >= 10, `datumen under staplarna är ${datum[1]} px — granskningen kunde inte läsa dem`);
  const axel = CSS.match(/\.statistics-axis span\{[^}]*font-size:(\d+(?:\.\d+)?)px/);
  assert.ok(axel && Number(axel[1]) >= 10, 'y-axelns siffror saknar en läsbar storlek');
});
