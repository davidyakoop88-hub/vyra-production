'use strict';
// "VÄNTA TILLS CLOUD-SYNKEN ÄR ANSLUTEN" — TILL EN SOM ALDRIG KAN ANSLUTA (2026-10-17).
//
// En OBS-länk kräver en overlay-rad i molnet (POST /overlays) och en åtkomstnyckel
// (POST .../access-tokens). Båda stoppas med 403 {emailVerificationRequired} av server/index.js
// så länge kontots e-post är overifierad. cloud-sync.js sätter då status 'verifiering' och har
// ingen overlay.
//
// FÖRE: openManager() såg bara "ingen overlay" och visade toasten "Vänta tills cloud-synken är
// ansluten" — som försvann efter 1,7 s och skrevs över direkt av media.js "Skapa en säker länk
// först". Att vänta hjälper inte. Det som hjälper är att verifiera e-posten, och det sades inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'overlay-access.js'), 'utf8');

function element(tag) {
  const el = { tagName: tag, className: '', hidden: false, textContent: '', onclick: null, children: [], html: '',
    style: {}, dataset: {}, disabled: false,
    append(c) { el.children.push(c) }, remove() { el.removed = true },
    querySelectorAll: () => [],
    querySelector(sel) { return el.parts && el.parts[sel] || null } };
  Object.defineProperty(el, 'innerHTML', { get: () => el.html, set: v => {
    el.html = String(v);
    // Knappar och resultatfält i innehållet görs adresserbara för provet.
    el.parts = {};
    for (const m of el.html.matchAll(/class="([^"]+)"/g)) for (const k of m[1].split(' ')) el.parts['.' + k] = element('x');
  } });
  return el;
}

function makeEnv({ status, overlay = null, user = { email: 'ny@exempel.se', emailVerified: false } }) {
  const body = element('body');
  const toasts = [], anrop = [];
  const sandbox = {
    console, URLSearchParams, JSON, Object, Array, String, Promise, Error, Date,
    location: { search: '' },
    document: {
      readyState: 'complete',
      body,
      createElement: element,
      querySelector: sel => {
        const klass = sel.replace(/^\./, '').split(':')[0];
        const not = (sel.match(/:not\(\.([^)]+)\)/) || [])[1];
        return body.children.find(c => !c.removed && c.className.split(' ').includes(klass) && !(not && c.className.split(' ').includes(not))) || null;
      },
      querySelectorAll: () => [],
    },
    addEventListener: () => {},
    toast: t => toasts.push(t),
    VyraCloudSync: { current: () => ({ workspace: { id: 'ws1' }, overlay }), status: () => status },
    VyraAuth: { lastDetail: () => ({ user }), api: async (p, o) => { anrop.push({ p, o }); return { ok: true } } },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'overlay-access.js' });
  const knapp = body.children.find(c => c.className === 'oa-open');
  return { body, toasts, anrop, knapp };
}
const settle = () => new Promise(r => setImmediate(r));

test('overifierad e-post: ingen "Vänta tills cloud-synken är ansluten"', async () => {
  const env = makeEnv({ status: 'verifiering' });
  await env.knapp.onclick();
  assert.ok(!env.toasts.some(t => /Vänta tills cloud-synken/.test(t)), `toasts: ${JSON.stringify(env.toasts)}`);
});

test('overifierad e-post: en kvarstående ruta säger varför och vad som hjälper', async () => {
  const env = makeEnv({ status: 'verifiering' });
  await env.knapp.onclick();
  const ruta = env.body.children.find(c => /oa-epostkrav/.test(c.className));
  assert.ok(ruta, 'en ruta ska öppnas, inte en toast som försvinner');
  assert.match(ruta.innerHTML, /[Vv]erifiera din e-post/);
  assert.match(ruta.innerHTML, /ny@exempel\.se/, 'adressen mejlet gick till');
  assert.match(ruta.innerHTML, /OBS/);
});

test('rutan kan skicka verifieringsmejlet igen', async () => {
  const env = makeEnv({ status: 'verifiering' });
  await env.knapp.onclick();
  const ruta = env.body.children.find(c => /oa-epostkrav/.test(c.className));
  const igen = ruta.querySelector('.oa-epost-igen');
  assert.ok(igen && typeof igen.onclick === 'function', 'knappen "Skicka mejlet igen" saknas');
  await igen.onclick(); await settle();
  assert.deepEqual(env.anrop.map(a => [a.p, a.o && a.o.method]), [['/api/auth/email/send-verification', 'POST']]);
});

test('vanlig väntan (ingen overlay ännu, inget e-postkrav) är oförändrad', async () => {
  const env = makeEnv({ status: 'saving' });
  await env.knapp.onclick();
  assert.deepEqual(env.toasts, ['Vänta tills cloud-synken är ansluten']);
  assert.ok(!env.body.children.some(c => /oa-epostkrav/.test(c.className)));
});

test('cachebusten höjdes med filen', () => {
  const v = (fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8').match(/overlay-access\.js\?v=([^"]+)"/) || [])[1];
  assert.notEqual(v, '20260822-2');
});
