// topgift-pension.js — skyddsnätet under en gallring av Top Gifts designer.
//
// VARFÖR FILEN FINNS. Top Gift har 40 designer fördelade på fyra tabeller i widget-factory.js:
// `topgift.theme` (4), `topgift.frame` (7), `topgift.extra` (8) och `topgift.premium` (21). När en
// av dem plockas bort finns tre utgångar, och två av dem är TYSTA — uppmätt 2026-09-23:
//
//   katalogen skapar en ny     pick() KASTAR: "Okänd premiumdesign … giltiga: …"
//   sparad widget MED ram      GIFT_FRAMES[w.giftFrame] → undefined → faller till premiumgrenen
//   sparad widget UTAN ram     klassen topgift-<borttagen> utan CSS → struktur utan skinn
//
// De två sista kraschar inte. De ser bara fel ut nästa gång någon laddar sin overlay, och det kan
// vara mitt i en sändning. Den här filen gör dem omöjliga: en pensionerad design pekas om till en
// vi valt åt den, INNAN renderaren ser den.
//
// TABELLEN ÄR TOM MED FLIT. Skyddsnätet byggs före gallringen, inte efter — annars är den första
// borttagningen den som inte skyddas. Att pensionera en design är sedan EN rad här plus städningen
// (CSS, referensbild, vaktens nyckel, ramkonsten). tests/topgift-pension.test.js håller raden ärlig.
//
// VAR DEN SITTER, OCH VARFÖR DET ÄR PRECIS HÄR. `premium-final.js:18` SKRIVER ÖVER `vyraTopGift`
// helt — den i media.js ser ut som originalet men betjänar bara ramgrenen (via `klassiskTopGift`).
// Den här modulen laddas därför i premiumbunten direkt efter premium-final.js och lindar den
// renderare som faktiskt kör. En wrapper i media.js skriptsvans hade lindat fel funktion, eller
// rätt funktion vid fel tidpunkt.
//
// DEN MUTERAR INTE WIDGETEN. Renderaren får en KOPIA med de omskrivna namnen. Streamerns sparade
// val står kvar orört, så en design som tas tillbaka dyker upp igen av sig själv — och en
// felaktig pensionering kan ångras utan att någons data gått förlorad.
(function (root) {
  'use strict';

  // <pensionerad design> : <vad den ska ritas som>
  //
  // Nyckeln är namnet som ligger i `w.theme` eller `w.giftFrame` hos någon som redan sparat sin
  // layout. Värdet är antingen
  //
  //   en STRÄNG        — samma sorts design, nytt namn. Fältet behålls.
  //   ett OBJEKT       — `{ tema, accent }`: widgeten AVFRAMAS. `giftFrame` töms och `theme` sätts.
  //
  // Objektformen finns därför att en ram och ett tema inte är samma sak: ramen är en egen GREN i
  // renderaren (`if (w.giftFrame) return klassiskTopGift(w)`), inte ett annat skinn på samma gren.
  // En ram som pekades på ett temanamn hade fallit igenom till premiumgrenen ändå — men av en
  // slump, inte av ett beslut, och nästa läsare hade inte kunnat se skillnaden.
  //
  // `accent` sätts BARA om widgeten saknar en egen. Den ramade grenen föll tillbaka på ramens
  // accentfärg när streamern inte valt någon (`bk(w, w.accent, 'highlight', gf.accent)`), och
  // premiumgrenen faller tillbaka på guld. Utan raden hade sju lila och rosa widgetar blivit gula.
  const PENSIONERADE = {
    // RAMARNA, pensionerade 2026-09-23 pa Davids begaran: "for mycket och trakigt design".
    // Hela grenen gar — `topgift.frame` ar borta ur widget-factory.js, sa katalogknapparna
    // (som byggs ur Object.entries(GIFT_FRAMES)) forsvinner av sig sjalva och `klassiskTopGift`
    // blir oatkomlig. Accentfargerna ar ramarnas egna, lasta ur tabellen innan den togs bort.
    'royal-wings':   { tema: 'royal', accent: '#ffc13b' },
    'crystal-spire': { tema: 'royal', accent: '#b083ff' },
    'angel-heart':   { tema: 'royal', accent: '#ff8fc8' },
    'dark-raven':    { tema: 'royal', accent: '#9b5cff' },
    'frost-crystal': { tema: 'royal', accent: '#6db8ff' },
    'rose-garden':   { tema: 'royal', accent: '#ff8fc8' },
    'luna-mist':     { tema: 'royal', accent: '#c07bff' },

    // PREMIUMDESIGNERNA, nitton av tjugoen pensionerade 2026-09-23 (David: "behall neon, royal
    // o ta bort resten"). De var omformningar av samma tre <i>-lador i `.topgift-ornament`;
    // renderaren ar EN for hela familjen, sa hela designutrymmet var tre tomma lador plus en
    // accentfarg. Har racker STRANGFORMEN: de ar redan temanamn, inte ramar, sa `giftFrame`
    // ska inte rotas — bara skinnet byts.
    'cyber':         'royal',
    'glass':         'royal',
    'sakura':        'royal',
    'fire':          'royal',
    'ice':           'royal',
    'galaxy':        'royal',
    'aurora':        'royal',
    'retro':         'royal',
    'goldrush':      'royal',
    'hall':          'royal',
    'throne':        'royal',
    'champion':      'royal',
    'pedestal':      'royal',
    'arch':          'royal',
    'phoenix':       'royal',
    'signal':        'royal',
    'fireworks':     'royal',
    'bloom':         'royal',
    'comet':         'royal',
  };

  // Standardtemat. `premium-final.js` gör `w.theme||'royal'`, så en widget utan valt tema ritas som
  // royal. Pensioneras royal utan att den defaulten ändras i samma andetag får varje sådan widget
  // ingen CSS alls — och den har aldrig gjort ett val som går att peka om. Vakten forbjuder det.
  const STANDARD = 'royal';

  // Följer en kedja: pensioneras a till b och b senare till c ska en gammal a hamna på c.
  // Taket finns för att en cykel aldrig ska kunna hänga renderaren; vakten forbjuder cykler, och
  // taket är bältet till dess hängslen.
  function levande(namn) {
    if (!namn) return namn;
    let n = namn;
    for (let steg = 0; steg < 8; steg += 1) {
      const post = PENSIONERADE[n];
      if (typeof post !== 'string') break;      // slut, eller en avframning som `avframa` tar
      n = post;
    }
    return n;
  }

  // Avframningen, om den pensionerade posten är en sådan. Returnerar null när den inte är det.
  function avframa(ram) {
    const post = ram && PENSIONERADE[levande(ram)];
    return post && typeof post === 'object' ? post : null;
  }

  function linda() {
    const original = root.vyraTopGift;
    if (typeof original !== 'function' || original.__pensionLindad) return false;
    const lindad = function (w) {
      if (!w) return original.call(this, w);
      const utan = avframa(w.giftFrame);
      if (utan) {
        // KOPIA, aldrig mutation — se filhuvudet. Accenten bara om streamern inte valt en egen.
        return original.call(this, Object.assign({}, w, {
          giftFrame: '',
          theme: levande(utan.tema),
          accent: w.accent || utan.accent,
        }));
      }
      const tema = levande(w.theme);
      const ram = levande(w.giftFrame);
      if (tema === w.theme && ram === w.giftFrame) return original.call(this, w);
      return original.call(this, Object.assign({}, w, { theme: tema, giftFrame: ram }));
    };
    lindad.__pensionLindad = true;
    root.vyraTopGift = lindad;
    return true;
  }

  linda();

  root.VyraTopGiftPension = { PENSIONERADE, STANDARD, levande, avframa, linda };
})(window);
