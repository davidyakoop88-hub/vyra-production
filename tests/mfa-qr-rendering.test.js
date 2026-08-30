'use strict';
// QR-KODEN I MFA-RUTAN — de två detaljer som gör skillnad mellan läsbar och oläsbar.
//
// Serverns sida är bevisad i `server/test/mfa.test.js` och `server/test/mfa-http.test.js`: koden
// AVKODAS där tillbaka till exakt den otpauth-URI rutten returnerade. Det den bevisningen inte
// når är ritningen i klienten.
//
// Två saker kan tas bort utan att ett enda prov blir rött, och båda gör koden OLÄSBAR medan den
// fortfarande SYNS — vilket är värre än att den saknas, för då tror användaren att felet är deras:
//
//   1. DEN VITA BAKGRUNDEN. Canvasens egna pixlar är genomskinliga tills någon fyller dem, och
//      rutan är mörk. Utan `fillRect` med vitt blir det mörkt på mörkt.
//   2. DEN TYSTA ZONEN. Standarden kräver fyra moduler marginal. Utan den hittar många läsare
//      inte hörnmarkörerna alls.
//
// Vakten läser KOD, inte kommentarer — filen bär en lång kommentar som nämner båda begreppen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');
const tvatta = k => k
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(r => r.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const JS  = tvatta(fs.readFileSync(path.join(ROT, 'auth-security.js'), 'utf8'));
const CSS = tvatta(fs.readFileSync(path.join(ROT, 'auth-security.css'), 'utf8'));

// Ritfunktionens kropp, hittad på sin egen kod och inte på ett radnummer.
const RITARE = (() => {
  const i = JS.indexOf('function ritaQrKod');
  assert.notEqual(i, -1, 'ritaQrKod finns inte längre i auth-security.js');
  return JS.slice(i, i + 1200);
})();

test('mfa-qr: rutan innehåller en canvas att rita i', () => {
  assert.match(JS, /class="mfa-qr"/, 'canvasen för QR-koden saknas i setup-rutan');
  assert.match(JS, /ritaQrKod\(\s*el\.querySelector\('\.mfa-qr'\)/,
    'ritaQrKod anropas inte med canvasen — rutan skulle visa en tom fyrkant');
});

test('mfa-qr: bakgrunden fylls explicit med vitt', () => {
  assert.match(RITARE, /fillStyle\s*=\s*'#ffffff'/,
    'den vita bakgrunden är borta — canvasen är genomskinlig och koden blir mörkt på mörkt');
  assert.match(RITARE, /fillRect\(\s*0\s*,\s*0\s*,/,
    'bakgrunden fylls aldrig, bara modulerna ritas');
});

test('mfa-qr: den tysta zonen är kvar och är minst fyra moduler', () => {
  const m = RITARE.match(/TYST\s*=\s*(\d+)/);
  assert.ok(m, 'den tysta zonen är borttagen ur ritfunktionen');
  assert.ok(Number(m[1]) >= 4,
    'tyst zon på ' + m[1] + ' moduler — standarden kräver fyra, annars hittas inte hörnmarkörerna');
});

test('mfa-qr: moduldatan valideras innan den ritas', () => {
  // En äldre server utan `qr` i svaret ska ge en rensad ruta, inte en trasig canvas.
  assert.match(RITARE, /moduler\.length\s*!==\s*qr\.storlek\s*\*\s*qr\.storlek/,
    'ritfunktionen kontrollerar inte att moduldatan är kvadratisk');
  assert.match(RITARE, /canvas\.remove\(\)/,
    'en ogiltig eller saknad QR lämnar en tom canvas kvar i rutan');
});

test('mfa-qr: CSS:en skalar upp utan att sudda kanterna', () => {
  assert.match(CSS, /\.mfa-qr\b/, 'ingen stil för .mfa-qr');
  assert.match(CSS, /image-rendering:\s*pixelated/,
    'utan pixelated interpoleras modulgränserna och koden blir svårare att läsa');
  assert.match(CSS, /\.mfa-qr[\s\S]{0,400}background:\s*#fff/,
    'CSS:en sätter ingen vit bakgrund som andra försvar');
});

// KONTROLLMÄTNING. Utan den kan påståendena ovan bli gröna för att RITARE är tom eller omfattar
// hela filen — ett fönster som råkar täcka allt matchar allt.
test('mfa-qr: KONTROLLMÄTNING — fönstret är ritfunktionen, inte hela filen', () => {
  assert.ok(RITARE.length < JS.length, 'fönstret omfattar hela filen');
  assert.match(RITARE, /getContext\('2d'\)/, 'fel utsnitt — ritfunktionen finns inte i fönstret');
});
