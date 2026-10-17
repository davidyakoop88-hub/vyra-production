'use strict';
// REFERENSERNA FÅR ALDRIG BLANDA TVÅ RASTRERARE.
//
// 2026-10-17 föll test-visuell på 21 nycklar ingen hade rört (fanlevel, followeralert, gifterlevel,
// lastx, socialgoal), 2–189 pixlar i textkanter. Samma avbild, samma typsnittspaket och samma region
// som de gröna körningarna — men rastreringsprovet var rött: maskinen gav 0a5592fd, referenserna
// togs på 3e0f58bc. GitHub servar då och då en sådan maskin (1 av 57 test-visuell-körningar).
// Ett experiment på 8 löpare (AMD EPYC 7763 utan AVX-512, EPYC 9V74/9V45 med) gav samma avtryck
// överallt och --disable-skia-runtime-opts ändrade ingenting, så det är inte vektorvägen i Skia.
//
// Det farliga var referensflödet. Körning 39034481938 hamnade på en sådan maskin, skrev två bilder
// med filter och skulle ha skrivit manifestets `rastrering` som 0a5592fd — medan ~170 bilder var
// ritade på 3e0f58bc. Hade den committats hade varje vanlig maskin gått röd. Utan filter hade ALLA
// bilder ritats av fel maskin. Därför bestämmer skriptet, innan något skrivs, om maskinen får skriva.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const V = require('./helpers/visuell.js');

test('rastreringskrock: samma maskin får alltid skriva', () => {
  assert.equal(V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '3e0f58bc', filtrerad: true }), null);
  assert.equal(V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '3e0f58bc', filtrerad: false }), null);
});

test('rastreringskrock: ett manifest utan avtryck stoppar ingenting', () => {
  assert.equal(V.rastreringsKrock({ lagrat: null, nu: '0a5592fd', filtrerad: true }), null);
});

test('rastreringskrock: fel maskin med filter stoppas — alltid, även med uttryckligt ja', () => {
  for (const nyRastrerare of [false, true]) {
    const skal = V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '0a5592fd', filtrerad: true, nyRastrerare });
    assert.ok(skal, 'en filtrerad körning på fel maskin blandar två rastrerare i samma uppsättning');
    assert.match(skal, /0a5592fd/); assert.match(skal, /3e0f58bc/);
    assert.match(skal, /kör om/i, 'beskedet ska säga vad man gör');
  }
});

test('rastreringskrock: fel maskin utan filter stoppas om ingen sagt att flottan bytts', () => {
  assert.ok(V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '0a5592fd', filtrerad: false }));
  assert.match(V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '0a5592fd', filtrerad: false }),
    /VYRA_VISUELL_NY_RASTRERARE/, 'beskedet ska nämna hur man medvetet byter rastrerare');
  assert.equal(V.rastreringsKrock({ lagrat: '3e0f58bc', nu: '0a5592fd', filtrerad: false, nyRastrerare: true }), null);
});

test('rastreringskrock: skriptet frågar INNAN något skrivs', () => {
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'visuell-referens.js'), 'utf8');
  const fraga = kalla.indexOf('rastreringsKrock(');
  const skriv = kalla.indexOf('fs.writeFileSync(V.refvag(');
  assert.ok(fraga > 0, 'scripts/visuell-referens.js frågar aldrig om maskinen får skriva');
  assert.ok(skriv > 0, 'hittade inte skrivningen av referensbilderna');
  assert.ok(fraga < skriv, 'frågan kommer efter att bilderna redan skrivits');
});

test('rastreringskrock: referensflödet låter människan säga att flottan bytts', () => {
  const flode = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'visuell-referenser.yml'), 'utf8');
  assert.match(flode, /ny_rastrerare:/, 'workflow_dispatch saknar valet');
  assert.match(flode, /VYRA_VISUELL_NY_RASTRERARE:\s*\$\{\{\s*github\.event\.inputs\.ny_rastrerare/,
    'valet når aldrig skriptet');
});

test('rastreringskrock: båda visuella jobben loggar maskinen', () => {
  // Nästa gång en avvikande maskin dyker upp ska loggen säga VILKEN — den här gången gick det inte.
  for (const fil of ['ci.yml', 'visuell-referenser.yml']) {
    const flode = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', fil), 'utf8');
    assert.match(flode, /lscpu/, fil + ' loggar inte processorn');
    assert.match(flode, /libfreetype6/, fil + ' loggar inte FreeType-versionen');
  }
});
