'use strict';
// SPOTIFY SÄGER VARFÖR (David 2026-10-21: "Spotify funkar inte"). status() slängde Spotifys svar och
// studion visade bara "Inte ansluten". Nu följer orsaken med, och Spotifys 403 för ett konto som inte
// lagts till i utvecklarappen blir en mening streamern kan göra något åt — inte "kräver Premium".
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function spotify(svarMe) {
  const lagring = new Map([['vyra-spotify-token-v1', JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600e3 })]]);
  const window = { addEventListener() {}, dispatchEvent() {} };
  const ctx = {
    window, location: { hostname: 'vyralive.app', origin: 'https://vyralive.app', search: '' },
    localStorage: { getItem: k => lagring.get(k) ?? null, setItem: (k, v) => lagring.set(k, v), removeItem: k => lagring.delete(k) },
    fetch: async () => svarMe, BroadcastChannel: function () { return {}; }, CustomEvent: function () {},
    URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  };
  vm.runInNewContext(las('spotify-client.js'), ctx);
  return window.VyraSpotify;
}
const svar = (status, body) => ({ status, ok: status < 300, json: async () => body });

test('ansluten: profilen kommer tillbaka', async () => {
  const s = await spotify(svar(200, { id: 'david', display_name: 'David' })).status();
  assert.equal(s.connected, true);
  assert.equal(s.profile.display_name, 'David');
});

test('konto som inte lagts till i Spotify-appen: en begriplig orsak, inte "kräver Premium"', async () => {
  const s = await spotify(svar(403, { error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } })).status();
  assert.equal(s.connected, false);
  assert.match(s.fel, /inte tillagt i VYRA:s Spotify-app/);
  assert.match(s.fel, /User Management/);
  assert.doesNotMatch(s.fel, /Premium/);
});

test('annat fel: Spotifys eget meddelande följer med', async () => {
  const s = await spotify(svar(500, { error: { message: 'Server error' } })).status();
  assert.equal(s.connected, false);
  assert.equal(s.fel, 'Server error');
});

test('studion visar orsaken bredvid Inte ansluten', () => {
  assert.match(las('extras.js'), /statusEl\.textContent='Inte ansluten'\+\(state\.fel\?' — '\+state\.fel:''\)/);
});
