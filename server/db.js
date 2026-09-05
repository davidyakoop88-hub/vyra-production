'use strict';

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';
let railwayInternal = false;

try {
  const url = new URL(databaseUrl);
  railwayInternal = /\.railway\.internal$/i.test(url.hostname);
} catch {}

// TRE LÄGEN, INTE TVÅ. Tidigare fanns bara "strikt verifiering" och "ingen kryptering", och det
// tvingade fram fel val: Railways PUBLIKA proxy (sakura.proxy.rlwy.net) svarar med ett
// SJÄLVSIGNERAT certifikat, så `require` avvisar den. Enda utvägen var att stänga av SSL helt — och
// då går databasens lösenord i KLARTEXT över internet. Det är mycket värre än det det löser.
//
// `no-verify` behåller krypteringen men hoppar över kedjekontrollen. Det är rätt läge för
// administrationsskript som körs för hand mot den publika proxyn (scripts/certifieringskonto.js),
// och FEL läge för servern själv — därför är det ett uttryckligt val i miljön, aldrig en tyst
// reserv. Ett OKÄNT värde ger `false`, precis som förut: det får aldrig tolkas som "nästan require".
//
// Bruten ut ur Pool-anropet för att den går att prova. Låg den kvar inline kunde den bara provas
// genom att ladda om modulen med olika miljö, alltså i praktiken inte alls.
function sslLage(internt, lage) {
  if (internt) return false;
  if (lage === 'require') return { rejectUnauthorized: true };
  if (lage === 'no-verify') return { rejectUnauthorized: false };
  return false;
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_SIZE || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslLage(railwayInternal, process.env.DATABASE_SSL)
});

// Exported as a factory so tests can run the REAL transaction logic against a fake pool. Copying
// this into a test would only prove the copy works, and the thing under test here — that the
// advisory lock is still held when the INSERT lands — lives entirely in this shape.
function makeTx(poolLike) {
  return async function tx(fn) {
  const client = await poolLike.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  };
}

const tx = makeTx(pool);

module.exports = { pool, tx, makeTx, sslLage };
