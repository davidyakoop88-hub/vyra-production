'use strict';
// "VERIFIERA DIN E-POST INNAN DU ANSLUTER TIKTOK" — REDAN NÄR KONTOT SKAPAS (2026-10-17).
//
// server/index.js stoppar varje skrivning från ett konto med overifierad e-post, också
// TikTok-anslutningen. Studion säger det sedan #623 (bannern, sidhuvudknappen, Steg 1/Steg 2 i
// modalen) — men först EFTER registreringen. I själva registreringsformuläret, där användaren
// skriver in sin e-postadress, stod ingenting om att adressen måste verifieras innan TikTok kan
// anslutas. David 2026-10-17: "vi måste vara tydliga att verifiera ditt mail innan du kopplar dig
// mot tiktok".
//
// Två ingångar skapar konton: startsidans kort (index.html + landing-login.js) och studions
// inloggningsruta (auth-client.js). Båda provas.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KRAV = /verifiera.*e-post.*TikTok|TikTok.*verifiera.*e-post/is;

function startsidan() {
  const html = las('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://vyra.test/' });
  dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });
  dom.window.eval(las('landing-login.js'));
  return dom.window;
}
const synlig = el => {
  for (let e = el; e; e = e.parentElement) if (e.hidden) return false;
  return true;
};

test('startsidan, Skapa konto: formuläret säger att e-posten ska verifieras innan TikTok', () => {
  const w = startsidan();
  w.document.querySelector('[data-login-flik="register"]').click();
  const ruta = w.document.querySelector('[data-login-epostkrav]');
  assert.ok(ruta, 'raden [data-login-epostkrav] saknas i registreringsformuläret');
  assert.ok(synlig(ruta), 'raden ska synas i läget Skapa konto');
  assert.match(ruta.textContent, KRAV);
});

test('startsidan, Logga in: raden syns inte', () => {
  const w = startsidan();
  const ruta = w.document.querySelector('[data-login-epostkrav]');
  assert.ok(ruta, 'raden [data-login-epostkrav] saknas');
  assert.ok(!synlig(ruta), 'en inloggning är inte en registrering');
  w.document.querySelector('[data-login-flik="register"]').click();
  w.document.querySelector('[data-login-flik="login"]').click();
  assert.ok(!synlig(ruta), 'tillbaka till Logga in ska dölja den igen');
});

function studionsRuta(lage) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://vyra.test/studio.html' });
  const w = dom.window;
  w.fetch = async () => ({ ok: false, json: async () => ({}) });
  w.eval(las('auth-client.js'));
  w.VyraAuth.showGate(lage);
  return w;
}

test('studions inloggningsruta, Kom igång: samma besked', () => {
  const w = studionsRuta('register');
  const ruta = w.document.querySelector('.auth-gate [data-auth-epostkrav]');
  assert.ok(ruta, 'raden [data-auth-epostkrav] saknas i registreringsläget');
  assert.match(ruta.textContent, KRAV);
});

test('studions inloggningsruta, Logga in: ingen sådan rad', () => {
  const w = studionsRuta('login');
  assert.equal(w.document.querySelector('.auth-gate [data-auth-epostkrav]'), null);
});

test('cachebustarna höjdes med filerna', () => {
  assert.doesNotMatch(las('index.html'), /landing-login\.js\?v=20260821-1"/);
  const v = (las('studio.html').match(/auth-client\.js\?v=([^"]+)"/) || [])[1];
  assert.ok(v, 'studio.html laddar auth-client.js');
  assert.notEqual(v, VERSION_FORE);
});
const VERSION_FORE = '20261017-epostkrav';
