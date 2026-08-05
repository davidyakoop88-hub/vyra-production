'use strict';
// Ingen trädsökning i tests/ får ha sin egen undantagslista.
//
// Fyra tester går igenom filträdet och letar efter mönster i levererad kod. Alla fyra hade en
// handskriven lista över kataloger att hoppa över, och alla fyra skrev `dist`. Electron bygger inte
// till `dist`: electron-app/package.json säger `build.directories.output: "dist2"`, och den
// katalogen innehåller en hel kopia av klientkoden under win-unpacked/resources/app/.
//
// Katalogen är gitignorerad, så CI ser den aldrig och sviten är grön där. Men den som byggt
// desktop-appen lokalt får två röda tester som pekar rakt in i sin egen byggutdata, utan samband
// med det hen just ändrat. Det hände i den här sessionen och kostade en felsökning innan orsaken
// var hittad — och det är den värsta sortens testfel, eftersom det ser ut som en riktig regression.
//
// tests/helpers/skip-dirs.js läser namnet ur samma package.json som bygget använder. Det här testet
// finns för att ingen ska skriva en femte lista för hand.
//
// RÖTT NU: de fyra sökningarna har fortfarande varsin egen lista.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { BYGGUTDATA, byggutdataNamn } = require('./helpers/skip-dirs.js');

const HÄR = __dirname;

// De fyra filerna som går igenom filträdet.
const SÖKANDE_TESTER = [
  'gift-image-paths.test.js',
  'gift-source-single.test.js',
  'live-widget-reference.test.js',
  'site-image-contents.test.js'
];

test('byggutdatakatalogen läses ur electron-app/package.json', () => {
  const namn = byggutdataNamn();
  assert.ok(namn, 'kunde inte läsa build.directories.output — hjälparen gissar då i stället');
  assert.ok(BYGGUTDATA.includes(namn),
    `"${namn}" saknas i undantagen — trädsökningarna går ner i byggutdatan`);
});

test('varje trädsökande test använder den delade listan', () => {
  const utan = SÖKANDE_TESTER.filter(fil =>
    !/require\(['"]\.\/helpers\/skip-dirs\.js['"]\)/.test(fs.readFileSync(path.join(HÄR, fil), 'utf8')));
  assert.deepEqual(utan, [],
    `dessa har en egen undantagslista och missar byggutdatan: ${utan.join(', ')}`);
});

test('ingen egen lista med bara "dist" finns kvar', () => {
  // Den exakta formen som var fel: en Set-literal som räknar upp kataloger och nämner 'dist' utan
  // det konfigurerade namnet. Hittas den igen har någon skrivit om listan för hand.
  const kvar = [];
  for (const fil of SÖKANDE_TESTER) {
    const src = fs.readFileSync(path.join(HÄR, fil), 'utf8');
    for (const m of src.matchAll(/new Set\(\[([^\]]*)\]\)/g)) {
      const poster = m[1];
      if (/'dist'/.test(poster) && !new RegExp(`'${byggutdataNamn()}'`).test(poster)) {
        kvar.push(`${fil}: new Set([${poster.replace(/\s+/g, ' ').trim().slice(0, 60)}...])`);
      }
    }
  }
  assert.deepEqual(kvar, [], `handskrivna listor som saknar byggutdatan:\n${kvar.join('\n')}`);
});
