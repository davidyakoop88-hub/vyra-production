'use strict';
// SUPPORTÄRENDEN GER ETT INTERNT MEJL — POST /api/support/tickets och svar i ett ärende.
//
// Innan detta sparades ärenden från supportformuläret i appen bara i databasen. Ingen fick veta att
// de fanns: teamet som läser support@ i Gmail såg dem aldrig, och kunden såg "Mottaget" medan ingen
// läste. Nu läggs ett mejl i notification_outbox till SUPPORT_INBOX (standard support@vyralive.app),
// med kundens adress som svarsadress. Mejlen begränsas per kund och timme, men ärendet sparas alltid.
//
// Mejlets innehåll provas utan databas. HTTP-delen är BLOCKERAD utan isolerad Postgres + Redis,
// precis som mfa-http.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');

const INKORG = 'support-prov@t.invalid';
process.env.SUPPORT_INBOX = INKORG;
const DB_URL = process.env.TEST_DATABASE_URL || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.TIKTOK_INGEST_TOKEN = process.env.TIKTOK_INGEST_TOKEN || 'prov-ingest-token-0123456789';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');

const N = require('../notifications');

// ---- Mejlets innehåll -------------------------------------------------------------------------

test('supportmejl: nytt ärende har ämne, avsändare, typ, meddelande och svarsadress', () => {
  const m = N.message('support_ticket_new', {
    ticketId: 'abc-123', category: 'feedback', subject: 'Fler avatarer', message: 'Kan ni lägga till fler avatarer?\nTack!',
    email: 'kund@exempel.se'
  });
  assert.equal(m.subject, 'Nytt supportärende: Fler avatarer');
  assert.match(m.text, /Från: kund@exempel\.se/);
  assert.match(m.text, /Typ: Idé eller önskemål/);
  assert.match(m.text, /Ärende-id: abc-123/);
  assert.match(m.text, /Kan ni lägga till fler avatarer\?\nTack!/);
  assert.match(m.text, /\/operations\.html/);
  assert.equal(m.replyTo, 'kund@exempel.se');
});

test('supportmejl: svar i ärende får egen rubrik', () => {
  const m = N.message('support_ticket_reply', { subject: 'Fler avatarer', message: 'Hej igen', email: 'kund@exempel.se' });
  assert.equal(m.subject, 'Nytt svar i supportärende: Fler avatarer');
  assert.match(m.text, /Kunden har svarat/);
});

test('supportmejl: radbrytningar i ämnet blir mellanslag och html escapas', () => {
  const m = N.message('support_ticket_new', { subject: 'Rad1\r\nBcc: x@y.z', message: 'a & "b"', email: 'kund@exempel.se' });
  assert.ok(!/[\r\n]/.test(m.subject), 'ämnet innehöll radbrytning');
  assert.match(m.html, /a &amp; &quot;b&quot;/);
});

test('supportmejl: ogiltig avsändaradress ger ingen svarsadress', () => {
  for (const email of ['', 'inte-en-adress', 'a@b.c, d@e.f']) {
    assert.equal(N.message('support_ticket_new', { subject: 'x', message: 'y', email }).replyTo, null, email);
  }
});

test('supportmejl: reply_to skickas till e-posttjänsten bara för supportmejl', async () => {
  const gammalFetch = global.fetch, gammalNyckel = process.env.RESEND_API_KEY, kroppar = [];
  process.env.RESEND_API_KEY = 'prov';
  global.fetch = async (_url, init) => { kroppar.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; };
  const pool = { query: async sql => /^SELECT/.test(sql) ? { rowCount: 2, rows: [
    { id: 1, recipient: INKORG, template: 'support_ticket_new', payload: { subject: 'x', message: 'y', email: 'kund@exempel.se' }, dedupe_key: 'a', attempts: 0 },
    { id: 2, recipient: 'kund@exempel.se', template: 'trial_started', payload: {}, dedupe_key: 'b', attempts: 0 }
  ] } : { rowCount: 1, rows: [] } };
  try {
    const r = await N.processOutbox(pool);
    assert.equal(r.sent, 2);
    assert.equal(kroppar[0].reply_to, 'kund@exempel.se');
    assert.deepEqual(kroppar[0].to, [INKORG]);
    assert.ok(!('reply_to' in kroppar[1]), 'kundmejl fick reply_to');
  } finally {
    global.fetch = gammalFetch;
    if (gammalNyckel === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = gammalNyckel;
  }
});

// ---- Över HTTP mot riktig Postgres ------------------------------------------------------------

let BLOCKED = DB_URL ? null : 'BLOCKERAT: ingen isolerad Postgres.';
async function blockerad() {
  if (BLOCKED !== null) return BLOCKED;
  const url = new URL(REDIS_URL);
  BLOCKED = await new Promise(klar => {
    const s = net.connect({ host: url.hostname, port: Number(url.port) || 6379 });
    const av = svar => { s.destroy(); klar(svar); };
    s.once('connect', () => av(''));
    s.once('error', () => av('BLOCKERAT: ingen Redis.'));
    s.setTimeout(1500, () => av('BLOCKERAT: Redis svarade inte.'));
  });
  return BLOCKED;
}

let server = null, eventBus = null, pool = null, S = null, bas = '';
const KUND = 'beef0000-0000-4000-8000-00000000e5c1';
const KUND_EPOST = 'supportmejl-kund@t.invalid';
// Egen kund för taket: mejlräknaren gäller en timme och delas annars med proven ovanför.
const TAKKUND = 'beef0000-0000-4000-8000-00000000e5c2';
const TAKKUND_EPOST = 'supportmejl-takkund@t.invalid';
const KUNDER = [[KUND, KUND_EPOST], [TAKKUND, TAKKUND_EPOST]];

async function session(anv = KUND) {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at) VALUES ($1,$2,$3, now() + interval '1 hour')",
    [anv, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}
async function post(vag, kropp, vem) {
  const res = await fetch(bas + vag, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: vem.cookie, 'x-vyra-csrf': vem.csrf },
    body: JSON.stringify(kropp)
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}
const mejlen = async (epost = KUND_EPOST) => (await pool.query(
  "SELECT recipient, template, payload, dedupe_key FROM notification_outbox WHERE recipient=$1 AND payload->>'email'=$2 ORDER BY id",
  [INKORG, epost])).rows;
async function stada() {
  for (const [id, epost] of KUNDER) {
    await pool.query("DELETE FROM notification_outbox WHERE recipient=$1 AND payload->>'email'=$2", [INKORG, epost]);
    await pool.query('DELETE FROM support_replies WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id=$1)', [id]);
    await pool.query('DELETE FROM support_tickets WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [id]);
  }
}

const prov = (namn, fn) => test('supportmejl http: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));
  for (const [id, epost] of KUNDER) await pool.query(
    "INSERT INTO users (id,email,password_hash,display_name,email_verified_at) VALUES ($1,$2,$3,'supportmejlprov',now())" +
    ' ON CONFLICT (id) DO UPDATE SET email=$2',
    [id, epost, S.hashPassword('Prov-Losenord-9134!')]);
  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.beforeEach(async () => { if (!await blockerad()) await stada(); });

test.after(async () => {
  if (await blockerad()) return;
  await stada();
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[KUND, TAKKUND]]);
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

prov('nytt ärende sparas och lägger ett mejl till supportinkorgen', async () => {
  const vem = await session();
  const r = await post('/api/support/tickets', { category: 'feedback', subject: 'Fler avatarer', message: 'Kan ni lägga till fler avatarer?' }, vem);
  assert.equal(r.status, 201, 'svarade ' + r.status + ' (' + (r.body && r.body.error) + ')');
  const m = await mejlen();
  assert.equal(m.length, 1, 'fel antal mejl i kön');
  assert.equal(m[0].template, 'support_ticket_new');
  assert.equal(m[0].payload.ticketId, r.body.ticket.id);
  assert.equal(m[0].payload.subject, 'Fler avatarer');
  assert.equal(m[0].payload.category, 'feedback');
  assert.equal(m[0].dedupe_key, 'support_ticket_new:' + r.body.ticket.id);
});

prov('kundens svar i ärendet lägger ett eget mejl', async () => {
  const vem = await session();
  const r = await post('/api/support/tickets', { category: 'technical', subject: 'Widget syns inte', message: 'Widgeten syns inte i OBS.' }, vem);
  const s = await post('/api/support/tickets/' + r.body.ticket.id, { message: 'Nu har jag startat om OBS.' }, vem);
  assert.equal(s.status, 201, 'svarade ' + s.status + ' (' + (s.body && s.body.error) + ')');
  const m = await mejlen();
  assert.deepEqual(m.map(x => x.template), ['support_ticket_new', 'support_ticket_reply']);
  assert.equal(m[1].payload.message, 'Nu har jag startat om OBS.');
  assert.equal(m[1].payload.subject, 'Widget syns inte');
});

prov('ogiltigt ärende ger 400 och inget mejl', async () => {
  const vem = await session();
  const r = await post('/api/support/tickets', { category: 'feedback', subject: 'x', message: 'kort' }, vem);
  assert.equal(r.status, 400);
  assert.equal((await mejlen()).length, 0);
});

prov('efter fem mejl i timmen sparas ärendet men inget mer mejl läggs', async () => {
  const vem = await session(TAKKUND);
  for (let i = 1; i <= 6; i++) {
    const r = await post('/api/support/tickets', { category: 'other', subject: 'Ärende nummer ' + i, message: 'Detta är ärende nummer ' + i }, vem);
    assert.equal(r.status, 201, 'ärende ' + i + ' svarade ' + r.status);
  }
  const antal = (await pool.query('SELECT count(*)::int n FROM support_tickets WHERE user_id=$1', [TAKKUND])).rows[0].n;
  assert.equal(antal, 6, 'alla ärenden sparades inte');
  assert.equal((await mejlen(TAKKUND_EPOST)).length, 5, 'taket på fem mejl i timmen höll inte');
});
