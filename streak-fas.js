// streak-fas.js — koreografin för Top Streak, en fas i taget.
//
// GÅVORÖRELSENS FÖRSTA ART (docs/gavororelsen.md). Mekaniken bor i widget-fas.js — samma fabrik
// som driver Fan Level Up och Gifter Level Up. Här bor det Streak-specifika: registret FASER,
// tiderna, temanas dokumentation och konfigurationspunkterna.
//
// TRE SAKER SKILJER DEN HÄR ARTEN FRÅN DE TVÅ ANDRA, och alla tre är uppmätta.
//
// 1 · DEN KOPPLAR SIG INTE (spec §1). Fan och Gifter är ALERTS: de tänds, spelar och släcks, och
//     `koppla()` lindar sig runt deras globala trigger och läser ett timerspår per tänd låda. Top
//     Streak är en PERMANENT widget — uppmätt 2026-09-22 finns varken `triggerTopStreak` eller
//     något timerfält. Arten säger därför `triggerNamn: null` rakt ut, och `spela()` anropas
//     explicit från gift-event-images.js:arma(), efter patchen och efter rekordgrinden. Det är
//     exakt där `mark()` redan anropas.
//
// 2 · FASERNA RÖR ALDRIG NÅGON AV DE SJU NODERNA (spec §3). `VyraFlip.PARTS` listar sex
//     selektorer, men `parts()` är `[el, ...el.querySelectorAll(PARTS)]` — WIDGETLÅDAN står först.
//     `offset()` skriver `animation-delay` på alla sju vid varje gåva. Uppmätt 2026-09-23: lådan
//     får `-38ms` efter 38 ms. En fas på lådan hade fått hela sändningens gångtid som negativ
//     fördröjning och aldrig synts en enda gång. Faserna animerar barnen.
//
// 3 · PREFIXET ÄR `sfas-`, INTE `streak-fas-`. Modellen läses med `layoutAv()`, som returnerar
//     FÖRSTA klassen som börjar med layoutPrefix. Temaklasserna heter `streak-inferno`, så
//     prefixet måste vara `streak-`. Hade fasklasserna hetat `streak-fas-slaget` — formen de två
//     andra arterna använder — hade `layoutAv()` kunnat svara 'fas-slaget' i stället för 'inferno'
//     så fort klassordningen bytte. S4 i tests/streak-fas.test.js vaktar att de två aldrig möts.
//
// TAKET BETYDER NÅGOT ANNAT HÄR. För Fan och Gifter är `KORTASTE_VISNING` hur kort en alert som
// kortast står kvar, och provet kräver att sekvensen ryms innan lådan släcks. Top Streak släcks
// aldrig. Taket är i stället hur länge en streamer står ut med att vänta på nästa kvittens, och
// sedan §7:s beslut — en pågående koreografi spelar klart — är det den enda gräns som finns.
(function (root) {
  'use strict';

  const PREFIX = 'sfas-';
  const LAYOUTPREFIX = 'streak-';
  const KORTASTE_VISNING = 1300;

  // REGISTRET. Ett tema utan post spelar som förut — utan fas. Temana byggs ett i taget med
  // godkänd byggplan per tema; en halvfärdig fas är sämre än ingen.
  //
  // inferno · ELDEN TAR. Uppmätt på main 2026-09-23 före bygget: vid ett nytt rekord gör widgeten
  // exakt EN sak — `mark()` lägger `.record` och `giftPulse 2.1s` spelar på gåvobilden. Allt annat
  // som är streakens accent (`streakEnter 3.8s`, `streakHit 1.1s`, `streakNumber .8s`,
  // `streakFire .8s`) hänger på `.hit`, och den klassen sätts aldrig om i sändning — rotationen är
  // oändlig och `resume()` får inte spola tillbaka den. Talet byter alltså värde i tystnad, med en
  // enda puls på bilden bredvid.
  //
  //   fas 1 · antändning  340 ms   rubriken TOP STREAK tänds och öppnar sin spärr
  //   fas 2 · slaget      380 ms   talblocket tar emot: glöd på ramen, etiketten STREAK hårdnar
  //   fas 3 · avläsning   340 ms   namnet lyfts fram kort och lägger sig
  //
  // Totalt 1060 ms — samma storleksordning som Fan (1000–1040) och Gifter (1040–1280), för att tre
  // rörelser ur samma app ska kännas som samma app.
  //
  // VI RAMAR IN `giftPulse`, VI DUPLICERAR DEN INTE. Samma val som `number`-modellen i
  // gifter-fas.js gjorde mot `gifterTransform`: pulsen är 2,1 s och löper vidare genom alla tre
  // faserna som en lång svans. Koreografin är läsordningen, inte ännu en puls.
  //
  // TVÅ NODER ÄR UPPTAGNA och rörs därför inte: `.streak-score b` bär `streakNumber` och
  // `.streak-flip>i` bär `streakFire`, båda under `.hit`. En fas-regel på dem hade ersatt
  // animationen — och när fasklassen togs bort hade den gamla startat om av sig själv, mitt i
  // sekvensen. Faserna håller sig till noder utan egen animation.
  //
  // OCH TRANSFORMEN ÄR UPPTAGEN PÅ DE DIREKTA BARNEN. `.streak-inferno>*` bär `skewX(3deg)` som
  // motvikt till lådans `skewX(-3deg)`. En transform-animation på `.streak-copy` eller
  // `.streak-score` hade slagit ut skevningen mitt i rörelsen. Fas 2 använder därför `filter` på
  // det direkta barnet; bara barnbarnen (`small`, `strong`, `span`) får röra transform.
  const FASER = {
    inferno: [
      { namn: 'antandning', ms: 340 },
      { namn: 'slaget', ms: 380 },
      { namn: 'avlasning', ms: 340 },
    ],
  };

  // Punkterna, samlade på ETT ställe. `layoutPrefix` speglar renderarens streak-<tema>-klasser
  // (media.js vyraStreak). `triggerNamn` och `timerFalt` är NULL med flit — se punkt 1 i
  // filhuvudet; fabriken svarar då att den inte kopplar sig, och S6 vaktar det.
  const motor = root.VyraWidgetFas.skapa({
    prefix: PREFIX,
    kortasteVisning: KORTASTE_VISNING,
    faser: FASER,
    layoutPrefix: LAYOUTPREFIX,
    selector: '.vyra-streak',
    aktivKlass: 'hit',
    timerFalt: null,
    triggerNamn: null,
  });

  motor.LAYOUTPREFIX = LAYOUTPREFIX;
  root.VyraStreakFas = motor;
})(window);
