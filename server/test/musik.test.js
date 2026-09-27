'use strict';
// Låtönskningarnas YouTube-sökning (server/musik.js) — utan nätverk, med injicerad fetch.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createMusik, sekunderAv } = require('../musik.js');

function falskFetch(svar) {
  const anrop = [];
  const f = async (url) => {
    anrop.push(url);
    if (url.includes('/search?')) return svar.sok;
    if (url.includes('/videos?')) return svar.video;
    throw new Error('okänd url');
  };
  f.anrop = anrop;
  return f;
}
const ok = body => ({ ok: true, status: 200, json: async () => body });
const SOK = ok({ items: [{ id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Never Gonna &amp; Give', channelTitle: 'Rick', thumbnails: { medium: { url: 'https://i.ytimg.com/x.jpg' } } } }] });
const VIDEO = ok({ items: [{ contentDetails: { duration: 'PT3M33S' } }] });

test('sökningen ger videoId, titel, kanal, bild och längd — aldrig nyckeln', async () => {
  const f = falskFetch({ sok: SOK, video: VIDEO });
  const m = createMusik({ fetch: f, apiKey: 'HEMLIG' });
  const svar = await m.sokYoutube('never gonna give you up');
  assert.deepEqual(svar, { videoId: 'dQw4w9WgXcQ', titel: 'Never Gonna & Give', kanal: 'Rick', bild: 'https://i.ytimg.com/x.jpg', sekunder: 213 });
  assert.ok(!JSON.stringify(svar).includes('HEMLIG'), 'nyckeln läcker i svaret');
  assert.match(f.anrop[0], /videoEmbeddable=true/, 'en video som inte får bäddas in kan inte spelas på overlayn');
});

test('samma låt två gånger kostar bara en sökning', async () => {
  const f = falskFetch({ sok: SOK, video: VIDEO });
  const m = createMusik({ fetch: f, apiKey: 'k' });
  await m.sokYoutube('Låt A'); await m.sokYoutube('låt a');
  assert.equal(f.anrop.filter(u => u.includes('/search?')).length, 1);
});

test('utan nyckel: 503 med ett begripligt fel, och inget anrop mot YouTube', async () => {
  const f = falskFetch({});
  const m = createMusik({ fetch: f, apiKey: '' });
  await assert.rejects(m.sokYoutube('låt'), e => e.status === 503 && /YOUTUBE_API_KEY/.test(e.message));
  assert.equal(f.anrop.length, 0);
});

test('kvoten slut (403) blir 503, och felmeddelandet bär inte nyckeln', async () => {
  const f = falskFetch({ sok: { ok: false, status: 403, json: async () => ({}) } });
  const m = createMusik({ fetch: f, apiKey: 'HEMLIG' });
  await assert.rejects(m.sokYoutube('låt'), e => e.status === 503 && !e.message.includes('HEMLIG'));
});

test('ingen träff ger null, en för kort fråga ger 400', async () => {
  const m = createMusik({ fetch: falskFetch({ sok: ok({ items: [] }) }), apiKey: 'k' });
  assert.equal(await m.sokYoutube('asdfqwer'), null);
  await assert.rejects(m.sokYoutube(' a '), e => e.status === 400);
});

test('ISO-längder', () => {
  assert.equal(sekunderAv('PT3M33S'), 213);
  assert.equal(sekunderAv('PT1H2M'), 3720);
  assert.equal(sekunderAv('P1D'), 0);
});

test('rutterna finns både för OBS-länken och för studion, med takt', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(index, /rest==='musik\/youtube'/);
  assert.match(index, /\\\/musik\\\/youtube\$\/i\)/);
  assert.match(index, /musik-youtube:\$\{access\.workspace_id\}/);
  assert.ok(!/YOUTUBE_API_KEY/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'studio.html'), 'utf8')));
});
