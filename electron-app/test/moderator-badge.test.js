'use strict';
// Moderatorn känns igen på badgen sceneType 1 även när chattmeddelandet saknar userIdentity
// (sändningen 2026-11-16: en moderators `!s …` till Chattavataren gav ingenting). Desktopvägen
// (tiktok-fields.js) och molnvägen (tiktok-bridge/normalizer.js) ska svara likadant.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../tiktok-fields.js');
const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));

const fall = [
  { namn: 'bara badge', data: { user: { uniqueId: 'm', badgeList: [{ sceneType: 1 }] } }, mod: true },
  { namn: 'badge som sträng', data: { user: { uniqueId: 'm', badgeList: [{ sceneType: '1' }] } }, mod: true },
  { namn: 'bara userIdentity', data: { user: { uniqueId: 'm' }, userIdentity: { isModeratorOfAnchor: true } }, mod: true },
  { namn: 'userIdentity nej men badge', data: { user: { uniqueId: 'm', badgeList: [{ sceneType: 1 }] }, userIdentity: { isModeratorOfAnchor: false } }, mod: true },
  { namn: 'andra badgar', data: { user: { uniqueId: 't', badgeList: [{ sceneType: 10 }, { sceneType: 8 }, { sceneType: 6 }, { sceneType: 16 }] } }, mod: false },
  { namn: 'inget alls', data: { user: { uniqueId: 't' } }, mod: false }
];

for (const f of fall) {
  test(`moderator — ${f.namn}: desktop och molnet svarar ${f.mod}`, () => {
    assert.equal(D.identityOf(f.data).isModerator, f.mod, 'desktop (tiktok-fields.js)');
    assert.equal(N.identityOf(f.data).isModerator, f.mod, 'molnet (normalizer.js)');
  });
}
