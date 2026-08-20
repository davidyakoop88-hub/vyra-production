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
function kravNycklar(minst = 150) {
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
  'catalog:giftjar:heart':
    'ORSAKEN AR INTE FASTSTALLD, och det star har med flit. Uppmatt 2026-08-19: nyckeln vaxlar pa '
    + 'CI mellan exakt tva renderingar som skiljer 115 av 87000 pixlar, alltid inom exakt samma '
    + '232x34 px vid (13,254), alltid med storsta kanalskillnad 18 av 255. Samma siffror i fyra '
    + 'korningar. Lokalt ar den daremot helt stabil: 10 ombyggnader gav en enda bild, tva skilda '
    + 'webblasarsessioner gav 0 av 87000, och 100 sekunders vantan andrade ingenting. De ovriga sex '
    + 'giftjar-varianterna reproducerar. Bandet ligger vid burkens fyllnadsniva, sa en hypotes ar '
    + 'att nivan speglar hopsamlat gavotillstand fran de alerts som triggats tidigare i korningen '
    + 'och darmed beror pa ordningen - men det ar en HYPOTES, inte en matning. Nyckeln ar undantagen '
    + 'tills nagon har visat vad som faktiskt skiljer.',
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

module.exports = { nycklar, kravNycklar, ALERTS, KARTA, UTAN_REFERENS, utanReferens, REGI };
