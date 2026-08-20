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

test('toppraden och skyltfönstret är borta — texten äger toppen, kortet står under', () => {
  // Davids skiss 2026-08-20 i två steg: först bort med headern, de stora knapparna och
  // OBS-demokortet; sedan (samma kväll) bort med ÄVEN nedladdningsknappen — skrivbordsappen
  // laddas ner EFTER kontoskapandet, inne i Studio ([data-ladda-desktop], egen provsvit som
  // kör mot studio.html direkt). Med noll knappar kvar är startmodalen onåbar och rivs enligt
  // borttagnings-prejudikatet (de sju sektionerna): dolda påståenden kan tändas igen av misstag.
  // Texten äger toppen: rubriken kommer FÖRE inloggningskortet i DOM.
  const index = las('index.html');
  assert.ok(!index.includes('site-header'), 'toppraden ska vara borta');
  assert.ok(!index.includes('obs-demo'), 'OBS-demokortet ska vara borta');
  assert.ok(!index.includes('hero3d') && !index.includes('home-3d.js'),
    'hero-3D:n följer demokortet ut — en osynlig Three.js-scen är bara vikt');
  assert.ok(!index.includes('data-open-start') && !index.includes('startModal'),
    'nedladdningsknappen och startmodalen ska vara HELT borta — nedladdning sker i Studio');
  assert.ok(!index.includes('download-client.js'),
    'download-client.js band redan ingenting på framsidan — utan modalen är den bara vikt');
  assert.ok(index.indexOf('grad-shimmer') < index.indexOf('data-login'),
    'texten äger toppen — rubriken ska komma före inloggningskortet i DOM');
});

test('mobilbilden svävar i mitten — och står stilla för den som bett om det', () => {
  // Davids beslut 2026-08-20: samma mobilmockup-koncept som konkurrenten (tikcontrol.app,
  // "Grow on TikTok LIVE") men med VYRA:s EGEN AI-genererade bild (VYRALIVE-neonen i
  // bakgrunden) och deras uppmätta rörelse: rotate(-3°) i vila, sväv upp-höger till
  // rotate(-1.2°) translate(8px,-16px) scale(1.018) över 5,5 s, oändligt.
  const index = las('index.html');
  assert.match(index, /class="hero-mobil"/, 'mobilbilden (figure.hero-mobil) saknas');
  assert.match(index, /assets\/images\/vyralive-live-lejon/, 'bilden pekar inte på repo-asseten');
  const css = las('styles.css');
  assert.match(css, /vyraSvavHoger/, 'svävanimationen saknas i styles.css');
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\{[^@]*\.hero-mobil\{animation:none[;}]/,
    'reduced-motion-vakten saknas för svävet — samma regel som tubes och hero-3D:n hade');
});

test('fyra gåvor svävar i 3D runt mobilen — ur repots egna assets', () => {
  // Davids skiss 2026-08-20: fyra gåvor i mobilens fyra hörn. Bilderna är REPOTS EGNA
  // (assets/gifts/events, samma konstverk gåvo-widgetarna renderar) — inget nytt hämtat
  // material. De bor INUTI .hero-mobil-scen så de ärver muslutningens perspektiv och får
  // parallax via translateZ; varje gåva har sin EGEN keyframe och fördröjning, annars
  // marscherar de i takt och rörelsen läses som en enda platta.
  const index = las('index.html');
  const css = las('styles.css');
  for (const gava of ['8377_Zeus', '8373_Gorilla', '8361_Phoenix', '8374_Sam_the_Whale',
    '8378_Leon_and_Lion', '8282_Lili_and_Sakura', '8049_Pim_Bear', '8211_Desert_Wolf']) {
    assert.ok(index.includes('assets/gifts/events/' + gava),
      `gåvan ${gava} saknas — den ligger redan i repot och ska återanvändas`);
  }
  assert.match(index, /class="hero-gava/, 'gåvorna saknar .hero-gava-klassen');
  assert.ok(index.indexOf('hero-gava') > index.indexOf('hero-mobil-scen'),
    'gåvorna måste ligga INUTI scenen för att ärva perspektivet');
  // ETT LEVANDE SYSTEM, INTE ÅTTA LÖSA (Davids beslut 2026-08-20, ersätter regeln om en egen
  // keyframe per gåva): gåvorna delar EN bana runt mobilen — samma rotation, olika FAS via
  // negativ animation-delay — så de kretsar tillsammans i stället för att darra var för sig.
  // Individualiteten ligger kvar i andetaget: varje gåva har sin egen bob-tid. Billboarden
  // motroterar exakt lika mycket som banan, annars vänder gåvorna ryggen mot betraktaren.
  const antalGavor = (index.match(/class="hero-gava"/g) || []).length;
  assert.ok(antalGavor >= 8, `bara ${antalGavor} gåvor i banan — åtta är beslutet`);
  const faser = new Set(index.match(/--i:\s*\d+/g) || []);
  assert.equal(faser.size, antalGavor,
    `${antalGavor} gåvor men ${faser.size} unika faser — två gåvor på samma plats i banan`);
  assert.match(css, /@keyframes vyraRing\b/, 'den gemensamma banan (vyraRing) saknas');
  assert.match(css, /@keyframes vyraRingMot\b/,
    'motrotationen saknas — utan den snurrar gåvorna bort från betraktaren');
  assert.match(css, /\.hero-gavoring\{[^}]*perspective|\.hero-mobil-scen\{[^}]*perspective/,
    'utan perspective-EGENSKAPEN på föräldern får barnen inget djup att kretsa i');
  assert.match(css, /translateZ/, 'utan translateZ finns inget djup att luta i');
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\{[^@]*\.hero-gava img\{animation:none\}/,
    'reduced-motion-vakten saknas för gåvorna — banan, billboarden OCH andetaget ska stanna');
});

test('studio.html rör aldrig framsidans loginmodul', () => {
  const studio = las('studio.html');
  assert.ok(!studio.includes('landing-login'),
    'studio.html refererar landing-login — gaten (auth-client.js) äger inloggningen där');
});
