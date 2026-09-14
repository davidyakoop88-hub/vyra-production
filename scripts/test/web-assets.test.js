'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY_POINTS = [
  'index.html',
  'studio.html',
  'layout.html',
  'overlay.html',
  'operations.html',
  'status.html',
  'privacy.html',
  'terms.html'
];

function localReferences(file) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...content.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|mailto:|data:|\/api\/)/i.test(value));
}

// En referens som borjar med "/" ar rotabsolut MOT WEBBROTEN, alltsa mot repotroten — inte mot
// filsystemets rot. path.resolve() kastar bort alla tidigare segment sa fort ett argument ar
// absolut, sa "/favicon.ico" blev C:\favicon.ico (respektive /favicon.ico pa POSIX) och provet
// rapporterade tre filer som saknade fast de ligger i repot. Felet var osynligt eftersom ingenting
// korde den har filen — se #352. Darfor ankras rotabsoluta referenser uttryckligen mot ROOT.
function resolveReference(file, reference) {
  return reference.startsWith('/')
    ? path.join(ROOT, reference)
    : path.resolve(ROOT, path.dirname(file), reference);
}

test('all browser entry-point resources exist', () => {
  const missing = [];
  for (const file of ENTRY_POINTS) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} is missing`);
    for (const reference of localReferences(file)) {
      if (!fs.existsSync(resolveReference(file, reference))) missing.push(`${file} -> ${reference}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('rotabsoluta referenser ankras mot repotroten, inte filsystemets rot', () => {
  // Vakten mot att felet ovan smyger tillbaka: utan ankringen pekar den forsta ut C:\favicon.ico.
  assert.equal(resolveReference('index.html', '/favicon.ico'), path.join(ROOT, 'favicon.ico'));
  assert.equal(resolveReference('index.html', 'assets/logo/vl-ikon.svg'),
    path.join(ROOT, 'assets', 'logo', 'vl-ikon.svg'));
});

test('widget fallbacks and gift manifest are packaged', () => {
  // The manifest named here must be the one studio.html actually loads. It used to name a
  // root-level gifts-manifest.js that nothing loaded: 708 KB listing 8372 gifts across the
  // part1..part9 packs, which had been removed from the project. The test stayed green while the
  // gift images it was supposed to guard were broken.
  for (const file of [
    'assets/gifts/gifts-manifest.js',
    'assets/gifts/gift-placeholder.svg',
    'assets/images/test-profile.svg'
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} is missing`);
  }
});

test('removed test-profile path cannot return', () => {
  const offenders = [];
  for (const file of ['studio.js', 'media.js', 'last-x-alerts.js', 'action-event.js']) {
    if (fs.readFileSync(path.join(ROOT, file), 'utf8').includes('assets/images/test/test-profile.png')) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
