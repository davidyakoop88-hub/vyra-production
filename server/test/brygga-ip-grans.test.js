'use strict';
// BRYGGANS INGEST RÄKNAS INTE MOT IP-GRÄNSEN (uppmätt 2026-10-16, sändningen jrofficialswe).
//
// API_RATE_LIMIT (120 per minut och IP) låg före ingest-routen. Molnbryggan skickar alla konton
// från en IP, så i skarp sändning släpptes ~2 events/sekund igenom; likes, gåvor och en
// Guardian-entré fick 429 innan ingestTikTokEvent ens nåddes. Stresstest mot staging gav exakt
// 120 av 1500 likes och 429 på allt annat.
//
// Provet sänker IP-gränsen till 5 och skickar 20 anrop av varje sort från samma IP:
//   * giltig maskintoken  -> aldrig IP-gränsens 429 (ingest har egna gränser per workspace)
//   * ogiltig token       -> IP-gränsen gäller som förut: 429 efter fem
//   * vanlig API-route    -> IP-gränsen gäller som förut
// Utan Postgres svarar ingest med ett databasfel efter gränsen — det som prövas är att svaret
// INTE är IP-gränsens 429, inte att eventet sparas.
const test = require('node:test'), assert = require('node:assert/strict');

const TOKEN = 'b'.repeat(48);
process.env.TIKTOK_INGEST_TOKEN = TOKEN;
process.env.API_RATE_LIMIT = '5';
process.env.RATE_LIMIT_NAMESPACE = 'auto';

let server, bas;
test.before(async () => {
  ({ server } = require('../index'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  const { eventBus } = require('../index');
  await new Promise(resolve => server.close(resolve));
  await eventBus.close().catch(() => {});
});

const ws = '12121212-1212-4212-8212-121212121212';
const ingest = (token, i) => fetch(`${bas}/api/events/tiktok/${ws}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ id: `ipgrans-${token[0]}-${i}`, type: 'like', username: `tittare${i}`, count: 1 }),
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const arIpGrans = s => s.status === 429 && s.body.error === 'För många försök';

test('bryggans ingest med giltig token stoppas aldrig av IP-gränsen', async () => {
  const svar = [];
  for (let i = 0; i < 20; i++) svar.push(await ingest(TOKEN, i));
  const stoppade = svar.filter(arIpGrans).length;
  assert.equal(stoppade, 0, `${stoppade} av 20 bryggevents fick IP-gränsens 429`);
});

test('fel token räknas mot IP-gränsen som förut', async () => {
  const fel = 'c'.repeat(48), svar = [];
  for (let i = 0; i < 20; i++) svar.push(await ingest(fel, i));
  assert.ok(svar.slice(0, 5).every(s => s.status === 401), 'de första fem ska nekas med 401');
  assert.ok(svar.some(arIpGrans), 'IP-gränsen slog aldrig till för anrop utan giltig token');
});

test('vanliga API-anrop räknas mot IP-gränsen som förut', async () => {
  const svar = [];
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${bas}/api/workspaces`);
    svar.push({ status: r.status, body: await r.json().catch(() => ({})) });
  }
  assert.ok(svar.some(arIpGrans), 'IP-gränsen slog aldrig till för vanliga anrop');
});
