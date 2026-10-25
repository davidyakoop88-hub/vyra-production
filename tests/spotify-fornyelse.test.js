'use strict';
// SPOTIFY TAPPAR INTE KOPPLINGEN NÄR TOKENET FÖRNYAS (David 2026-10-24: "Spotify funkade en gång").
//
// Åtkomsttokenet lever en timme. Efter det ropade varje samtidigt anrop på förnyelsen med SAMMA
// refresh-token. Spotify byter refresh-token vid varje förnyelse, så det första lyckades och resten
// fick invalid_grant — och felgrenen raderade tokenet det första just sparat. Kopplingen var borta
// och alla !önska ignorerades tyst. Provet spelar upp det mot den riktiga spotify-client.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KOD = fs.readFileSync(path.join(__dirname, '..', 'spotify-client.js'), 'utf8');
const KEY = 'vyra-spotify-token-v1';

function spotify({ tokenSvar } = {}) {
  const anrop = [];
  let giltigtRefresh = 'r1', nr = 1;
  const lagring = new Map([[KEY, JSON.stringify({ accessToken: 'gammal', refreshToken: 'r1', expiresAt: Date.now() - 1000 })]]);
  const svar = (status, body) => ({ status, ok: status < 300, json: async () => body });
  const fetch = async (url, opt = {}) => {
    if (String(url).includes('accounts.spotify.com/api/token')) {
      anrop.push('TOKEN');
      await new Promise(r => setImmediate(r));
      if (tokenSvar) return tokenSvar();
      const rt = new URLSearchParams(String(opt.body)).get('refresh_token');
      if (rt !== giltigtRefresh) return svar(400, { error: 'invalid_grant', error_description: 'Invalid refresh token' });
      giltigtRefresh = 'r' + (++nr);
      return svar(200, { access_token: 'ny' + nr, refresh_token: giltigtRefresh, expires_in: 3600 });
    }
    anrop.push((opt.method || 'GET') + ' ' + String(url).replace('https://api.spotify.com/v1', ''));
    return svar(200, { item: { uri: 'spotify:track:1' } });
  };
  const window = { addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(KOD, {
    window, fetch, location: { hostname: 'vyralive.app', origin: 'https://vyralive.app', search: '' },
    localStorage: { getItem: k => lagring.get(k) ?? null, setItem: (k, v) => lagring.set(k, v), removeItem: k => lagring.delete(k) },
    BroadcastChannel: function () { return {}; }, CustomEvent: function () {}, URLSearchParams, TextEncoder,
    crypto: globalThis.crypto, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  });
  return { S: window.VyraSpotify, anrop, lagring };
}

test('samtidiga anrop efter en timme förnyar EN gång och behåller kopplingen', async () => {
  const { S, anrop, lagring } = spotify();
  await Promise.all([S.current(), S.current(), S.current()]);
  assert.equal(anrop.filter(a => a === 'TOKEN').length, 1, anrop.join('\n'));
  const token = JSON.parse(lagring.get(KEY) || 'null');
  assert.ok(token, 'tokenet raderades — Spotify kopplades ifrån');
  assert.equal(token.refreshToken, 'r2');
});

test('ett nätverksfel vid förnyelsen raderar inte tokenet', async () => {
  const { S, lagring } = spotify({ tokenSvar: () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(S.current(), /inte anslutet/);
  assert.ok(lagring.get(KEY), 'ett tillfälligt nätverksfel kopplade ifrån Spotify');
});

test('ett återkallat refresh-token (invalid_grant) kopplar ifrån', async () => {
  const { S, lagring } = spotify({ tokenSvar: () => ({ status: 400, ok: false, json: async () => ({ error: 'invalid_grant' }) }) });
  await assert.rejects(S.current(), /inte anslutet/);
  assert.equal(lagring.get(KEY), undefined);
});
