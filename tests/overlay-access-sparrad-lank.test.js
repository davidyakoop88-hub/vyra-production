'use strict';
// EN SPÄRRAD OBS-LÄNK LÅG KVAR I KOPIERINGSFÄLTET (F10, 2026-10-18).
//
// overlay-access.js sparade bara `vyra-overlay-access-url` i sessionStorage när en länk skapades.
// Spärrknappen gjorde DELETE + refresh() och rörde aldrig nyckeln, så media.js overlayShareBase()
// fortsatte bygga varje länk på den döda nyckeln — även efter omladdning, eftersom sessionStorage
// överlever den. Streamern kunde klistra in en källa i OBS som servern redan nekar.
//
// Rättningen: tokenns id sparas bredvid URL:en, spärr med samma id rensar båda och skickar den
// befintliga händelsen med overlayUrl:null, och varje hämtning av listan stämmer av den sparade
// länken (revoked_at / saknas / utgången). En gammal URL utan id rensas bara när ingen aktiv
// nyckel finns kvar; annars märks statusen okänd — listan bär inget att jämföra råtoken med.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const URL_OK = 'https://vyralive.app/overlay.html?access=RAW123';
const BASE = '/api/workspaces/ws1/overlays/ov1/access-tokens';

const living = [];
test.after(() => { while (living.length) living.pop().window.close() });
const settle = () => new Promise(r => setTimeout(r, 0));

function studio({ tokens = [], sparad = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html', runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  if (sparad?.url) window.sessionStorage.setItem('vyra-overlay-access-url', sparad.url);
  if (sparad?.id) window.sessionStorage.setItem('vyra-overlay-access-id', sparad.id);
  const anrop = [], handelser = [];
  const lista = { tokens };
  window.addEventListener('vyra-overlay-access-created', e => handelser.push(e.detail));
  window.VyraCloudSync = { current: () => ({ workspace: { id: 'ws1' }, overlay: { id: 'ov1' } }), status: () => 'ready' };
  window.VyraAuth = {
    lastDetail: () => ({}),
    api: async (p, o = {}) => {
      anrop.push({ p, method: o.method || 'GET' });
      if (o.method === 'POST') {
        const t = { id: 'tok-ny', label: 'OBS huvuddator', created_at: '2026-10-18', expires_at: null };
        lista.tokens = [{ ...t, revoked_at: null }, ...lista.tokens];
        return { ok: true, token: t, accessToken: 'RAWNY', overlayUrl: 'https://vyralive.app/overlay.html?access=RAWNY' };
      }
      if (o.method === 'DELETE') {
        const id = p.split('/').pop();
        lista.tokens = lista.tokens.map(t => t.id === id ? { ...t, revoked_at: '2026-10-18T10:00:00Z' } : t);
        return { ok: true };
      }
      return { ok: true, tokens: lista.tokens };
    },
  };
  const script = window.document.createElement('script');
  script.textContent = read('overlay-access.js');
  window.document.body.append(script);
  // overlayShareBase() ur media.js, exakt som den står där.
  const fn = read('media.js').match(/function overlayShareBase\(\)\{[^\n]*?\}(?=\r?\nfunction overlayShareUrl)/);
  assert.ok(fn, 'overlayShareBase() hittades inte i media.js');
  window.eval(fn[0] + ';window.__base=overlayShareBase;');
  return { window, anrop, handelser, lista, base: () => window.__base() };
}

async function oppna(env) {
  // jsdom står i readyState "loading" när skriptet körs; mount() väntar på DOMContentLoaded.
  await settle(); await settle();
  await env.window.document.querySelector('.oa-open').onclick();
  await settle();
  return env.window.document.querySelector('.oa-modal');
}

test('Skapa länk sparar både URL och tokenns id', async () => {
  const env = studio();
  const modal = await oppna(env);
  await modal.querySelector('.oa-new').onclick(); await settle();
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), 'https://vyralive.app/overlay.html?access=RAWNY');
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-id'), 'tok-ny');
});

test('Spärra den sparade länken rensar sessionStorage och skickar händelsen med null', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: null, expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  const modal = await oppna(env);
  const knapp = modal.querySelector('[data-revoke="tok-a"]');
  assert.ok(knapp, 'spärrknappen renderades inte');
  env.handelser.length = 0;
  await knapp.onclick(); await settle();
  assert.deepEqual(env.anrop.filter(a => a.method === 'DELETE').map(a => a.p), [BASE + '/tok-a']);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), null);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-id'), null);
  assert.ok(env.handelser.some(d => d && d.overlayUrl === null), 'händelsen med overlayUrl:null skickades inte');
  const base = new URL(env.base());
  assert.equal(base.pathname, '/overlay.html');
  assert.equal(base.searchParams.has('access'), false, 'kopieringsfältets bas bär fortfarande den spärrade nyckeln');
});

test('Spärra en ANNAN länk lämnar den sparade orörd', async () => {
  const env = studio({ tokens: [
    { id: 'tok-a', label: 'A', revoked_at: null, expires_at: null },
    { id: 'tok-b', label: 'B', revoked_at: null, expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  const modal = await oppna(env);
  await modal.querySelector('[data-revoke="tok-b"]').onclick(); await settle();
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), URL_OK);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-id'), 'tok-a');
});

test('refresh: sparat id med revoked_at (spärrad i annan flik) rensas', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: '2026-10-18T09:00:00Z', expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  await oppna(env);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), null);
  assert.ok(env.handelser.some(d => d && d.overlayUrl === null));
});

test('refresh: sparat id som saknas i listan rensas', async () => {
  const env = studio({ tokens: [{ id: 'tok-z', label: 'OBS', revoked_at: null, expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  await oppna(env);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), null);
});

test('sidladdning: avstämningen körs utan att hanteraren öppnas', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: '2026-10-18T09:00:00Z', expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  await settle(); await settle();
  assert.deepEqual(env.anrop.map(a => [a.p, a.method]), [[BASE, 'GET']]);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), null);
  assert.equal(env.window.document.querySelector('.oa-modal'), null, 'hanteraren ska inte öppnas av sig själv');
});

test('sidladdning: giltig sparad länk står kvar', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: null, expires_at: null }], sparad: { url: URL_OK, id: 'tok-a' } });
  await settle(); await settle();
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), URL_OK);
  assert.equal(env.handelser.length, 0);
});

test('gammal URL utan id: rensas när ingen aktiv nyckel finns kvar', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: '2026-10-18T09:00:00Z', expires_at: null }], sparad: { url: URL_OK } });
  await settle(); await settle();
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), null);
});

test('gammal URL utan id: med aktiva nycklar står den kvar men märks okänd', async () => {
  const env = studio({ tokens: [{ id: 'tok-a', label: 'OBS', revoked_at: null, expires_at: null }], sparad: { url: URL_OK } });
  const modal = await oppna(env);
  assert.equal(env.window.sessionStorage.getItem('vyra-overlay-access-url'), URL_OK);
  assert.equal(modal.querySelector('.oa-status').textContent, 'Okänd status – skapa ny länk om OBS nekas');
});

test('cachebustarna höjdes med filerna', () => {
  const html = read('studio.html');
  const js = (html.match(/overlay-access\.js\?v=([^"]+)"/) || [])[1];
  const css = (html.match(/overlay-access\.css\?v=([^"]+)"/) || [])[1];
  assert.notEqual(js, '20261017-epost');
  assert.notEqual(css, '20260724-1');
  for (const v of [js, css]) assert.match(v, /^\d{8}-\d+$/, 'cachebusten ska vara datum-siffra: ' + v);
});
