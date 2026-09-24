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
  // Bumpad 2026-08-20 for glodet pa sidhuvudets tre knappar: BARA studio.css andrades. media.js,
  // widget-factory.js och premium-bundlens version ar oforandrade och behaller sina strangar —
  // samma regel som loyaltys uttoning: strangarna foljer filerna, inte varandra.
    // Bumpad 2026-08-20 for sidomenyn: BARA studio.css andrades (en bredd i en variabel, och
  // <nav> rullar i stallet for hela <aside>). media.js, widget-factory.js och premium-bundlens
  // version ar oforandrade och behaller sina strangar.
    // Bumpad 2026-08-21: de nio reglerna som krympte sidomenyn i editorvyn ar borta, sa menyn
  // ser likadan ut i alla vyer. BARA studio.css andrades.
    // Bumpad 2026-08-21 for overlaylanken: raden bryts till tva rader under 1500 px sa hela
  // adressen syns. BARA studio.css andrades.
    // Bumpad 2026-09-04 for de ritade markena: samuraiemblemets ::before ritar numera en
  // inline-SVG-mask i stallet for U+5200, och .vyra-glyf-regeln ar ny. BARA studio.css
  // andrades av den delen.
  // Bumpad 2026-09-08 (bildmatt): gavoramarnas flip var 0×0, gavobilden i naturlig storlek och
  // namnplattan pa en rad. BARA studio.css andrades av den delen.
  // Bumpad 2026-09-09 (panelordningen): studio.css bar regeln for en oppnad hopfalld grupp.
  // Bumpad 2026-09-09 for emoji-knappen: studio.css bar reglerna for knappen och dess valjare.
  // media.js ar OFORANDRAD av den andringen och behaller sin strang — de foljer filerna, inte
  // varandra.
  // Bumpad 2026-09-10: prestandavaljaren i Installningar saknade `flex:1` som sidans input har, sa
  // radens harlinje gick 475 px forbi innehallet. BARA studio.css andrades.
  // Bumpad 2026-09-22: Top Streak fick en `.record`-regel sa att `mark()` har nagot att rita.
  // BARA studio.css andrades av den regeln; media.js, widget-factory.js och premiumbundlen ar
  // oforandrade och behaller sina strangar.
  // Bumpad 2026-09-23 for gavororelsens forsta art: studio.css bar de fyra fas-reglerna och de
  // fyra keyframes som streak-fas.js tander. Samtidigt andrades media.js (skriptsvansen laddar
  // arten) och gift-event-images.js (armningen anropar koreografin), sa de bumpas ocksa — var och
  // en for sin egen andring. widget-factory.js och premiumbundlen ar OFORANDRADE och behaller
  // sina strangar.
  // Bumpad 2026-09-23 igen: de 16 reglerna for `.topgift-framed`/`.tgf-*` togs bort nar hela
  // ramgrenen pensionerades. widget-factory.js bumpas i samma andring — det ar DEN som bar
  // varianttabellen, och en cachad fabrik hade fortsatt erbjuda sju designer som inte finns.
  // Bumpad till -4 i sammanslagningen med main 2026-09-23: main andrade samma fil (sound
  // alerts respektive today-features) utan att bumpa sin strang, sa den sammanslagna filen ar
  // ny mot BADA foraldrarna. En klient som hamtat nagon av de tva gamla strangarna hade annars
  // suttit kvar pa sin halva av andringen.
  // -5 2026-09-23: de tva foraldralosa .lf-duk-reglerna gick med canvas-lagret. Ingen nod bar
  // den klassen langre, sa reglerna kunde aldrig matcha nagot — dod vikt som laste ut som
  // ett fungerande lager.
  // -6 2026-09-23: tva losa selektorer stadades bort — rester efter Like Fountains borttagna
  // canvas-lager. Den ena, `.lf-stream canvas`, stod utan block och SLOK nasta regel: `.lf-p`
  // parsades som `.lf-stream canvas .lf-p` och matchade ingenting, eftersom duken var borta.
  // Partiklarna tappade alltsa sin grundstil. En cachad studio.css hade fortsatt servera den
  // trasiga regeln, sa strangen maste folja med.
  // 20260924-1 2026-09-24: overlaylankradens inre rutnat. Etikettkolumnen gick fran fasta 170px
  // till minmax(0,170px) och adressfaltet fick golvet min-width:72ch. Faltet hade noll marginal
  // vid ALLA fyra fonsterbredder och klipptes i CI (falt 375 px, adress 389). En cachad studio.css
  // hade fortsatt servera den trangare raden.
  assert.match(studio, /studio\.css\?v=20260924-1/);
  // Bumpad igen 2026-09-23: topgift.theme och topgift.extra pensionerades ur varianttabellen.
  // studio.css ar DENNA gang oforandrad — skinnen star kvar och premiumdesignerna anvander dem,
  // sa ingen sparad widget andrar utseende. Strangarna foljer filerna, inte varandra.
  // Bumpad igen 2026-09-23: nitton av tjugoen premiumdesigner pensionerades. Alla tre foljer med
  // den har gangen — widget-factory.js bar varianttabellen, studio.css de 50 borttagna reglerna
  // och premiumbunten (media.js `version`) listan i premium-final.js.
  assert.match(studio, /widget-factory\.js\?v=20260923-3/);
  assert.match(studio, /gift-event-images\.js\?v=20260923-1/);
  // Arten laddas ur media.js skriptsvans, efter fabriken — samma vag som fan och gifter.
  assert.match(read('media.js'), /streak-fas\.js\?v=20260923-1/);
  assert.match(studio, /vyra-historik\.js\?v=20260818-scenbakgrund/);
  assert.match(studio, /stage-background\.js\?v=1/);
  assert.match(studio, /vyra-rotation\.js\?v=20260820-1/);
  assert.match(studio, /vyra-proportioner\.js\?v=20260820-1/);
  // Bumpad 2026-09-20: resize-handtagen klamper bredden sa att hela widgeten ryms pa duken.
  assert.match(studio, /widget-handles\.js\?v=20260920-1/);
    // Bumpad 2026-08-20 for toppgivarraden: media.js bar laddvagen till home-premium-bunten, och
  // overview-premium.css/.js laddades HELT UTAN version pa bada stallena — en cachad kopia hade
  // fortsatt visa de fyra gamla summakorten. Nu bar de ?v=20260820-1, och media.js sjalv maste
  // darfor bumpas: annars pekar en cachad media.js pa de gamla URL:erna.
    // Bumpad 2026-08-20 for liv i tomma laget: overview-premium.css/.js (skelett + sken) och
  // studio.js (basvyn bar samma skelett) andrades. media.js bar buntens URL:er och maste darfor
  // folja med — annars pekar en cachad media.js pa foregaende version av bada.
    // Bumpad 2026-08-20 for scopningen av skenet: BARA overview-premium.css andrades
  // (#view -> #view:has(>.oversikt-sken)). media.js bar dess URL och maste folja med.
    // Bumpad 2026-08-20 for TTS-statusraden: tts-chat.js och tts-chat.css andrades, och media.js
  // bar bada URL:erna — utan bump pekar en cachad media.js pa foregaende version av bada.
  // `20260817-tal` blir samtidigt en strang som bara sager nar, inte vad.
    // Bumpad 2026-08-21 for pausindikatorn: studio-live.js (sidhuvudets pausgren) och tts-chat.js
  // (pauslaget + laget lases ur handelsen i stallet for DOM) andrades. media.js bar bada
  // URL:erna och maste folja med. Bryggorna ar serversidan och har ingen cachestrang.
    // SAMMANSLAGNINGEN 2026-08-21: media.js, tts-chat.js och studio.html rordes av BADA sidorna
  // (TTS-statusraden pa main, pausindikatorn har). Det sammanslagna innehallet ar varken det
  // ena eller det andra, sa alla tre far en NY strang — en sammanslagning som ror en fil AR en
  // andring av den filen.
    // Bumpad 2026-08-21 for skrivloopen i tomma topplistor: live-leaderboard.js andrades och
  // media.js bar dess URL. Strangen 20260803-dedupe byts samtidigt mot en som bara sager nar.
    // Bumpad 2026-09-04: media.js bar bade foljarmalets klassiska renderare, katalogknappen
  // for Samurai och premiumbuntens version-konstant — alla tre andrades.
  // Bumpad 2026-09-05 för Guardian-emblemets bild: triggerGuardianEmblem i media.js satte namnet
  // men aldrig avataren, så emblemet visade fel person eller ingen alls. media.js BÄR dessutom
  // guardian-session.js:s versionssträng, och den filen ändrades i samma veva (en Guardian som
  // kommer tillbaka firas nu igen) — utan en ny sträng på media.js fortsätter en cachad media.js
  // peka på den GAMLA guardian-session.js och båda fixarna uteblir hos användaren.
  //
  // studio.css, widget-factory.js och premium-bundlens version är OFÖRÄNDRADE och behåller sina
  // strängar: de följer filerna, inte varandra.
  //
  // Strängen säger NÄR, inte VAD. Första utkastet hette '20260905-guardian' och föll på vakten
  // ovan — med rätta: exemplet i dess egen kommentar är '20260818-guardian', en sträng som
  // överlevde sin widgetfamilj med noll minuter.
  //
  // Bumpad 2026-09-05 för namnnormaliseringen: live-client.js ändrades (dekorativa Unicode-alfabet
  // i tittarnas namn viks tillbaka till läsbara bokstäver, annars ritar webbläsaren rutor).
  // media.js BÄR live-client.js:s versionssträng, så media.js själv måste bumpas — annars fortsätter
  // en cachad media.js peka på den gamla live-client.js och fixen når ingen. Samma skäl som
  // duckningen 2026-08-17.
  //
  // studio.css, widget-factory.js och premium-bundlens version är OFÖRÄNDRADE och behåller sina
  // strängar: de följer filerna, inte varandra.
  //
  // SAMMANSLAGNINGEN: de två ändringarna ovan låg på var sin gren och båda bumpade media.js —
  // emblemgrenen till `-1`, namngrenen till `-2`. Det sammanslagna innehållet är varken det ena
  // eller det andra, så det får en TREDJE sträng. Att behålla någondera hade betytt att halva
  // ändringen levererades under en sträng som redan var utrullad, och just den halvan hade aldrig
  // nått en cachad webbläsare. Samma resonemang som sammanslagningen 2026-08-19: en sammanslagning
  // som rör en fil är en ändring av den filen.
  //
  // Bumpad 2026-09-05 för Top Likes-modellen: live-leaderboard.js visar hela sändningens total i
  // stället för ett rullande tiominutersfönster, och media.js:s updateRankingCycles läste
  // `person.activeLikes` — ett fält som inte längre finns. Båda filerna ändrades, och media.js bär
  // dessutom live-leaderboard.js:s versionssträng.
  //
  // studio.css, widget-factory.js och premium-bundlens version är OFÖRÄNDRADE.
  //
  // ANDRA SAMMANSLAGNINGEN SAMMA KVÄLL, av samma skäl som den ovan: namnfixen och Top Likes-modellen
  // låg på var sin gren och båda bumpade media.js — till `-3` respektive `-4`. Det sammanslagna
  // innehållet är varken det ena eller det andra, så det får en FEMTE sträng. Fyra ändringar rörde
  // media.js på ett dygn (emblemets bild, namnen, Top Likes, och de två sammanslagningarna), och
  // varje gång gäller samma regel: strängen följer FILEN, och en sammanslagning som rör en fil är
  // en ändring av den filen.
  // Bumpad 2026-09-06 för de två buggar David såg i overlayen under en riktig sändning och som
  // sedan reproducerades i bandet. BÅDA ändringarna ligger i filer vars versionssträng media.js
  // BÄR, så media.js själv måste bumpas — annars pekar en cachad media.js på de gamla URL:erna.
  //
  //   Like Fountain (#369): wrappern i media.js delade en timer mellan pulsen och nivån. Uppmätt
  //   över 4 651 likes: medianavståndet mellan händelser var 857 ms mot en timer på 900 ms, så
  //   47,3 % av luckorna var längre än timern och widgeten slocknade nästan varannan like.
  //
  //   Battle MVP (#368): battle-mvp-session.js lät "först till kvarn" avgöra mellan TikToks facit
  //   och vår egen räkning. Uppmätt: de kommer inom ±3 ms av varandra, och i 2 av 13 matcher
  //   pekade de på olika person. Filens strang gar fran `20260817-duckning` till en som bara
  //   sager NAR — den gamla namngav sitt innehall, vilket provet ovan forbjuder.
  // Bumpad 2026-09-07 för vinstsviten (#366): live-control.js och live-control.css ändrades båda
  // — Match Monitor visar numera `battleComboV2.comboCount`, det tal streamern ser som "0-2" i
  // TikToks eget gränssnitt. media.js BÄR båda strängarna, så media.js själv måste bumpas.
  // Bumpad igen 2026-09-07 för medvärdsgåvorna (#360): live-leaderboard.js filtrerar numera bort
  // gåvor som gick till en medvärd. media.js BÄR dess sträng, så media.js själv måste följa med.
  //
  // Och en TREDJE gång samma dygn för diamantmålet (#367 del 1), där tre filer ändrades och alla
  // tre bär egna strängar: widget-factory.js (måltypstabellen), premium-final.js (renderaren,
  // versionerad via konstanten längre ner) och media.js själv (katalogsektionen).
  //
  // SAMMANSLAGNINGEN ÄR SKÄLET TILL `-3`. #360 tog `-2` och #367 låg på en parallell gren. Det
  // rebasade innehållet är VARKEN det ena eller det andra utan båda, och en sammanslagning som
  // rör en fil är en ändring av den filen — precis som de två sammanslagningarna 2026-08-20 här
  // ovanför. Därför en egen sträng i stället för att ärva någonderas.
  // Bumpad en FJARDE gang samma dygn for ligabrickan (#367 del 3): live-control.js och
  // live-control.css andrades bada — Match Monitor visar numera vardens liga (A/B/C) med poang,
  // det narmaste svaret pa "vilken nr ar jag" som faktiskt finns i TikToks strom. media.js BAR
  // bada strangarna, sa media.js sjalv maste folja med.
  // Bumpad en FEMTE gang samma dygn: ligabrickan gjorde headern till en trekolumnslayout och
  // MATCH AKTIV-chippet flyttade 436 px in mot mitten. Bade live-control.js och .css andrades igen.
  // Bumpad 2026-09-08: Top Like-ramen renderas som syskon till fotot och placeras efter mätning.
  // Bumpad igen samma dag: gift-alert-frames.css fick omslaget i flodet (Follower/Fan Level),
  // och media.js bar dess versionsstrang.
  // Ny Guardian-modell: fabriken, media.js och dess syskonmodul laddas som samma version.
  for (const file of ['media.js', 'widget-factory.js']) {
    const version = studio.match(new RegExp('src=["\']' + file.replace('.', '\\.') + '\\?v=(\\d{8})-(\\d+)["\']'));
    assert.ok(version, file + ' must have a dated cache version');
    const date = Number(version[1]), revision = Number(version[2]);
    assert.ok(date > 20260912 || (date === 20260912 && revision >= 4),
      file + ' must retain cache freshness from 20260912-4 or later');
  }
  // Bumpad 2026-08-19: guardian-emblem.css fick sitt vilolage i sandningen (en alert far inte ligga
  // kvar pa skarmen mellan handelserna). BARA den filen andrades, sa bara den strangen byts —
  // en bump utan andring ar en gratis omladdning for varje anvandare.
  assert.match(studio, /guardian-emblem\.css\?v=20260819-2/);
  assert.match(studio, /guardian-emblem-fas\.js\?v=20260818-2/);
  // SAMMANSLAGNINGEN 2026-08-20 (Stigningen mot main): studio.css och media.js andrades av
  // BADA grenarna, sa bada far strangen 20260820-3. Grenen andrade dessutom
  // premium-final.css, som laddas via den injicerade version-konstanten — darfor byts
  // aven den. gifter-fas.js ar grenens nya fil och behaller v=1.
  assert.match(media, /gifter-fas\.js\?v=20260820-5/);
  // SAMMANSLAGNINGEN 2026-08-20 (Rise & Pop mot main): media.js andrades av bada
  // grenarna och premium-final.css bar profile-koreografin, sa skript-URL:en, den
  // injicerade version-konstanten OCH gifter-fas.js far strangen 20260820-4.
  // Bumpade 2026-09-20 av 5a96741 ("Aktivera endast nya rankingdesigner"): BADA filerna
  // andrades i den omgangen, sa bada far samma nya strang. Vakten foljde inte med da.
  // Bumpad 2026-09-21: BARA .js-strangen. #493 andrade toplike-studio.js men inte .css:en, och
  // en strang som hojs utan att filen andrats ar lika fel at andra hallet — den tvingar fram en
  // omladdning av nagot som ar identiskt, och nasta lasare tror att filen bytts.
  // Bumpad 2026-09-22: BARA .js-strangen igen. Skinnklassen stamplas nu bara pa templateTopLike,
  // och skinnvaljaren ritas bara dar — en andring i toplike-studio.js, inte i .css:en. Utan
  // hojningen kor varje cachad OBS-kalla kvar pa den gamla koden och far aldrig fixen.
  // Bumpad 2026-09-24 (ranking-sixpack): BADA strangarna. toplike-studio.js fick den nya
  // riktnings-/spegelklassen (ranking-mirrored) och toplike-studio.css inget nytt direkt (de sex
  // nya skinnens CSS ligger i ranking-sixpack.css) — men bada bumpas tillsammans har eftersom
  // skinnlistan (toplike-design.js) och skinnklassens konsumenter andrades i samma omgang.
  assert.match(media, /toplike-studio\.css\?v=20260924-sixpack/);
  assert.match(media, /toplike-studio\.js\?v=20260924-sixpack/);
  // Bumpade 2026-09-08 (ramen ror inte bildmattet): gift-alert-frames.js/.css lagger ramen runt hela
  // flippen med utatskalad konst, profile-frames-premium.css bar Top Likes syskonregler.
  assert.match(media, /gift-alert-frames\.js\?v=20260908-bildmatt/);
  assert.match(media, /gift-alert-frames\.css\?v=3/);
  assert.match(media, /profile-frames-premium\.css\?v=9/);
    // Bumpad 2026-09-04: premium-final.js AR den levande renderaren for social goals — den
  // laddas har, inte av en <script>-tagg i studio.html — och dess plusikon ritas numera som
  // inline-SVG. Konstanten styr premium-final.js/.css och runtime-controls.css.
  // Bumpad 2026-09-07 (#367): premium-final.js erbjuder numera diamantmålet bland ramdesignerna.
  // Premium-bundelns strang. Den halkade efter i 48b3458 ("Byt gamla social goals mot sex nya
  // VYRA-designer") och har varit ur synk sedan dess — darav tre veckor med en rod vakt som
  // ingen atgardade. Star nu pa det media.js faktiskt bar.
  // Bumpad 2026-09-23: premiumbunten fick topgift-pension.js, som lindar den vyraTopGift
  // premium-final.js sjalv skriver over. En ny fil I bunten ar en andring AV bunten, sa
  // strangen foljer med — annars laddar en cachad klient de fyra gamla och aldrig den femte.
  // Bumpad 2026-09-23 igen: premium-final.css stadades pa de tio pensionerade designer som
  // gallringen lamnade kvar dar (32 selektorer, fyra keyframes). Konstanten styr BADE
  // premium-final.js och premium-final.css, sa en cachad klient hade annars fortsatt hamta den
  // gamla CSS:en — och de borttagna designerna hade levt kvar hos just de som redan varit inne.
  assert.match(media, /const version='20260923-3'/);
  // Bumpad 2026-09-22 for gavororelsen (docs/gavororelsen.md §1 och §7): widget-fas.js fick
  // `spelar(box)` och en uttrycklig vagran att koppla sig nar `triggerNamn` saknas. media.js BAR
  // strangen, sa media.js sjalv maste bumpas — annars pekar en cachad media.js pa den gamla
  // widget-fas.js och ingen av de tre arterna far den nya motorn. Samma skal som duckningen
  // 2026-08-17. fan-fas.js och gifter-fas.js ar OFORANDRADE och behaller sina strangar.
  assert.match(media, /widget-fas\.js\?v=20260922-1/);
  assert.match(media, /fan-fas\.js\?v=20260819-fabriken/);

  // De filer duckningen rorde. En bump utan andring ar en gratis omladdning for varje
  // anvandare; en andring utan bump ar en tyst gammal fil. Bada ar fel, sa listan ar explicit.
  //
  // battle-mvp-session.js LAMNADE listan 2026-09-06: filen andrades (facit vinner over den egna
  // rakningen, #368), sa dess strang foljer numera den andringen och inte duckningen. Den fick
  // samtidigt en strang som bara sager NAR — `20260817-duckning` namngav sitt innehall, vilket
  // provet hogre upp i den har filen forbjuder. De ovriga fyra ar OFORANDRADE och behaller sin.
  assert.match(media, /battle-mvp-session\.js\?v=20260906-1/,
    'battle-mvp-session.js cachebustades inte for #368');
  // sound-alerts.js LAMNADE listan 2026-09-23: sound alerts-biblioteket andrade filen, och den ar
  // alltsa inte langre "oforandrad sedan duckningen". Bumpen till 20260923-library gjordes ratt i
  // den andringen — det var LISTAN som inte fick veta, sa provet stod rott pa main.
  //
  // Upptackt i sammanslagningen hit och fixat har for att gallringen ska kunna ga in gron. Felet
  // ar INTE gallringens: det faller likadant pa main utan en rad ur den har grenen.
  assert.match(media, /sound-alerts\.js\?v=20260923-library/, 'sound-alerts.js cachebustades inte');
  for (const fil of ['vyra-tal']) {
    assert.match(media, new RegExp(`${fil}\\.js\\?v=20260817-duckning`), `${fil}.js cachebustades inte`);
  }
  // action-event.js LAMNADE listan 2026-09-16: Action-vyn byggdes om mot TikFinity-facit
  // (docs/referens/tikfinity-actions-facit.md) och filen ar alltsa inte langre "oforandrad sedan
  // duckningen". De fyra filerna i samma ombyggnad delar strang, for de ar EN andring — halls de
  // isar kan en av dem laddas gammal mot de andras nya kontrakt, och faltregistret finns bara i en
  // av dem: laddas action-event.js gammal saknar de andra tre `VyraActionFields` och tappar TYST
  // varje falt de skulle ha lamnat ifran sig.
  //
  // GRUPPEN DELADES 2026-09-23. action-event.js och action-event.css bumpades till
  // `20260923-workspace` i workspace-arbetet pa main; de ovriga sju rordes inte. Provet stod rott
  // pa main tills den har raden skrevs om.
  //
  // Delningen ar RATT, och det ar vart att skriva ut varfor, for regeln ovan sager motsatsen:
  // repots grundregel ar att en strang foljer SIN fil, inte grannarnas. Faran gruppen skulle
  // skydda mot ar att action-event.js laddas GAMMAL mot de andras nya kontrakt — da saknas
  // `VyraActionFields` och de tre som laser registret tappar tyst varje falt. En NYARE strang pa
  // just action-event.js gor tvartom: den tvingar fram en ny hamtning. De sju oforandrade ska
  // darfor behalla sin, annars ar bumpen en gratis omladdning for varje anvandare.
  for (const fil of ['action-media', 'action-options', 'action-scenes', 'action-runtime', 'action-event-advanced', 'live-client', 'action-simulator']) {
    assert.match(media, new RegExp(`${fil}\\.js\\?v=20260916-facit`), `${fil}.js cachebustades inte for facit-ombyggnaden`);
  }
  // action-event.js gick vidare till 20260923-2 nar de tva tomma tillstanden lagades (de var
  // hidden, bar avkortad text och lat vyra-tomma-handlingar.js injicera en ANDRA knapp bredvid
  // kortets egen). CSS:en rordes inte och star kvar — strangen foljer sin fil.
  assert.match(media, /action-event\.js\?v=20260923-2/, 'action-event.js cachebustades inte');
  assert.match(media, /action-event\.css\?v=20260923-workspace/, 'action-event.css bumpades utan andring');
  // goal-client.js fick ett tyst nollställningsläge för actionen "Styr ett mål"; den laddas
  // från studio.html, inte från media.js.
  assert.match(read('studio.html'), /goal-client\.js\?v=20260916-facit/, 'goal-client.js cachebustades inte');
  // Grannarna i samma laddningslista ar ororda och ska INTE ha bumpats med.
  // De tva filer panellagningen rorde. En bump utan andring ar en gratis omladdning; en andring
  // utan bump ar en tyst gammal fil som fortsatter riva panelen vid varje tangenttryck.
  assert.match(media, /custom-widgets\.js\?v=20260818-panel-live/);
  // Bumpad 2026-09-20: gift-fireworks.js andrades nar nivan borjade folja gavans varde i
  // stallet for antalet tryck. Grannarna pa samma rad (gift-classics-engine,
  // gift-supernova-engine/-panel) ar ororda och behaller 20260912-3.
  assert.match(media, /gift-fireworks\.js\?v=20260919-niva2/);
  assert.match(media, /vyra-masterval\.js\?v=20260817-tal/);
  assert.match(media, /action-master\.js\?v=20260817-tal/);

  // WIDGETLANKENS FILTER 2026-08-22. layout-safe.js ager duken i overlay-utdata (overlay-lage
  // kor med view === 'editor'), och dess renderare fragade aldrig ?widget= — en individuell
  // widgetlank ritade hela overlayn, uppmatt i produktion. Filen laddas DIREKT fran studio.html,
  // inte via media.js, sa strangen bor dar. Den sag inte ens tidigare till i det har provet;
  // en andring utan bump hade betytt att varje cachad webblasare fortsatter lacka hela layouten
  // in i sandningen.
  // Bumpad till -4 samma dag: fallbacken nar window.VyraWidgets saknas var fail-open och
  // kunde ater visa hela layouten fran en individuell lank. -3 hann publiceras i PR-grenen och
  // kan ligga i previewmiljons cache, sa strangen maste byta igen — annars serveras den
  // fail-open-versionen vidare.
  // Bumpad 2026-09-20: layout-safe.js passar in duken igen efter att den bytt ut #view i
  // overlay-utdata - forr stod overlayen oskalad 432x768 i hornet av TikToks 1080x1920-ruta.
  assert.match(studio, /layout-safe\.js\?v=20260920-1/);
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
