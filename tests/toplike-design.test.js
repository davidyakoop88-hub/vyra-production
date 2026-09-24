const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const root = {};
  vm.runInNewContext(fs.readFileSync('toplike-design.js', 'utf8'), { globalThis: root });
  return root;
}

test('Top Like exposes the six VYRA designs in the picker — the four originals are retired', () => {
  // Pensionerade 2026-09-24 (Davids beslut): Clean Bar, Soft Stack, Mini Podium och Side Rank star
  // inte langre i listan designvaljaren laser. Deras presets finns kvar for sparade widgetar.
  // Bumpad 2026-09-24 (ranking-sixpack): fyra -> tio, sex nya skinn (Voltage, Basic v2, Prism
  // vertikal/horisontal, Celestial, Royal Rose), godkanda av David som Claude Artifacts. Se
  // ranking-sixpack.css for deras CSS och toplike-design.js for tabellen.
  const root = load();
  assert.deepEqual(Array.from(root.VYRA_TOPLIKE_STYLES, ([id]) => id),
    ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);
  assert.ok(root.VYRA_TOPLIKE_DEFAULTS['clean-bar'], 'presetet behovs fortfarande for sparade widgetar');
});

test('preset removes old ranking chrome and keeps the compact TikTok layout', () => {
  const root = load();
  const widget = { id: 'same', placement: 'standalone' };
  assert.equal(root.applyVyraTopLikeStyle(widget, 'clean-bar'), true);
  assert.equal(widget.id, 'same');
  assert.equal(widget.placement, 'standalone');
  assert.equal(widget.skin, 'clean-bar');
  assert.equal(widget.showTitle, false);
  assert.equal(widget.showCrown, false);
  assert.equal(widget.autoMedal, false);
  assert.equal(widget.width, 250);
  assert.equal(widget.rankingCycle, false);
});

test('unknown style is rejected so styles never collapse into one fallback', () => {
  const root = load(), widget = { skin: 'clean-bar' };
  assert.equal(root.applyVyraTopLikeStyle(widget, 'missing'), false);
  assert.equal(widget.skin, 'clean-bar');
});

test('legacy rank numbers cannot return through an old framed skin', () => {
  const studio = fs.readFileSync('toplike-studio.js', 'utf8');
  const css = fs.readFileSync('toplike-studio.css', 'utf8');
  assert.match(studio, /toplike-row\[\^"\]\*.*<b>\\d\+<\\\/b>/s);
  assert.match(css, /\.widget\.vyra-toplike \.toplike-row>b\s*\{\s*display:none!important;/);
});

test('retired saved skins are clamped to the new VYRA designs at render time', () => {
  const media = fs.readFileSync('media.js', 'utf8');
  const studio = fs.readFileSync('toplike-studio.js', 'utf8');
  const guard = fs.readFileSync('approved-rankings.js', 'utf8');
  // Faller nu tillbaka pa Voltage (Clean Bar pensionerad 2026-09-24). toplike-studio.js klass-
  // stampel faller fortfarande pa clean-bar, men ranking-sixpack.js tar bort den och ritar Voltage.
  assert.match(guard, /LIKE_SKINS\.has\(w\.skin\) \? w\.skin : 'voltage'/);
  assert.match(studio, /SKIN_IDS\.has\(w\.skin\) \? w\.skin : 'clean-bar'/);
  assert.match(guard, /querySelector\('#likeTheme'\).*closest\('label'\).*remove/);
});

test('fresh asset versions prevent a cached retired design from surviving reload', () => {
  const studioHtml = fs.readFileSync('studio.html', 'utf8');
  const media = fs.readFileSync('media.js', 'utf8');
  // Bumpad 2026-09-20: media.js bar versionsstrangen for gift-fireworks.js, som andrades nar
  // fyrverkeriets niva borjade folja gavans varde. media.js har alltsa andrats, och da maste
  // dess egen strang bytas - annars pekar en cachad media.js kvar pa den gamla filen.
  // Bumpad 2026-09-21: #493 andrade toplike-studio.js (skinnet stamplas inte langre pa en
  // renderare som ager sin egen design) UTAN att hoja dess ?v=. Servern fick ratt fil men varje
  // webblasare och OBS-kalla som redan cachat den gamla under samma URL korde kvar den gamla
  // koden — alltsa en fix som inte nadde dem som hade buggen. media.js bar strangen, sa media.js
  // andrades i sin tur, och da maste dess EGEN strang i studio.html ocksa bytas.
  // Bumpad 2026-09-22 (-1): cykeln hoppar over metriker utan data i overlay, en andring i media.js
  // egen kod (rankingStegMedData + updateRankingCycles). Samma regel som ovan galler da: bar en
  // cachad media.js kvar den gamla koden ser OBS-kallan den tomma mallen an en gang.
  // Bumpad igen (-2): OVERLAY_FORMAT ber nu om sandningens matt (1080x1920) i stallet for
  // layoutens designpixlar, och titeltexten sager att overlayn skalar sig sjalv. Det ar KOD och
  // synlig text, inte bara en kommentar — en cachad media.js skulle fortsatta skicka streamern
  // till en kalla pa en fjardedels upplosning.
  // toplike-studio.css och toplike-studio.js ar OFORANDRADE och behaller darfor sina strangar.
  // Bumpad till -4 i sammanslagningen med main 2026-09-23: main andrade samma fil (sound
  // alerts respektive today-features) utan att bumpa sin strang, sa den sammanslagna filen ar
  // ny mot BADA foraldrarna. En klient som hamtat nagon av de tva gamla strangarna hade annars
  // suttit kvar pa sin halva av andringen.
  // -5 2026-09-23: like-fountain-particles.js togs bort ur skriptsvansen. En cachad media.js
  // hade fortsatt injicera den och allokerat en duk per render som ingenting ritar pa.
  // -6 2026-09-23: prototypkortet "Top Gift Flip" togs bort ur katalogen. En cachad media.js
  // hade fortsatt rita knappen och dess nyckel.
  assert.match(studioHtml, /media\.js\?v=20260923-6/);
  // Bumpad 2026-09-24 (ranking-sixpack): toplike-studio.js fick riktnings-/spegelklassen
  // (ranking-mirrored, generisk for alla RANKING_TYPES) — bada strangarna bumpas tillsammans,
  // se motiveringen i tests/widget-rendering-cache-and-fountain.test.js.
  assert.match(media, /toplike-studio\.css\?v=20260924-sixpack/);
  assert.match(media, /toplike-studio\.js\?v=20260924-sixpack/);
});
