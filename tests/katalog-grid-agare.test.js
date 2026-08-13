'use strict';
// Ett griduppslag i media.js far inte lita pa dokumentordningen.
//
// ORSAKEN, uppmatt i Chromium 2026-08-13: media.js:129 slog upp sin container som
// `document.querySelector('.template-style-grid')` — utan att saga VILKEN. Det finns tre:
//
//   0  .social-goal-template-section .template-style-grid
//   1  .prototype-section .template-style-grid      <- den ratta
//   2  .prototype-section .template-style-grid      (premium-final.js egen grid)
//
// Vid forsta bind-passet fanns goal-griden annu inte, sa uppslaget rakade traffa ratt. Vid nasta
// pass fanns den och kom FORST i dokumentordning — sa vakten fragade fel grid, sag ingen sakura,
// och la atta extrateman plus sju Top Gift-ramar i goal-sektionen. Femton knappar i fel sektion,
// och dubbletter i katalogen.
//
// Felet gick inte att se i koden: bade uppslaget och vakten var interna och konsekventa. Det som
// andrade sig var DOM:en runt dem. Darfor vaktas formen har i stallet: ett uppslag som ska hitta
// en specifik grid maste namna sin agare.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const MEDIA = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');

// Varje querySelector som soker en template-style-grid, med det som star fore klassen i selektorn.
const UPPSLAG = /querySelector\(\s*'([^']*\.template-style-grid)'\s*\)/g;

function uppslag() {
  return [...MEDIA.matchAll(UPPSLAG)].map(m => m[1]);
}

test('kontrollmatning: uppslagen hittas', () => {
  assert.ok(uppslag().length > 0,
    'hittade inga .template-style-grid-uppslag i media.js — monstret har andrat form och provet mater inget');
});

test('varje griduppslag namner sin agande sektion', () => {
  // Ett oscopat uppslag ar exakt '.template-style-grid'. Ett scopat bar nagot fore.
  const oscopade = uppslag().filter(sel => sel.trim() === '.template-style-grid');
  assert.deepEqual(oscopade, [],
    'oscopat griduppslag i media.js — det traffar forsta griden i DOKUMENTORDNING, vilket byter ' +
    'element mellan bind-passen. Namn agaren, t.ex. ".prototype-section .template-style-grid".');
});

test('vakten for extratemana kollar sitt eget attribut', () => {
  // Vakten skrev data-extra-theme men kollade data-theme-template, sag darfor aldrig sin egen
  // utdata och lade till samma atta knappar igen vid varje pass.
  assert.ok(!/querySelector\('\[data-theme-template=/.test(MEDIA),
    'vakten kollar [data-theme-template] men knapparna bar [data-extra-theme] — den ser aldrig ' +
    'sin egen utdata och duplicerar vid varje bind');
  assert.ok(/\[data-extra-theme="sakura"\]/.test(MEDIA),
    'kontrollmatning: hittade inte vakten pa [data-extra-theme] — provet mater inget');
});
