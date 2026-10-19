(function () {
  'use strict';
  // EXEMPELDATA FÖR ▶ TESTA WIDGET (panelspecifikationen 2.4).
  //
  // Deterministisk: samma anrop ger alltid samma data, så ett test som stoppas och spelas om ger
  // exakt samma förlopp. Ingenting här är slumpat, tidsberoende eller hämtat från nätet.
  //
  // RESERVBILDERNA LIGGER BAKOM GRÄNSSNITTET. En person eller gåva bär en BILDNYCKEL ('profil',
  // 'rose' …), inte en sökväg. Adaptern gör `ex.bild(nyckel)` när den sätter src på en <img>, och
  // `ex.bildnamn(nyckel)` när något ska stå i text. Sökvägen ska aldrig synas i panelen (spec 3.2:
  // "Sökvägen skrivs aldrig ut i gränssnittet").
  //
  // Varje anrop av hamta() ger en NY, djupfryst kopia. En adapter kan alltså inte råka ändra den
  // data nästa test får, och den kan inte skriva tillbaka något till widgeten den kom ifrån.

  const BILDER = Object.freeze({
    profil: { url: 'assets/images/test-profile.svg', namn: 'Exempelprofil' },
    rose: { url: 'assets/gifts/events/0001_Rose.png', namn: 'Rose' },
    lion: { url: 'assets/gifts/events/7882_Lion_s_Mane.png', namn: 'Lion' },
    crown: { url: 'assets/gifts/events/7578_Crown.png', namn: 'Crown' },
    cap: { url: 'assets/gifts/events/7460_Cap.png', namn: 'Cap' },
    gava: { url: 'assets/gifts/gift-placeholder.svg', namn: 'Exempelgåva' },
  });

  // Gåvorna i den ordning testen använder dem. Coins är TikToks värden för respektive gåva.
  const GAVOR = Object.freeze([
    { namn: 'Rose', coins: 1, bild: 'rose' },
    { namn: 'Cap', coins: 99, bild: 'cap' },
    { namn: 'Crown', coins: 799, bild: 'crown' },
    { namn: 'Lion', coins: 29999, bild: 'lion' },
  ]);

  // Fem personer med värden i fallande ordning. En rankning visar dem i den här ordningen; ett test
  // som vill visa en omsortering ("#3 tar #1") byter själv plats på dem i sin egen kopia.
  const PERSONER = Object.freeze([
    { namn: 'Alex', likes: 1240, coins: 899, poang: 1520, bild: 'profil' },
    { namn: 'Mia', likes: 980, coins: 560, poang: 1180, bild: 'profil' },
    { namn: 'Leo', likes: 760, coins: 320, poang: 940, bild: 'profil' },
    { namn: 'Sara', likes: 510, coins: 150, poang: 610, bild: 'profil' },
    { namn: 'Zoe', likes: 230, coins: 40, poang: 280, bild: 'profil' },
  ]);

  const GRUND = Object.freeze({
    namn: 'Alex',
    meddelande: 'Tack för stödet!',
    profil: 'profil',
    gava: GAVOR[0],
    gavor: GAVOR,
    personer: PERSONER,
    niva: { fran: 11, till: 12 },
    poang: 1520,
    coins: 899,
    likes: 1240,
    streak: { fran: 1, till: 12 },
    mal: { fran: 0, mitt: 60, till: 100 },
  });

  // Familjernas avvikelser från grunden. Familjerna lägger till sina egna i sina PR:er via
  // definiera(); i den här PR:en finns bara grunden.
  const familjer = new Map();

  const kopia = v => JSON.parse(JSON.stringify(v));
  function frys(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) frys(o[k]);
    }
    return o;
  }

  function bild(nyckel) {
    const b = BILDER[nyckel];
    return b ? b.url : BILDER.profil.url;
  }
  function bildnamn(nyckel) {
    const b = BILDER[nyckel];
    return b ? b.namn : BILDER.profil.namn;
  }

  // familj: adapter-id (t.ex. 'topgift'). typ: det typväljaren i sektion 1 står på, om adaptern har
  // en. Funktionen får inte läsa något annat än sina argument — då vore den inte deterministisk.
  function definiera(familj, fn) {
    if (typeof familj !== 'string' || !familj || typeof fn !== 'function') throw new Error('VyraExempeldata.definiera(familj, fn)');
    if (familjer.has(familj)) throw new Error('VyraExempeldata: ' + familj + ' har redan exempeldata');
    familjer.set(familj, fn);
  }

  function hamta(familj, typ) {
    const data = kopia(GRUND);
    const fn = familjer.get(familj);
    if (fn) {
      const tillagg = fn(kopia(GRUND), typ);
      if (tillagg && typeof tillagg === 'object') Object.assign(data, kopia(tillagg));
    }
    if (typ != null) data.typ = typ;
    // Funktionerna läggs på efter kopieringen; de följer med i frysningen men inte i JSON.
    Object.defineProperty(data, 'bild', { value: bild, enumerable: false });
    Object.defineProperty(data, 'bildnamn', { value: bildnamn, enumerable: false });
    return frys(data);
  }

  window.VyraExempeldata = { hamta, definiera, bild, bildnamn, har: f => familjer.has(f) };
})();
