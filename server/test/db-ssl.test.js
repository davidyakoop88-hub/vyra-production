'use strict';
// SSL-LÄGET MOT DATABASEN. Valet såg ut som en detalj men styr om databasens lösenord går
// krypterat över internet eller inte.
//
// Innan `no-verify` fanns hade modulen bara två lägen: strikt verifiering, eller ingen kryptering
// alls. Railways PUBLIKA proxy svarar med ett självsignerat certifikat, så `require` avvisar den —
// och enda utvägen för ett administrationsskript var att stänga av SSL helt. Det hade skickat
// lösenordet i klartext för att slippa ett certifikatfel, vilket är att byta ett litet problem mot
// ett mycket större.
//
// Det farligaste utfallet vore att ett OKÄNT värde tolkades som "nästan require" och tyst gav en
// oskyddad anslutning som såg säker ut. Därför provas stavfel uttryckligen.
const test = require('node:test'), assert = require('node:assert/strict');
const { sslLage } = require('../db');

test('railway.internal kor utan TLS — trafiken lamnar aldrig deras nat', () => {
  for (const lage of ['require', 'no-verify', undefined, 'trams']) {
    assert.equal(sslLage(true, lage), false, `internt lage "${lage}" ska ge false`);
  }
});

test('require kraver ett verifierbart certifikat', () => {
  assert.deepEqual(sslLage(false, 'require'), { rejectUnauthorized: true });
});

test('no-verify behaller krypteringen men hoppar over kedjekontrollen', () => {
  const lage = sslLage(false, 'no-verify');
  assert.deepEqual(lage, { rejectUnauthorized: false });
  // Det viktiga: det ar ETT SSL-OBJEKT, inte `false`. Blev det false vore anslutningen okrypterad
  // och losenordet skulle ga i klartext — samma fel som laget finns till for att undvika.
  assert.notEqual(lage, false, 'no-verify far ALDRIG betyda okrypterat');
  assert.equal(typeof lage, 'object');
});

test('ett okant varde ger INGEN kryptering — inte "nastan require"', () => {
  // Ett stavfel far inte tyst ge en halvsaker anslutning. Antingen ar lagets namn ratt, eller sa
  // beter sig modulen som den alltid gjort utan flaggan.
  for (const stavfel of ['no_verify', 'noverify', 'Require', 'true', '1', '', undefined]) {
    assert.equal(sslLage(false, stavfel), false, `"${stavfel}" ska inte ge ett SSL-objekt`);
  }
});
