'use strict';
// ETT FORMAT, TRE KONSUMENTER — och provet som binder ihop dem.
//
// Fram till 2026-08-28 fanns TVÅ olika krav på APP_ENCRYPTION_KEY:
//
//   production-config.js  minst 32 TECKEN           → stoppade uppstarten
//   token-vault.js        exakt 32 BYTES base64url  → kastade först vid användning
//
// Glappet var tyst och farligt. En nyckel som klarade det ena men inte det andra lät servern starta
// och se frisk ut, medan `heart-me-goal.js` — som är fail-closed — räknade NOLL utan att säga något.
// Ett FORMATFEL såg då ut som ett FUNKTIONSFEL: widgeten stod på noll och misstanken hamnade på
// Heart Me Goal i stället för på nyckeln.
//
// Det här provet är vakten mot att glappet återuppstår. Det räcker inte att prova parsern ensam:
// tabellen körs mot ALLA TRE konsumenterna och kräver samma svar av var och en. Skulle någon av dem
// få en egen tolkning igen faller provet på just den raden.
//
// Kräver ingen databas.
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');

const Nyckel = require('../krypteringsnyckel');
const Vault = require('../token-vault');
const HeartMe = require('../heart-me-goal');
const Config = require('../production-config');

// ---- TABELLEN ---------------------------------------------------------------------------------
//
// Alla värden är syntetiska. Den giltiga nyckeln är 32 bytes av ett fast mönster — aldrig något som
// liknar en riktig hemlighet.
const GILTIG = Buffer.alloc(32, 7).toString('base64url');
const NOLLOR = Buffer.alloc(32, 0).toString('base64url');       // 43 tecken, sista är 'A'

const FALL = [
  { namn: 'kanonisk 32-bytesnyckel', varde: GILTIG, giltig: true },
  // FORMATET ar giltigt, men uppstarten nekar den anda: 43 likadana tecken ar en usel hemlighet.
  // `svag` ar darfor en EGEN kolumn — de tre formatkonsumenterna sager ja, uppstarten sager nej,
  // och det ar avsiktligt. Utan kolumnen hade provet tvingat fram fel svar hos nagon av dem.
  { namn: 'kanonisk nyckel av nollbytes', varde: NOLLOR, giltig: true, svag: true },

  // Den lömska: avkodar till 32 bytes, men sista sextetten är inte kanonisk. En längdkontroll
  // släpper igenom den, och då blir två olika strängar samma nyckel.
  { namn: 'icke-kanonisk sista sextett', varde: NOLLOR.slice(0, 42) + 'B', giltig: false },

  { namn: 'tom sträng', varde: '', giltig: false },
  { namn: 'ett tecken för kort', varde: GILTIG.slice(0, 42), giltig: false },
  { namn: 'ett tecken för långt', varde: GILTIG + 'A', giltig: false },
  { namn: 'standard-base64 med padding', varde: Buffer.alloc(32, 7).toString('base64'), giltig: false },
  { namn: 'standard-base64-alfabet (+ och /)', varde: Buffer.alloc(32, 251).toString('base64').replace(/=+$/, ''), giltig: false },
  { namn: 'rätt längd men otillåtet tecken', varde: GILTIG.slice(0, 42) + '.', giltig: false },
  { namn: '32 tecken — klarar gamla teckenkravet, fel form', varde: 'x'.repeat(32), giltig: false },
  { namn: 'hex i stället för base64url', varde: crypto.randomBytes(32).toString('hex'), giltig: false },
  { namn: 'inte en sträng', varde: 12345, giltig: false },
  { namn: 'null', varde: null, giltig: false },
  { namn: 'odefinierad', varde: undefined, giltig: false }
];

// ---- KONSUMENT 1: PARSERN ---------------------------------------------------------------------

test('parsern accepterar och nekar enligt tabellen', () => {
  for (const f of FALL) {
    assert.equal(Nyckel.arGiltig(f.varde), f.giltig, `${f.namn}: fel svar från parsern`);
  }
});

test('parsern returnerar 32 bytes för en giltig nyckel, null annars', () => {
  assert.equal(Nyckel.las(GILTIG).length, 32);
  assert.equal(Nyckel.las('nej'), null);
  assert.ok(Buffer.isBuffer(Nyckel.las(GILTIG)));
});

test('krav() kastar utan att avslöja värdet eller dess längd', () => {
  const dolt = 'x'.repeat(37);
  try {
    Nyckel.krav(dolt, 'PROV_NYCKEL');
    assert.fail('krav() skulle ha kastat');
  } catch (fel) {
    assert.match(fel.message, /PROV_NYCKEL/, 'namnet ska stå i felet');
    assert.ok(!fel.message.includes(dolt), 'värdet får aldrig stå i felet');
    assert.ok(!/\b37\b/.test(fel.message), 'inte heller längden — den säger hur nära man var');
  }
});

// ---- KONSUMENT 2: TOKEN-VAULT -----------------------------------------------------------------

function medNyckel(varde, fn) {
  const sparad = process.env.APP_ENCRYPTION_KEY;
  if (varde === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = String(varde);
  try { return fn(); }
  finally {
    if (sparad === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = sparad;
  }
}

test('token-vault accepterar exakt samma format som parsern', () => {
  for (const f of FALL) {
    const gick = medNyckel(f.varde, () => {
      try { Vault.seal('prov'); return true; } catch { return false; }
    });
    assert.equal(gick, f.giltig, `${f.namn}: token-vault svarar inte som parsern`);
  }
});

test('token-vault kan fortfarande försegla och öppna', () => {
  // KONTROLLMÄTNING: provet ovan hade gått grönt även om seal() slutat fungera helt.
  medNyckel(GILTIG, () => {
    assert.equal(Vault.open(Vault.seal('hemlig text')), 'hemlig text');
  });
});

// ---- KONSUMENT 3: HEART ME-HMAC ---------------------------------------------------------------

test('heart-me-goal accepterar exakt samma format som parsern', () => {
  for (const f of FALL) {
    const fick = medNyckel(f.varde, () => HeartMe.harledNyckel() !== null);
    assert.equal(fick, f.giltig, `${f.namn}: heart-me-goal svarar inte som parsern`);
  }
});

test('heart-me-goal ger en nyckel för en giltig hemlighet', () => {
  // KONTROLLMÄTNING igen: utan den här hade "alltid null" sett korrekt ut för varje ogiltigt fall.
  medNyckel(GILTIG, () => {
    assert.match(HeartMe.avsandarnyckel('ws', 'sess', 'anna'), /^[0-9a-f]{64}$/);
  });
});

// ---- KONSUMENT 4: UPPSTARTEN ------------------------------------------------------------------
//
// Den viktigaste. Innan den här ändringen startade servern på en felformad nyckel och såg frisk ut.

const BAS = () => ({
  APP_ENV: 'production',
  APP_ORIGIN: 'https://app.vyra.test',
  DATABASE_URL: 'postgresql://vyra:secret@db.vyra.test/vyra',
  DATABASE_SSL: 'require',
  REDIS_URL: 'rediss://redis.vyra.test:6380',
  APP_ENCRYPTION_KEY: GILTIG,
  TIKTOK_INGEST_TOKEN: 'ing_' + crypto.randomUUID(),
  METRICS_TOKEN: 'met_' + crypto.randomUUID(),
  MEDIA_SCAN_TOKEN: 'scan_' + crypto.randomUUID(),
  OBJECT_ENDPOINT: 'https://objects.vyra.test',
  CDN_ORIGIN: 'https://cdn.vyra.test',
  OBJECT_ACCESS_KEY: 'access_' + crypto.randomUUID(),
  OBJECT_SECRET_KEY: 'object_' + crypto.randomUUID(),
  MEDIA_SCAN_REQUIRED: 'true',
  STRIPE_SECRET_KEY: 'sk_live_' + crypto.randomUUID(),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + crypto.randomUUID(),
  STRIPE_PRICE_MONTHLY: 'price_123ABC',
  RESEND_API_KEY: 're_' + crypto.randomUUID(),
  EMAIL_FROM: 'VYRA <billing@vyra.test>',
  ALERT_EMAIL_TO: 'alerts@vyra.test',
  ALERT_WEBHOOK_URL: 'https://alerts.vyra.test/hook',
  DESKTOP_DOWNLOAD_URL: 'https://downloads.vyra.test/VYRA-Setup.exe',
  DESKTOP_VERSION: '1.0.0',
  DESKTOP_SHA256: 'a'.repeat(64),
  DESKTOP_SIZE_BYTES: '2048'
});

const uppstartKlarar = varde => {
  const env = BAS();
  if (varde === undefined) delete env.APP_ENCRYPTION_KEY;
  else env.APP_ENCRYPTION_KEY = varde;
  try { Config.validateProductionEnv(env); return true; } catch { return false; }
};

test('uppstarten accepterar exakt samma format som parsern, plus ett styrkekrav', () => {
  for (const f of FALL) {
    // Uppstarten = parserns format OCH secret():s svaghetskontroll. Ett formatfel och en svag nyckel
    // stoppas bada, men av olika skal — och bara formatet delas med de andra tva konsumenterna.
    assert.equal(uppstartKlarar(f.varde), f.giltig && !f.svag,
      `${f.namn}: uppstarten svarar inte som vantat`);
  }
});

test('DE TRE FORMATKONSUMENTERNA ar overens, rad for rad', () => {
  // Karnpastaendet i hela filen, samlat: parser, token-vault och Heart Me-HMAC ska ge IDENTISKT svar
  // for varje rad i tabellen. Uppstarten star utanfor just har, eftersom den lagger till ett krav.
  for (const f of FALL) {
    const parser = Nyckel.arGiltig(f.varde);
    const vault = medNyckel(f.varde, () => { try { Vault.seal('prov'); return true; } catch { return false; } });
    const hmac = medNyckel(f.varde, () => HeartMe.harledNyckel() !== null);
    assert.deepEqual({ parser, vault, hmac }, { parser: f.giltig, vault: f.giltig, hmac: f.giltig },
      `${f.namn}: konsumenterna ar inte overens`);
  }
});

test('uppstarten säger VAD som är fel, utan att visa nyckeln', () => {
  const dolt = 'x'.repeat(50);
  const env = BAS(); env.APP_ENCRYPTION_KEY = dolt;
  assert.throws(() => Config.validateProductionEnv(env), fel => {
    assert.match(fel.message, /APP_ENCRYPTION_KEY/);
    assert.match(fel.message, /base64url/, 'felet ska säga vilken form som krävs');
    assert.ok(!fel.message.includes(dolt), 'nyckeln får aldrig hamna i ett uppstartsfel');
    return true;
  });
});

test('den gamla svaghetskontrollen finns kvar — 43 likadana tecken är kanoniskt men uselt', () => {
  // 'A' × 43 ÄR en kanonisk nyckel (32 nollbytes), så formatkontrollen ensam släpper igenom den.
  // Det är precis därför BÅDA kontrollerna behövs: secret() nekar upprepade tecken.
  assert.equal(Nyckel.arGiltig(NOLLOR), true, 'formatkontrollen accepterar den');
  assert.equal(uppstartKlarar(NOLLOR), false, 'men uppstarten ska ändå neka den som svag');
});

// ---- VAKTEN MOT ETT NYTT GLAPP ----------------------------------------------------------------

test('vakt: ingen konsument tolkar nyckeln på egen hand', () => {
  const fs = require('node:fs'), path = require('node:path');
  const utanKommentarer = fil => fs.readFileSync(path.join(__dirname, '..', fil), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  for (const fil of ['token-vault.js', 'heart-me-goal.js', 'production-config.js']) {
    const kall = utanKommentarer(fil);
    assert.ok(!/Buffer\.from\(\s*[A-Za-z_.$[\]']*\s*,\s*'base64url'\s*\)/.test(kall),
      `${fil} avkodar nyckeln själv — det är så de två kraven drev isär från början`);
  }

  // KONTROLLMÄTNING: mönstret kan träffa.
  assert.ok(/Buffer\.from\(\s*[A-Za-z_.$[\]']*\s*,\s*'base64url'\s*\)/
    .test("const v=Buffer.from(raw,'base64url');"));

  // Och parsern SKA göra det — den är den enda som får.
  assert.ok(/base64url/.test(utanKommentarer('krypteringsnyckel.js')));
});
