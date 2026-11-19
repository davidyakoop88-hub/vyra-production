'use strict';
// MOLNSTRÖMMEN (2026-11-19). David efter sändningen: "tts i lokal app funkar inte" och "Sound alert
// funkade inte på appen heller".
//
// Den lokala Studion (127.0.0.1) hämtar bara händelser från appens EGEN TikTok-anslutning, med poll
// mot /api/events. Davids sändning var kopplad via molnbryggan. Avläst under sändningen:
// /api/status gav connected:false och lastEventId:0 — appens Studio fick inte en enda händelse, så
// varken Sound Alerts eller TTS Chat hade något att reagera på. Molnets ström går inte heller att
// läsa genom den allmänna vidarebefordran: den väntar in hela svaret och bryter efter 15 s.
//
// Nu läser den lokala servern molnets ström själv när appens egen anslutning inte är igång, och
// lägger händelserna i samma kö som /api/events delar ut.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.join(__dirname, '..', '..');
const CLOUD = 'https://vyra-cloud.invalid';
const SESSION = 'vyra_session=hemligt-token';
const WS = 'ws-1';
const vanta = ms => new Promise(r => setTimeout(r, ms));

// Ett moln som svarar med en händelseström (text/event-stream) på rätt adress, och minns allt annat.
function stubMoln(t, block) {
  const realFetch = global.fetch, sett = [];
  t.after(() => { global.fetch = realFetch; });
  global.fetch = async (url, init = {}) => {
    const mal = new URL(String(url));
    if (mal.origin !== CLOUD) return realFetch(url, init);
    sett.push({ path: mal.pathname, method: init.method || 'GET', headers: init.headers || {} });
    if (mal.pathname === `/api/workspaces/${WS}/events/stream`) {
      const enc = new TextEncoder();
      const body = new ReadableStream({ start(c) { for (const b of block) c.enqueue(enc.encode(b)); if (init.signal) init.signal.addEventListener('abort', () => { try { c.close() } catch (_) {} }); } });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return sett;
}
const live = (id, e) => `id: ${id}\nevent: live\ndata: ${JSON.stringify(e)}\n\n`;
async function medServer(t, port, options, run) {
  const server = await startLocalServer(ROOT, port, Object.assign({ cloudOrigin: CLOUD, cloudSession: () => SESSION, cloudIdentity: () => ({ workspaceId: WS }), molnstromPulsMs: 30 }, options));
  try { await run(`http://127.0.0.1:${port}`); } finally { await new Promise(r => server.close(r)); }
}
const handelser = async origin => (await (await fetch(origin + '/api/events?after=0')).json()).events;

test('utan egen TikTok-anslutning får Studion molnets händelser genom /api/events', async t => {
  const sett = stubMoln(t, [
    ': heartbeat\n\n',
    live('1-0', { id: 'g1', type: 'gift', username: 'anna', name: 'Anna', giftName: 'Rose', diamonds: 5, profileUrl: 'https://cdn/a.jpg', fanClubLevel: 7, fanLevelUp: { from: 6, to: 7 } }),
    // Ett block delat mitt i: strömmen kommer i godtyckliga bitar.
    'id: 2-0\nevent: live\ndata: {"id":"c1","type":"chat","use', 'rname":"bo","comment":"i love you"}\n\n',
    'id: 3-0\nevent: goal\ndata: {"widgetId":"w","value":3}\n\n'
  ]);
  await medServer(t, 4240, {}, async origin => {
    await vanta(250);
    const e = await handelser(origin);
    assert.deepEqual(e.map(x => x.type), ['gift', 'chat'], 'bara live-händelserna ska in, i ordning');
    assert.equal(e[0].username, 'anna');
    assert.equal(e[0].profileUrl, 'https://cdn/a.jpg', 'molnets fält ska följa med orörda — klienten känner redan båda formerna');
    assert.deepEqual(e[0].fanLevelUp, { from: 6, to: 7 });
    assert.equal(e[1].comment, 'i love you', 'chatten är det Sound Alerts och TTS Chat lyssnar på');
    assert.ok(typeof e[0].id === 'number' && e[1].id > e[0].id, 'lokala löpnummer, stigande — poll-loopen räknar på dem');
    assert.equal(e[0].eventKey, 'g1', 'molnets id bärs som eventKey så klientens dubblettspärr håller');
  });
  const strom = sett.find(s => s.path.endsWith('/events/stream'));
  assert.ok(strom, 'strömmen öppnades aldrig');
  assert.equal(strom.headers.cookie, SESSION, 'strömmen ska öppnas med appens session');
  assert.ok(!sett.some(s => s.method === 'POST'), 'en händelse SOM KOM från molnet får aldrig speglas tillbaka dit');
});

test('med egen TikTok-anslutning läses ingen molnström — annars kom varje händelse två gånger', async t => {
  const sett = stubMoln(t, [live('1-0', { id: 'g1', type: 'gift', username: 'anna' })]);
  let status;
  await medServer(t, 4241, { createLiveConnector: ({ onStatus }) => { status = onStatus; return { connect: async () => ({}), disconnect: async () => ({}) }; } }, async origin => {
    status({ connected: true, state: 'live', username: 'jokero' });
    await vanta(200);
    assert.deepEqual(await handelser(origin), []);
  });
  assert.ok(!sett.some(s => s.path.endsWith('/events/stream')), 'strömmen öppnades fast appen själv var ansluten');
});

test('utan inloggning eller arbetsyta öppnas ingenting', async t => {
  const sett = stubMoln(t, []);
  await medServer(t, 4242, { cloudSession: () => '' }, async () => { await vanta(150); });
  await medServer(t, 4243, { cloudIdentity: () => ({}) }, async () => { await vanta(150); });
  assert.equal(sett.length, 0);
});

test('en bruten ström öppnas igen och fortsätter där den slutade', async t => {
  const sett = stubMoln(t, [live('5-0', { id: 'g1', type: 'gift', username: 'anna' })]);
  await medServer(t, 4244, {}, async origin => {
    await vanta(120);
    assert.equal((await handelser(origin)).length, 1);
    // Samma händelse levereras igen efter en återanslutning: den får inte dubbleras.
    await vanta(250);
    assert.equal((await handelser(origin)).length, 1, 'en händelse som kom två gånger från molnet lades in två gånger');
  });
  const oppningar = sett.filter(s => s.path.endsWith('/events/stream'));
  assert.ok(oppningar.length >= 1);
  if (oppningar.length > 1) assert.equal(oppningar[1].headers['last-event-id'], '5-0', 'återanslutningen ska be om det som kom efter det senast lästa');
});

// Målwidgetarna öppnar en egen ström (goal-client.js: /overlays/<id>/events/stream). Den allmänna
// vidarebefordran väntar in hela svaret och bryter efter 15 s, så i appens Studio kom aldrig en ram.
test('en händelseström från Studion släpps igenom bit för bit, med appens session', async t => {
  const realFetch = global.fetch, sett = [];
  t.after(() => { global.fetch = realFetch; });
  let stangd = false;
  global.fetch = async (url, init = {}) => {
    const mal = new URL(String(url));
    if (mal.origin !== CLOUD) return realFetch(url, init);
    sett.push({ path: mal.pathname, headers: init.headers || {} });
    if (!mal.pathname.endsWith('/overlays/ov-1/events/stream')) return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const enc = new TextEncoder();
    // Strömmen tar ALDRIG slut av sig själv — precis som den riktiga.
    const body = new ReadableStream({ start(c) { c.enqueue(enc.encode('event: goal\ndata: {"widgetId":"w1","value":7}\n\n')); init.signal.addEventListener('abort', () => { stangd = true; try { c.close() } catch (_) {} }); } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  await medServer(t, 4245, {}, async origin => {
    const avbryt = new AbortController();
    const svar = await fetch(origin + `/api/workspaces/${WS}/overlays/ov-1/events/stream`, { signal: avbryt.signal });
    assert.equal(svar.status, 200);
    assert.match(svar.headers.get('content-type'), /text\/event-stream/);
    const lasare = svar.body.getReader();
    const forsta = await Promise.race([lasare.read(), vanta(2000).then(() => ({ timeout: true }))]);
    assert.ok(!forsta.timeout, 'första ramen kom inte fram inom 2 s — svaret väntas fortfarande in helt');
    assert.match(new TextDecoder().decode(forsta.value), /"widgetId":"w1"/);
    avbryt.abort();
    await vanta(150);
    assert.ok(stangd, 'när sidan stänger sin ström ska uppkopplingen mot molnet också stängas');
  });
  const anrop = sett.find(s => s.path.endsWith('/overlays/ov-1/events/stream'));
  assert.equal(anrop.headers.cookie, SESSION);
});
