'use strict';
// EGENSKAPSPANELEN UTAN GLAPP — RÖTT FÖRST (2026-10-11).
//
// DAVIDS ORD: "lägg en och en widget i layout, öppna höger sidan panel, gå genom funktioner vi
// har skrivit, widget ska popa eller fade, alla inställning ska vara anpassad och ingen glapp".
//
// UPPMÄTT I RIKTIG CHROMIUM, 175 katalognycklar → 60 unika paneler, alla grupper uppfällda och
// fotade i full höjd. Det här provet låser källkontrakten bakom varje fynd; browserprovet
// tests/browser/panelen-utan-glapp.browser.test.js mäter samma saker i renderad panel.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('kryssrutor i panelen är 16 px, inte 100 % breda rutor med texten under', () => {
  // ROTORSAKEN: toplike-studio.css ger `.properties .property-group label input` width:100%!important
  // för att textfält ska fylla raden. En kryssruta är också ett input — den blev en vit ruta på
  // 90×90 px med etiketten UNDER sig i 20 av 60 paneler ("Ta bort bakgrund" i varje BAKGRUND-grupp,
  // "Exkludera anonyma tittare", "Visa riktig aktivitet", "Vänd riktning", Last-X:s fem val ...).
  // last-x-alerts.css sa redan `width:16px` — och förlorade mot !important.
  const css = las('toplike-studio.css');
  const regel = /\.properties \.property-group label input\[type=checkbox\][^{]*\{[^}]*width:16px!important[^}]*\}/;
  assert.match(css, regel, 'kryssrutor behöver en egen regel med !important som vinner över 100 %-regeln');
  const i100 = css.search(/\.properties \.property-group label input,\.properties \.property-group label select\{float:none!important;width:100%!important/);
  const iKryss = css.search(regel);
  assert.ok(i100 >= 0 && iKryss > i100, 'kryssregeln ska stå EFTER 100 %-regeln så den vinner vid lika specificitet');
});

test('användarens intro-val vinner över widgetens egen entré på rotnoden', () => {
  // Top Gift: `.vyra-topgift.play{animation:vyraAppear}` (0,2,0) slog `.ws-anim-pop` (0,1,0).
  // Top Streak: `.vyra-streak.hit{animation:streakEnter}` likadant. (0,3,0) vinner utan !important.
  const css = las('toplike-studio.css');
  for (const e of ['fade', 'slideUp', 'pop']) {
    assert.match(css, new RegExp(`\\.widget\\.ws-anim-${e}\\.ws-anim-${e}\\{animation:`), `ws-anim-${e} behöver specificitet (0,3,0)`);
  }
});

test('vyra-intro.js laddas av media.js med cachebust, utanför overlay-vakten', () => {
  const media = las('media.js');
  assert.match(media, /js\.src='vyra-intro\.js\?v=\d{8}-\d+'/, 'laddraden saknas eller saknar bust');
  const intro = las('vyra-intro.js');
  // Samma fält som de tre familjerna redan skriver — annars hade en widget kunnat bära två intron.
  assert.match(intro, /w\.entranceAnimation = e\.target\.value/);
  assert.match(intro, /w\.entranceDuration = \+e\.target\.value/);
  // Klassen läggs bara om ingen annan redan lade den.
  assert.match(intro, /html\.includes\(' ws-anim-'\)/);
  // Effektwidgetarna och playground-familjen får inget andra val.
  for (const t of ['templateGiftFireworks', 'templateGiftBubbles', 'templateHeartFireworks', 'templateGloveSnipe', 'templateLikeFountain', 'templatePgGoal', 'templatePgPodium', 'templatePgStreak']) {
    assert.ok(intro.includes(`'${t}'`), `${t} ska stå i UTAN_VAL`);
  }
  assert.match(intro, /#gafEntrance, #wsEntrance, #lastXEntrance/, 'befintliga kontroller ska kännas igen');
  // PÅ TYP, INTE PÅ DOM (CI 2026-10-11, panel-inga-dubbletter): gift-alert-frames.js laddas lika
  // dynamiskt som vyra-intro.js; landar den efteråt finns #gafEntrance inte när vi tittar, och två
  // "Inträdeseffekt" byggs. Typlistan måste täcka exakt de tre familjernas typer.
  const gaf = las('gift-alert-frames.js').match(/const GIFT_ALERT_TYPES = \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
  const ws = las('toplike-studio.js').match(/const RANKING_TYPES ?= ?\[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
  for (const t of [...gaf, ...ws, 'templateLastX']) assert.ok(intro.includes(`'${t}'`), `${t} ska stå i EGNA_FAMILJER`);
  assert.match(intro, /EGNA_FAMILJER\.has\(w\.type\)\) return ut;/);
});

test('Egen text får inte den delade TEXT-gruppen — den har redan TYPSNITT och SKUGGA', () => {
  // Uppmätt: panelen för Egen text hade Typsnitt två gånger, Textstorlek två gånger (100 % och
  // 32px) och Skugga X/Y två gånger. Två reglage för samma sak är ett glapp.
  const t = las('vyra-textgrupp.js');
  assert.match(t, /w\.type === 'templateCustomText'/, 'vyra-textgrupp.js ska hoppa över templateCustomText');
});

test('Battle MVP med ram får en rad kryssrutor, inte två', () => {
  // Ramvarianterna (Dark Wings m.fl.) bygger "Rubrik / Namn / Poäng" i DESIGN. Den generella raden
  // "MVP / Namn / Coins" + Coin-symbol lades ändå till — "Namn" fanns två gånger, och "Coins" på en
  // widget vars spec säger att ramen aldrig visar poäng.
  const media = las('media.js');
  assert.match(media, /if\(!w\|\|w\.type!=='templateBattleMvp'\|\|w\.mvpFrame\)return html;return html\.replace\('<label>Poäng<input id="mvpScore"'/);
});

test('Guardian Emblem har POSITION & STORLEK och Ta bort som alla andra', () => {
  // Uppmätt: enda panelen av 60 utan positionsgrupp och utan Ta bort-knapp. Widgeten gick inte
  // att flytta med siffror och inte att ta bort från panelen.
  const media = las('media.js');
  const i = media.indexOf('<h4>TESTA</h4><button id="testGuardianEmblem">');
  assert.ok(i > 0);
  const svans = media.slice(i, i + 1400);
  assert.match(svans, /<h4>POSITION & STORLEK<\/h4><div class="property-grid"><label>X<input id="propX"/);
  assert.match(svans, /<label>Y<input id="propY"/);
  assert.match(svans, /<label>Bredd<input id="propWidth"/);
  assert.match(svans, /<label>Lager<input id="propLayer"/);
  assert.match(svans, /<button class="delete" id="del">Ta bort<\/button>/);
});

test('Top Like: en DESIGN-rubrik utan kontroller tas bort i stället för att stå tom', () => {
  // approved-rankings.js tar bort #likeTheme ur DESIGN (designen är låst per kort sedan #487).
  // Kvar stod rubriken DESIGN över ingenting.
  const ar = las('approved-rankings.js');
  assert.match(ar, /tomDesignGrupp|DESIGN-grupp(en)? utan/i, 'borttagningen av den tomma gruppen saknas');
});

test('volymreglagen visar sitt värde som alla andra reglage', () => {
  // Gift Campaign "Volym" och Gift Fireworks "Ljudvolym" var de enda två reglagen av ~140 utan
  // siffra bredvid etiketten.
  assert.match(las('gift-campaign-aura.js'), /<label class="range-label">Volym <b[^>]*>\$\{[^}]+\}%<\/b><input id="campaignVolume"/);
  assert.match(las('gift-supernova-panel.js'), /<label class="range-label">Ljudvolym <b[^>]*>\$\{[^}]+\}%<\/b><input id="fwVolume"/);
});

test('cachebustarna höjdes i samma commit som filerna', () => {
  const media = las('media.js'), html = las('studio.html');
  assert.match(media, /toplike-studio\.css\?v=20261011-1/);
  assert.match(media, /gift-campaign-aura\.js\?v=20261020-15/);  // 20261019-1: Ärv färgschema (accent och text), PR 9
  assert.match(media, /gift-supernova-panel\.js\?v=20261021-7/);  // 20261019-1: enheter i <b>, Rundning 0 och färgraden #fwFarger, PR 12
  assert.match(html, /vyra-textgrupp\.js\?v=20261020-20/);
  assert.match(html, /approved-rankings\.js\?v=20261020-23/);
  assert.match(html, /media\.js\?v=20261022-2/);
});
