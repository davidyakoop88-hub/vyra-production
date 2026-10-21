'use strict';
// "HÅLL MIG INLOGGAD" I KLIENTEN — skrivet RÖTT FÖRST (2026-10-21).
//
// David: "att personen som vill logga in har en knapp att hålla sig inloggad, behöver inte skriva
// lösenord varje gång". Två ingångar loggar in: framsidans kort (index.html + landing-login.js) och
// studions gate (auth-client.js). Båda ska ha rutan, båda ska ha den AV som standard (en delad
// dator är det säkra antagandet), och båda ska skicka `remember` med inloggningsanropet.
// Serversidan provas i server/test/hall-mig-inloggad-http.test.js.
//
// Rutan får aldrig bli en anledning att lägga något hemligt i webbläsaren: inloggningen bärs
// fortfarande bara av serverns HttpOnly-kaka, så varken lösenord eller valet sparas lokalt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const synlig = el => { for (let e = el; e; e = e.parentElement) if (e.hidden) return false; return true; };

// Fångar varje POST och svarar som en lyckad inloggning, så att kortet går vidare.
function fangaAnrop(w, anrop) {
  w.fetch = async (vag, opt = {}) => {
    anrop.push({ vag, kropp: opt.body ? JSON.parse(opt.body) : null });
    return { ok: true, status: 200, json: async () => ({ ok: true, csrfToken: 'c', user: { email: 'a@b.se' }, workspaces: [] }) };
  };
}

function startsidan() {
  const html = las('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://vyra.test/' });
  const anrop = [];
  fangaAnrop(dom.window, anrop);
  dom.window.matchMedia = () => ({ matches: true });   // reducerad rörelse: ingen dörr, ingen väntan
  dom.window.eval(las('landing-login.js'));
  return { w: dom.window, anrop };
}
async function loggaInPaKortet(w, kryss) {
  const d = w.document;
  d.querySelector('#loginEmail').value = 'a@b.se';
  d.querySelector('#loginPassword').value = 'ett-langt-losenord';
  if (kryss) d.querySelector('#loginRemember').click();
  d.querySelector('[data-login] form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
}

test('framsidan: rutan "Håll mig inloggad" finns under lösenordet, är av och har svensk hjälptext', () => {
  const { w } = startsidan();
  const ruta = w.document.querySelector('[data-login] #loginRemember');
  assert.ok(ruta, 'kryssrutan #loginRemember saknas på framsidans kort');
  assert.equal(ruta.type, 'checkbox');
  assert.equal(ruta.checked, false, 'rutan ska vara AV som standard');
  assert.equal(ruta.hasAttribute('checked'), false, 'rutan får inte vara förkryssad i HTML');
  assert.match(ruta.closest('label').textContent, /Håll mig inloggad/);
  const hjalp = w.document.getElementById(ruta.getAttribute('aria-describedby'));
  assert.ok(hjalp, 'hjälptexten ska vara kopplad med aria-describedby');
  assert.match(hjalp.textContent, /delad dator/);
  // Under lösenordet: rutan kommer efter lösenordsfältet i dokumentordningen och före knappen.
  const losen = w.document.querySelector('#loginPassword');
  const knapp = w.document.querySelector('[data-login] form button[type="submit"]');
  assert.ok(losen.compareDocumentPosition(ruta) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'rutan ska ligga under lösenordet');
  assert.ok(ruta.compareDocumentPosition(knapp) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'rutan ska ligga ovanför Logga in');
  assert.ok(synlig(ruta) && synlig(hjalp), 'rutan och hjälptexten ska synas i läget Logga in');
});

test('framsidan: rutan och hjälptexten döljs i Skapa konto och kommer tillbaka i Logga in', () => {
  const { w } = startsidan();
  const ruta = w.document.querySelector('#loginRemember');
  const hjalp = w.document.querySelector('[data-login-minns-hjalp]');
  w.document.querySelector('[data-login-flik="register"]').click();
  assert.ok(!synlig(ruta) && !synlig(hjalp), 'en registrering har ingen Håll mig inloggad-ruta');
  w.document.querySelector('[data-login-flik="login"]').click();
  assert.ok(synlig(ruta) && synlig(hjalp));
});

test('framsidan: inloggningen skickar remember:false utan kryss och remember:true med', async () => {
  for (const kryss of [false, true]) {
    const { w, anrop } = startsidan();
    await loggaInPaKortet(w, kryss);
    const login = anrop.find(a => a.vag === '/api/auth/login');
    assert.ok(login, 'inget anrop till /api/auth/login');
    assert.strictEqual(login.kropp.remember, kryss, 'remember skickades inte som ' + kryss);
  }
});

test('framsidan: en registrering skickar inget remember', async () => {
  const { w, anrop } = startsidan();
  w.document.querySelector('[data-login-flik="register"]').click();
  w.document.querySelector('#loginName').value = 'Prov';
  await loggaInPaKortet(w, false);
  const reg = anrop.find(a => a.vag === '/api/auth/register');
  assert.ok(reg, 'inget anrop till /api/auth/register');
  assert.equal('remember' in reg.kropp, false);
});

function studionsGate(lage) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://vyra.test/studio.html' });
  const w = dom.window, anrop = [];
  w.fetch = async () => ({ ok: false, json: async () => ({}) });
  w.eval(las('auth-client.js'));
  fangaAnrop(w, anrop);
  w.VyraAuth.showGate(lage);
  return { w, anrop };
}
async function loggaInIGaten(w, kryss) {
  const d = w.document;
  d.querySelector('#authEmail').value = 'a@b.se';
  d.querySelector('#authPassword').value = 'ett-langt-losenord';
  if (kryss) d.querySelector('#authRemember').click();
  d.querySelector('.auth-gate form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
}

test('studions gate: rutan finns under lösenordet, är av och har svensk hjälptext', () => {
  const { w } = studionsGate('login');
  const ruta = w.document.querySelector('.auth-gate #authRemember');
  assert.ok(ruta, 'kryssrutan #authRemember saknas i gaten');
  assert.equal(ruta.type, 'checkbox');
  assert.equal(ruta.checked, false, 'rutan ska vara AV som standard');
  assert.match(ruta.closest('label').textContent, /Håll mig inloggad/);
  assert.match(w.document.getElementById(ruta.getAttribute('aria-describedby')).textContent, /delad dator/);
  assert.ok(w.document.querySelector('#authPassword').compareDocumentPosition(ruta) & w.Node.DOCUMENT_POSITION_FOLLOWING);
});

test('studions gate: ingen ruta i Kom igång', () => {
  const { w } = studionsGate('register');
  assert.equal(w.document.querySelector('.auth-gate #authRemember'), null);
});

test('studions gate: inloggningen skickar remember:false utan kryss och remember:true med', async () => {
  for (const kryss of [false, true]) {
    const { w, anrop } = studionsGate('login');
    await loggaInIGaten(w, kryss);
    const login = anrop.find(a => a.vag === '/api/auth/login');
    assert.ok(login, 'inget anrop till /api/auth/login');
    assert.strictEqual(login.kropp.remember, kryss);
  }
});

test('valet och lösenordet sparas aldrig i webbläsaren', async () => {
  for (const [w, logga] of [[startsidan().w, loggaInPaKortet], [studionsGate('login').w, loggaInIGaten]]) {
    await logga(w, true);
    for (const lager of [w.localStorage, w.sessionStorage]) {
      for (let i = 0; i < lager.length; i++) {
        const v = lager.getItem(lager.key(i));
        assert.doesNotMatch(v, /ett-langt-losenord/, 'lösenordet hamnade i webblagringen');
        assert.doesNotMatch(lager.key(i), /remember|minns|inloggad/i, 'valet ska bara bo på servern');
      }
    }
  }
});

test('cachebustarna höjdes med filerna', () => {
  const index = las('index.html'), studio = las('studio.html');
  assert.match(index, /landing-login\.js\?v=20261021-\d+"/);
  assert.match(index, /styles\.css\?v=20261021-\d+"/);
  assert.match(studio, /auth-client\.js\?v=20261021-\d+"/);
  assert.match(studio, /auth-client\.css\?v=20261021-\d+"/);
});
