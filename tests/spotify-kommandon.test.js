'use strict';
// SPOTIFY UTAN WIDGET (spotify-kommandon.js, David 2026-10-22: "Spotify ska funka utan att lägga den
// som widget på layout").
//
// Spotify byts mot en stubbe som minns varje anrop — provet mäter reglerna (vem, när, hur många
// gånger), inte Spotifys API (det har tests/spotify-enhet.test.js). Där det går matas eventen in
// genom den riktiga live-client.js (VyraLive.ingest), så att fogen mellan klientens mappning och
// kommandona provas, inte bara kommandona själva.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const vanta = ms => new Promise(r => setTimeout(r, ms));
const living = [];
test.after(() => { while (living.length) living.pop().window.close(); });

const LAT = { is_playing: true, item: { uri: 'spotify:track:bl', name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }] } };

function studio({ overlay = false, master = true, widgets = [], token = true, extras = {}, spelar = LAT,
                  live = null, katalog = [], idn = {}, skript = [], fore = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div><section id="view"></section></body></html>',
    { url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''), runScripts: 'dangerously' });
  living.push(dom);
  const w = dom.window;
  w.navigator.locks = undefined;
  w.EventSource = function () { return { close() {}, addEventListener() {} }; };   // jsdom har ingen
  w.__anrop = [];
  w.__toast = [];
  w.toast = t => w.__toast.push(t);
  if (token) w.localStorage.setItem('vyra-spotify-token-v1', JSON.stringify({ accessToken: 'a', expiresAt: Date.now() + 3600e3 }));
  w.state = { widgets };
  w.VyraSpotify = {
    status: async () => ({ connected: token, profile: { display_name: 'JOKERO' } }),
    current: async () => { w.__anrop.push(['current']); return spelar; },
    play: async q => { w.__anrop.push(['play', q]); return 'spotify:track:x'; },
    queue: async q => { w.__anrop.push(['queue', q]); return { uri: 'spotify:track:' + q.replace(/\W/g, ''), titel: q }; },
    next: async () => { w.__anrop.push(['next']); return null; }
  };
  w.__master = master;
  w.VyraAutomationMaster = { farKora: () => w.__master, arMaster: () => w.__master };
  if (live) w.VyraLive = live;
  w.VyraGavokatalog = { lista: () => katalog, idn: n => new Set(idn[String(n).toLowerCase()] || []) };
  if (!skript.includes('session-state.js')) {
    w.VyraExtras = { data: extras };
    w.__skrivet = [];
    w.VyraSessionState = { writeActive: async (k, v) => { w.__skrivet.push([k, JSON.parse(v)]); w.localStorage.setItem(k, v); return { ok: true }; } };
  }
  if (fore) fore(w);
  const ladda = f => { const s = w.document.createElement('script'); s.textContent = las(f); w.document.body.append(s); };
  // Samma ordning som studio.html: kommandona före live-client och Action & Events (media.js-svansen).
  skript.filter(f => f === 'session-state.js').forEach(ladda);
  ladda('spotify-kommandon.js');
  skript.filter(f => f !== 'session-state.js').forEach(ladda);
  return w;
}
const chatt = (w, d) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'chat', id: 'e' + Math.random(), at: Date.now() }, d) }));
const gava = (w, d) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'gift', id: 'g' + Math.random(), at: Date.now(), username: 'lisa', count: 1 }, d) }));
const anrop = (w, typ) => w.__anrop.filter(a => a[0] === typ);

// ---- !önska ---------------------------------------------------------------------------------------

test('!önska via riktiga live-client: läggs i Spotify-kön exakt en gång, även om eventet kommer två gånger', async () => {
  const w = studio({ skript: ['cloud-fields.js', 'live-client.js'] });
  w.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  assert.equal(typeof w.VyraLive.ingest, 'function', 'live-client laddades inte — provet mäter då ingenting');
  const e = { type: 'chat', id: 'rad-1', username: 'lina', comment: '!önska blinding lights', at: Date.now() };
  w.VyraLive.ingest({ ...e });
  w.VyraLive.ingest({ ...e });
  await vanta(50);
  assert.deepEqual(anrop(w, 'queue'), [['queue', 'blinding lights']]);
});

test('!sr och !låt fungerar, ett tomt kommando och vanlig chatt gör ingenting', async () => {
  const w = studio();
  chatt(w, { username: 'a', comment: '!sr levitating' });
  chatt(w, { username: 'b', comment: '!låt Dancing Queen' });
  chatt(w, { username: 'c', type: 'chatcommand', name: '!onska flowers', comment: '' });
  chatt(w, { username: 'd', comment: '!önska' });
  chatt(w, { username: 'e', comment: '!önska  ' });
  chatt(w, { username: 'f', comment: 'hej alla' });
  await vanta(30);
  assert.deepEqual(anrop(w, 'queue').map(a => a[1]), ['levitating', 'Dancing Queen', 'flowers']);
});

test('väntetid 60 s per tittare, samma låt två gånger avvisas', async () => {
  const w = studio();
  chatt(w, { username: 'lina', comment: '!önska blinding lights' });
  chatt(w, { username: 'lina', comment: '!önska en till direkt' });
  chatt(w, { username: 'omar', comment: '!önska Blinding Lights' });
  chatt(w, { username: 'omar', comment: '!önska levitating' });
  await vanta(30);
  assert.deepEqual(anrop(w, 'queue').map(a => a[1]), ['blinding lights', 'levitating']);
});

test('högst 10 låtar väntar i kön', async () => {
  const w = studio({ spelar: null });
  for (let i = 0; i < 12; i++) chatt(w, { username: 't' + i, comment: '!önska låt nummer ' + i });
  await vanta(60);
  assert.equal(anrop(w, 'queue').length, 10);
  assert.ok(anrop(w, 'current').length >= 1, 'taket frågade aldrig Spotify vad som spelas');
});

test('historik, test- och simulerade rader rör aldrig den riktiga Spotify', async () => {
  const w = studio();
  chatt(w, { username: 'a', comment: '!önska gammal', at: Date.now() - 5 * 60000 });
  chatt(w, { username: 'b', comment: '!önska testlåt', __test: true });
  chatt(w, { username: 'c', comment: '!önska simulerad', __simulerad: true });
  chatt(w, { username: 'd', comment: '!önska servertest', id: 'test-123' });
  chatt(w, { username: 'e', comment: '!skip', isModerator: true, __test: true });
  await vanta(30);
  assert.deepEqual(w.__anrop, []);
});

// ---- !skip ----------------------------------------------------------------------------------------

test('!skip: bara moderatorer och streamern själv byter låt', async () => {
  const w = studio({ live: { tillstand: () => ({ konto: 'jokero' }) } });
  chatt(w, { username: 'tittare', comment: '!skip' });
  await vanta(20);
  assert.equal(anrop(w, 'next').length, 0, 'en vanlig tittare kunde byta låt');
  chatt(w, { username: 'moddan', comment: '!skip', isModerator: true });
  await vanta(20);
  assert.equal(anrop(w, 'next').length, 1);
  chatt(w, { username: '@JOKERO', comment: '!hoppa' });
  await vanta(20);
  assert.equal(anrop(w, 'next').length, 2, 'streamern själv kunde inte byta låt');
});

// ---- vem kör --------------------------------------------------------------------------------------

test('en synlig Låtönskningar-widget äger !önska och !skip — ingen dubbel kö', async () => {
  const w = studio({ widgets: [{ id: 'l1', type: 'templateSongRequests', latKalla: 'youtube' }] });
  chatt(w, { username: 'a', comment: '!önska blinding lights' });
  chatt(w, { username: 'm', comment: '!skip', isModerator: true });
  await vanta(30);
  assert.deepEqual(w.__anrop, []);
  // En dold widget tar inga kommandon (latonskningar.js forsta()), då gör den här filen det.
  w.state.widgets[0].hidden = true;
  chatt(w, { username: 'b', comment: '!önska levitating' });
  await vanta(30);
  assert.deepEqual(anrop(w, 'queue'), [['queue', 'levitating']]);
});

test('i overlayn händer ingenting — där finns ingen Spotify-token', async () => {
  const w = studio({ overlay: true, extras: { spotify: { gavor: [{ id: 'r', gava: { name: 'Rose' }, lat: 'x', on: true }] } } });
  chatt(w, { username: 'a', comment: '!önska blinding lights' });
  chatt(w, { username: 'm', comment: '!skip', isModerator: true });
  gava(w, { giftName: 'Rose' });
  await vanta(30);
  assert.deepEqual(w.__anrop, []);
  assert.equal(w.VyraSpotifyKommandon.aktiv, false);
});

test('en flik som inte är automationsförare gör ingenting', async () => {
  const w = studio({ master: false, extras: { spotify: { gavor: [{ id: 'r', gava: { name: 'Rose' }, lat: 'x', on: true }] } } });
  chatt(w, { username: 'a', comment: '!önska blinding lights' });
  chatt(w, { username: 'm', comment: '!skip', isModerator: true });
  gava(w, { giftName: 'Rose' });
  await vanta(30);
  assert.deepEqual(w.__anrop, []);
});

test('utan Spotify-anslutning, eller med kommandot avstängt, händer ingenting', async () => {
  const utan = studio({ token: false });
  chatt(utan, { username: 'a', comment: '!önska blinding lights' });
  const av = studio({ extras: { spotify: { onska: false, skip: false } } });
  chatt(av, { username: 'a', comment: '!önska blinding lights' });
  chatt(av, { username: 'm', comment: '!skip', isModerator: true });
  await vanta(30);
  assert.deepEqual(utan.__anrop, []);
  assert.deepEqual(av.__anrop, []);
});

// ---- Gåva → låt -----------------------------------------------------------------------------------

test('gåva → låt: träffar på namn, på radens giftId och på katalogens id för namnet', async () => {
  const extras = { spotify: { gavor: [
    { id: 'r1', gava: { name: 'Rose', giftId: '5655' }, lat: 'Blinding Lights', on: true },
    { id: 'r2', gava: { name: 'Galaxy', giftId: '' }, lat: 'spotify:track:galax', on: true },
    { id: 'r3', gava: { name: 'Lejon' }, lat: 'Av-låten', on: false }
  ] } };
  const w = studio({ extras, idn: { galaxy: ['11046'] } });
  gava(w, { giftName: 'Rose' });                       // namnet
  await vanta(20);
  assert.deepEqual(anrop(w, 'play'), [['play', 'Blinding Lights']]);
  w.VyraSpotifyKommandon.rensa(); w.__anrop.length = 0;
  gava(w, { giftName: 'Ros', giftId: '5655' });        // svenska namnet, samma id
  await vanta(20);
  assert.deepEqual(anrop(w, 'play'), [['play', 'Blinding Lights']]);
  gava(w, { giftName: 'Galax', giftId: '11046' });     // id via katalogen
  await vanta(20);
  assert.deepEqual(anrop(w, 'play').map(a => a[1]), ['Blinding Lights', 'spotify:track:galax']);
  gava(w, { giftName: 'Lejon' });                      // raden är avstängd
  gava(w, { giftName: 'Hjärta', giftId: '999' });      // ingen rad
  await vanta(20);
  assert.equal(anrop(w, 'play').length, 2);
});

test('gåva → låt: en kombo startar inte om låten för varje tryck, och testgåvor spelar aldrig', async () => {
  const w = studio({ extras: { spotify: { gavor: [{ id: 'r1', gava: { name: 'Rose' }, lat: 'Blinding Lights', on: true }] } } });
  gava(w, { giftName: 'Rose', __simulerad: true });
  gava(w, { giftName: 'Rose', __test: true });
  await vanta(20);
  assert.equal(anrop(w, 'play').length, 0, 'en simulerad gåva bytte låt i den riktiga Spotify');
  for (let i = 0; i < 5; i++) gava(w, { giftName: 'Rose', count: i + 1 });
  await vanta(20);
  assert.equal(anrop(w, 'play').length, 1);
});

// ---- !song: chattbotens svar -------------------------------------------------------------------

const KEY = 'vyra-action-event-v2';
function chatbotStudio({ svar = 'Visar låten som spelas på Spotify', spelar = LAT } = {}) {
  const actions = [{ id: 'cb1', name: 'Chatbot: !song', types: ['chat', 'tts'], duration: 8, cooldown: 3, volume: 80,
    config: { chatText: svar, ttsText: svar }, scene: { number: 1 } }];
  const events = [{ id: 'ev1', trigger: 'chatCommand', condition: '!song', actionId: 'cb1', enabled: true }];
  const w = studio({
    spelar, skript: ['session-state.js', 'action-runtime.js', 'action-event.js', 'action-event-advanced.js', 'cloud-fields.js', 'live-client.js'],
    fore: w => {
      w.localStorage.setItem(KEY, JSON.stringify({ actions, events }));
      w.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now()));
    }
  });
  w.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  return w;
}
const kordaRun = w => { try { return JSON.parse(w.localStorage.getItem('vyra-action-run') || 'null'); } catch (e) { return null; } };

test('!song: chattbotens standardsvar blir låten som spelas, i chatten och i TTS', async () => {
  const w = chatbotStudio();
  await vanta(600);                                   // lindningen görs när action-event.js finns
  w.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  w.VyraLive.ingest({ type: 'chat', id: 's1', username: 'lina', comment: '!song', at: Date.now() });
  await vanta(80);
  const run = kordaRun(w);
  assert.ok(run, 'chattbotens action skickades aldrig till overlayn');
  assert.equal(run.action.config.chatText, 'Nu spelas: Blinding Lights – The Weeknd');
  assert.equal(run.action.config.ttsText, 'Nu spelas: Blinding Lights – The Weeknd');
  assert.equal(run.action.name, 'Chatbot: !song');
  assert.equal(run.action.scene.number, 1, 'kopian tappade sin scen');
  // Det sparade svaret är orört: nästa !song hämtar låten på nytt.
  assert.equal(w.VyraActionEvent.read().actions[0].config.chatText, 'Visar låten som spelas på Spotify');
});

test('!song: ingen låt spelas → "Ingen låt spelas just nu"; ett eget svar med {låt} får låten insatt', async () => {
  const tyst = chatbotStudio({ spelar: null });
  const eget = chatbotStudio({ svar: '{username}, nu hörs {låt} 🎶' });
  await vanta(600);
  for (const w of [tyst, eget]) {
    w.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now()));
    w.VyraLive.ingest({ type: 'chat', id: 's1', username: 'lina', comment: '!song', at: Date.now() });
  }
  await vanta(80);
  assert.equal(kordaRun(tyst).action.config.chatText, 'Ingen låt spelas just nu');
  assert.equal(kordaRun(eget).action.config.chatText, '{username}, nu hörs Blinding Lights – The Weeknd 🎶',
    '{username} ska fyllas i av overlayn som förut, {låt} här');
});

test('!song: ett eget svar utan {låt} rörs inte och frågar aldrig Spotify', async () => {
  const w = chatbotStudio({ svar: 'Låtlistan finns på min profil' });
  await vanta(600);
  w.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  w.VyraLive.ingest({ type: 'chat', id: 's1', username: 'lina', comment: '!song', at: Date.now() });
  await vanta(80);
  const run = kordaRun(w);
  assert.equal(run.action.id, 'cb1');
  assert.equal(run.action.config.chatText, 'Låtlistan finns på min profil');
  assert.equal(anrop(w, 'current').length, 0);
});

test('fyll(): standardsvaret, {låt}/{lat}/{song} och ett vanligt svar', () => {
  const w = studio();
  const K = w.VyraSpotifyKommandon, l = { titel: 'Flowers', artist: 'Miley Cyrus' };
  assert.equal(K.fyll('Visar låten som spelas på Spotify', l), 'Nu spelas: Flowers – Miley Cyrus');
  assert.equal(K.fyll('Visar laten som spelas pa Spotify', null), 'Ingen låt spelas just nu');
  assert.equal(K.fyll('Låt: {lat} / {SONG}', l), 'Låt: Flowers – Miley Cyrus / Flowers – Miley Cyrus');
  assert.equal(K.fyll('Hej {username}', l), 'Hej {username}');
  assert.equal(K.behoverLat({ config: { chatText: 'Hej' } }), false);
  assert.equal(K.behoverLat({ config: { ttsText: 'Nu: {låt}' } }), true);
});

// ---- Spotify-sidan --------------------------------------------------------------------------------

const SIDAN = '<article class="card spotify-card"><div class="spotify-connect"><small id="spotifyStatus"></small><button id="spotifyConnect"></button></div><h3>Musikåtgärder</h3><div class="music-rules"><article><code>!song</code><small>Visa aktuell låt i chatten</small></article><article><code>!skip</code><small>Moderatorer kan byta låt</small></article><article><b>Gåva → låt</b><small>Spela vald låt vid gåva</small></article></div></article>';

test('Spotify-sidan: rutorna säger Aktiv när Spotify är anslutet, och gåva → låt sparas och testas', async () => {
  const extras = { commands: [{ cmd: '!song', reply: 'Visar låten som spelas på Spotify', on: true }] };
  const w = studio({ extras, katalog: [{ name: 'Galaxy', image: 'https://p16.tiktokcdn.com/galaxy.png', coins: 1000, giftId: '11046' }, { name: 'Rose', image: 'https://p16.tiktokcdn.com/rose.png', coins: 1, giftId: '5655' }] });
  w.document.querySelector('#view').innerHTML = SIDAN;
  await vanta(60);
  const regler = w.document.querySelector('.music-rules');
  assert.equal(regler.dataset.spotifyKommandon, '1', 'sidan fick aldrig de riktiga åtgärderna');
  const rutor = [...regler.querySelectorAll(':scope > article')];
  for (const r of rutor) {
    assert.match(r.firstElementChild.tagName, /CODE|B/, 'kommandot ska stå först (spotify-kommandon.browser.test.js)');
    assert.equal(r.querySelector('small'), r.firstElementChild.nextElementSibling, 'förklaringen ska stå direkt under kommandot');
  }
  const status = () => Object.fromEntries(rutor.length ? [...w.document.querySelectorAll('.music-rules > article')].map(a => [a.firstElementChild.textContent, a.querySelector('[data-spk-status]').textContent]) : []);
  assert.deepEqual(status(), { '!önska <låt>': 'Aktiv', '!song': 'Aktiv', '!skip': 'Aktiv', 'Gåva → låt': 'Välj gåva och låt' });

  w.document.querySelector('[data-spk-valj="0"]').click();
  const val = [...w.document.querySelectorAll('.spk-valjare [data-spk-gava]')];
  assert.equal(val.length, 2);
  assert.match(val[0].textContent, /Rose[\s\S]*1 coins/, 'billigast först, med namn och coins');
  assert.ok(val[0].querySelector('img'), 'gåvans bild saknas');
  val[1].click();                                      // Galaxy
  const latFalt = w.document.querySelector('[data-spk-lat="0"]');
  latFalt.value = 'Blinding Lights';
  latFalt.dispatchEvent(new w.Event('change'));
  await vanta(20);
  const sparat = w.__skrivet.at(-1);
  assert.equal(sparat[0], 'vyra-extras');
  assert.deepEqual(sparat[1].spotify.gavor.map(r => [r.gava.name, r.gava.giftId, r.lat, r.on]), [['Galaxy', '11046', 'Blinding Lights', true]]);
  assert.deepEqual(sparat[1].commands, extras.commands, 'chattbotens kommandon försvann ur vyra-extras');
  assert.equal(status()['Gåva → låt'], 'Aktiv · 1 gåva');

  w.document.querySelector('[data-spk-testa="0"]').click();
  await vanta(20);
  assert.deepEqual(anrop(w, 'play'), [['play', 'Blinding Lights']], 'Testa spelade inte låten');

  // Sparat → nästa riktiga Galaxy spelar låten.
  w.VyraExtras.data = sparat[1];
  gava(w, { giftName: 'Galaxy', giftId: '11046' });
  await vanta(20);
  assert.equal(anrop(w, 'play').length, 2);
});

test('Spotify-sidan: utan anslutning säger rutorna det, och en pausad !song säger var den pausats', async () => {
  const w = studio({ token: false, extras: { commands: [{ cmd: '!song', reply: 'x', on: false }] } });
  w.document.querySelector('#view').innerHTML = SIDAN;
  await vanta(60);
  const texter = [...w.document.querySelectorAll('[data-spk-status]')].map(e => e.textContent);
  assert.ok(texter.every(t => t === 'Anslut Spotify först'), texter.join(' | '));
  w.localStorage.setItem('vyra-spotify-token-v1', '{}');
  w.VyraSpotify.status = async () => ({ connected: true, profile: {} });
  w.dispatchEvent(new w.CustomEvent('vyra:spotify-changed'));
  await vanta(40);
  const song = [...w.document.querySelectorAll('.music-rules > article')].find(a => a.firstElementChild.textContent === '!song');
  assert.equal(song.querySelector('[data-spk-status]').textContent, 'Pausad i Chatbot');
});
