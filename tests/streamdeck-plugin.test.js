'use strict';
// STREAM DECK-PLUGINET (streamdeck-plugin/se.vyra.live.sdPlugin) — manifestet, koden och
// inställningsrutan måste säga samma sak, annars blir en knapp tyst i Stream Deck-appen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const MAPP = path.join(__dirname, '..', 'streamdeck-plugin', 'se.vyra.live.sdPlugin');
const manifest = JSON.parse(fs.readFileSync(path.join(MAPP, 'manifest.json'), 'utf8'));
const plugin = fs.readFileSync(path.join(MAPP, 'plugin.js'), 'utf8');
const pi = fs.readFileSync(path.join(MAPP, 'pi.html'), 'utf8');
const klient = fs.readFileSync(path.join(__dirname, '..', 'streamdeck.js'), 'utf8');

test('varje knapp i manifestet har ett kommando i plugin.js och en ruta i pi.html', () => {
  for (const a of manifest.Actions) {
    assert.ok(pi.includes(`data-for="${a.UUID}"`), `${a.Name}: ingen ruta i pi.html`);
    if (a.UUID === 'se.vyra.live.knapp') continue;
    const m = plugin.match(new RegExp(`'${a.UUID.replace(/\./g, '\\.')}':\\s*'([a-z]+)'`));
    assert.ok(m, `${a.Name}: plugin.js vet inte vad knappen ska göra`);
    assert.match(klient, new RegExp(`\\b${m[1]}: \\{ dar:`), `${a.Name}: streamdeck.js har inget kommando "${m[1]}"`);
  }
});

test('0.1-knappen finns kvar med samma UUID, så gamla knappar på folks Stream Deck fungerar', () => {
  assert.ok(manifest.Actions.some(a => a.UUID === 'se.vyra.live.knapp'));
  assert.match(plugin, /type: 'knapp', eventKey: nyckel/);
});

test('varje bild manifestet pekar på finns, i båda storlekarna', () => {
  const bilder = [manifest.Icon, manifest.CategoryIcon];
  for (const a of manifest.Actions) bilder.push(a.Icon, ...a.States.map(s => s.Image));
  for (const b of new Set(bilder)) {
    assert.ok(fs.existsSync(path.join(MAPP, b + '.png')), `${b}.png saknas`);
    assert.ok(fs.existsSync(path.join(MAPP, b + '@2x.png')), `${b}@2x.png saknas`);
  }
});

test('varje tryck har en egen eventKey — local-server dedupar på den i 120 s', () => {
  assert.match(plugin, /eventKey: `sd:\$\{m\.context\}:\$\{Date\.now\(\)\}`/);
});
