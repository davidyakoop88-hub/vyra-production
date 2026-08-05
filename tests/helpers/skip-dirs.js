'use strict';
// Kataloger som ingen kodsökning i tests/ ska gå ner i.
//
// Fyra tester går igenom filträdet och letar efter mönster i "levererad kod" — hårdkodade
// gåvosökvägar, borttagna funktionsnamn, fångade widgetreferenser, filer sidorna laddar. Alla fyra
// hade sin egen handskrivna undantagslista, och alla fyra listade `dist`.
//
// Electron bygger inte till `dist`. `electron-app/package.json` säger
// `build.directories.output: "dist2"`, och den katalogen innehåller en HEL kopia av klientkoden
// (win-unpacked/resources/app/*). Den är gitignorerad, så CI har den aldrig — men den som byggt
// desktop-appen lokalt en gång får två röda tester som pekar på filer i sin egen byggutdata, utan
// något som helst samband med det hen just ändrat. Det kostade en felsökning i den här sessionen.
//
// Namnet står därför inte här. Det LÄSES ur samma package.json som bygget använder, så att byta
// output-katalog inte kan göra listan tyst inaktuell igen.
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function byggutdataNamn() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron-app', 'package.json'), 'utf8'));
    const ut = pkg?.build?.directories?.output;
    return typeof ut === 'string' && ut ? ut : null;
  } catch { return null; }
}

// 'dist' behålls vid sidan av det konfigurerade namnet: det är electron-builders standard, och en
// äldre eller framtida build kan ha lagt något där.
const BYGGUTDATA = [...new Set(['dist', 'coverage', byggutdataNamn()].filter(Boolean))];

// Grunden varje trädsökning delar. Anropas med de extra kataloger just det testet vill utesluta.
const hoppaOver = (...extra) => new Set(['node_modules', '.git', ...BYGGUTDATA, ...extra]);

module.exports = { BYGGUTDATA, byggutdataNamn, hoppaOver };
