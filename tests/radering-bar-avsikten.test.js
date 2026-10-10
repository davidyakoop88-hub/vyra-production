'use strict';
// VARJE RADERINGSVAG MASTE BARA AVSIKTEN TILL SYNKEN.
//
// Uppmatt i Davids Studio 2026-10-10: han tog bort widgets med papperskorgen i LIVE-LAGER, och
// synkbanderollen "Layouten andrades pa en annan dator" kom tillbaka efter varje val. Api-loggen
// visade 44 st 409 pa tre minuter, en var tredje sekund. Orsaken: serverns krympvakt
// (server/goal-runtime.js, shrinkBlocked) slapper bara igenom en sparning med farre widgets an
// molnet nar klienten skickar allowWidgetLoss — och cloud-sync.js satter den flaggan bara nar
// window.__vyraUserRemovedWidget ar sant. Av tre raderingsknappar satte EN den (studio.js #del).
// Papperskorgen i LIVE-LAGER (media.js mountLiveLayers) och reservlagets knapp (layout-safe.js)
// tog bort widgeten lokalt och lat synken tro att en annan enhet tappat den.
//
// Och dialogens "Den har datorn" skickade samma sparning som nyss avvisats, utan flagga, sa
// valet kunde aldrig vinna: samma 409, banderollen kvar for evigt.
//
// Provet laser kallan: varje stalle som filtrerar bort en widget ur state.widgets pa
// anvandarens knapptryck ska satta __vyraUserRemovedWidget i samma handtag, och konfliktdialogens
// lokala val ska satta den fore push().
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function handtag(kalla, start, langd = 900) {
  const i = kalla.indexOf(start);
  assert.notEqual(i, -1, `hittar inte "${start.slice(0, 60)}" — raderingsvagen har flyttat, uppdatera provet`);
  return kalla.slice(i, i + langd);
}

test('LIVE-LAGER-papperskorgen satter avsiktsflaggan', () => {
  const h = handtag(las('media.js'), "layer-delete').onclick=");
  assert.match(h, /__vyraUserRemovedWidget\s*=\s*true/,
    'papperskorgen i LIVE-LAGER tar bort widgeten utan att saga det till synken — serverns krympvakt svarar da 409 pa varje sparning');
  // Flaggan ska sattas FORE save(), annars gar den forsta pushen utan den.
  assert.ok(h.indexOf('__vyraUserRemovedWidget') < h.indexOf('save()'),
    'flaggan satts efter save() — forsta sparningen gar utan avsikt');
});

test('egenskapspanelens raderingsknapp satter avsiktsflaggan', () => {
  const h = handtag(las('studio.js'), "$('#del')&&($('#del').onclick=");
  assert.match(h, /__vyraUserRemovedWidget\s*=\s*true/);
});

test('reservlagets raderingsknapp satter avsiktsflaggan', () => {
  const h = handtag(las('layout-safe.js'), 'if (remove) remove.onclick = function () {', 600);
  assert.match(h, /__vyraUserRemovedWidget\s*=\s*true/,
    'layout-safe.js raderar utan avsiktsflagga — samma 409-slinga som LIVE-LAGER hade');
  assert.ok(h.indexOf('__vyraUserRemovedWidget') < h.indexOf('save();'),
    'flaggan satts efter save() — forsta sparningen gar utan avsikt');
});

test('"Den har datorn" i konfliktdialogen bar avsikten fore push()', () => {
  const h = handtag(las('cloud-sync.js'), "[data-cs-local]').onclick=", 1400);
  const flagga = h.indexOf('__vyraUserRemovedWidget=true'), push = h.indexOf('await push()');
  assert.notEqual(flagga, -1, 'dialogens lokala val satter inte avsiktsflaggan — krympvakten ger 409 och valet kan aldrig vinna');
  assert.notEqual(push, -1, 'hittar inget push() i handtaget');
  assert.ok(flagga < push, 'flaggan satts efter push() — den forsta sparningen gar utan avsikt');
});

test('cloud-sync skickar flaggan som allowWidgetLoss', () => {
  const k = las('cloud-sync.js');
  assert.match(k, /allowWidgetLoss:\s*tappade/);
  assert.match(k, /const tappade\s*=\s*root\.__vyraUserRemovedWidget===true/);
});
