'use strict';
// KODSKYDD (David 2026-11-17: "Har vi sånt i våra kod?"). Konkurrenterna säger uttryckligen nej till
// AI-assisterad kopiering: BetterTok med en copyright-text i koden, TikOverlay med ett licensdokument,
// TTLive genom att spärra AI-robotar i robots.txt. VYRA hade bara användarvillkoren och "private" i
// package.json. Det här provet ser till att de tre skydden finns kvar.
//
// Inget av det stoppar tekniskt någon som läser koden i webbläsaren. Det gör förbudet tydligt, och
// seriösa AI-verktyg och robotar följer det.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('LICENSE är proprietär och förbjuder AI-kopiering och AI-träning', () => {
  const lic = las('LICENSE');
  assert.match(lic, /Alla rättigheter förbehållna/);
  assert.match(lic, /All rights reserved/);
  assert.match(lic, /inte öppen källkod/);
  assert.match(lic, /AI-verktyg/, 'förbud mot återskapande med AI-verktyg');
  assert.match(lic, /träna, finjustera/, 'förbud mot AI-träning');
});

test('alla fyra paket pekar på LICENSE', () => {
  for (const f of ['package.json', 'server/package.json', 'tiktok-bridge/package.json', 'electron-app/package.json']) {
    const pkg = JSON.parse(las(f));
    assert.equal(pkg.license, 'SEE LICENSE IN LICENSE', f);
    assert.equal(pkg.private, true, f);
  }
});

test('ingångsfilerna bär copyright-huvudet', () => {
  for (const f of ['studio.html', 'index.html', 'media.js', 'server/index.js', 'tiktok-bridge/bridge.js', 'electron-app/main.js']) {
    const topp = las(f).slice(0, 800);
    assert.match(topp, /Copyright © 2026 VYRA/, f);
    assert.match(topp, /se LICENSE/, f);
  }
  // Huvudet får inte flytta doctype: utan den hamnar sidan i quirks mode.
  for (const f of ['studio.html', 'index.html']) assert.ok(las(f).startsWith('<!doctype html>'), f);
  // 'use strict' måste stå först bland satserna; en kommentar före är tillåten.
  assert.match(las('server/index.js'), /^\/\*![\s\S]*?\*\/\r?\n'use strict';/);
});

test('robots.txt spärrar AI-träningsrobotar men släpper in sök och AI-sök', () => {
  const r = las('robots.txt');
  const grupper = r.split(/\r?\n\s*\r?\n/).map(g => g.split(/\r?\n/).filter(l => l && !l.startsWith('#')));
  const gruppFor = bot => grupper.find(g => g.some(l => l.toLowerCase() === ('user-agent: ' + bot).toLowerCase()));
  for (const bot of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'meta-externalagent']) {
    const g = gruppFor(bot);
    assert.ok(g, bot + ' saknas');
    assert.ok(g.includes('Disallow: /'), bot + ' ska spärras helt');
  }
  // Sökrobotar och AI-sökrobotar får inte råka hamna i spärrgruppen.
  for (const bot of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'])
    assert.equal(gruppFor(bot), undefined, bot + ' ska följa de vanliga reglerna');
  const alla = gruppFor('*');
  assert.ok(alla.includes('Allow: /'));
  assert.ok(alla.includes('Disallow: /studio.html'));
  assert.match(r, /Sitemap: https:\/\/vyralive\.app\/sitemap\.xml/);
});
