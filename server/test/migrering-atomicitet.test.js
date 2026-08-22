'use strict';
// KÖRS HELA schema.sql SOM ETT ALLT-ELLER-INGET?
//
// Frågan är inte akademisk. migrate.js gör `pool.query(fs.readFileSync('schema.sql'))` — ETT anrop
// med hela filen och utan parametrar. Om Postgres kör det som en implicit transaktion läks en
// misslyckad migrering av att nästa deploy kör om filen. Om den INTE gör det kan en deploy lämna
// databasen halvmigrerad, med några tabeller skapade och andra inte.
//
// Jag PÅSTOD tidigare att det är atomiskt, utifrån protokollregeln att en flersatsig simple query
// körs i en implicit transaktion, plus fyra kontroller i filen (ingen BEGIN/COMMIT, ingen
// CONCURRENTLY, inga parametrar, ett DO-block vars BEGIN är plpgsql). Det är ett resonemang, inte
// en mätning. Det här provet mäter i stället.
//
// KONSTRUKTIONEN: ett eget flersatsuttryck — giltig DDL följd av ett avsiktligt fel — mot en
// TILLFÄLLIG tabell med eget namn. schema.sql rörs inte, produktionsdata rörs inte, och provet
// städar efter sig oavsett utfall.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Atomiciteten går inte att mäta mot en attrapp — det är '
    + 'databasens beteende som är frågan, inte kodens.';
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

const TABELL = 'atomicitetsprov_tillfallig';

test('migrering: ett flersatsuttryck rullas tillbaka i sin helhet vid ett sent fel',
  { timeout: 30000, skip: BLOCKED }, async () => {
    const { pool } = require('../db.js');
    await pool.query('DROP TABLE IF EXISTS ' + TABELL);
    try {
      // Samma anropsform som migrate.js: en sträng, inga parametrar → simple query protocol.
      // Första satsen är giltig. Andra satsen kastar. Frågan är om den första överlever.
      await pool.query(
        'CREATE TABLE ' + TABELL + ' (id integer PRIMARY KEY);'
        + ' SELECT 1/0;');
      assert.fail('felsatsen kastade inte — då mäter provet ingenting');
    } catch (error) {
      assert.match(String(error.message), /division by zero/i,
        'fel fel kastades: ' + error.message);
    }

    const finns = await pool.query(
      'SELECT to_regclass($1) IS NOT NULL AS finns', ['public.' + TABELL]);
    const kvarstar = finns.rows[0].finns;
    await pool.query('DROP TABLE IF EXISTS ' + TABELL);

    assert.equal(kvarstar, false,
      'MIGRERINGEN ÄR INTE ATOMISK: tabellen från den första satsen överlevde felet i den andra. '
      + 'En deploy kan då lämna databasen halvmigrerad, och all DDL i schema.sql måste vara '
      + 'återkörbar var för sig — vilket den är (allt är IF NOT EXISTS), men antagandet om '
      + 'rollback får inte göras.');
  });

// Kontrollmätning. Utan den bevisar provet ovan bara att ett fel kastades — inte att den giltiga
// satsen HADE lyckats om felet uteblivit. En rollback av något som ändå aldrig skedde är inget bevis.
test('kontroll: samma DDL utan felsats skapar faktiskt tabellen',
  { timeout: 30000, skip: BLOCKED }, async () => {
    const { pool } = require('../db.js');
    await pool.query('DROP TABLE IF EXISTS ' + TABELL);
    await pool.query('CREATE TABLE ' + TABELL + ' (id integer PRIMARY KEY); SELECT 1;');
    const finns = await pool.query(
      'SELECT to_regclass($1) IS NOT NULL AS finns', ['public.' + TABELL]);
    const skapades = finns.rows[0].finns;
    await pool.query('DROP TABLE IF EXISTS ' + TABELL);
    assert.equal(skapades, true,
      'den giltiga satsen skapade ingen tabell ens utan felsats — då säger rollback-provet inget');
  });
