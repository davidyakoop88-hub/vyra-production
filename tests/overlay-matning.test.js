'use strict';
// OBS-källan mäter sig själv (overlay-matning.js). Det som provas här är den rena räknaren: när en
// minut blir en varning, när den är tyst, och att en rad aldrig bär annat än tal och filnamn.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const M = require('../overlay-matning.js');
const KALLA = fs.readFileSync(path.join(__dirname, '..', 'overlay-matning.js'), 'utf8');

const minut = (m, { lag = 5, rutorPerS = 60, handelser = 300, upptagenMs = 0 } = {}) => {
  for (let i = 0; i < 60; i++) m.slag(Array.isArray(lag) ? lag[i % lag.length] : lag);
  for (let i = 0; i < rutorPerS * 60; i++) m.ruta();
  for (let i = 0; i < handelser; i++) m.handelse();
  m.upptagen(upptagenMs);
  return m.fonster(60);
};

test('första minuten ger en lugn inforad, sedan tyst tills var femte minut', () => {
  const m = M.skapaMatare();
  const forsta = minut(m);
  assert.equal(forsta.niva, 'info');
  assert.match(forsta.text, /OBS-källan mår bra/);
  assert.equal(minut(m), null);
  assert.equal(minut(m), null);
  assert.equal(minut(m), null);
  assert.equal(minut(m), null);
  assert.equal(minut(m).niva, 'info', 'var femte minut ska en rad komma');
});

test('en klocka som slår sent blir en varning med hur sent', () => {
  const m = M.skapaMatare();
  const r = minut(m, { lag: [10, 20, 3200, 15], handelser: 412, upptagenMs: 36600 });
  assert.equal(r.niva, 'varning');
  assert.match(r.text, /OBS-källan släpar: tidtagningen låg upp till 3,2 s efter/);
  assert.match(r.text, /412 händelser/);
  assert.equal(r.data.lagMaxMs, 3200);
  assert.equal(r.data.upptagenProcent, 61);
});

test('få bildrutor blir en varning — men inte när källan var dold i OBS', () => {
  const m = M.skapaMatare();
  const r = minut(m, { rutorPerS: 9 });
  assert.equal(r.niva, 'varning');
  assert.match(r.text, /bara 9 bildrutor\/s/);
  m.varDold();
  const dold = minut(m, { rutorPerS: 0 });
  assert.ok(dold === null || dold.niva === 'info', 'en dold källa ritar inga bildrutor, det är inte ett fel');
});

test('varje fönster börjar om från noll', () => {
  const m = M.skapaMatare();
  minut(m, { lag: [5000] });
  const nasta = minut(m);
  assert.ok(nasta === null || nasta.niva === 'info', 'förra minutens släp följde med in i nästa');
});

test('lagringsraden varnar först när en lista är stor', () => {
  const liten = M.lagringsrad({ poang: 75 * 1024, topplista: 237 * 1024, allt: 500 * 1024 });
  assert.equal(liten.niva, 'info');
  assert.match(liten.text, /poänglistan 75 kB, dagens topplista 237 kB, allt 500 kB/);
  const stor = M.lagringsrad({ poang: 1300 * 1024, topplista: 10, allt: 1400 * 1024 });
  assert.equal(stor.niva, 'varning');
  assert.equal(stor.data.poangKb, 1300);
});

test('filnamnet bär värd och fil, aldrig frågesträngen', () => {
  assert.equal(M.filnamn('https://v16.tiktokcdn.com/a/b/gava.mp4?x-signature=hemlig&uid=123'), 'v16.tiktokcdn.com/…/gava.mp4');
  assert.equal(M.filnamn('assets/chattavatar/vyra-avatar-flow-dance2.webm'), 'vyra-avatar-flow-dance2.webm');
});

test('filen gör ingenting utanför en riktig OBS-länk, och läser aldrig ur händelserna', () => {
  assert.ok(KALLA.includes("if (!params.has('overlay') || !access) return;"));
  assert.doesNotMatch(KALLA, /username|nickname|uniqueId|\.detail\b/, 'mätraden får inte läsa ur händelserna');
  assert.ok(KALLA.includes('/api/overlay-access/${encodeURIComponent(access)}/matning'));
});

test('studio.html laddar mätfilen efter overlay-access.js, och domänkartan äger den', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'studio.html'), 'utf8');
  assert.ok(html.indexOf('overlay-access.js?v=') > 0);
  assert.ok(html.indexOf('overlay-access.js?v=') < html.indexOf('overlay-matning.js?v='));
  const karta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude', 'domaner.json'), 'utf8'));
  const lista = Array.isArray(karta) ? karta : (karta.domaner || []);
  const d = lista.find(x => x.id === 'overlay');
  assert.ok(d && d.filer.includes('overlay-matning.js'));
});
