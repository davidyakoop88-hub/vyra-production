'use strict';
// EGET CLIENT ID (David 2026-11-23: "bygg att alla kan ansluta sig"). VYRA:s Spotify-app är i
// utvecklarläge och släpper bara in fem konton. Med kundens eget Client ID ska hela kedjan —
// inloggning, kodutbyte och förnyelse — gå genom kundens app, och aldrig blandas med VYRA:s.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KOD = fs.readFileSync(path.join(__dirname, '..', 'spotify-client.js'), 'utf8');
const VYRA = '98200bcc03394a56889e42c9ac53eba2';
const EGET = 'aabbccddeeff00112233445566778899';

function rigg({ lagring = new Map(), search = '', svar, fetch } = {}) {
  const anrop = [], oppnade = [];
  const window = { addEventListener() {}, dispatchEvent() {}, open: url => { oppnade.push(url); return {}; }, opener: null };
  const ctx = {
    window, location: { hostname: 'vyralive.app', origin: 'https://vyralive.app', search },
    localStorage: { getItem: k => lagring.has(k) ? lagring.get(k) : null, setItem: (k, v) => lagring.set(k, String(v)), removeItem: k => lagring.delete(k) },
    fetch: fetch || (async (url, opt = {}) => {
      anrop.push({ url: String(url), body: opt.body ? String(opt.body) : '' });
      const r = svar ? svar(String(url)) : { access_token: 'ny', refresh_token: 'r2', expires_in: 3600 };
      return { status: 200, ok: true, text: async () => JSON.stringify(r), json: async () => r };
    }),
    BroadcastChannel: function () { return { postMessage() {} }; }, CustomEvent: function () {},
    URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  };
  vm.runInNewContext(KOD, ctx);
  return { s: window.VyraSpotify, lagring, anrop, oppnade };
}
const clientIdI = text => new URLSearchParams(text.split('?')[1] || text).get('client_id');

test('utan eget Client ID används VYRA:s app som förut', async () => {
  const { s, oppnade } = rigg();
  assert.equal(s.clientId(), VYRA);
  assert.equal(s.egetClientId(), '');
  await s.connect();
  assert.equal(clientIdI(oppnade[0]), VYRA);
});

test('med eget Client ID går inloggningen genom kundens app', async () => {
  const { s, oppnade, lagring } = rigg();
  s.setClientId('  ' + EGET.toUpperCase() + ' ');
  assert.equal(s.egetClientId(), EGET);
  await s.connect();
  assert.equal(clientIdI(oppnade[0]), EGET, 'inloggningen skickades till VYRA:s app — taket på fem gäller fortfarande');
  assert.equal(JSON.parse(lagring.get('vyra-spotify-oauth-v1')).clientId, EGET);
});

test('kodutbytet använder appen som inloggningen startade med, och tokenet minns den', async () => {
  const lagring = new Map([['vyra-spotify-oauth-v1', JSON.stringify({ clientId: EGET, state: 'st', verifier: 'v', redirectUri: 'https://vyralive.app/spotify-callback.html', createdAt: Date.now() })]]);
  const { s, anrop } = rigg({ lagring, search: '?code=kod&state=st' });
  await s.handleCallback();
  assert.equal(clientIdI(anrop[0].body), EGET, 'kodutbytet gjordes med fel app — Spotify svarar invalid_client');
  assert.equal(JSON.parse(lagring.get('vyra-spotify-token-v1')).clientId, EGET);
});

test('förnyelsen görs med tokenets egen app', async () => {
  const lagring = new Map([['vyra-spotify-token-v1', JSON.stringify({ accessToken: 'gammal', refreshToken: 'r', expiresAt: 0, clientId: EGET })]]);
  const { s, anrop } = rigg({ lagring, svar: url => url.includes('/api/token') ? { access_token: 'ny', expires_in: 3600 } : { id: 'kund' } });
  assert.equal((await s.status()).connected, true);
  assert.equal(clientIdI(anrop[0].body), EGET, 'förnyelsen gick till VYRA:s app — kopplingen dör efter en timme');
  assert.equal(JSON.parse(lagring.get('vyra-spotify-token-v1')).clientId, EGET);
});

test('ett token sparat före ändringen förnyas fortfarande med VYRA:s app', async () => {
  const lagring = new Map([['vyra-spotify-token-v1', JSON.stringify({ accessToken: 'gammal', refreshToken: 'r', expiresAt: 0 })]]);
  const { s, anrop } = rigg({ lagring, svar: url => url.includes('/api/token') ? { access_token: 'ny', expires_in: 3600 } : { id: 'david' } });
  assert.equal((await s.status()).connected, true);
  assert.equal(clientIdI(anrop[0].body), VYRA, 'Davids befintliga koppling bröts av ändringen');
});

test('byte av app kopplar från den gamla kopplingen; samma app gör det inte', () => {
  const lagring = new Map([['vyra-spotify-token-v1', '{"accessToken":"a"}']]);
  const { s } = rigg({ lagring });
  s.setClientId(EGET);
  assert.equal(lagring.has('vyra-spotify-token-v1'), false, 'tokenet från VYRA:s app låg kvar och kan inte förnyas med den nya appen');
  lagring.set('vyra-spotify-token-v1', '{"accessToken":"b"}');
  s.setClientId(EGET);
  assert.equal(lagring.has('vyra-spotify-token-v1'), true, 'att spara samma Client ID igen kopplade från');
  s.setClientId('');
  assert.equal(s.clientId(), VYRA);
  assert.equal(lagring.has('vyra-spotify-token-v1'), false);
});

test('ett felaktigt Client ID avvisas med en mening som säger var det finns', () => {
  const { s } = rigg();
  for (const fel of ['abc', EGET + '0', 'zz' + EGET.slice(2), 'https://developer.spotify.com']) {
    assert.throws(() => s.setClientId(fel), /32 tecken[\s\S]*Basic Information/);
  }
  assert.equal(s.egetClientId(), '');
});

test('konto utanför kundens egen app: rådet gäller kundens app, inte VYRA:s', async () => {
  const lagring = new Map([['vyra-spotify-client-id-v1', EGET], ['vyra-spotify-token-v1', JSON.stringify({ accessToken: 'a', expiresAt: Date.now() + 3600e3, clientId: EGET })]]);
  const { s } = rigg({ lagring, fetch: async () => ({ status: 403, ok: false,
    text: async () => 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' }) });
  const st = await s.status();
  assert.equal(st.connected, false);
  assert.match(st.fel, /din egen Spotify-app/);
  assert.match(st.fel, /User Management/);
});
