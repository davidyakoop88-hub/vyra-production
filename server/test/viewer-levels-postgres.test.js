'use strict';
// Nivåminnets SQL mot en riktig Postgres.
//
// viewer-levels.test.js kör mot en injicerad query och prövar därför aldrig själva uttalandet. Det
// var precis där felet satt: ON CONFLICT räknade GREATEST(COALESCE(NULL,0), COALESCE(NULL,0)) = 0,
// och nollan bryter mot CHECK (… BETWEEN 1 AND 50). Uppmätt under en riktig LIVE 2026-10-15 som
// `viewer_level_apply_failed` flera gånger i sekunden — varje gång avvisades hela raden.
//
// Tabellen är en TEMP-kopia av den migrerade (LIKE … INCLUDING CONSTRAINTS INCLUDING INDEXES): samma
// CHECK och samma primärnyckel, men utan arbetsytans främmande nyckel, så provet slipper skapa en
// arbetsyta. pg_temp ligger först i search_path, så modulens okvalificerade `viewer_levels` träffar
// kopian.
const test = require('node:test'), assert = require('node:assert/strict');
const { createViewerLevels } = require('../viewer-levels');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Uttalandet är oprövat tills TEST_DATABASE_URL pekar på en '
    + 'migrerad engångsdatabas.';
const db = (name, fn) => test(`db: ${name}`, { timeout: 60000, skip: BLOCKED }, fn);

const WS = '00000000-0000-4000-8000-000000000001';

async function rigg() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  await client.query(`CREATE TEMP TABLE viewer_levels
    (LIKE public.viewer_levels INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
  const fel = [];
  const levels = createViewerLevels({
    query: (sql, params) => client.query(sql, params),
    log: rad => fel.push(rad)
  });
  const rad = async viewer => (await client.query(
    'SELECT fan_level, gifter_level FROM viewer_levels WHERE workspace_id = $1 AND viewer_id = $2',
    [WS, viewer])).rows[0];
  return { client, levels, fel, rad };
}

db('bara fan level på en tittare som lärts in med bara fan level', async () => {
  const { client, levels, fel, rad } = await rigg();
  try {
    await levels.applyEvent(WS, { userId: 'a', fanClubLevel: 5 });
    const ut = await levels.applyEvent(WS, { userId: 'a', fanClubLevel: 6 });
    assert.deepEqual(fel, [], 'uttalandet avvisades av databasen');
    assert.deepEqual(ut.fanLevelUp, { from: 5, to: 6 }, 'höjningen försvann med den avvisade raden');
    assert.deepEqual(await rad('a'), { fan_level: 6, gifter_level: null },
      'gifter_level ska vara NULL när ingen gifternivå setts, inte 0');
  } finally { await client.end(); }
});

db('bara gifter level på en tittare som lärts in med bara gifter level', async () => {
  const { client, levels, fel, rad } = await rigg();
  try {
    await levels.applyEvent(WS, { userId: 'b', gifterLevel: 12 });
    const ut = await levels.applyEvent(WS, { userId: 'b', gifterLevel: 14 });
    assert.deepEqual(fel, []);
    assert.deepEqual(ut.gifterLevelUp, { from: 12, to: 14 });
    assert.deepEqual(await rad('b'), { fan_level: null, gifter_level: 14 });
  } finally { await client.end(); }
});

db('en nivå som syns senare fylls i utan att den andra rörs', async () => {
  const { client, levels, fel, rad } = await rigg();
  try {
    await levels.applyEvent(WS, { userId: 'c', fanClubLevel: 3 });
    const ut = await levels.applyEvent(WS, { userId: 'c', gifterLevel: 20 });
    assert.deepEqual(fel, []);
    assert.equal(ut.gifterLevelUp, null, 'första gifternivån ska bara läras in');
    assert.deepEqual(await rad('c'), { fan_level: 3, gifter_level: 20 });
  } finally { await client.end(); }
});

db('lagret är fortfarande monotont', async () => {
  const { client, levels, fel, rad } = await rigg();
  try {
    await levels.applyEvent(WS, { userId: 'd', fanClubLevel: 9, gifterLevel: 30 });
    const ut = await levels.applyEvent(WS, { userId: 'd', fanClubLevel: 4, gifterLevel: 25 });
    assert.deepEqual(fel, []);
    assert.deepEqual(ut, { fanLevelUp: null, gifterLevelUp: null }, 'en sänkning gav en alert');
    assert.deepEqual(await rad('d'), { fan_level: 9, gifter_level: 30 });
  } finally { await client.end(); }
});
