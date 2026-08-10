'use strict';
// Formelprovet: varje tomt tillstand i fixturen foljer [vad/varfor] + [handling] —
// minst tva delar atskilda av punkt, utropstecken eller tankstreck, bada med innehall.
// Det har ar vad som hindrar en trettonde rost fran att smyga in i fixturen; DOM-provet
// i tests/browser/tomma-tillstand.browser.test.js hindrar texter UTANFOR fixturen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { TOMMA, PER_VY } = require('./fixtures/tomma-tillstand.js');

const FORMEL = /^[^.!—]{8,}[.!—]\s+\S.{7,}$/;

test('varje tomt tillstand foljer formeln mening + handling', () => {
  const fel = [];
  for (const [nyckel, def] of Object.entries(TOMMA)) {
    const text = def.text || def.exempel;
    if (!text) { fel.push(`${nyckel}: saknar bade text och exempel`); continue }
    if (def.monster && !def.monster.test(def.exempel))
      fel.push(`${nyckel}: exemplet matchar inte sitt eget monster`);
    // Alla roster, inte bara den DOM-provet rakar mota. oversikt-historik har fyra.
    for (const t of [text, ...(def.varianter || [])]) {
      if (!FORMEL.test(t))
        fel.push(`${nyckel}: "${t}" har inte tva delar [vad/varfor] + [handling]`);
    }
  }
  assert.deepEqual(fel, [], 'fixturen bryter formeln:\n  ' + fel.join('\n  '));
});

// ---- Kallvakten --------------------------------------------------------------------------------
// DOM-provet ser bara den rost som RAKAR renderas i testmiljon, och den ar alltid utloggad. Sa
// upptacktes det att oversikt-historik bar fyra roster daer fixturen kande en: tre av dem hade
// legat i koden sedan Etapp 4 utan att en enda matning natt dem.
//
// Vakten laser darfor kallan i stallet for att lita pa att nagon minns att uppdatera fixturen —
// samma princip som docs/katalogkarta.md, som genereras ur den korande katalogen.
test('varje notera()-text i kallan ar deklarerad i fixturen', () => {
  const perKalla = {};
  for (const [nyckel, def] of Object.entries(TOMMA)) {
    if (!def.kalla) continue;
    perKalla[def.kalla] = perKalla[def.kalla] || { nycklar: [], texter: new Set() };
    perKalla[def.kalla].nycklar.push(nyckel);
    for (const t of [def.text, def.laddar, ...(def.varianter || [])]) if (t) perKalla[def.kalla].texter.add(t);
  }

  const fel = [];
  for (const [fil, { nycklar, texter }] of Object.entries(perKalla)) {
    const p = path.join(__dirname, '..', fil);
    if (!fs.existsSync(p)) { fel.push(`${fil}: filen finns inte — fixturens 'kalla' pekar fel`); continue }
    const kalla = fs.readFileSync(p, 'utf8');

    // Hela argumentet till varje notera(), inte bara det enklaste fallet: texten star ofta i en
    // ternar som spanner flera rader. Forsta forsoket hade en andra regex for "rad som borjar
    // med ? eller :" och drog da in strangar som inte var argument alls — "Overlay tom" bland
    // annat. Balanserade parenteser ar den enda avgransning som faktiskt stammer.
    const funna = [];
    for (const traff of kalla.matchAll(/\bnotera\(/g)) {
      let djup = 0, i = traff.index + traff[0].length - 1, slut = -1;
      for (; i < kalla.length; i++) {
        const c = kalla[i];
        if (c === '(') djup++;
        else if (c === ')') { djup--; if (djup === 0) { slut = i; break } }
      }
      if (slut === -1) continue;
      let arg = kalla.slice(traff.index + traff[0].length, slut);

      // I notera(villkor ? A : B) ar villkoret INTE en rost — notera(period === 'all' ? ...)
      // innehaller 'all', som aldrig visas for nagon. Skar bort allt fore det forsta ? pa
      // toppniva.
      //
      // Forsta forsoket filtrerade i stallet bort literaler utan mellanslag, med motiveringen
      // att en rost alltid har tva delar. Det gav en BLINDFLACK: mutationsprovet aterstallde
      // notera('Hämtar…') och vakten sag den inte, eftersom den ar ett enda ord. En avgransning
      // som bygger pa hur texten SER UT missar det den inte forvantar sig; en som bygger pa
      // strukturen gor det inte.
      let d = 0;
      for (let j = 0; j < arg.length; j++) {
        const c = arg[j];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') d--;
        else if (c === '?' && d === 0 && arg[j + 1] !== '.') { arg = arg.slice(j + 1); break }
      }
      for (const s of arg.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) funna.push(s[2]);
    }

    for (const t of funna) {
      // Mallstrangar med ${} ar sammansatta texter (t.ex. "Allt sedan X · N dagar"), inte
      // tomma tillstand — de har ingen fast lydelse att vakta.
      if (t.includes('${')) continue;
      if (!texter.has(t)) {
        fel.push(`${fil}: "${t.slice(0, 70)}" star i koden men inte i fixturen ` +
          `(nycklar dar: ${nycklar.join(', ')})`);
      }
    }
    // Kontrollmatning: hittade vi over huvud taget nagot? En regex som slutar traffa skulle
    // annars ge tyst gront — samma falla som proven i #163 och #162.
    if (!funna.length) fel.push(`${fil}: kallvakten hittade INGA texter — regexen traffar inte langre`);
  }
  assert.deepEqual(fel, [], 'otaggade roster i kallan:\n  ' + fel.join('\n  '));
});

test('varje nyckel i PER_VY finns i TOMMA, och tvartom', () => {
  const anvanda = new Set(Object.values(PER_VY).flat());
  const definierade = new Set(Object.keys(TOMMA));
  const saknas = [...anvanda].filter(n => !definierade.has(n));
  const oanvanda = [...definierade].filter(n => !anvanda.has(n));
  assert.deepEqual(saknas, [], 'PER_VY pekar pa odefinierade nycklar');
  assert.deepEqual(oanvanda, [], 'TOMMA har nycklar ingen vy anvander');
});
