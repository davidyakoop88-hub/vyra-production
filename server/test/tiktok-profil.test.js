'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createTikTokProfil } = require('../tiktok-profil.js');

// Canned TikTok-HTML — det inbaddade JSON-blocket profilsidan bar.
function htmlMed(nickname, avatar) {
  const data = { __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { nickname, avatarLarger: avatar } } } } };
  return '<!doctype html><html><head></head><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
    + JSON.stringify(data) + '</script></body></html>';
}
// En sida utan anvandardata (obefintlig/privat) — TikTok svarar 200 men utan user.
const HTML_TOM = '<!doctype html><html><head></head><body>nada</body></html>';

// Fake fetch: mappar @namn -> {status, html}. Raknar anrop sa vi kan bevisa cachen.
function fakeFetch(map) {
  const anrop = [];
  const f = async (url) => {
    anrop.push(url);
    const key = Object.keys(map).find(k => url.includes('@' + k));
    if (!key) return { ok: false, status: 404, text: async () => '' };
    const v = map[key], status = v.status || 200;
    return { ok: status >= 200 && status < 300, status, text: async () => v.html || '' };
  };
  f.anrop = anrop;
  return f;
}

test('giltig anvandare ger namn + avatar', async () => {
  const tp = createTikTokProfil({ fetch: fakeFetch({ nova: { html: htmlMed('• Nova Storm ♛', 'https://p16.tiktokcdn.com/nova.jpg') } }) });
  const d = await tp.hamta('@nova');
  assert.equal(d.nickname, '• Nova Storm ♛');
  assert.equal(d.avatar, 'https://p16.tiktokcdn.com/nova.jpg');
  assert.equal(d.username, 'nova');
});

test('samma profil tva ganger slar bara upp en gang (cache)', async () => {
  const ff = fakeFetch({ nova: { html: htmlMed('Nova', 'https://x/y.jpg') } });
  const tp = createTikTokProfil({ fetch: ff });
  const a = await tp.hamta('nova'); assert.equal(a.cached, false);
  const b = await tp.hamta('@NOVA'); assert.equal(b.cached, true);   // skiftlagesokanslig nyckel
  assert.equal(ff.anrop.length, 1, 'bara ett natverksanrop');
});

test('saknat anvandarnamn kastar 400', async () => {
  const tp = createTikTokProfil({ fetch: fakeFetch({}) });
  await assert.rejects(() => tp.hamta(''), e => e.status === 400);
  await assert.rejects(() => tp.hamta('   '), e => e.status === 400);
});

test('ogiltiga tecken kastar 400 (skydd mot url-injektion)', async () => {
  const tp = createTikTokProfil({ fetch: fakeFetch({}) });
  for (const bad of ['bad name', 'a', 'x'.repeat(25), '../etc', 'no/slash', 'ä']) {
    await assert.rejects(() => tp.hamta(bad), e => e.status === 400, bad + ' borde ge 400');
  }
});

test('upstream 404 ger 404', async () => {
  const tp = createTikTokProfil({ fetch: fakeFetch({ borta: { status: 404 } }) });
  await assert.rejects(() => tp.hamta('borta'), e => e.status === 404);
});

test('sida utan profil (ingen avatar) ger 404, inte ett tomt kort', async () => {
  const tp = createTikTokProfil({ fetch: fakeFetch({ ingenprofil: { html: HTML_TOM } }) });
  await assert.rejects(() => tp.hamta('ingenprofil'), e => e.status === 404);
});

test('natverksfel lacker inte upstream-detaljer (503)', async () => {
  const tp = createTikTokProfil({ fetch: async () => { throw new Error('ECONNRESET hemlig intern grej'); } });
  await assert.rejects(() => tp.hamta('nova'), e => e.status === 503 && !/ECONNRESET/.test(e.message));
});

// Kallvakt: routen och rate-limit-nyckeln finns kvar i index.js (som server/test/musik.test.js).
test('index.js exponerar /api/tiktok-profile med rate-limit', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(src, /p==='\/api\/tiktok-profile'&&req\.method==='GET'/, 'routen saknas');
  assert.match(src, /tiktok-profile:'\+S\.klientadress\(req\)/, 'rate-limit-nyckel saknas');
  assert.match(src, /TIKTOK_PROFILE_RATE_LIMIT/, 'rate-limit-konstant saknas');
});
