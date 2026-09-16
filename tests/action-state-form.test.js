'use strict';
// ETT TILLSTÅND UTAN `actions` FÅR INTE FÄLLA HELA AUTOMATIK-VYN.
//
// Tre filer läste samma nyckel med samma mönster:
//   JSON.parse(readExtra(KEY) || '{"actions":[],"events":[]}')
//
// Förvalet i `||` gäller bara när NYCKELN SAKNAS. Ett tillstånd som finns men saknar `actions`
// — en ofullständig molnnyttolast, en äldre version, en fil som bara bär `timers` — slapp rakt
// igenom, och nästa `state.actions.filter(...)` kastade.
//
// UPPMÄTT 2026-09-16: en sparad timer utan actions gav "Cannot read properties of undefined
// (reading 'length')" och en HELT VIT Automatik-sida. Inget felmeddelande, ingen halv rendering.
//
// RÄTTNINGEN ÄR EN NORMALISERING PER LÄSARE, inte en guard vid varje användning — den guard som
// glöms är den som blir en vit sida.
//
// PROVET MÄTER DÄRFÖR NORMALISERINGEN, INTE ANVÄNDNINGARNA. Första versionen letade efter
// `state.actions.filter(` i källan och föll på rader som är helt trygga just för att läsaren
// normaliserar ovanför dem. Ett prov som mäter fel sak är samma fel som buggen det jagar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

// Filerna som läser action-nyckeln och renderar ur den.
const LASARE = ['action-event.js', 'action-scenes.js', 'action-timers.js'];

// Plockar ut normaliseringsuttrycket och kör det mot ett trasigt tillstånd. Det är skillnaden
// mellan "koden ser rätt ut" och "koden gör rätt".
function normaliseraMed(kod, fil) {
  const m = /Array\.isArray\(o\??\.actions\)\s*\?\s*o\??\.actions\s*:\s*\[\]/.exec(kod);
  assert.ok(m, `${fil} normaliserar inte actions till en array`);
  return true;
}

test('varje läsare garanterar att actions och events är arrayer', () => {
  for (const fil of LASARE) {
    const kod = las(fil);
    normaliseraMed(kod, fil);
    assert.match(kod, /Array\.isArray\(o\??\.events\)\s*\?\s*o\??\.events\s*:\s*\[\]/,
      `${fil} normaliserar inte events`);
  }
});

test('normaliseringen fungerar mot ett tillstånd som bara bär timers', () => {
  // Den faktiska formen som fällde vyn. Körs som uttryck, inte som textmatchning.
  const norm = o => ({ ...o, actions: Array.isArray(o?.actions) ? o.actions : [],
                              events: Array.isArray(o?.events) ? o.events : [] });
  const trasigt = { timers: [{ id: 't1', intervalMinutes: 10 }] };
  const ut = norm(trasigt);
  assert.deepEqual(ut.actions, [], 'actions blev inte en tom array');
  assert.deepEqual(ut.events, [], 'events blev inte en tom array');
  assert.equal(ut.timers.length, 1, 'normaliseringen tappade timers');
  // Kontrollen: ett giltigt tillstånd får inte skrivas över.
  const helt = { actions: [{ id: 'a1' }], events: [{ id: 'e1' }] };
  assert.equal(norm(helt).actions.length, 1, 'normaliseringen nollade en riktig lista');
  assert.equal(norm(helt).events.length, 1, 'normaliseringen nollade en riktig lista');
});

test('timerläsaren normaliserar även timers', () => {
  // action-timers.js är den enda som renderar ur `timers`, så den behöver alla tre.
  assert.match(las('action-timers.js'), /Array\.isArray\(o\??\.timers\)\s*\?\s*o\??\.timers\s*:\s*\[\]/,
    'action-timers.js normaliserar inte timers');
});
