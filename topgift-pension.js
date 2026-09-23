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

  // <pensionerad design> : <design den ska ritas som>
  //
  // Nyckeln är namnet som ligger i `w.theme` eller `w.giftFrame` hos någon som redan sparat sin
  // layout. Värdet måste vara en design som FINNS i widget-factory.js variants — vakten kräver det.
  const PENSIONERADE = {};

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
    for (let steg = 0; steg < 8 && PENSIONERADE[n]; steg += 1) n = PENSIONERADE[n];
    return n;
  }

  function linda() {
    const original = root.vyraTopGift;
    if (typeof original !== 'function' || original.__pensionLindad) return false;
    const lindad = function (w) {
      if (!w) return original.call(this, w);
      const tema = levande(w.theme);
      const ram = levande(w.giftFrame);
      if (tema === w.theme && ram === w.giftFrame) return original.call(this, w);
      // KOPIA, aldrig mutation — se filhuvudet.
      return original.call(this, Object.assign({}, w, { theme: tema, giftFrame: ram }));
    };
    lindad.__pensionLindad = true;
    root.vyraTopGift = lindad;
    return true;
  }

  linda();

  root.VyraTopGiftPension = { PENSIONERADE, STANDARD, levande, linda };
})(window);
