'use strict';
// SKATTKISTAN AVVISADES I MOLNET — RÖTT FÖRST (2026-10-11).
//
// UPPMÄTT I PRODUKTION, sändningen jrofficialswe: bryggan skickade tio ENVELOPE-events (kistor)
// och molnet svarade `400 Fältet "username" saknas eller är inte en sträng` på varenda en.
// Bryggans flödesräknare: `envelope=10 event-fel=8`. Kistan nådde aldrig overlayn.
//
// TikToks envelopeInfo bar inget sendUserName för de kistorna — normalizer.js envelopeFields ger
// då username '' (text() av tomt), och validateTikTokIngestPayload kräver en icke-tom sträng för
// allt som inte är en rumshändelse. Men en kista identifieras av kistaId, inte av avsändaren:
// avsändarnamnet är dekoration i widgeten, och utan det ska kistan ändå visas och räknas ned.
//
// Kontraktet: envelope får komma utan username. Rumshändelserna (viewer/battle/glove) är orörda,
// och personhändelser (gift, fanlevelup …) kräver username precis som förut.
const test = require('node:test'), assert = require('node:assert/strict');
const { validateTikTokIngestPayload, TIKTOK_INGEST_TYPES } = require('../index.js');

test('en kista utan avsändarnamn släpps igenom', () => {
  assert.equal(TIKTOK_INGEST_TYPES.has('envelope'), true);
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'envelope', username: '', kistaId: '7546541354546545455', diamonds: 100 }));
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'envelope', kistaId: '7546541354546545455' }));
});

test('en kista med avsändare släpps igenom som förut', () => {
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'envelope', username: 'Lina', kistaId: '1' }));
});

test('personhändelser kräver fortfarande username', () => {
  assert.throws(() => validateTikTokIngestPayload({ type: 'gift', username: '' }), /username/);
  assert.throws(() => validateTikTokIngestPayload({ type: 'fanlevelup' }), /username/);
  assert.throws(() => validateTikTokIngestPayload({ type: 'guardian' }), /username/);
});

test('rumshändelser är orörda', () => {
  for (const t of ['viewer', 'battle', 'glove']) assert.doesNotThrow(() => validateTikTokIngestPayload({ type: t }));
});
