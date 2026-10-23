(function () {
  'use strict';
  // LAST-X I PANELRAMEN — andra familjen (PR 5 i panelspecifikationen, avsnitt 5.17).
  //
  // Elva modeller av templateLastX (last-x-alerts.js), i tre grupper efter vad designen visar
  // (last-x-alerts.css):
  //   * card, stack, skew, badge — rubrik, namn, meddelande och profilbild,
  //   * royal (Royal Coronation) — rubrik, profilbild och namn; meddelandet är dolt,
  //   * crownBanner, royalAmethyst, iceKing, neonCyber, dragonFlame, angelGold — rubrik, namn och
  //     profilbild; meddelandet är dolt.
  // De gamla typerna (templateLastGifter m.fl.) har ingen post och behåller sin äldre panel.
  //
  // Filen har tre delar, som vyra-topgift-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   3. testadaptern 'lastx' (vyra-testspel.js). Uppspelningen är lastXSpelaPa i last-x-alerts.js:
  //      samma fasmaskin som en riktig händelse, på klonens nod, utan w.lastXLatest och utan save().
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Färgtema verkar bara med EN typ vald (med flera har varje typ sin egen färg) och inte alls i
  //     royal och banderollerna — där syns den bara när den gör något,
  //   * Egen accent färgar bara dolda delar i royal och banderollerna (0–0,0008 andel px) — bara
  //     card, stack, skew och badge har den,
  //   * Meddelandet är dolt i royal och banderollerna — fältet visas inte där, och en
  //     rad i Utseende säger vad designen inte visar,
  //   * BAKGRUND visas inte för en ny widget (Ta bort bakgrund gav 0 px i alla elva — det finns
  //     ingen bakgrund att ta bort). En widget som redan har en egen bakgrund behåller gruppen, så
  //     att den kan ändras och tas bort. Borta är också de två testknapparna, "Profilbild (URL)"
  //     och märket "AUTO HIDE".
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // EGEN TEXT OCH LIVEDATA. Rubrik och Meddelande per typ är egen text som syns i sändningen
  // (w.lastXLabel / w.lastXMessage, per typ). Panelen har varken exempeldata (Testnamn, Testhändelse)
  // eller bildväljare för profilbilden (David 2026-10-20): personen kommer från TikTok, och renderaren
  // ritar sin automatiska reserv tills den första händelsen kommer.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TYPER = ['gifter', 'liker', 'sharer', 'subscriber', 'follower'];
  const TYPNAMN = { gifter: 'Gåva', liker: 'Like', sharer: 'Delning', subscriber: 'Prenumeration', follower: 'Följare' };
  const DESIGNNAMN = {
    card: 'Card', stack: 'Stack', skew: 'Skew', badge: 'Badge', royal: 'Royal Coronation',
    crownBanner: 'Crown Banner', royalAmethyst: 'Royal Amethyst', iceKing: 'Ice King',
    neonCyber: 'Neon Cyber', dragonFlame: 'Dragon Flame', angelGold: 'Angel Gold',
  };
  const PLATTOR = ['card', 'stack', 'skew', 'badge'];
  const BANDEROLLER = ['crownBanner', 'royalAmethyst', 'iceKing', 'neonCyber', 'dragonFlame', 'angelGold'];

  const modell = w => (w && DESIGNNAMN[w.lastXDesign] ? w.lastXDesign : 'card');

  // Vilka typer widgeten visar. last-x-alerts.js laddas asynkront av media.js; tills den finns
  // läses lastXType på samma sätt som dess activeKeysFor.
  function aktiva(w) {
    const L = window.VyraLastX;
    if (L && typeof L.aktiva === 'function') { try { return L.aktiva(w); } catch (_) { /* nedan */ } }
    const raw = String((w && w.lastXType) || 'all').toLowerCase();
    if (raw === 'all') return TYPER.slice();
    const valda = raw.split(',').map(s => s.trim()).filter(k => TYPER.includes(k));
    return valda.length ? valda : ['gifter'];
  }
  const enTyp = w => aktiva(w).length === 1;
  const harEgenBakgrund = w => !!(w && (w.hideBackground || w.bgColor || w.bgStrength != null || w.bgRadius != null || w.bgPadding != null));

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];


  function lastX(design) {
    const platta = PLATTOR.includes(design), royal = design === 'royal';
    const visarMeddelande = platta;
    const perTyp = [];
    for (const k of TYPER) {
      perTyp.push({ sektion: 2, typ: 'text', falt: 'lastXLabel_' + k, etikett: 'Rubrik (' + TYPNAMN[k].toLowerCase() + ')',
        legacyId: '#lastXLabel_' + k, om: w => aktiva(w).includes(k) });
      if (visarMeddelande) {
        perTyp.push({ sektion: 2, typ: 'text', falt: 'lastXMessage_' + k, etikett: 'Meddelande (' + TYPNAMN[k].toLowerCase() + ')',
          legacyId: '#lastXMessage_' + k, om: w => aktiva(w).includes(k) });
      }
    }
    const live = platta ? 'Hämtas från TikTok: namn, profilbild och händelse för den senaste personen av varje vald typ.'
        : 'Hämtas från TikTok: namn och profilbild för den senaste personen av varje vald typ.';

    const kontroller = [
      // 1 · Exempeldata (Testnamn och Testhändelse)
      // 2 · Innehåll
      { sektion: 2, typ: 'kryss', falt: 'lastXType', etikett: 'Vilka ska visas', legacyId: '.last-x-type-checks' },
      ...perTyp,
      ...(visarMeddelande ? [{ sektion: 2, typ: 'text', falt: 'lastXMeddelandeTips', legacyId: '#lastXMeddelandeTips' }] : []),
      // Reglage 3–30 s i hela sekunder (last-x-alerts.js durationOf); de gamla valen 5/10/15 betyder samma tid.
      { sektion: 2, typ: 'tal', falt: 'followDuration', etikett: 'Visningstid', enhet: 's', min: 3, max: 30, steg: 1, legacyId: '#followDuration' },
      { sektion: 2, typ: 'kryss', falt: 'lastXPersistent', legacyId: '#lastXPersistent' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: live },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      // 4 · Text
      { sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      // 5 · Utseende
      { sektion: 5, typ: 'val', falt: 'lastXDesign', etikett: 'Design', legacyId: '#lastXDesign' },
      ...(platta ? [
        // Färgtemat verkar bara med en typ och när ingen egen accent eller arv tar över (accentFor).
        { sektion: 5, typ: 'val', falt: 'followTheme', etikett: 'Färgtema', legacyId: '#followTheme',
          om: w => enTyp(w) && !w.inheritBrandKit && !w.followColor },
        { sektion: 5, typ: 'farg', falt: 'followColor', etikett: 'Accentfärg', legacyId: '#followColor', arv: 'highlight' },
        { sektion: 5, typ: 'knapp', id: 'lastXTemafarg', etikett: 'Använd färgtemat i stället',
          om: w => enTyp(w) && !w.inheritBrandKit && !!w.followColor,
          klick: w => {
            delete w.followColor;
            if (typeof save === 'function') save();
            if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else if (typeof render === 'function') render();
          } },
      ] : []),
      ...(platta ? [] : [{ sektion: 5, typ: 'text', falt: 'lastXDoltInfo', legacyId: '#lastXDoltInfo' }]),
      // BAKGRUND tas bort (spec 5.17), men bara för widgetar som inte redan har en egen bakgrund.
      // widget-background.js ritar en vald färg bakom kortet (tests/browser/bakgrundsgrupp), så en
      // sparad widget med bakgrund måste fortfarande kunna ändra eller ta bort den.
      { sektion: 5, typ: 'std-bakgrund', om: harEgenBakgrund },
      // 6 · Animation — utgången speglar inträdet, så det finns inget eget utgångsval.
      { sektion: 6, typ: 'val', falt: 'lastXEntrance', etikett: 'Inträdeseffekt', legacyId: '#lastXEntrance' },
      // 7 · Återställ utseende
      { sektion: 7, typ: 'std-aterstall' },
    ];
    return {
      typ: 'templateLastX',
      modell,
      galler: [design],
      rubrik: () => 'Last-X',
      marke: () => DESIGNNAMN[design] + ' · senaste händelsen',
      katalognyckel: () => 'catalog:lastx:' + design,
      test: 'lastx',
      // De två testknapparna och sökvägsfältet för profilbilden.
      ersatter: ['#testLastX', '#testLastXAll', '#followProfile'],
      // Spec 4.2: plattorna ärver accent, text, andra färgen och typsnitt (brandKitStyleFor och
      // accentFor i last-x-alerts.js). Royal och banderollerna ärver bara typsnittet — färgerna når
      // där bara delar som designen döljer, så färgdelen visas inte.
      arv: platta ? ['highlight', 'text', 'secondary', 'fontFamily'] : ['fontFamily'],
      kontroller,
      utseendeFalt: ['followTheme', 'followColor', 'lastXEntrance', 'inheritBrandKit', ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  Object.keys(DESIGNNAMN).forEach(d => R.definiera(lastX(d)));

  // ---- 2. Exempeldata ---------------------------------------------------------------------------
  // Namnet och meddelandet är widgetens egna exempel (sektion 1). Gåvan och antalet hör till
  // händelsen: fem Crown för en gåva, 50 likes för en like.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('lastx'))) {
    E.definiera('lastx', (g, typ) => ({ gava: g.gavor[2], antal: typ === 'liker' ? 50 : typ === 'gifter' ? 5 : 1 }));
  }

  // ---- 3. Testadaptern --------------------------------------------------------------------------
  //
  // ENTRÉ: kortet kommer in med widgetens intro (enterLX, 400 ms). VISNING: widgetens visningstid
  // (3–30 s). UTGÅNG: intron baklänges (360 ms) — eller ingen alls när widgeten behåller
  // den senaste personen synlig, för då ligger kortet kvar i sändningen också. Typväljaren väljer
  // händelsen; en typ som widgeten inte visar spelas som widgetens första typ.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('lastx'))) return;

  T.registrera('lastx', {
    typer: TYPER.map(k => [k, TYPNAMN[k]]),
    typEtikett: 'Händelse',
    spela(nod, k, ex, ctl) {
      if (typeof window.lastXSpelaPa !== 'function') throw new Error('last-x-alerts.js är inte laddad');
      const valda = aktiva(k);
      const typ = valda.includes(ctl.typ) ? ctl.typ : valda[0];
      // TEXT-gruppens typsnitt, skugga och kontur läggs på efter render (vyra-textgrupp.js); klonen
      // ritas av wh() och behöver dem också.
      if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k);
      const gava = ex.gava || {};
      return window.lastXSpelaPa(nod, k, typ, { giftName: gava.namn, count: ex.antal, likes: ex.antal },
        { prov: true, setTimeout: ctl.setTimeout, clearTimeout: ctl.clearTimeout });
    },
    stoppa(nod) {
      if (typeof window.lastXStoppaPa === 'function') window.lastXStoppaPa(nod);
    },
  });
})();
