'use strict';
// SPOTIFY SPELAR ÄVEN NÄR INGEN ENHET ÄR AKTIV (uppmätt i Davids studio 2026-10-21).
// Spotify-appen öppen på datorn ("JOKERO", is_active: false), Premium, ansluten — men varje
// spelarkommando svarade 404 "Player command failed: No active device found". Med device_id angivet
// spelade samma anrop direkt. Provet spelar upp exakt den sekvensen mot spotify-client.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KOD = fs.readFileSync(path.join(__dirname, '..', 'spotify-client.js'), 'utf8');

function spotify(enheter) {
  const anrop = [];
  const lagring = new Map([['vyra-spotify-token-v1', JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600e3 })]]);
  const svar = (status, body) => ({ status, ok: status < 300, json: async () => body });
  const fetch = async (url, opt = {}) => {
    const u = String(url).replace('https://api.spotify.com/v1', '');
    anrop.push((opt.method || 'GET') + ' ' + u);
    if (u.startsWith('/search')) return svar(200, { tracks: { items: [{ uri: 'spotify:track:1', name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], album: { images: [] }, duration_ms: 200000 }] } });
    if (u === '/me/player/devices') return svar(200, { devices: enheter });
    if (u.startsWith('/me/player/') && !u.includes('device_id=')) return svar(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } });
    if (u.startsWith('/me/player/')) return svar(u.startsWith('/me/player/play') ? 204 : 200, {});
    return svar(404, {});
  };
  const window = { addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(KOD, {
    window, fetch, location: { hostname: 'vyralive.app', origin: 'https://vyralive.app', search: '' },
    localStorage: { getItem: k => lagring.get(k) ?? null, setItem: (k, v) => lagring.set(k, v), removeItem: k => lagring.delete(k) },
    BroadcastChannel: function () { return {}; }, CustomEvent: function () {}, URLSearchParams, TextEncoder,
    crypto: globalThis.crypto, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  });
  return { S: window.VyraSpotify, anrop };
}

const DATORN = { id: 'dator1', name: 'JOKERO', type: 'Computer', is_active: false, is_restricted: false };
const MOBILEN = { id: 'mobil1', name: 'iPhone', type: 'Smartphone', is_active: false, is_restricted: false };

test('play: ingen aktiv enhet → datorn väljs och låten spelar', async () => {
  const { S, anrop } = spotify([MOBILEN, DATORN]);
  assert.equal(await S.play('Blinding Lights'), 'spotify:track:1');
  assert.ok(anrop.includes('PUT /me/player/play?device_id=dator1'), anrop.join('\n'));
});

test('queue och next går samma väg', async () => {
  const { S, anrop } = spotify([DATORN]);
  await S.queue('Blinding Lights');
  await S.next();
  assert.ok(anrop.includes('POST /me/player/queue?uri=spotify%3Atrack%3A1&device_id=dator1'), anrop.join('\n'));
  assert.ok(anrop.includes('POST /me/player/next?device_id=dator1'), anrop.join('\n'));
});

test('en aktiv enhet går före datorn', async () => {
  const { S, anrop } = spotify([DATORN, { ...MOBILEN, is_active: true }]);
  await S.next();
  assert.ok(anrop.includes('POST /me/player/next?device_id=mobil1'));
});

test('ingen enhet alls: felet säger vad streamern ska göra', async () => {
  const { S } = spotify([]);
  await assert.rejects(S.play('Blinding Lights'), /Öppna Spotify på datorn eller mobilen/);
});
