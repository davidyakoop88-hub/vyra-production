'use strict';
// KATALOGENS NYCKLAR, EN KÄLLA.
//
// Listan läses ur `docs/katalogkarta.md`, som CI genererar ur de KÖRANDE katalogknapparna. Det är
// med flit inte en handskriven lista: en vakt som räknar upp vaktar bara det någon kom ihåg, och en
// ny widgetfamilj ska ärva täckningen utan att någon behöver minnas det.
//
// TECKENKLASSEN MÅSTE BÄRA A-Z. Uppmätt 2026-08-19: utan versaler klipptes
// `catalog:glovesnipe:koiPearl` till `koi` och `catalog:ranking:templateTopCoins` till `template`,
// och båda rapporterades som katalognycklar fabriken inte kunde bygga. Det var uttrycket som var
// trasigt, inte katalogen.
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KARTA = path.join(ROOT, 'docs', 'katalogkarta.md');

function nycklar() {
  const text = fs.readFileSync(KARTA, 'utf8');
  return [...new Set(text.match(/catalog:[A-Za-z0-9:._-]+/g) || [])].sort();
}

// Golvet är en kontrollmätning, inte ett tak. En tom eller flyttad karta ger noll nycklar, och då
// blir varje vakt som itererar över dem grön av ingenting.
//
// Golvet var 150. Kartan gick från 151 till 149 nycklar 2026-09-19 22:20 (cffae80) när katalogen
// krympte med flit, och referensvakten föll då vid inläsning — före ett enda foto — med felet
// här nedanför. Vakten mot en FLYTTAD eller TOM karta är inte ett facit för antalet.
//
// 140 skrevs "med marginal för nästa avvecklinger". Den marginalen räckte inte: gallringen av Top
// Gifts designer 2026-09-23 tog bort 38 på en gång (sju gåvoramar, tolv VYRA ORIGINAL, nitton
// premium) och kartan står nu på 112 nycklar i 115 kort. Golvet föll alltså på en avveckling som
// var hela poängen med ändringen, inte på en karta som flyttat.
//
// 100 är det nya golvet, satt på samma sätt: långt under dagens 112 så att en normal avveckling
// får plats, långt över noll så att en tom eller flyttad karta fortfarande fångas. Siffran står på
// ETT ställe och overlay-alla-widgets läser den härifrån — annars glider de två isär, och det var
// precis vad som hände förra gången golvet ändrades.
const GOLV = 100;
function kravNycklar(minst = GOLV) {
  const lista = nycklar();
  if (lista.length < minst) {
    throw new Error(`hittade bara ${lista.length} katalognycklar i docs/katalogkarta.md `
      + `(väntade minst ${minst}) — har kartan flyttat eller inte regenererats?`);
  }
  return lista;
}

// Alert-familjerna kan inte fotograferas i vila: de är SLÄCKTA tills de utlösts, och Playwright
// vägrar fotografera en osynlig nod. Tabellen säger hur var och en väcks.
//
// ANROPSFORMEN STÅR UTSKRIVEN PER FAMILJ. `triggerLastXAlert(typeKey, event)` tar en TYPNYCKEL som
// första argument och inte ett event — en rigg som skickade ett objekt tystade fem friska widgets
// och rapporterade dem som trasiga.
const ALERTS = {
  templateBattleMvp:      ['triggerBattleMvp', { username: '@Vakt', __test: true }],
  templateFanLevel:       ['triggerFanLevelUp', { username: '@Vakt', level: 12, __test: true }],
  templateGifterLevel:    ['triggerGifterLevelUp', { username: '@Vakt', level: 9, __test: true }],
  templateFollowerAlert:  ['triggerNewFollower', { username: '@Vakt', __test: true }],
  templateLastX:          ['triggerLastXAlert', 'gifter', { username: '@Vakt', __test: true }],
  templateGuardianEmblem: ['triggerGuardianEmblem', { username: '@Vakt', __test: true }],
  templateGloveSnipe:     ['triggerGloveSnipe', { username: '@Vakt', __test: true }],
  templateLikeFountain:   ['triggerLikeFountainPop', { username: '@Vakt', __test: true }],
  templateGiftJar:        ['triggerGiftJarDrop', { username: '@Vakt', __test: true }],
  templateGiftFireworks:  ['triggerGiftFireworks', { username: '@Vakt', __test: true }],
};

// UTAN VISUELL REFERENS, MED SKÄL PER POST.
//
// Tröskeln sänks inte. En referens som är en tom ruta matchar allt, så att skriva en vore att tysta
// vakten för just den nyckeln — och den tystnaden upptäcks aldrig, eftersom provet är grönt. De här
// är i stället UNDANTAGNA, var och en för att det inte FINNS någon stillbild att jämföra.
//
// EN POST KAN VARA ETT PREFIX, och det är med flit: `giftfireworks` har tre varianter med exakt
// samma skäl. Att skriva tre rader hade fått undantagslistan att se dubbelt så stor ut som den är,
// och taket nedan finns för att listan ska göra ont att växa.
const UTAN_REFERENS = {
  'catalog:custom:image': 'en tom behållare som väntar på användarens egen bild — 0,4 % målad',
  'catalog:custom:video': 'samma, för video — 0,2 % målad',
  'catalog:giftfireworks:':
    'partiklarna ritas på en Pixi-duk med egen ticker, som animationsfrysningen inte styr. Vid '
    + 'varje fast tidpunkt är duken tom (0 % målad i alla tre varianterna), och en pixeljämförelse '
    + 'av ett partikelsystem säger ingenting även när den lyckas.',
  'catalog:glovesnipe:':
    'effekten är en H.264-kodad MP4 (`pack-fx-video`), och playwright-core:s Chromium saknar stöd '
    + 'för den kodeken. Uppmätt 2026-08-19: `canPlayType("video/mp4; codecs=avc1.42E01E")` ger tom '
    + 'sträng och videon faller med DEMUXER_ERROR_NO_SUPPORTED_STREAMS, så alla åtta varianter '
    + 'målar 0 %. Det är webbläsaren i provet som saknar kodeken — i OBS och i vanlig Chrome '
    + 'spelar de. Undantaget gäller alltså provmiljön, inte widgeten.',
  'catalog:likefountain':
    'en fontän av hjärtan i ständig rörelse. Uppmätt 2026-08-19: 22 olika bildrutor på 12 sekunder '
    + 'och ingen kom igen, i fyra körningar av fyra. Frysningen når inte heller rörelsen. Utan ett '
    + 'stillastående ögonblick finns ingen bild att jämföra mot.',
};

const utanReferens = nyckel =>
  Object.keys(UTAN_REFERENS).some(p => nyckel === p || nyckel.startsWith(p));

// EGEN REGI FÖR DE WIDGETAR SOM INTE GÅR ATT FRYSA UTIFRÅN.
//
// Den generella riggen fryser CSS-animationer på en fast tidpunkt. Det räcker för nästan hela
// katalogen, men inte för en widget vars förlopp drivs av KLASSER som en JS-klocka byter över tid:
// spolar man animationerna till en tidpunkt medan klasserna står på en annan blir kombinationen
// omöjlig och bilden tom. Uppmätt på Guardian Emblem 2026-08-19: 0 % målad yta vid samtliga nio
// stegtidpunkter, mot 66–82 % levande.
//
// Att i stället fotografera den levande gick inte heller: koreografin är i ständig rörelse, och av
// ~20 bildrutor på 12 sekunder kom samma bild igen bara ibland — 2 av 4 körningar föll. En vakt med
// nolltolerans kan inte vila på det.
//
// Familjen har därför en egen regi här. Den använder krokan familjen själv lämnade: `klocka` i
// VyraGuardianEmblemFas är utbytbar MED FLIT, med orden "Provet ersätter den med en manuell klocka"
// i filhuvudet. Regin stoppar klockan, ställer lådan i den fas som ska fotograferas och fryser
// animationerna en fast tid in i just den fasen. Då är bilden bestämd av kod och inte av tajming.
const REGI = {
  // LIKE FOUNTAIN. Den DOM-byggda fontanen har alltid kunnat fotograferas: dess
  // hjartan ar CSS-animationer som gar i loop och hamnar i samma lage igen. Canvas-
  // lagret i like-fountain-particles.js gor inte det -- partiklarna ar slumpade och
  // samma RASTER kommer aldrig tillbaka, vilket ar exakt det `stilla()` letar efter.
  //
  // Motorn lamnar darfor VyraLikeFountainFx.still(), samma kontrakt som
  // VyraMvpParticles.still() och VyraAnimalGiftJars.still(): den stoppar slingan,
  // tar bort duken och later DOM:en ga tillbaka till det som fanns fore modulen.
  // Referensbilderna gjordes pa DOM-fontanen och galler alltsa fortfarande.
  //
  // Duken ar dessutom dold for prefers-reduced-motion i studio.css, sa regin
  // replikerar produktens egen regel i stallet for att hitta pa en ny.
  'catalog:likefountain': {
    fas: 'duken-borttagen', ms: 0,
    varfor: 'DOM-fontanen loopar och kan fotograferas; canvas-lagret ar slumpat och kan inte',
    regi: () => {
      const box = document.querySelector('.widget.like-fountain');
      if (!box) return { fel: 'fontanen renderades inte — saknas .widget.like-fountain' };
      if (!window.VyraLikeFountainFx) return { fel: 'like-fountain-particles.js laddades aldrig' };
      window.VyraLikeFountainFx.still();
      return {
        dukar: box.querySelectorAll('canvas.lf-duk').length,
        partiklar: box.querySelectorAll('.lf-p').length
      };
    }
  },

  // EN POST PA NYCKELNIVA, inte pa typ. Alla 23 battlemvp-nycklar har typen templateBattleMvp,
  // men bara de sex firandena ar CSS-koreografier. De ovriga 17 fotograferas korrekt av den
  // generella frysningen — prefixet haller dem utanfor. Se uppslaget i tests/helpers/visuell.js.
  //
  // FORLAGAN AR GUARDIAN OCH GIFTJAR I FORENING. Fasen stalls som guardian gor, OCH en canvas
  // maste stoppas som giftjar gor.
  //
  // Posten sa tidigare att firandena varken hade canvas, requestAnimationFrame eller
  // renderarobjekt. Det slutade vara sant nar battle-mvp-particles.js lades till: tva dukar
  // per scen, ritade av en rAF-slinga med slumpade partiklar. Vakten foll pa exakt det --
  // 43 olika bildrutor pa 14 s och ingen som kom igen, for `stilla()` letar samma RASTER tva
  // ganger och slumpade partiklar ger aldrig det. De stillastaende rutorna i slutet raknades
  // inte heller: da har mvc-show redan tonat scenen under 3 % malad yta.
  //
  // Motorn lamnar darfor VyraMvpParticles.still(), precis som VyraAnimalGiftJars.still().
  //
  // MS AR VALT UR KEYFRAMES, inte pa kansla. Durationen ar 10 s for katalognycklarna
  // (widget-factory satter mvpDuration: 10, CSS laser var(--mvc-duration,10s)):
  //
  //   mvc-face (portrattet)  osynligt till 40 %, pa plats 48 %  -> 4800 ms
  //   mvc-copy (texten)      osynlig till 44 %, satt fran 54 %  -> 5400 ms
  //   mvc-show (hela scenen) opacity 1 till 96 %, DARIFRAN till 0 -> 9600 ms
  //
  // Hallfonstret ar alltsa 5400-9600 ms. 7500 ar mitten, med 2,1 s marginal at bada hallen.
  // Att frysa pa SLUTBILDEN hade gett opacity 0 och en tom referens — och en tom referens matchar
  // allt, vilket ar tystare an att sakna en.
  //
  // PARTIKLARNA TAS BORT, de vaktas inte. .mvc-finale ar 20 element med egna fordrojningar och
  // drift, och .mvc-charge ar ett laddningsglod — bada icke-deterministiska. Produkten doljer dem
  // redan sjalv for anvandare med prefers-reduced-motion, sa regin nedan replikerar exakt den
  // regeln i stallet for att hitta pa en egen. Vakten tacker komposition, konstverk, portratt och
  // text; inte partikeleffekten. Smalare an full tackning, men matbart och arligt.
  'catalog:battlemvp:celebration:': {
    fas: 'firande-stilla', ms: 7500,
    varfor: 'CSS/DOM-koreografi utan canvas eller ticker; produkten har redan ett stilla lage for reducerad rorelse',
    regi: ([fas, ms]) => {
      const box = document.querySelector('.battle-mvp.mvp-celebration');
      if (!box) return { fel: 'firandet renderades inte — saknas .battle-mvp.mvp-celebration' };
      if (!box.classList.contains('mvp-active')) {
        return { fel: 'firandet tandes aldrig — .mvp-active saknas, kordes triggerBattleMvp?' };
      }
      // Samma tva val som @media(prefers-reduced-motion:reduce) gor i battle-mvp-celebrations.css.
      box.querySelectorAll('.mvc-charge, .mvc-finale').forEach(n => n.remove());
      // Partikeldukarna ar samma sorts dekoration och doljs av samma media-regel.
      if (window.VyraMvpParticles) window.VyraMvpParticles.still();
      const alla = [...box.getAnimations({ subtree: true })];
      alla.forEach(a => { a.pause(); a.currentTime = ms });
      void box.offsetWidth;
      return { fas, ms, animationer: alla.length };
    },
  },
  templateGiftJar: {
    fas: 'tom djurburk', ms: 0,
    varfor: 'godkänd djurkonst fotograferas stilla; fallande gåvor verifieras separat i liveprovet',
    regi: async ([fas, ms]) => {
      const box = document.querySelector('.animal-gift-jar');
      const cv = box?.querySelector('canvas');
      const w = state.widgets.find(w => String(w.id) === box?.dataset.id);
      if (!cv || !w || !window.VyraAnimalGiftJars) return {fel: 'djurburkens renderare saknas'};
      cv.dataset.jarFrozen = '1';
      await window.VyraAnimalGiftJars.still(cv, w);
      return {fas, ms, animationer: 0};
    },
  },
  templateGiftCampaign: {
    fas: 'stilla aura', ms: 4000,
    varfor: 'canvas och perspektiv drivs av gemensam JS-ticker; katalogens frysta renderare ger en reproducerbar bild',
    regi: ([fas, ms]) => {
      const box = document.querySelector('.vyra-campaign-aura');
      const w = state.widgets.find(w => w.id === box?.dataset.id);
      if (!box || !w || !window.VyraCampaignAuraEngine) return { fel: 'kampanjens renderare saknas' };
      window.VyraCampaignAuraSession.clear();
      window.VyraCampaignAuraEngine.still(box, w);
      const alla = [...box.getAnimations({subtree:true})];
      alla.forEach(a => { a.pause(); a.currentTime = ms; });
      return {fas, ms, animationer: alla.length};
    },
  },
  templateGuardianEmblem: {
    // `hyllning` är hållfasen (3500 ms av totalt 6100) — det är den bilden tittaren minns.
    fas: 'hyllning',
    ms: 900,
    varfor: 'faskoreografi driven av en JS-klocka; fryst utifrån blir bilden tom',
    regi: ([fas, ms]) => {
      const F = window.VyraGuardianEmblemFas;
      if (!F) return { fel: 'VyraGuardianEmblemFas saknas — laddas inte skriptet i overlay?' };
      const box = document.querySelector('[data-id]');
      if (!box) return { fel: 'ingen widget' };
      if (F.FASER.indexOf(fas) < 0) return { fel: 'okänd fas ' + fas + ' av ' + F.FASER.join(',') };

      // Stoppa klockan INNAN spela() — annars hinner de riktiga timrarna läggas.
      // Bytet är permanent för sidan, och det är avsiktligt: varje emblem-nyckel fotograferas
      // under samma regi, och sidan används inte till något annat.
      F.klocka.satt = () => 0;
      F.klocka.rensa = () => {};
      if (!F.spela(box)) return { fel: 'spela() nekade steget ' + F.stegAv(box) };

      [...box.classList].forEach(k => { if (k.indexOf(F.PREFIX) === 0) box.classList.remove(k) });
      box.classList.add(F.PREFIX + fas);
      void box.offsetWidth;

      const alla = [...box.getAnimations({ subtree: true })];
      alla.forEach(a => { a.pause(); a.currentTime = ms });
      void box.offsetWidth;
      return { fas, ms, animationer: alla.length, klasser: [...box.classList].join(' ') };
    },
  },
};

module.exports = { nycklar, kravNycklar, GOLV, ALERTS, KARTA, UTAN_REFERENS, utanReferens, REGI };
