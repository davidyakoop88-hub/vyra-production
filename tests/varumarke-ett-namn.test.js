'use strict';
// ETT NAMN I DET SOM SYNS: VYRA.
//
// Granskning 2026-10-17 F33: landningens delningskort och strukturerade data sa "VYRA LIVE",
// översikten "VYRA LIVE-KOMMANDOCENTRAL", flikens titel "VYRA Studio" och resten av appen, guiden
// och policysidorna "VYRA". Microsoft Store listar skrivbordsappen som "VYRA Studio".
//
// Beslut (det namn appen använder mest): VYRA. Skrivbordsappen heter VYRA Desktop i appen; Store-
// namnet VYRA Studio står kvar i Store-identiteten (electron-app/, kan inte bytas härifrån) och
// förklaras i guiden. Filnamn, domänen vyralive.app, logotypfilerna och API-namn som `VyraLive`
// rörs inte — provet läser bara synlig text i klientens filer i repotroten.
//
// Logotypen på landningen är ett ritat ordmärke (assets/logo/, genererat av
// scripts/generera-logo.js) och är inte text. Den omfattas inte av provet.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// Klientens filer i repotroten: allt som webbläsaren laddar och visar.
const filer = fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile());

test('kontrollmätning: filerna som bär varumärket finns med', () => {
  for (const f of ['index.html', 'studio.html', 'overview-premium.js', 'guide.js', 'sound-alerts.js']) assert.ok(filer.includes(f), f);
});

test('ingen synlig text kallar produkten "VYRA LIVE"', () => {
  const traffar = [];
  for (const f of filer) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/).forEach((rad, i) => {
      if (/VYRA LIVE/.test(rad)) traffar.push(`${f}:${i + 1}: ${rad.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(traffar, [], 'produkten heter VYRA i synlig text:\n' + traffar.join('\n'));
});

test('"VYRA Studio" nämns bara där guiden förklarar Store-namnet', () => {
  const traffar = [];
  for (const f of filer) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/).forEach((rad, i) => {
      if (/VYRA Studio(?!s identitet)/.test(rad) && !/VYRA Studio i Microsoft Store/.test(rad)) traffar.push(`${f}:${i + 1}: ${rad.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(traffar, [], 'VYRA Studio är Store-namnet på VYRA Desktop, inte ett eget produktnamn:\n' + traffar.join('\n'));
  assert.match(fs.readFileSync(path.join(ROOT, 'guide.js'), 'utf8'), /VYRA Desktop[^']*VYRA Studio i Microsoft Store[^']*samma program/,
    'guiden förklarar inte att VYRA Studio i Microsoft Store är VYRA Desktop');
});
