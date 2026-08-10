'use strict';
// Skuldregistret ska inte kunna ljuga.
//
// docs/tech-debt.md listade §3 som oppen langt efter att koden lagats. 2026-08-10 valdes den
// darfor som "den farligaste kvarvarande skulden" och arbetet paborjades — innan matningen
// visade att det inte fanns nagot att laga. Ett register som ljuger kostar mer an skulden det
// beskriver, eftersom det styr vad man valjer att gora harnast.
//
// Varje punkt som bar en MATBAR utsaga far den matningen kord har. Provet faller at bada hallen
// med flit:
//
//   skulden har vuxit   -> nagot har blivit samre och ingen sa till
//   skulden ar borta    -> punkten ska flyttas till "Sadant som ar lost", inte sta kvar
//
// Punkter utan matbar utsaga (§2 ar en avvagning, inte ett fel) hor inte hemma har.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROT = path.join(__dirname, '..');
const las = p => fs.readFileSync(path.join(ROT, p), 'utf8');

function filerUnder(katalog, filter) {
  const ut = [];
  for (const post of fs.readdirSync(path.join(ROT, katalog), { withFileTypes: true })) {
    const rel = path.join(katalog, post.name);
    if (post.isDirectory()) ut.push(...filerUnder(rel, filter));
    else if (filter(post.name)) ut.push(rel);
  }
  return ut;
}

// ---- §1 · Glove Snipe kan inte tandas av ett riktigt event -------------------------------------
test('§1 star kvar: bryggan publicerar ingen av Glove Snipes eventtyper', () => {
  const typer = ["'tap'", "'snipe'", "'glove'"];
  const traffar = [];
  for (const fil of filerUnder('tiktok-bridge', n => n.endsWith('.js'))) {
    const kalla = las(fil);
    for (const t of typer) if (kalla.includes(t)) traffar.push(`${fil}: ${t}`);
  }
  assert.deepEqual(traffar, [],
    'Bryggan publicerar numera en av Glove Snipes typer. Antingen ar §1 LOST och ska flyttas ' +
    'till "Sadant som ar lost", eller sa har nagon lagt till en typ utan att stanga punkten:\n  ' +
    traffar.join('\n  '));
});

// ---- §3 · aterfallsvakt -------------------------------------------------------------------------
// Punkten ar lost. Provet finns for att den inte ska kunna aterkomma tyst — det var den enda
// skulden i registret som kunde forstora nagot anvandaren AGER (den sparade layouten).
test('§3 forblir lost: livevagen skriver inte till widgetobjektet', () => {
  const kalla = las('gift-fireworks.js');
  const trigger = kalla.slice(kalla.indexOf('window.triggerGiftFireworks'));
  assert.ok(trigger.length > 200, 'kontrollmatning: triggerGiftFireworks hittades inte i kallan');

  // Funktionens kropp, avgransad av dess egen slutrad. Forsta versionen slog upp '\nwindow.'
  // och fick -1, vilket via `|| trigger.length` svalde HELA resten av filen — inklusive
  // panelens knapphanterare, som legitimt skriver w.x och w.y.
  const slut = trigger.indexOf('return true};');
  assert.ok(slut > 0, 'kontrollmatning: hittade inte slutet pa triggerGiftFireworks');
  const kropp = trigger.slice(0, slut);

  // Kommentarer bort FORST. Kommentaren pa platsen citerar den borttagna raden ordagrant
  // ("Forr stod har `traffar.forEach(w=>{w.fwCombo=combo})...`") — forklaringen ser alltsa ut
  // precis som felet den beskriver, och en vakt som laser prosa hittar det den sjalv skrev.
  const utanKommentarer = kropp.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

  // Anhakad pa ordgrans: utan den matchar monstret inuti "windo(w.t)riggerGiftFireworks=".
  const skrivningar = [...utanKommentarer.matchAll(/(?<![\w.])w\.\w+\s*=(?!=)/g)].map(m => m[0]);
  assert.deepEqual(skrivningar, [],
    'triggerGiftFireworks skriver till widgetobjektet igen — combon ska vara ett argument, ' +
    'aldrig ett falt. Se docs/tech-debt.md §3: ' + skrivningar.join(', '));

  // Vakterna som gor det har provet overflodigt maste finnas kvar.
  // Matchas MED sitt test('...'-holje. En ren includes() av namnet overlevde ett mutationsprov
  // som dopte om provet till "...NAMNBYTT": delstrangen fanns kvar och vakten sag inget.
  const vakter = las('tests/gift-fireworks-live-path.test.js');
  for (const namn of ['combon skrivs inte pa widgetobjektet', 'livevagen gor inga writes i kallan heller']) {
    assert.ok(vakter.includes(`test('${namn}'`),
      `provet "${namn}" ar borta eller omdopt i gift-fireworks-live-path.test.js — §3 tappar sin vakt`);
  }
});

// ---- §6 · laddningsgrindar pekar pa UI-kopia ---------------------------------------------------
test('§6 star kvar: sex browser-prov grindar pa kopiatext', () => {
  const MONSTER = /toString\(\)\.includes\('[A-ZÅÄÖ]/g;
  const traffar = [];
  for (const fil of filerUnder('tests', n => n.endsWith('.js'))) {
    // Det har provet namner monstret i sin egen kalla; det ska inte rakna sig sjalvt.
    if (fil.endsWith('tech-debt-aktuell.test.js')) continue;
    const antal = (las(fil).match(MONSTER) || []).length;
    if (antal) traffar.push(`${fil}: ${antal}`);
  }
  const summa = traffar.reduce((s, r) => s + Number(r.split(': ')[1]), 0);
  assert.equal(summa, 6,
    `§6 sager sex grindar, kallan sager ${summa}. Farre = punkten ar (delvis) atgardad och ` +
    'registret ska uppdateras; fler = monstret har spridit sig.\n  ' + traffar.join('\n  '));
});

// ---- Registret sjalvt --------------------------------------------------------------------------
test('varje punkt provet vaktar finns kvar i registret', () => {
  const doc = las('docs/tech-debt.md');
  const saknas = [];
  if (!/^## 1\. Glove Snipe/m.test(doc)) saknas.push('§1');
  if (!/^## ~~3\. Gift Fireworks skriver live-data/m.test(doc)) saknas.push('§3 (som löst)');
  if (!/^## 6\. Laddningsgrindar/m.test(doc)) saknas.push('§6');
  assert.deepEqual(saknas, [],
    'provet vaktar punkter som inte langre star i docs/tech-debt.md: ' + saknas.join(', '));
});
