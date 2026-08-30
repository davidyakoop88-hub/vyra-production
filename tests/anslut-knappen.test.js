'use strict';
// KNAPPEN "ANSLUT KONTO" FÅR INTE KUNNA DÖ TYST.
//
// studio.html laddar inte studio-live.js direkt. media.js bygger en kedja: live-client.js först,
// och studio-live.js på dess onload. studio-live.js är den som binder den RIKTIGA klickhanteraren
// för #connectNow; studio.js:292 sätter en platshållare som bara visar
// "TikTok-anslutningen förbereds…" och inte gör någonting.
//
// Föll den första filen bort fanns ingen onerror, så kedjan bröts tyst och platshållaren blev det
// enda som återstod. Användaren klickar, får en text, och ingenting händer — utan någon ledtråd
// om varför. Det är exakt det läget den här vakten finns för att förhindra.
//
// onload räcker inte som hälsotecken: ett skript som KASTAR under körning utlöser onload ändå.
// Då laddas studio-live.js, hanteraren binds — och VyraLive finns inte. Knappen ser levande ut och
// kan aldrig ansluta. Därför krävs BÅDE onerror och en kontroll av VyraLive.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');

// VAKTEN LÄSER KOD, INTE KOMMENTARER. Utan den här tvättningen räcker det att ordet "onerror"
// står i en kommentar för att vakten ska bli grön — och just den här ändringen bär en lång
// kommentar som nämner onerror flera gånger.
function utanKommentarer(kalla) {
  return kalla
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(rad => rad.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

const MEDIA = utanKommentarer(fs.readFileSync(path.join(ROT, 'media.js'), 'utf8'));

// Kedjan hittas på sin egen kod, inte på ett radnummer — radnumret flyttar sig vid varje ändring
// ovanför.
const KEDJA = (() => {
  const start = MEDIA.indexOf("live-client.js?v=");
  assert.notEqual(start, -1, 'hittade inte laddkedjan för live-client.js i media.js');
  return MEDIA.slice(Math.max(0, start - 400), start + 900);
})();

test('anslut-knappen: live-client.js har en onerror', () => {
  assert.match(KEDJA, /live\.onerror\s*=/,
    'live-client.js laddas utan onerror — ett hämtningsfel bryter kedjan tyst och lämnar kvar ' +
    'platshållaren i studio.js, som ser levande ut men inte ansluter');
});

test('anslut-knappen: studio-live.js har en onerror', () => {
  assert.match(KEDJA, /ui\.onerror\s*=/,
    'studio-live.js laddas utan onerror — faller den bort binds aldrig den riktiga ' +
    'klickhanteraren för #connectNow');
});

test('anslut-knappen: VyraLive kontrolleras innan studio-live.js laddas', () => {
  assert.match(KEDJA, /VyraLive/,
    'kedjan litar på onload ensam. Ett skript som kastar under körning utlöser onload ändå, så ' +
    'utan en kontroll av VyraLive blir knappen bunden till ett API som inte finns');
});

// KONTROLLMÄTNING. Utan den kan de tre påståendena ovan bli gröna för att KEDJA är tom eller
// pekar fel — ett fönster som inte innehåller kedjan matchar ingenting och faller, men ett
// fönster som av misstag omfattar HELA filen matchar allt och blir grönt av fel skäl.
test('anslut-knappen: KONTROLLMÄTNING — fönstret är kedjan, inte hela filen', () => {
  assert.ok(KEDJA.length < MEDIA.length,
    'fönstret omfattar hela media.js — då bevisar påståendena ovan ingenting om just kedjan');
  assert.match(KEDJA, /studio-live\.js\?v=/,
    'fönstret innehåller inte studio-live.js — det är fel utsnitt av filen');
});

// Platshållaren i studio.js får finnas kvar (capture-lyssnaren i studio-live.js vinner alltid över
// den), men den ska inte vara det enda som binder knappen. Vakten mäter att den riktiga
// hanteraren fortfarande finns där den ska.
test('anslut-knappen: studio-live.js binder fortfarande #connectNow', () => {
  const live = utanKommentarer(fs.readFileSync(path.join(ROT, 'studio-live.js'), 'utf8'));
  assert.match(live, /connectNow/,
    'studio-live.js binder inte längre #connectNow — då är platshållaren i studio.js det enda ' +
    'som svarar på klick');
  assert.match(live, /VyraLive\.connect/,
    'studio-live.js anropar inte längre VyraLive.connect');
});
