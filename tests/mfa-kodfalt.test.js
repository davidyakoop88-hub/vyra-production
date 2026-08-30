'use strict';
// KODFÄLTET I MFA-SETUP — mellanslaget som gav "Fel kod" på en helt rätt kod.
//
// Fältet hade `maxlength="6"`. Google Authenticator visar koden som "318 516", och klistrar man in
// den kapar WEBBLÄSAREN till sex TECKEN — "318 51" — innan någon handlare ser värdet. Servern
// strippar visserligen blanksteg (`verify()` gör `replace(/\s/g,'')`), men då återstår fem siffror
// och `/^\d{6}$/` faller.
//
// Symptomet var alltså "Fel kod" på en korrekt kod, vilket ser exakt ut som en trasig hemlighet.
// Det är samma feltext som den riktiga MFA-buggen gav, och därför särskilt dyrt att felsöka.
//
// ORDNINGEN ÄR HELA POÄNGEN: kapningen sker före `input`-händelsen och går inte att ångra i JS.
// Därför måste `maxlength` bort — inte höjas — och städningen ske i JS i stället.
//
// Vakten läser inte bara källkoden, den KÖR den strippning som står i filen. Byter någon
// `/\D/` mot `/\s/` blir bindestreck kvar, och det fångas här och inte av en användare.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROT, 'auth-security.js'), 'utf8');
const utanKommentarer = KALLA
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(r => r.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// Fältets egen tagg, hittad på sin etikett.
const FALT = (() => {
  const m = utanKommentarer.match(/Sexsiffrig kod<input[^>]*>/);
  assert.ok(m, 'kodfältet i setup-rutan hittades inte längre');
  return m[0];
})();

test('mfa-kodfält: fältet har INGEN maxlength', () => {
  // Höjd maxlength duger inte som fix och ska inte smyga tillbaka: varje gräns kapar något, och
  // kapningen sker före den händelse som skulle kunna städa.
  assert.doesNotMatch(FALT, /maxlength/,
    'maxlength är tillbaka på kodfältet — en inklistrad "318 516" kapas till "318 51" innan ' +
    'någon handlare ser den, och användaren får "Fel kod" på en helt rätt kod');
});

test('mfa-kodfält: städningen körs vid inmatning OCH vid submit', () => {
  assert.match(utanKommentarer, /kodfalt\.addEventListener\('input'/,
    'ingen input-handlare städar fältet');
  assert.match(utanKommentarer, /code:e\.currentTarget\.querySelector\('input'\)\.value\.replace\(/,
    'submit skickar det råa värdet — städningen faller bort om input-händelsen aldrig fyrar ' +
    '(autofyll, programmatisk ifyllnad)');
});

// DEN HÄR KÖR KODEN, den läser den inte. Regexen plockas ur filen och används skarpt.
test('mfa-kodfält: strippningen i filen klarar varje form koden visas i', () => {
  const m = utanKommentarer.match(/kodfalt\.value\.replace\(\/([^/]+)\/g,''\)\.slice\(0,\s*(\d+)\)/);
  assert.ok(m, 'hittade inte strippningsuttrycket i input-handlaren');
  const re = new RegExp(m[1], 'g'), max = Number(m[2]);
  const stada = v => v.replace(re, '').slice(0, max);

  assert.equal(max, 6, 'koden kapas till ' + max + ' tecken, inte 6');
  for (const [rå, vad] of [
    ['318 516',      'mellanslag — så visar Google Authenticator koden'],
    ['318-516',      'bindestreck'],
    ['318 516', 'icke-brytande blanksteg (U+00A0)'],
    ['318​516', 'nollbreddsblank (U+200B)'],
    [' 318516 ',     'omgivande blanksteg'],
    ['318516',       'redan ren — får inte ändras'],
    ['3185161234',   'för lång'],
  ]) assert.equal(stada(rå), '318516', 'misslyckades på: ' + vad);
});

test('mfa-kodfält: de ANDRA kodfälten städas INTE till siffror', () => {
  // Stäng-av-rutan och kontoraderingen tar även ÅTERSTÄLLNINGSKODER — bokstäver och bindestreck.
  // Sprider någon `/\D/`-städningen dit blir varje återställningskod obrukbar, och det märks först
  // när någon redan tappat telefonen. De fälten har inget maxlength och behöver ingen fix.
  const andra = utanKommentarer.match(/(Säkerhetskod|återställningskod)<input[^>]*>/g) || [];
  assert.ok(andra.length >= 2, 'hittade inte de andra kodfälten (' + andra.length + ')');
  for (const f of andra) {
    assert.doesNotMatch(f, /maxlength/, 'ett fält som tar återställningskoder har fått maxlength: ' + f);
    assert.doesNotMatch(f, /class="mfa-kod"/,
      'siffersstädningen har spridits till ett fält som tar återställningskoder: ' + f);
  }
});

test('mfa-kodfält: KONTROLLMÄTNING — vakten läser rätt fält', () => {
  assert.match(FALT, /one-time-code/, 'fel utsnitt — det här är inte kodfältet');
  assert.ok(FALT.length < 300, 'utsnittet är för brett för att bevisa något om just fältet');
});
