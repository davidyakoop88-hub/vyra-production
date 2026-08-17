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

// ---- §1 · Glove Snipe tands av ett riktigt multiplikatorfonster ------------------------------
//
// Punkten var oppen till 2026-08-14 och lod: bryggan publicerar ingen av Glove Snipes eventtyper,
// sa widgeten kan bara nas fran battle-UI:t eller en Actions-regel. Provet vaktade da FRANVARON av
// typerna. Nu ar det tvartom: kallan hittades i LINK_MIC_BATTLE_TASK och bryggan skickar `glove`,
// sa provet vaktar att kopplingen finns kvar.
test('§1 ar lost: bryggan publicerar multiplikatorfonstret som glove', () => {
  const bryggan = las('tiktok-bridge/bridge.js');
  assert.match(bryggan, /LINK_MIC_BATTLE_TASK/,
    'bryggan prenumererar inte langre pa handelsen som bar multiplikatorn');
  assert.match(bryggan, /sendEvent\('glove'/,
    'bryggan skickar inte langre glove — Glove Snipe har tappat sin enda riktiga trigger');
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

// ---- §6 · aterfallsvakt -------------------------------------------------------------------------
//
// Punkten var oppen till 2026-08-17 och lod: sex command-center-prov vantar pa premium-vyn genom
// att lasa kopiatexten ur funktionskallan. Provet raknade da till exakt sex och foll at bada
// hallen. Nu ar rakningen noll, och den ska forbli noll.
//
// Sveper HELA tests/, inte bara tests/browser/ — monstret uppstar pa nytt varje gang nagon behover
// vanta pa en modul och tar det som ligger narmast. Ingen undantagslista: filen som mater skulden
// (command-center-grind.browser.test.js) bygger ihop ordet i stallet for att skriva ut det, sa den
// racker inte hit av sig sjalv.
test('§6 forblir lost: ingen laddningsgrind hanger pa en UI-strang', () => {
  const MONSTER = /toString\(\)\.includes\('[A-ZÅÄÖ]/g;
  const traffar = [];
  for (const fil of filerUnder('tests', n => n.endsWith('.js'))) {
    // Det har provet namner monstret i sin egen kalla; det ska inte rakna sig sjalvt.
    if (fil.endsWith('tech-debt-aktuell.test.js')) continue;
    const antal = (las(fil).match(MONSTER) || []).length;
    if (antal) traffar.push(`${fil}: ${antal}`);
  }
  const summa = traffar.reduce((s, r) => s + Number(r.split(': ')[1]), 0);
  assert.equal(summa, 0,
    `${summa} laddningsgrind(ar) hanger pa en UI-strang igen. Byt till en strukturell markor — ` +
    'se docs/tech-debt.md §6.\n  ' + traffar.join('\n  '));

  // KONTROLLMATNING (§7). Utan den ar noll traffar lika sant for en katalog som flyttat, en
  // andrad filandelse eller en trasig filerUnder(). Sveper skarrningen fortfarande nagot?
  // 176 filer uppmatt 2026-08-17. Golvet star lagre an sa med flit: det ska fanga att svepet
  // slutat hitta katalogen, inte falla varje gang nagon delar upp en provfil.
  const svepta = filerUnder('tests', n => n.endsWith('.js'));
  assert.ok(svepta.length >= 150, `svepte bara ${svepta.length} provfiler — har katalogen flyttat?`);

  // Vakterna som gor det har provet overflodigt maste finnas kvar. Matchas MED sitt test('-holje,
  // samma lardom som §3 ovan: en ren includes() av namnet overlever ett namnbyte.
  const grind = las('tests/browser/command-center-grind.browser.test.js');
  for (const namn of [
    '6b · markören uteblir helt när overview-premium.js blockeras',
    '6d · en kopieändring släcker den gamla grinden men inte markören',
  ]) {
    assert.ok(grind.includes(`test('${namn}'`),
      `provet "${namn}" ar borta eller omdopt — §6 tappar sin vakt`);
  }
});

// Markoren far inte hjalpas pa traven. Sitter den ocksa i studio.html ar 6a sann aven utan
// modulen, och avbrottsprovet 6b tappar all sin skarpa.
test('§6: markoren data-cc-ready satts pa exakt ett stalle', () => {
  const rot = fs.readdirSync(ROT).filter(f => /\.(js|html)$/.test(f));
  const traffar = rot.filter(f => /data-cc-ready|ccReady/.test(las(f)));
  assert.deepEqual(traffar, ['overview-premium.js'],
    `markoren satts pa ${traffar.length} stallen: ${traffar.join(', ')}`);
});

// ---- Registret sjalvt --------------------------------------------------------------------------
test('varje punkt provet vaktar finns kvar i registret', () => {
  const doc = las('docs/tech-debt.md');
  const saknas = [];
  // §1 skrevs om till "löst" 2026-08-14 när multiplikatorfönstret kopplades in — rubriken bär
  // därför överstrykning nu, precis som §3.
  if (!/^## ~~1\. Glove Snipe/m.test(doc)) saknas.push('§1 (som löst)');
  if (!/^## ~~3\. Gift Fireworks skriver live-data/m.test(doc)) saknas.push('§3 (som löst)');
  // §6 skrevs om till "löst" 2026-08-17 när grindarna byttes mot markören data-cc-ready.
  if (!/^## ~~6\. Laddningsgrindar/m.test(doc)) saknas.push('§6 (som löst)');
  assert.deepEqual(saknas, [],
    'provet vaktar punkter som inte langre star i docs/tech-debt.md: ' + saknas.join(', '));
});
