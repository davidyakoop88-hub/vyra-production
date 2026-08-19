'use strict';
// Framsidan som inloggningssida — Davids beslut 2026-08-19 (skärmbildsskiss): bara översta
// delen av sidan används, inloggningskortet synligt direkt till vänster, sakerna där uppe
// omflyttade och tydliga knappar. Skrivet RÖTT FÖRST.
//
// Inloggningen återanvänder det RIKTIGA kontosystemet (auth-client.js:s endpoints):
// POST /api/auth/login|register → csrfToken, ev. mfaRequired → /api/auth/mfa/challenge.
// Framsidans kort duplicerar inte gaten — det talar samma API och landar i studio.html.
//
// Vakterna nedan håller tre löften:
//   1. Kortet finns och talar rätt API — annars är det en attrapp.
//   2. Sektionerna under vecket är DOLDA men KVAR (agency-prejudikatet: hidden, inte raderade)
//      och [hidden] backas av display:none!important — author-display slår annars attributet
//      (scenbakgrundens uppmätta läxa 2026-08-18).
//   3. studio.html rör aldrig framsidans loginmodul, och de gamla navlänkarna som pekade in i
//      det dolda innehållet är borta.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('framsidan bär inloggningskortet och det talar det riktiga kontosystemet', () => {
  const index = las('index.html');
  assert.match(index, /data-login/, 'inloggningskortet (data-login) saknas på framsidan');
  assert.match(index, /id="loginEmail"[^>]*type="email"/, 'e-postfältet saknas');
  assert.match(index, /id="loginPassword"[^>]*type="password"[^>]*minlength="12"/,
    'lösenordsfältet saknas eller har fel golv — kontosystemets minsta längd är 12');
  assert.match(index, /landing-login\.js\?v=/, 'framsidan laddar aldrig landing-login.js');
  const js = las('landing-login.js');
  assert.match(js, /\/api\/auth\/'\s*\+\s*|\/api\/auth\/(login|register)/,
    'landing-login.js talar inte /api/auth/login|register — då är kortet en attrapp');
  assert.match(js, /\/api\/auth\/mfa\/challenge/,
    'MFA-utmaningen saknas — ett konto med tvåsteg kan aldrig logga in från framsidan');
  assert.match(js, /studio\.html/, 'lyckad inloggning ska landa i studio.html');
  assert.match(js, /X-VYRA-CSRF/, 'CSRF-huvudet saknas — registrering/MFA faller utan det');
});

test('glömt lösenord finns på kortet och talar återställningsflödet', () => {
  // Återställningen är redan byggd (auth-security.js): POST /api/auth/password/request {email}
  // skickar engångslänken, och länken landar i studio.html?reset-password där recover() tar vid.
  // Kortet behöver alltså bara BEGÄRAN — aldrig ett eget resetformulär.
  const index = las('index.html');
  assert.match(index, /data-login-glomt/, 'Glömt lösenord-länken saknas på kortet');
  assert.match(index, /data-login-forgot/, 'glömt-steget (data-login-forgot) saknas i kortet');
  const js = las('landing-login.js');
  assert.match(js, /\/api\/auth\/password\/request/,
    'glömt-steget talar inte /api/auth/password/request — då skickas aldrig länken');
});

test('innehållet under vecket är dolt men kvar, och inga navlänkar pekar in i det', () => {
  const index = las('index.html');
  assert.match(index, /class="product"[^>]*\bhidden\b|id="product"[^>]*\bhidden\b/,
    'produktsektionen ska bära hidden — framsidan är bara översta delen nu');
  assert.match(index, /class="logos"[^>]*\bhidden\b/, 'logosektionen ska bära hidden');
  assert.ok(!/href="#product"/.test(index),
    'Produkt-länken pekar in i dolt innehåll — den skulle scrolla ingenstans');
  const css = las('styles.css');
  assert.match(css, /\[hidden\]\{display:none!important\}/,
    'hidden-attributet saknar display-ryggrad — author-display slår det annars (scenbakgrundens läxa)');
});

test('studio.html rör aldrig framsidans loginmodul', () => {
  const studio = las('studio.html');
  assert.ok(!studio.includes('landing-login'),
    'studio.html refererar landing-login — gaten (auth-client.js) äger inloggningen där');
});
