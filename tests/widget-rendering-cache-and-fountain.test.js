'use strict';

// De har vakterna ar medvetet källnara. Felet syns forst i en webblasare,
// men orsakerna ar binara: gammal bundle-URL, flera startpunkter eller
// ramkonst bakom widgetens hela stacking context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

// EN CACHEBUST-STRANG FAR INTE NAMNGE DET DEN BUSTAR.
//
// Uppmatt 2026-08-18: `const version='20260818-guardian'` overlevde den familj den var uppkallad
// efter med noll minuter — skrotningen tog bort widgeten men strangen hade blivit kvar om inte en
// assertion fangat den. En strang som namnger kod ar ett lofte om att koden finns, och den lever
// kvar langt efter att koden ar borta; nasta lasare soker pa namnet, hittar en versionsstrang och
// ingen implementation, och maste laga ihop varfor.
//
// Vakten ar med FLIT en svartlista over familjenamn och inte "alla ord": en strang som sager NAR
// (ett datum, en ordningssiffra) ar precis vad vi vill ha, och en generisk regel hade fallt den.
test('ingen cachebust-strang namnger en widgetfamilj', () => {
  const studio = read('studio.html');
  const media = read('media.js');
  const FAMILJENAMN = ['guardian', 'emblem', 'fanlevel', 'gifterlevel', 'battlemvp', 'giftjar',
    'fireworks', 'streak', 'toplike', 'topgift', 'campaign'];
  // Positiv kontroll: matcharen maste falla en uppenbar overtradelse, annars mater provet ingenting.
  const strangarI = text => [...text.matchAll(/\?v=([A-Za-z0-9_.-]+)/g)].map(m => m[1])
    .concat([...text.matchAll(/const version='([^']+)'/g)].map(m => m[1]));
  const fallda = t => strangarI(t).filter(v => FAMILJENAMN.some(f => v.toLowerCase().includes(f)));
  assert.deepEqual(fallda("<script src=\"a.js?v=20260818-guardian\">"), ['20260818-guardian'],
    'matcharen hittar inte ens en uppenbar overtradelse');
  assert.deepEqual(fallda("<script src=\"a.js?v=20260818-2\">"), [],
    'matcharen faller en strang som bara sager nar');

  // ARVDA OVERTRADELSER, MED UTGANGSDATUM.
  //
  // `20260807-topgift` fanns redan nar regeln skrevs (gift-event-images.js i studio.html och
  // live-leaderboard.js i media.js). Att doepa om den NU vore en bump utan andring — en gratis
  // omladdning for varje anvandare, och just det som varje bump-kommentar i filen ovan varnar for.
  // Den star darfor kvar tills nagon av de tva filerna andras pa riktigt, och da byts strangen mot
  // en som bara sager nar.
  //
  // Listan ar en SKULD, inte ett undantag: den far bara krympa. Ett prov nedan ser till att en ny
  // overtradelse inte kan gomma sig genom att laggas till har.
  const ARVDA = ['20260807-topgift'];
  for (const [namn, text] of [['studio.html', studio], ['media.js', media]]) {
    assert.deepEqual(fallda(text).filter(v => !ARVDA.includes(v)), [],
      `${namn} bar en cachebust-strang som namnger sitt innehall — den blir ett arkeologiskt spar `
      + 'sa fort koden byts ut eller tas bort');
  }
  assert.ok(ARVDA.length <= 1,
    `listan over arvda overtradelser har vuxit till ${ARVDA.length} — den far bara krympa`);
});

test('studio och premium-bundlen cachebustas tillsammans', () => {
  const studio = read('studio.html');
  const media = read('media.js');
  // Bumpad 2026-08-13 for Battle MVP-ramarna: andringen lag i media.js och widget-factory.js,
  // och utan ny strang fortsatter en cachad webblasare servera de gamla filerna.
  //
  // Bumpad 2026-08-17 for hero-koreografin, sedan for stack, ribbon, loyalty, badgereveal, hearts, heartbeat och duo — alla atta modeller. Regeln ar densamma
  // varje gang: BARA de strangar vars filer faktiskt andrades. For stack och ribbon ar det tre —
  // studio.css (modellens gamla .fan-active-regler borttagna), media.js (som bar bade sin egen
  // och fan-fas.js:s versionsstrang) och premium-bundlens version, som styr premium-final.css dar
  // faserna bor. widget-factory.js ar orord i bada och behaller sin strang; en bump utan andring
  // ar en gratis omladdning for varje anvandare och gor nasta lasare osaker pa vad som bytts.
  //
  // Bumpad 2026-08-17 for duckningen (§14): media.js bar versionsstrangarna for de sex filer som
  // andrades, sa media.js sjalv maste bumpas — annars fortsatter en cachad media.js peka pa de
  // gamla URL:erna och ingen av de sex byts ut. studio.css, widget-factory.js och fan-fas.js ar
  // OFORANDRADE och behaller darfor sina strangar. Det ar forsta gangen strangarna gar isar, och
  // det ar meningen: de ska folja filerna, inte varandra.
  //
  // Bumpad 2026-08-18 for loyaltys uttoning: BARA studio.css andrades — exit-regeln flyttade
  // fran ankaret `.fan-profile img` till behallaren `.fan-profile`. media.js, widget-factory.js,
  // fan-fas.js och premium-bundlens version ar oforandrade och behaller sina strangar. Andra
  // gangen strangarna gar isar, och av samma skal som forsta: de foljer filerna, inte varandra.
  //
  // Bumpad 2026-08-18 for panelens live-vag: custom-widgets.js och gift-fireworks.js andrades
  // (oninput byggde om hela vyn och slog ut faltet man skrev i). media.js BAR bada strangarna, sa
  // media.js sjalv maste bumpas — annars pekar en cachead media.js pa de gamla URL:erna och ingen
  // av filerna byts ut. Samma skal som duckningen 2026-08-17. gift-fireworks lamnar darfor
  // duckningslistan nedan: dess strang foljer numera panellagningen, inte duckningen.
  // studio.css, widget-factory.js, fan-fas.js och premium-bundlens version ar OFORANDRADE.
  //
  // Bumpad 2026-08-18 for SKROTNINGEN av Guardian Welcome, och strax darpa for Guardian Emblem:
  // media.js (renderare, panel, katalogsektion, trigger), widget-factory.js (familjen registrerad)
  // och runtime-controls.js (koposten) andrades; de tva nya filerna guardian-emblem.css och
  // guardian-emblem-fas.js far samma strang som de laddas med. EN BORTTAGNING KRAVER SAMMA BUMP SOM
  // ETT TILLAGG — en cachead media.js hade annars fortsatt rendera en widgettyp fabriken inte langre
  // kanner till, och det felet ser ut som en trasig widget, inte som en gammal fil.
  //
  // Bumpad 2026-08-18 for ramvaljarens stadning: media.js (tre pickergenerationer reducerade till EN
  // containerskapare), studio.css, toplike-studio.js/.css, gift-alert-frames.js och
  // profile-frames-premium.css (v=8). Sedan igen for scenbakgrunden: studio.css och vyra-historik.js
  // andrades, stage-background.js ar ny. Och for rotationen: widget-handles.js andrades,
  // vyra-rotation.js ar ny.
  //
  // MEDIA.JS BAR EN TREDJE STRANG EFTER SAMMANSLAGNINGEN, `20260819-1`. Bada grenarna andrade filen
  // — huvudgrenen till `-ramstad`, emblemgrenen till `-2` — och det sammanslagna innehallet ar
  // varken det ena eller det andra. Att behalla nagondera hade betytt att halften av andringen
  // levererades under en strang som redan var utrullad. En sammanslagning som ror en fil ar en
  // andring av den filen.
  //
  // SAMMANSLAGNINGEN 2026-08-20 (rotations-UI:t mot main): studio.css, vyra-rotation.js,
  // vyra-proportioner.js och widget-handles.js andrades av BADA grenarna, sa alla fyra far
  // en NY strang som bara sager nar. media.js rordes INTE av rotations-UI:t och behaller
  // darfor mains 20260819-1 — strangarna foljer filerna, inte varandra.
  //
  // STRANGEN SAGER NAR, INTE VAD. `20260818-guardian` levde i media.js i tre timmar och overlevde
  // den familj den var uppkallad efter; en lasare som sokte pa "guardian" hittade en versionsstrang
  // och ingen widget. Vad som andrades star i kommentaren har och i commiten. `sokvakt` nedan
  // vaktar regeln.
  assert.match(studio, /studio\.css\?v=20260820-3/);
  assert.match(studio, /vyra-historik\.js\?v=20260818-scenbakgrund/);
  assert.match(studio, /stage-background\.js\?v=1/);
  assert.match(studio, /vyra-rotation\.js\?v=20260820-1/);
  assert.match(studio, /vyra-proportioner\.js\?v=20260820-1/);
  assert.match(studio, /widget-handles\.js\?v=20260820-1/);
  assert.match(studio, /[^-]media\.js\?v=20260820-4/);
  assert.match(studio, /widget-factory\.js\?v=20260818-2/);
  // Bumpad 2026-08-19: guardian-emblem.css fick sitt vilolage i sandningen (en alert far inte ligga
  // kvar pa skarmen mellan handelserna). BARA den filen andrades, sa bara den strangen byts —
  // en bump utan andring ar en gratis omladdning for varje anvandare.
  assert.match(studio, /guardian-emblem\.css\?v=20260819-2/);
  assert.match(studio, /guardian-emblem-fas\.js\?v=20260818-2/);
  // SAMMANSLAGNINGEN 2026-08-20 (Stigningen mot main): studio.css och media.js andrades av
  // BADA grenarna, sa bada far strangen 20260820-3. Grenen andrade dessutom
  // premium-final.css, som laddas via den injicerade version-konstanten — darfor byts
  // aven den. gifter-fas.js ar grenens nya fil och behaller v=1.
  assert.match(media, /gifter-fas\.js\?v=20260820-4/);
  // SAMMANSLAGNINGEN 2026-08-20 (Rise & Pop mot main): media.js andrades av bada
  // grenarna och premium-final.css bar profile-koreografin, sa skript-URL:en, den
  // injicerade version-konstanten OCH gifter-fas.js far strangen 20260820-4.
  assert.match(media, /toplike-studio\.css\?v=20260818-ramstad/);
  assert.match(media, /toplike-studio\.js\?v=20260818-ramstad/);
  assert.match(media, /gift-alert-frames\.js\?v=20260818-ramstad/);
  assert.match(media, /profile-frames-premium\.css\?v=8/);
  assert.match(media, /const version='20260820-4'/);
  assert.match(media, /widget-fas\.js\?v=1/);
  assert.match(media, /fan-fas\.js\?v=20260819-fabriken/);

  // De sex filer duckningen rorde. En bump utan andring ar en gratis omladdning for varje
  // anvandare; en andring utan bump ar en tyst gammal fil. Bada ar fel, sa listan ar explicit.
  for (const fil of ['vyra-tal', 'action-event', 'action-runtime',
                     'battle-mvp-session', 'sound-alerts']) {
    assert.match(media, new RegExp(`${fil}\\.js\\?v=20260817-duckning`), `${fil}.js cachebustades inte`);
  }
  // Grannarna i samma laddningslista ar ororda och ska INTE ha bumpats med.
  // De tva filer panellagningen rorde. En bump utan andring ar en gratis omladdning; en andring
  // utan bump ar en tyst gammal fil som fortsatter riva panelen vid varje tangenttryck.
  assert.match(media, /custom-widgets\.js\?v=20260818-panel-live/);
  assert.match(media, /gift-fireworks\.js\?v=20260818-panel-live/);
  assert.match(media, /vyra-masterval\.js\?v=20260817-tal/);
  assert.match(media, /action-master\.js\?v=20260817-tal/);
});

test('Like Fountain föder alla partiklar från mitten', () => {
  const css = read('studio.css');
  assert.match(css, /\.lf-p\{position:absolute;left:50%;bottom:14px/,
    'varje partikel måste ha samma fysiska startpunkt');
  assert.doesNotMatch(css, /\.lf-p\{position:absolute;left:calc\(50% \+ var\(--ox/,
    'sidledsspridning får inte placera partiklar på olika startpunkter');
  assert.match(css, /@keyframes lfOrganicHeartRise\{\s*0%\{transform:translate\(-50%,10px\)/,
    'organiska hjärtan måste börja i källpunkten innan banan breder ut sig');
});

test('framed Goal har konst bakom innehållet, även stående', () => {
  const css = read('premium-final.css');
  assert.match(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:0/);
  assert.match(css, /\.premium-goal\.goal-framed>\.goal-copy,\.premium-goal\.goal-framed>\.goal-track,\.premium-goal\.goal-framed>em\{z-index:1\}/);
  assert.match(css, /\.premium-goal\.goal-framed\.goal-portrait\{min-height:440px/);
  assert.doesNotMatch(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:-1/);
});
