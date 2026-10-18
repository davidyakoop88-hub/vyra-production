'use strict';
// SKARPA BILDER I SÄNDNINGEN (David 2026-10-11: "mina widget ser suddiga i tiktok").
//
// UPPMÄTT: 18 046 av 18 147 sparade avatarer är 72×72 px — TikTok skickar `~tplv-tiktok-shrink:72:72`
// med varje gåvo- och like-event, och URL:en är signerad (720/1080 ger 403). Gåvobilden kommer som
// `~tplv-obj.webp` = 168×168, men CDN:en svarar 200 på `~tplv-resize:512:512.webp` utan signatur.
// Text, ramar och konstverk var skarpa i 1080×1920 — det var fotona.
//
// Två delar: (1) gåvobilden skrivs om till 512 px i normalizeCloudFields; (2) vyra-stor-avatar.js slår
// upp profilsidans 1080 px-avatar via /api/tiktok-profile för de personer som syns, gåvogivare
// först, och byter bilden i DOM, state och modulernas register.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CF = require('../cloud-fields.js');

const LITEN = 'https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/31ed7e~tplv-tiktok-shrink:72:72.webp?x-expires=1&x-signature=a';
const STOR = 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-avt-0068/31ed7e~tplv-tiktokx-cropcenter:1080:1080.jpeg?x-expires=2&x-signature=b';

test('gåvobilden skrivs om till 512 px, bara på TikToks CDN och bara uppåt', () => {
  const obj = 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/968820bc~tplv-obj.webp';
  assert.equal(CF.storGavobild(obj), 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/968820bc~tplv-resize:512:512.webp');
  assert.equal(CF.storGavobild('https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/composed.708d.png~tplv-resize:258:258.webp'),
    'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/composed.708d.png~tplv-resize:512:512.webp');
  const stor = 'https://p16-webcast.tiktokcdn.com/img/x~tplv-resize:1024:1024.webp';
  assert.equal(CF.storGavobild(stor), stor, 'redan stor rörs inte');
  assert.equal(CF.storGavobild('assets/gifts/events/0001_Rose.png'), 'assets/gifts/events/0001_Rose.png', 'lokala bilder rörs inte');
  assert.equal(CF.storGavobild('https://evil.example/x~tplv-obj.webp'), 'https://evil.example/x~tplv-obj.webp', 'andra värdar rörs inte');
  assert.equal(CF.storGavobild(''), '');
  const e = { type: 'gift', giftImage: obj };
  CF.normalizeCloudFields(e);
  assert.match(e.giftImage, /~tplv-resize:512:512\.webp$/, 'normalizeCloudFields skriver om giftImage');
});

function rigg() {
  const dom = new JSDOM('<!doctype html><body><div class="widget" data-id="g1"><img src="' + LITEN + '"><div class="av" style="background:url(\'' + LITEN + '\') center/cover"></div></div></body>',
    { url: 'http://localhost/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  const anrop = [];
  w.fetch = async url => { anrop.push(url); return { ok: true, json: async () => ({ ok: true, username: 'anna_01', avatar: STOR }) }; };
  w.eval(`var state={widgets:[{id:'g1',type:'templateTopGift',profileImage:${JSON.stringify(LITEN)}}]},sparat=0,save=()=>{sparat++};`);
  w.eval(las('vyra-stor-avatar.js'));
  w.VyraStorAvatar._konfig({ gap: 0 });
  return { w, anrop };
}
const vanta = ms => new Promise(r => setTimeout(r, ms));

test('en gåva med 72 px-avatar slås upp och bilden byts i DOM, state och register', async () => {
  const { w, anrop } = rigg();
  const handelser = [];
  w.addEventListener('vyra-stor-avatar', e => handelser.push(e.detail));
  const e = { type: 'gift', username: 'anna_01', profileImage: LITEN };
  w.VyraStorAvatar.forbattra(e);
  assert.equal(e.profileImage, LITEN, 'första eventet ändras inte — den stora är inte känd än');
  await vanta(30);
  assert.deepEqual(anrop, ['/api/tiktok-profile?username=anna_01']);
  assert.equal(w.document.querySelector('img').getAttribute('src'), STOR, 'img byttes');
  assert.ok(w.document.querySelector('.av').style.backgroundImage.includes(STOR), 'background-image byttes');
  assert.equal(w.eval('state').widgets[0].profileImage, STOR, 'state byttes');
  // Bilden är livedata: state ändras i minnet, ingen save() (2026-10-18, ingen omritning per byte).
  assert.equal(w.eval('sparat'), 0, 'bildbytet sparade layouten');
  assert.equal(JSON.stringify(handelser), JSON.stringify([{ username: 'anna_01', liten: LITEN, stor: STOR }]));
  // Nästa event från samma person får den stora direkt, utan nytt uppslag.
  const e2 = { type: 'like', username: 'anna_01', profileImage: LITEN, avatar: LITEN };
  w.VyraStorAvatar.forbattra(e2);
  assert.equal(e2.profileImage, STOR); assert.equal(e2.avatar, STOR);
  await vanta(20);
  assert.equal(anrop.length, 1, 'inget andra uppslag');
});

test('gåvogivare slås upp före likare, testevent aldrig, ogiltiga namn aldrig, stora bilder aldrig', async () => {
  const { w, anrop } = rigg();
  w.VyraStorAvatar._konfig({ gap: 5 });
  w.VyraStorAvatar.forbattra({ type: 'like', username: 'likare_1', profileImage: LITEN });
  w.VyraStorAvatar.forbattra({ type: 'like', username: 'likare_2', profileImage: LITEN });
  w.VyraStorAvatar.forbattra({ type: 'gift', username: 'givare_1', profileImage: LITEN });
  w.VyraStorAvatar.forbattra({ type: 'gift', username: 'Lina', profileImage: LITEN, __test: true });
  w.VyraStorAvatar.forbattra({ type: 'gift', username: 'bad name!', profileImage: LITEN });
  w.VyraStorAvatar.forbattra({ type: 'gift', username: 'redan_stor', profileImage: STOR });
  await vanta(120);
  // Första uppslaget startar i nästa makrotask, så gåvan som kom efter likarna går ändå först.
  assert.deepEqual(anrop.map(u => u.split('=')[1]), ['givare_1', 'likare_1', 'likare_2']);
});

test('ett misslyckat uppslag försöks inte igen, och eventet lämnas som det är', async () => {
  const { w, anrop } = rigg();
  w.fetch = async url => { anrop.push(url); return { ok: false }; };
  const e = { type: 'gift', username: 'okand_1', profileImage: LITEN };
  w.VyraStorAvatar.forbattra(e);
  await vanta(30);
  w.VyraStorAvatar.forbattra({ type: 'gift', username: 'okand_1', profileImage: LITEN });
  await vanta(30);
  assert.equal(anrop.length, 1);
  assert.equal(e.profileImage, LITEN);
  assert.equal(w.document.querySelector('img').getAttribute('src'), LITEN);
});

test('kopplingarna finns: ingest anropar modulen, registren lyssnar, loader och busts', () => {
  assert.match(las('live-client.js'), /normalizeUserFlags\(e\);\r?\n[\s\S]{0,400}if\(window\.VyraStorAvatar\)window\.VyraStorAvatar\.forbattra\(e\);/);
  assert.match(las('live-leaderboard.js'), /addEventListener\('vyra-stor-avatar'/);
  assert.match(las('playground-widgets.js'), /addEventListener\('vyra-stor-avatar'/);
  const media = las('media.js');
  assert.match(media, /setAttribute\('src','vyra-stor-avatar\.js\?v=20261018-1'\)/);
  assert.match(media, /cloud-fields\.js\?v=20261011-1/);
  assert.match(media, /live-client\.js\?v=20261017-p1granskning/);
  assert.match(media, /live-leaderboard\.js\?v=20261018-1/);
  assert.match(media, /playground-widgets\.js\?v=20261017-katalog3/);
  assert.match(las('studio.html'), /media\.js\?v=20261018-4/);
  assert.ok(JSON.stringify(JSON.parse(las('.claude/domaner.json'))).includes('"vyra-stor-avatar.js"'));
});
