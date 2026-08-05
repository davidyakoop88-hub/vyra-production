'use strict';
// Skript och stilmallar ska revalideras, inte gissas.
//
// Uppmätt på vyralive.app 2026-08-06:
//
//   studio.html          Cache-Control: no-cache, no-store, must-revalidate
//   media.js             (ingen Cache-Control alls)
//   gift-fireworks.css   (ingen Cache-Control alls)
//
// Caddyfile:5 sätter headern på *.html och ingenting annat. Utan Cache-Control faller webbläsaren
// tillbaka på HEURISTISK cachning: den behåller svaret i ungefär 10 % av tiden sedan Last-Modified.
// Last-Modified är deploytidpunkten för alla filer, så en ändring kan vara osynlig i upp till en
// tiondel av tiden sedan förra deployen — olika länge för olika användare, vilket är det värsta
// slaget av fel att felsöka.
//
// Skyddet har hittills varit ?v=-markörer i media.js. De sitter på ungefär tio av femtio filer.
// gift-fireworks.css var en av de fyrtio utan, och laddades osynligt gammal tills PR #94 gav den
// en markör för hand. Det är ett plåster som måste kommas ihåg vid varje framtida ändring, och
// bevisligen inte blir ihågkommet.
//
// `no-cache` betyder inte "cacha inte" utan "cacha, men fråga alltid först". Caddy skickar redan
// ETag, så frågan blir ett tomt 304-svar. Då blir ?v= överflödigt och felklassen omöjlig.
//
// De två konfigurationerna måste dessutom säga samma sak. Dockerfile:55 kopierar `Caddyfile` —
// det är den som körs. `Caddyfile.production` används av web/Dockerfile, som inte är den bygg
// Railway kör, och den saknar HTML-regeln helt. Skulle någon någon gång byta till den skulle
// APPSKALET börja cachas heuristiskt, vilket är betydligt värre än dagens problem.
//
// RÖTT NU: ingen av filerna har någon regel för js och css, och bara den ena har en för html.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const läs = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Den Railway faktiskt bygger står först — Dockerfile:55.
const KONFIGURATIONER = [
  ['Caddyfile', läs('Caddyfile')],
  ['Caddyfile.production', läs('Caddyfile.production')]
];

// En Cache-Control-rad i Caddyfilen: `header @namn Cache-Control "..."` plus matcharens mönster.
function cacheRegler(src) {
  const matchare = Object.fromEntries(
    [...src.matchAll(/@(\w+)\s+path\s+([^\n]+)/g)].map(m => [m[1], m[2].trim()]));
  return [...src.matchAll(/header\s+@(\w+)\s+Cache-Control\s+"([^"]+)"/g)]
    .map(m => ({ matchare: m[1], mönster: matchare[m[1]] || '', värde: m[2] }));
}
const regelFör = (src, ändelse) =>
  cacheRegler(src).find(r => r.mönster.split(/\s+/).some(p => p === `*${ändelse}`));

test('Dockerfile kopierar den Caddyfile som testas först', () => {
  // Testar vi fel fil bevisar resten ingenting.
  assert.match(läs('Dockerfile'), /COPY\s+Caddyfile\s+\/etc\/caddy\/Caddyfile/,
    'bygget kopierar inte längre ./Caddyfile — då pekar det här testet på fel konfiguration');
});

for (const [namn, src] of KONFIGURATIONER) {
  test(`${namn}: js och css revalideras`, () => {
    for (const ändelse of ['.js', '.css']) {
      const regel = regelFör(src, ändelse);
      assert.ok(regel, `${namn} har ingen Cache-Control-regel som täcker *${ändelse}` +
        ' — webbläsaren cachar heuristiskt och en ändring kan bli osynlig i timmar');
      assert.match(regel.värde, /no-cache/,
        `${namn}s regel för *${ändelse} är "${regel.värde}", som inte tvingar fram en revalidering`);
    }
  });

  test(`${namn}: html revalideras`, () => {
    const regel = regelFör(src, '.html');
    assert.ok(regel, `${namn} låter appskalet cachas heuristiskt — värre än ett gammalt skript`);
    assert.match(regel.värde, /no-cache/, `${namn}s html-regel är "${regel.värde}"`);
  });
}

test('de två konfigurationerna säger samma sak om cachning', () => {
  // Två konfigurationer som skiljer sig är en fälla som väntar på att någon byter fil.
  const [[, körs], [, reserv]] = KONFIGURATIONER;
  const nyckel = src => cacheRegler(src)
    .map(r => `${r.mönster} => ${r.värde}`).sort().join(' | ');
  assert.equal(nyckel(reserv), nyckel(körs),
    'Caddyfile.production cachar annorlunda än den som körs — byter någon fil ändras beteendet tyst');
});
