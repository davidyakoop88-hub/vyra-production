const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('landing-events.js', 'utf8');
const data = fs.readFileSync('tiktok-events-data.js', 'utf8');

test('front page loads the weekly TikTok event module with fresh versions', () => {
  assert.match(html, /data-tiktok-events/);
  assert.match(html, /tiktok-events-data\.js\?v=20260920-1/);
  assert.match(html, /landing-events\.js\?v=20260920-1/);
  assert.match(html, /landing-events\.css\?v=20260920-1/);
});

test('event module supports tasks, boosted gifts, bonus windows and countdown', () => {
  assert.match(js, /event\.tasks/);
  assert.match(js, /event\.boostedGifts/);
  assert.match(js, /event\.bonusWindows/);
  assert.match(js, /data-event-countdown/);
  assert.match(js, /Europe\/Stockholm/);
});

test('unverified TikTok details are never invented', () => {
  assert.match(data, /events: Object\.freeze\(\[\]\)/);
  assert.match(js, /inga obekräftade gifts, multiplikatorer eller bonustider/i);
  assert.match(js, /Kontrollera att eventet är tillgängligt på ditt TikTok-konto/);
});
