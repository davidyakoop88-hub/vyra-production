'use strict';
// Skript och stilmallar ska revalideras, inte gissas.
//
// Uppmätt på vyralive.app 2026-08-06:
//
//   studio.html          Cache-Control: no-cache, no-store, must-revalidate
//   media.js             (ingen Cache-Control alls)
//   gift-fireworks.css   (ingen Cache-Control alls)
//
// Caddyfile:5 satte headern på *.html och ingenting annat. Utan Cache-Control faller webbläsaren
// tillbaka på HEURISTISK cachning: den behåller svaret i ungefär 10 % av tiden sedan Last-Modified.
// Last-Modified är deploytidpunkten för alla filer, så en ändring kunde vara osynlig i upp till en
// tiondel av tiden sedan förra deployen — olika länge för olika användare, vilket är det värsta
// slaget av fel att felsöka.
//
// Skyddet har varit ?v=-markörer i media.js. De sitter på ungefär tio av femtio filer.
// gift-fireworks.css var en av de fyrtio utan och laddades osynligt gammal tills den fick en markör
// för hand i #94. Ett plåster som måste kommas ihåg vid varje framtida ändring, och bevisligen inte
// blir ihågkommet.
//
// `no-cache` betyder inte "cacha inte" utan "cacha, men fråga alltid först". file_server skickar
// redan ETag, så frågan blir ett tomt 304-svar. Då blir ?v= överflödigt och felklassen omöjlig.
//
// Repot hade tidigare TVÅ Caddy-konfigurationer. Dockerfile kopierar `Caddyfile` — det är den som
// kör. `Caddyfile.production` lästes bara av web/Dockerfile, ett bygge Railway aldrig körde, och
// saknade HTML-regeln helt; ett byte dit hade börjat cacha själva appskalet. Båda den och
// web/Dockerfile är borttagna. Sista testet nedan finns för att en andra konfiguration inte ska
// kunna smyga tillbaka utan att omfattas av reglerna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const läs = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CADDY = läs('Caddyfile');

// En Cache-Control-rad i Caddyfilen: `header @namn Cache-Control "..."` plus matcharens mönster.
function cacheRegler(src) {
  const matchare = Object.fromEntries(
    [...src.matchAll(/@(\w+)\s+path\s+([^\n]+)/g)].map(m => [m[1], m[2].trim()]));
  return [...src.matchAll(/header\s+@(\w+)\s+Cache-Control\s+"([^"]+)"/g)]
    .map(m => ({ matchare: m[1], mönster: matchare[m[1]] || '', värde: m[2] }));
}
const regelFör = (src, ändelse) =>
  cacheRegler(src).find(r => r.mönster.split(/\s+/).some(p => p === `*${ändelse}`));

test('Dockerfile kopierar den Caddyfile som testas', () => {
  // Testar vi fel fil bevisar resten ingenting.
  assert.match(läs('Dockerfile'), /COPY\s+Caddyfile\s+\/etc\/caddy\/Caddyfile/,
    'bygget kopierar inte längre ./Caddyfile — då pekar det här testet på fel konfiguration');
});

test('js och css revalideras', () => {
  for (const ändelse of ['.js', '.css']) {
    const regel = regelFör(CADDY, ändelse);
    assert.ok(regel, `ingen Cache-Control-regel täcker *${ändelse}` +
      ' — webbläsaren cachar heuristiskt och en ändring kan bli osynlig i timmar');
    assert.match(regel.värde, /no-cache/,
      `regeln för *${ändelse} är "${regel.värde}", som inte tvingar fram en revalidering`);
  }
});

test('html revalideras', () => {
  const regel = regelFör(CADDY, '.html');
  assert.ok(regel, 'appskalet cachas heuristiskt — värre än ett gammalt skript');
  assert.match(regel.värde, /no-cache/, `html-regeln är "${regel.värde}"`);
});

test('det finns bara en Caddy-konfiguration, och CI validerar den', () => {
  // Två konfigurationer som skiljer sig är en fälla som väntar på att någon byter fil. Dyker en
  // andra upp igen ska den här raden tvinga fram ett beslut i stället för att den glider med.
  const caddyFiler = fs.readdirSync(ROOT).filter(f => /^Caddyfile/i.test(f));
  assert.deepEqual(caddyFiler, ['Caddyfile'],
    `fler Caddy-konfigurationer än den som körs: ${caddyFiler.join(', ')}`);
  assert.match(läs('.github/workflows/ci.yml'), /caddy validate[^\n]*--config Caddyfile/,
    'CI validerar inte längre Caddyfilen — ett syntaxfel skulle märkas först vid deploy');
});
