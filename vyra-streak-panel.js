(function () {
  'use strict';
  // TOP STREAK I PANELRAMEN — PR 10 i panelspecifikationen (avsnitt 5.4, 4.2 och 2.4).
  //
  // Fyra modeller av templateTopStreak, alla ritade av approved-rankings.js:
  //   * Clean Flip — cleanStreakHtml, gåva ↔ profil i en cirkel som vänder (Flippar var),
  //   * Design 1–3 — topstreak-designer.js (streakDesign 1, 2, 3). Design 1 vänder också.
  // En äldre sparad Top Streak (de avvecklade temana och streakramarna) ritas som Clean Flip
  // (approved-rankings.js svarar för varje Top Streak) och får därför Clean Flips panel.
  //
  // Top Streak Flip (templatePgStreak, playground-widgets.js) är en annan typ och hör till PR 11.
  //
  // Filen har fyra delar, som vyra-mal-panel.js och vyra-topgift-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens tillägg: Återställ utseende för katalogkortets Clean Flip (bind-omslag),
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptern 'topstreak' (vyra-testspel.js). Själva skrivningen på klonens nod är
  //      streakSpelaPa i approved-rankings.js — samma skrivning som en riktig combo gör.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Clean Flip: hela GIFT EDITOR (kryssrutorna, Giftstorlek och Textstil), Text under, Prefix,
  //     kryssrutorna i streakExtraOptions, Namn- och Nummerstorlek och Animation läses inte av
  //     cleanStreakHtml — alla 18 mättes utan verkan. Visa-kryssrutorna i Innehåll finns därför bara i
  //     Design 1–3, som ritar dem (utan-gava/-profil/-namn/-varde i topstreak-designer.js),
  //   * Inträdeseffekt: bara i Clean Flip, och utan "Gilded Invite" (förlorar mot widgetens egen entré).
  //     Design 1–3 nollställer all animation på roten (topstreak-designer.css .tsd{animation:none!important}),
  //     så ingen inträdeseffekt syns där — valet visas inte (spec 5.4: "std-entre bara om wh-kedjan rättas"),
  //   * Bildstorlek finns inte: ingen av renderarna läser giftSize (spec 5.4 villkorar den av en rättning),
  //   * Höjd och Lås proportioner visas inte: höjden följer innehållet,
  //   * Textstorlek i Design 1–3 är px-reglaget (dataSize); TEXT-gruppens Textstorlek % hade varit en andra
  //     kontroll med samma etikett,
  //   * Profilbild och Gåvobild har ingen väljare (David 2026-10-20); sökvägsfälten tas bort och
  //     renderaren ritar sin automatiska reserv tills den första combon kommer.
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas. Samma döda reglage tas också
  // bort ur den gamla panelen (topstreak-designer.js rensa, UTAN_VERKAN utvidgad till Clean Flip), så att
  // flaggläget utan ram (localStorage vyra-panelram=av) inte visar dem heller.
  //
  // LIVEDATA. Namn och Streak ersätts av den dyraste combon i sändningen (gift-event-images.js). Panelen
  // har inget exempeldatablock (David 2026-10-20): ▶ Testa widget spelar vyra-exempeldata.js, och
  // Innehåll säger med en LIVE-rad vad som kommer från sändningen. I overlayn nollas demovärdena som
  // förut (approved-rankings.js).
  //
  // FÄRGARV (spec 4.2): Clean Flip och Design 1 ärver accenten (Accentfärg/Färg 1), Design 2 och 3 även
  // andra färgen (Färg 2). Renderarna läser bk() (approved-rankings.js, topstreak-designer.js).

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];
  const DESIGNNAMN = { 1: 'Design 1 · profil ↔ gåva i en cirkel', 2: 'Design 2 · profil och gåva sida vid sida', 3: 'Design 3 · gåvan i en glasruta' };

  // Samma regel som renderaren (topstreak-designer.js design()): streakDesign 1–3, annars Clean Flip.
  const streakModell = w => {
    if (!w || w.type !== 'templateTopStreak') return null;
    const d = Number(w.streakDesign);
    return [1, 2, 3].includes(d) ? String(d) : 'clean';
  };

  const live = { sektion: 2, kalla: 'live', typ: 'text',
    etikett: 'Hämtas från sändningen: namn, profilbild, gåva och streak för den dyraste combon hittills.' };
  const position = { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] };
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const ersatter = ['#approvedStreakProfile', '#approvedStreakGift'];

  // ---- 1a. Clean Flip --------------------------------------------------------------------------
  R.definiera({
    typ: 'templateTopStreak',
    modell: streakModell,
    galler: ['clean'],
    rubrik: () => 'Top Streak',
    marke: () => 'Clean Flip · gåva ↔ profil',
    katalognyckel: () => 'catalog:topstreak',
    test: 'topstreak',
    ersatter,
    arv: ['highlight'],
    kontroller: [
      // 2 · Innehåll
      live,
      // 3 · Storlek och placering
      position,
      // 4 · Text
      { sektion: 4, typ: 'std-text' },
      // 5 · Utseende
      { sektion: 5, typ: 'farg', falt: 'accent', etikett: 'Accentfärg', legacyId: '#approvedStreakAccent', arv: 'highlight' },
      { sektion: 5, typ: 'std-bakgrund' },
      // 6 · Animation
      { sektion: 6, typ: 'tal', falt: 'streakFlipSeconds', etikett: 'Flippar var', enhet: 's', legacyId: '#approvedStreakSeconds' },
      { sektion: 6, typ: 'std-entre' },
      aterstall,
    ],
    utseendeFalt: ['accent', 'streakFlipSeconds', 'entranceAnimation', 'entranceDuration', 'inheritBrandKit', ...TEXTFALT, ...BAKGRUNDSFALT],
  });

  // ---- 1b. Design 1–3 --------------------------------------------------------------------------
  function design(d) {
    const kontroller = [
      // 2 · Innehåll
      { sektion: 2, typ: 'kryss', falt: 'showGift', etikett: 'Visa gåva', legacyId: '#universalShowGift' },
      { sektion: 2, typ: 'kryss', falt: 'showProfile', etikett: 'Visa profilbild', legacyId: '#universalShowProfile' },
      { sektion: 2, typ: 'kryss', falt: 'showDataName', etikett: 'Visa namn', legacyId: '#universalShowName' },
      { sektion: 2, typ: 'kryss', falt: 'showDataValue', etikett: 'Visa streaktal', legacyId: '#universalShowValue' },
      live,
      // 3 · Storlek och placering
      position,
      // 4 · Text
      { sektion: 4, typ: 'tal', falt: 'dataSize', etikett: 'Textstorlek', enhet: 'px', legacyId: '#tsdText' },
      { sektion: 4, typ: 'val', falt: 'fontStyle', etikett: 'Textstil', legacyId: '#universalFontStyle' },
      { sektion: 4, typ: 'std-text', utan: ['vtScale'] },
      // 5 · Utseende. Stilen i Design 3 fyller Färg 1 och Färg 2, och ärvs därför med dem.
      ...(d === 3 ? [{ sektion: 5, typ: 'val', falt: 'streakStil', etikett: 'Stil', legacyId: '#tsdStil', arv: 'highlight' }] : []),
      { sektion: 5, typ: 'farg', falt: 'accent', etikett: 'Färg 1', legacyId: '#tsdFarg', arv: 'highlight' },
      ...(d === 1 ? [] : [{ sektion: 5, typ: 'farg', falt: 'accent2', etikett: 'Färg 2', legacyId: '#tsdFarg2', arv: 'secondary' }]),
      { sektion: 5, typ: 'tal', falt: 'streakGlow', etikett: 'Ljus', enhet: '%', legacyId: '#tsdLjus' },
      { sektion: 5, typ: 'std-bakgrund' },
      // 6 · Animation: bara Design 1 vänder.
      ...(d === 1 ? [{ sektion: 6, typ: 'tal', falt: 'streakFlipSeconds', etikett: 'Flippar var', enhet: 's', legacyId: '#tsdFlip' }] : []),
      aterstall,
    ];
    return {
      typ: 'templateTopStreak',
      modell: streakModell,
      galler: [String(d)],
      rubrik: () => 'Top Streak',
      marke: () => DESIGNNAMN[d],
      katalognyckel: () => 'catalog:topstreak:design:' + d,
      test: 'topstreak',
      ersatter,
      arv: d === 1 ? ['highlight'] : ['highlight', 'secondary'],
      kontroller,
      utseendeFalt: ['accent', 'accent2', 'streakStil', 'streakGlow', 'dataSize', 'fontStyle', 'streakFlipSeconds', 'inheritBrandKit',
        ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }
  [1, 2, 3].forEach(d => R.definiera(design(d)));

  // ---- 2. Återställ utseende för katalogkortets Clean Flip ---------------------------------------
  //
  // Ramen återställer till fabrikens widget (VyraWidgets.create(createdFrom)). Katalogkortet lägger
  // Clean Flips egna värden ovanpå fabrikens (approved-rankings.js CLEAN_GRUND: guldaccent, flipp var
  // 8:e sekund); en Clean Flip från kortet ska tillbaka till det kortet gav, inte till fabrikens cyan.
  // Bara de fält posten räknar som utseende rörs, och bara för en widget som kortet skapat
  // (streakTheme 'approved-clean'). Innehåll, position och media rörs inte.
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const klon = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;

  function aterstallClean(w, post) {
    const A = window.VyraApprovedRankings;
    if (!A || !A.cleanGrund || !window.VyraWidgets || typeof window.VyraWidgets.create !== 'function') return false;
    let ny;
    try { ny = Object.assign(window.VyraWidgets.create('catalog:topstreak'), A.cleanGrund); } catch (_) { return false; }
    for (const f of post.utseendeFalt) {
      if (Object.prototype.hasOwnProperty.call(ny, f)) w[f] = klon(ny[f]);
      else delete w[f];
    }
    if (typeof save === 'function') save();
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else if (typeof render === 'function') render();
    return true;
  }

  function kopplaAterstall(w) {
    if (!w || w.streakTheme !== 'approved-clean' || streakModell(w) !== 'clean') return;
    const knapp = document.querySelector('.properties #pr-aterstall-utseende');
    const post = R.hitta(w);
    if (!knapp || !post || knapp.dataset.streakAterstall === w.id) return;
    knapp.dataset.streakAterstall = w.id;
    knapp.onclick = () => aterstallClean(w, post);
  }

  if (typeof bind === 'function' && !iOverlay()) {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        const w = vald();
        if (typeof view !== 'undefined' && view === 'editor' && w && w.type === 'templateTopStreak' && R.hitta(w)) {
          kopplaAterstall(w);
          // Ramen bygger knappen i sin egen avstämning, synkront och en gång till i en mikrotask.
          Promise.resolve().then(() => Promise.resolve()).then(() => { try { const x = vald(); if (x && x.id === w.id) kopplaAterstall(x); } catch (e) { console.error('[VyraStreakPanel]', e); } });
        }
      } catch (e) { console.error('[VyraStreakPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Givaren är grundens (Alex, intern reservbild) och streaken går 1 → 12 (grunden: streak). Gåvan är en
  // Cap, så att testet syns även när widgeten står på standardgåvan (Rose).
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('topstreak'))) {
    E.definiera('topstreak', g => ({ gava: g.gavor[1] }));
  }

  // ---- 4. Testadaptern ---------------------------------------------------------------------------
  //
  // Förloppet: ENTRÉ med widgetens egen inträdeseffekt (Clean Flip; Design 1–3 har ingen), VISNING där
  // exempelgivaren kommer in med en combo som räknas upp 1 → 12 — varje steg skrivs med streakSpelaPa,
  // som en riktig combo — medan widgeten flippar mellan gåva och profil i sin egen takt (Flippar var), och
  // UTGÅNG som tonar ut klonen. Visningen räcker alltid till att profilsidan hinner visas en gång.
  // Allt på klonens nod; inga timers utanför ctl.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('topstreak'))) return;

  const FORE_MS = 600, STEG_MS = 250, EFTER_MS = 1200, PROFIL_MS = 1200, UTGANG_MS = 500;
  const harEntre = k => streakModell(k) === 'clean' && !!(k.entranceAnimation && k.entranceAnimation !== 'none');
  // Hur lång ett flippvarv är: Clean Flip --flip-duration (standard 8 s), Design 1 --tsd-flip (7 s). Båda
  // visar profilen från halva varvet (approved-streak-flip och tsdVand). Design 2 och 3 vänder inte.
  function varvMs(k) {
    const m = streakModell(k);
    if (m === 'clean') return Math.max(4, Number(k.streakFlipSeconds) || 8) * 1000;
    if (m === '1') return Math.max(4, Number(k.streakFlipSeconds) || 7) * 1000;
    return 0;
  }

  T.registrera('topstreak', {
    spela(nod, k, ex, ctl) {
      if (typeof window.streakSpelaPa !== 'function') throw new Error('approved-rankings.js saknar streakSpelaPa');
      // Klonen ska inte armas av autoStartAllFlips (media.js) — VyraFlip-registret hör till sändningen.
      nod.dataset.autoFlip = '1';
      // Den riktiga nodens fördröjning (VyraFlip offset, kopierad med stilen) hade spolat förbi entrén.
      nod.style.animationDelay = '';
      // TEXT-gruppens typsnitt, skugga och kontur läggs på efter render (vyra-textgrupp.js).
      if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k);
      let entre = 0;
      if (harEntre(k)) {
        // vyra-intro.js sätter klassen på riktiga noder (de hittas med liveWidget); klonen finns inte i
        // state och får den här, med samma namn och varaktighet.
        entre = Number(k.entranceDuration) || 600;
        nod.classList.add('ws-anim-' + String(k.entranceAnimation).replace(/[^a-zA-Z]/g, ''));
        nod.style.setProperty('--ws-anim-duration', entre + 'ms');
      }
      const fran = Math.max(1, Number(ex.streak && ex.streak.fran) || 1);
      const till = Math.max(fran, Number(ex.streak && ex.streak.till) || 12);
      for (let n = fran; n <= till; n++) ctl.setTimeout(() => window.streakSpelaPa(nod, k, ex, n), entre + FORE_MS + (n - fran) * STEG_MS);
      let visning = FORE_MS + (till - fran) * STEG_MS + EFTER_MS;
      const varv = varvMs(k);
      // Flippen börjar när klonen monteras; profilsidan syns från halva varvet.
      if (varv) visning = Math.max(visning, Math.round(varv / 2) + PROFIL_MS - entre);
      ctl.setTimeout(() => {
        if (typeof nod.animate === 'function') nod.__streakUt = nod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UTGANG_MS, fill: 'forwards' });
        else nod.style.opacity = '0';
      }, entre + visning);
      return { entre, visning, utgang: UTGANG_MS };
    },
    stoppa(nod) {
      if (nod.__streakUt) { try { nod.__streakUt.cancel(); } catch (_) {} nod.__streakUt = null; }
      nod.classList.remove('hit', 'record');
    },
  });
})();
