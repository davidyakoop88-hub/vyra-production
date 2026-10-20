(function () {
  'use strict';
  // TOP GIFT I PANELRAMEN — första familjen (PR 4 i panelspecifikationen, avsnitt 5.2).
  //
  // Fyra modeller: Top Gift · Design 1–3 (templateTopGift, temana neon, royal och fokus) och
  // Top Gift · Design 4, som är Top Coins-modellen Signal Orbit (templateTopCoins). Katalogen har
  // länge kallat Signal Orbit för Top Gift; nu har den också Top Gifts panel.
  //
  // Filen har tre delar:
  //   1. registerposterna (vyra-panelregister.js) — vilka kontroller panelen visar, i vilken sektion
  //   2. exempeldatan för ▶ Testa widget (vyra-exempeldata.js)
  //   3. testadaptern 'topgift' (vyra-testspel.js). Själva uppspelningen på klonens nod är
  //      topGiftSpelaPa i gift-event-images.js — samma skrivning som en riktig gåva gör.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT. Listorna nedan följer granskningens mätning per modell
  // (en kontroll ändrades, widgetens DOM, stil och bild jämfördes) och provas om av
  // tests/browser/panel-krav.browser.test.js. Det som mättes utan verkan är borta:
  //   * Varaktighet i royal, fokus och Signal Orbit (entrén har sin egen längd där),
  //   * kryssrutan Rubrik och Växlingshastighet i royal och fokus (Lager finns i alla: vyra-lager.js skriver z-index, PR 16),
  //   * AVATAR-RAM i royal, fokus och Signal Orbit, POSITION · TEXTELEMENT och LIVE-DATA i
  //     Signal Orbit, Textstorlek % där Textstorlek i px redan finns,
  //   * Höjd i Top Gift (höjden följer innehållet), och "Töm widget" i royal och fokus.
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // EGEN TEXT, EXEMPEL OCH LIVEDATA. Användarnamn och Coins syns i editorn men ersätts av den
  // största gåvan i sändningen; de är därför exempeldata (sektion 1), och Innehåll säger med en
  // LIVE-rad vad som kommer från sändningen. Profilbild och gåvobild väljs med mediaväljaren
  // (vyra-mediaval.js); de gamla sökvägsfälten tas bort.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const PROFIL = 'assets/images/test-profile.svg';
  const GAVA = 'assets/gifts/events/0001_Rose.png';
  const NAMN = { neon: 'Design 1', royal: 'Design 2', fokus: 'Design 3' };

  const profilbild = { sektion: 5, typ: 'media', medietyp: 'bild', falt: 'profileImage', etikett: 'Profilbild innan första gåvan',
    reserv: PROFIL, reservText: 'Automatisk – ersätts av givarens profilbild när en gåva kommer' };
  const gavobild = { sektion: 5, typ: 'media', medietyp: 'bild', falt: 'giftImage', etikett: 'Gåvobild innan första gåvan',
    reserv: GAVA, reservText: 'Automatisk – ersätts av gåvan när en gåva kommer' };

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];

  // ---- 1. Top Gift · Design 1–3 -----------------------------------------------------------------
  //
  // giftFrame-varianterna och spellayoutens Top Gifter ritas av andra renderare och har ingen post.
  const tgModell = w => (w && !w.giftFrame && !w.spelTema ? w.theme : null);

  function topGift(tema) {
    const neon = tema === 'neon', royal = tema === 'royal';
    const kontroller = [
      // 1 · Exempeldata
      { kalla: 'exempel', typ: 'text', falt: 'dataName', etikett: 'Användarnamn', legacyId: '#pfTopGiftName' },
      { kalla: 'exempel', typ: 'text', falt: 'dataValue', etikett: 'Mynt', legacyId: '#pfTopGiftCoins' },
      ...(neon ? [{ kalla: 'exempel', typ: 'knapp', id: 'vyraTomWidget', legacyId: '#vyraTomWidget', etikett: 'Töm exempeldata' }] : []),
      // 2 · Innehåll
      { sektion: 2, typ: 'kryss', falt: 'showGift', etikett: 'Visa gåva', legacyId: '#universalShowGift' },
      { sektion: 2, typ: 'kryss', falt: 'showProfile', etikett: 'Visa profilbild', legacyId: '#universalShowProfile' },
      ...(neon ? [{ sektion: 2, typ: 'kryss', falt: 'showTitle', etikett: 'Visa krona', legacyId: '#universalShowTitle' }] : []),
      { sektion: 2, typ: 'kryss', falt: 'showDataName', etikett: 'Visa namn', legacyId: '#universalShowName' },
      { sektion: 2, typ: 'kryss', falt: 'showDataValue', etikett: 'Visa värde', legacyId: '#universalShowValue' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från sändningen: namn, profilbild, gåva och värde för den största gåvan hittills.' },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      { sektion: 3, typ: 'tal', falt: 'giftSize', etikett: 'Bildstorlek (profil och gåva)', enhet: 'px', legacyId: '#pfTopGiftSize' },
      // 4 · Text
      { sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'tal', falt: 'dataSize', etikett: 'Textstorlek', enhet: 'px', legacyId: '#pfTopGiftText' },
      { sektion: 4, typ: 'val', falt: 'fontStyle', etikett: 'Textstil', legacyId: '#universalFontStyle' },
      { sektion: 4, typ: 'std-text', utan: ['vtFont', 'vtScale'] },
      // 5 · Utseende
      { sektion: 5, typ: 'farg', falt: 'accent', etikett: 'Accentfärg', legacyId: '#pfTopGiftColor', arv: 'highlight' },
      ...(neon ? [] : [{ sektion: 5, typ: 'farg', falt: 'accent2', etikett: 'Andra färg', legacyId: '#tgdColor2' }]),
      ...(royal ? [
        { sektion: 5, typ: 'val', falt: 'tgdRam', etikett: 'Profilram', legacyId: '#tgdRam' },
        { sektion: 5, typ: 'val', falt: 'tgdBildram', etikett: 'Bildram', legacyId: '#tgdBildram', om: w => w.tgdRam === 'hd' },
      ] : []),
      // Design 1 ritar avatarramen runt profilbilden (mätt); i 2 och 3 gör den ingenting.
      ...(neon ? [{ sektion: 5, typ: 'knapp', id: 'profilram', legacyId: '.gaf-frame-group .pro-frame-picker', etikett: 'Profilram' }] : []),
      { sektion: 5, typ: 'tal', falt: 'topGiftGlow', etikett: 'Ljus', enhet: '%', legacyId: '#pfTopGiftGlow' },
      profilbild,
      gavobild,
      { sektion: 5, typ: 'std-bakgrund' },
      // 6 · Animation
      { sektion: 6, typ: 'std-entre', utan: neon ? [] : ['varaktighet'] },
      ...(neon ? [{ sektion: 6, typ: 'tal', falt: 'topGiftFlipSpeed', etikett: 'Växlingshastighet', enhet: '×', legacyId: '#pfTopGiftSpeed' }] : []),
      // 7 · Återställ utseende
      { sektion: 7, typ: 'std-aterstall' },
    ];
    return {
      typ: 'templateTopGift',
      modell: tgModell,
      galler: [tema],
      rubrik: () => 'Top Gift',
      marke: () => NAMN[tema] + ' · största gåvan',
      katalognyckel: () => 'catalog:topgift:premium:' + tema,
      test: 'topgift',
      // Den gamla testknappen och sökvägsfälten. Raderna ligger i parkerade grupper; själva fälten tas bort.
      ersatter: ['#pfTestTopGift', '#pfTopGiftProfile', '#pfTopGiftGift'],
      arv: ['highlight', 'text', 'fontFamily'],
      kontroller,
      utseendeFalt: ['accent', 'accent2', 'tgdRam', 'tgdBildram', 'profileFrame', 'topGiftGlow', 'giftSize', 'dataSize',
        'fontStyle', 'fontFamily', 'topGiftFlipSpeed', 'entranceAnimation', 'entranceDuration', 'inheritBrandKit',
        ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  // ---- 2. Top Gift · Design 4 (Signal Orbit) ----------------------------------------------------
  const orbitModell = w => {
    if (!w) return null;
    const T = window.VyraTopCoins;
    if (T && typeof T.designId === 'function') { try { return T.designId(w); } catch (_) { return null; } }
    return w.topCoinsDesign || w.skin || null;
  };
  const medGava = w => w.showGift === true;

  const signalOrbit = {
    typ: 'templateTopCoins',
    modell: orbitModell,
    galler: ['signal-orbit'],
    rubrik: () => 'Top Gift',
    marke: () => 'Design 4 · flest mynt',
    katalognyckel: () => 'catalog:ranking:templateTopCoins:signal-orbit',
    test: 'topgift',
    // Top Likes flikrad (Content/Design/Animation) och sökvägsfältet för profilbilden.
    ersatter: ['.ws-tabs', '#tcAvatar'],
    arv: ['highlight', 'text', 'fontFamily'],
    kontroller: [
      { kalla: 'exempel', typ: 'text', falt: 'dataName', etikett: 'Namn', legacyId: '#tcName' },
      { kalla: 'exempel', typ: 'text', falt: 'dataValue', etikett: 'Mynt', legacyId: '#tcValue' },
      { sektion: 2, typ: 'kryss', falt: 'showGift', etikett: 'Visa gåva' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från sändningen: namn, profilbild och mynt för den som gett mest.' },
      { sektion: 3, typ: 'std-position' },
      { sektion: 3, typ: 'kryss', falt: 'rankingMirror', etikett: 'Spegla', legacyId: '#wsMirror' },
      { sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      { sektion: 5, typ: 'farg', falt: 'accent', etikett: 'Accentfärg', legacyId: '#tcAccent', arv: 'highlight' },
      { sektion: 5, typ: 'tal', falt: 'opacity', etikett: 'Opacitet', enhet: '%', legacyId: '#wsOpacity' },
      profilbild,
      Object.assign({}, gavobild, { om: medGava }),
      { sektion: 5, typ: 'std-bakgrund' },
      { sektion: 6, typ: 'std-entre', utan: ['varaktighet'] },
      { sektion: 6, typ: 'tal', falt: 'topGiftFlipSpeed', etikett: 'Växlingshastighet', enhet: '×', min: 0.5, max: 2, steg: 0.1, standard: 1, om: medGava },
      { sektion: 6, typ: 'kryss', falt: 'topCoinsMotion', etikett: 'Rörelse i ringarna', legacyId: '#tcMotion' },
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['accent', 'opacity', 'topCoinsMotion', 'topGiftFlipSpeed', 'entranceAnimation', 'entranceDuration',
      'inheritBrandKit', ...TEXTFALT, ...BAKGRUNDSFALT],
  };

  ['neon', 'royal', 'fokus'].forEach(t => R.definiera(topGift(t)));
  R.definiera(signalOrbit);

  // ---- 3. Exempeldata ---------------------------------------------------------------------------
  // Givaren är grundens (Alex, intern reservbild). Gåvan väljs i sektion 1: en Rose eller en Lion.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('topgift'))) {
    E.definiera('topgift', (g, typ) => ({ gava: typ === 'lion' ? g.gavor[3] : g.gavor[0] }));
  }

  // ---- 4. Testadaptern --------------------------------------------------------------------------
  //
  // Förloppet: ENTRÉ med widgetens egen inträdeseffekt (den ligger i klonens markup, så den spelar
  // när klonen monteras), VISNING där en ny toppgåva kommer in efter en kort stund — exempelgivaren
  // och gåvan skrivs in och flippen och rekordpulsen startar, precis som på en riktig gåva — och
  // UTGÅNG som tonar ut klonen. Allt på klonens nod; inga timers utanför ctl.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('topgift'))) return;

  const FORE_GAVA_MS = 600;
  const UTGANG_MS = 500;
  const harEntre = k => !!(k.entranceAnimation && k.entranceAnimation !== 'none');

  function visningMs(k) {
    // Design 1 vänder kortet var femte sekund (vyraFlipSmooth, 10 s varv): visa profilen och sedan gåvan.
    if (k.type === 'templateTopGift' && tgModell(k) === 'neon') return FORE_GAVA_MS + 6500;
    // Signal Orbit med gåva: gåvan kommer efter halva varvet (topcoins-v2.css, --tc-flip).
    if (k.type === 'templateTopCoins' && medGava(k)) {
      const varv = 10000 / Math.min(2, Math.max(0.5, Number(k.topGiftFlipSpeed) || 1));
      return FORE_GAVA_MS + Math.round(varv / 2) + 1500;
    }
    // Design 2 och 3 vänder inte: profil och gåva syns samtidigt, rekordpulsen är 2,1 s.
    return FORE_GAVA_MS + 3500;
  }

  T.registrera('topgift', {
    utanEntre: w => !harEntre(w),
    typer: [['rose', 'Rose · 1 mynt'], ['lion', 'Lion · 29 999 mynt']],
    typEtikett: 'Gåva',
    spela(nod, k, ex, ctl) {
      // Klonen ska inte armas av autoStartAllFlips (media.js) — dess VyraFlip-register hör till sändningen.
      nod.dataset.autoFlip = '1';
      // TEXT-gruppens typsnitt, skugga och kontur läggs på efter render (vyra-textgrupp.js); klonen
      // ritas av wh() och behöver dem också.
      if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k);
      const entre = harEntre(k) ? (Number(k.entranceDuration) || 600) : 0;
      const visning = visningMs(k);
      ctl.setTimeout(() => window.topGiftSpelaPa(nod, k, ex), entre + FORE_GAVA_MS);
      ctl.setTimeout(() => {
        if (typeof nod.animate === 'function') nod.__tgUt = nod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UTGANG_MS, fill: 'forwards' });
        else nod.style.opacity = '0';
      }, entre + visning);
      return { entre, visning, utgang: UTGANG_MS };
    },
    stoppa(nod) {
      if (nod.__tgUt) { try { nod.__tgUt.cancel(); } catch (_) {} nod.__tgUt = null; }
      nod.classList.remove('play', 'record');
    },
  });
})();
