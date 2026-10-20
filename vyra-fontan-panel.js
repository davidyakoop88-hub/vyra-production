(function () {
  'use strict';
  // FONTÄNERNA OCH GÅVOBURKEN I PANELRAMEN — PR 13 i panelspecifikationen (avsnitt 5.15, 5.16, 4.2, 2.3–2.5).
  //
  // Tre modellgrupper, alla med en egen ström av riktiga händelser:
  //   * Like Fountain klassisk (templateLikeFountain utan fountainDesign) — DOM-hjärtan i media.js,
  //   * Like Fountain Portal (templateLikeFountain, fountainDesign 'portal', nio paletter) — duk i like-fountain-portal.js,
  //   * Gift Jar (templateGiftJar, fem djurburkar) — duk i gift-jar-animals.js, räknaren i media.js (giftJarRuntime).
  //
  // Filen har tre delar, som vyra-fyrverkeri-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   3. testadaptrarna 'fontan', 'portal' och 'burk' (vyra-testspel.js),
  // och ett bind-omslag för tre små saker ramen inte bygger själv (sist i filen).
  //
  // TESTKNAPPARNA ÄR BORTA (spec 2.3, 2.5): ▶ Testa Pop Effect och ▶ Replay/⏸ Pausa/⟲ Återställ (klassisk),
  // ♥ Testa (15 likes) och ✦ Testa stora hjärtat (Portal), och Släpp 5 testgåvor/Töm burken/Återställ till standard
  // (Gift Jar). Släpp 5 testgåvor gick genom triggerGiftJarDrop, som släppte i ALLA burkar och räknade testgåvorna
  // mot Full vid i den riktiga räknaren; Återställ till standard bytte dessutom modell till Royal Lion. Pop-
  // kryssrutorna spelar inte heller något test längre (media.js lfVerifiedPopBind). Testet spelar nu en KLON:
  //   * fontan: VyraLikeFountain.spelaPa(k, …) i media.js — samma tre lager som triggerLikeFountainPop, men på
  //     klonen och alltid som test (inget skrivs på widgeten och inget sparas),
  //   * portal: VyraLikePortal.spelaPa/tappaPa/stortHjarta — klonen ritas av portalens klocka bara under testet,
  //   * burk: VyraAnimalGiftJars.spelaPa monterar burkens rörelse på klonens duk, och dropIntoGiftJar(k, …) räknar
  //     i klonens EGEN runtime-post (nycklad på k.id). stoppa tömmer den och tar bort posten.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen i scratchpad panel-fynd.json, mätt om i den här PR:en; proven
  // tests/browser/panel-krav och fontan-livevag.browser.test.js):
  //   * TEXT visas inte i någon av dem: klassiska fontänen har inget textblad utom ♥-glyferna, och där skalade
  //     Textstorlek samma sak som Hjärtstorlek; Portal och Gift Jar ritar allt på duk (utanText),
  //   * BAKGRUND visas inte (transparenta effekter), Höjd och Lås proportioner inte (höjden följer Flyghöjd,
  //     respektive bredden). Lager visas: vyra-lager.js skriver z-index = lagret på lådan (PR 16),
  //   * klassisk: Glöd, Guldfärg, Avatar-glöd, Glas-opacitet och Orbit-hastighet styr CSS-variabler som bara läses
  //     av element renderaren inte längre bygger (.lf-avatar, .lf-ring, .lf-orbit, .lf-label) — uppmätt 0 noder
  //     med ändrad stil. Antal orbit-hjärtan lägger bara fler hjärtan i samma ström: en dubblett av Max antal
  //     hjärtan. Widgetstorlek är en dubblett av Storlek/Bredd. Alla är borta ur panelen,
  //   * Gift Jar: ANIMATION (Inträdeseffekt och Varaktighet) gjorde ingenting med burken (uppmätt 0).
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // FÄRGARV (spec 4.2): klassisk ärver accentfärg → Färg 1 och andra färgen → Färg 2 (media.js lfEgnaFarger), och
  // då är paletten inaktiv. Portal bara vid paletten "Egna färger", som nu också har Färg 1–3. Gift Jar erbjuder
  // inget arv: djurburkarna är fasta bilder.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const position = { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] };
  const live = text => ({ sektion: 2, kalla: 'live', typ: 'text', etikett: text });
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const arPortal = w => !!w && w.fountainDesign === 'portal';
  const POP = [['fountainPopBurst', 'Explosion'], ['fountainPopSparkle', 'Gnistor'], ['fountainPopMiniHearts', 'Mini-hjärtan'],
    ['fountainPopStars', 'Stjärnor'], ['fountainPopConfetti', 'Konfetti'], ['fountainPopFirework', 'Fyrverkeri'], ['fountainPopRing', 'Ring/chockvåg']];
  const egnaFarger = { falt: 'fountainPalette', villkor: v => v === 'custom', text: 'Aktiv vid Färgpalett Egna färger.' };

  // ---- 1a. Like Fountain klassisk (spec 5.15) ---------------------------------------------------
  R.definiera({
    typ: 'templateLikeFountain',
    modell: w => (arPortal(w) ? 'portal' : 'klassisk'),
    galler: ['klassisk'],
    rubrik: () => 'Like Fountain',
    marke: () => 'Fontän · klassisk',
    katalognyckel: () => 'catalog:likefountain',
    test: 'fontan',
    ersatter: ['#testFountainPop', '#lfReplay', '#lfPause', '#lfReset'],
    utanText: true,
    kontroller: [
      // 2 · Innehåll: vilka likes som syns och hur mycket.
      { sektion: 2, typ: 'tal', falt: 'fountainMinLikes', etikett: 'Minsta like-värde (likes)', legacyId: '#fountainMinLikes' },
      { sektion: 2, typ: 'tal', falt: 'fountainCount', etikett: 'Max antal hjärtan', enhet: 'st', legacyId: '#fountainCount' },
      { sektion: 2, typ: 'tal', falt: 'fountainMaxAvatars', etikett: 'Max profilbilder samtidigt', enhet: 'st', legacyId: '#fountainMaxAvatars' },
      { sektion: 2, typ: 'tal', falt: 'fountainStarLikes', etikett: 'Stjärnläge från (likes)', legacyId: '#fountainStarLikes' },
      live('Hämtas från sändningen: likes, tittarens namn och profilbild. Varje like-paket släpper hjärtan.'),
      // 3 · Storlek och placering. Orienteringen byter bredd (liggande/stående) och hör därför hit.
      position,
      { sektion: 3, typ: 'val', falt: 'fountainOrientation', etikett: 'Orientering', legacyId: '#fountainOrientation' },
      { sektion: 3, typ: 'tal', falt: 'fountainSize', etikett: 'Hjärtstorlek', enhet: 'px', legacyId: '#fountainSize' },
      // 5 · Utseende: färgtemat som en grupp. Färg 1 och 2 gäller paletten Egna färger.
      { sektion: 5, typ: 'val', falt: 'fountainPalette', etikett: 'Färgpalett', legacyId: '#fountainPalette', arv: 'highlight' },
      { sektion: 5, typ: 'farg', falt: 'fountainColor', etikett: 'Färg 1', legacyId: '#fountainColor', arv: 'highlight', beror: egnaFarger },
      { sektion: 5, typ: 'farg', falt: 'fountainColor2', etikett: 'Färg 2', legacyId: '#fountainColor2', arv: 'secondary', beror: egnaFarger },
      { sektion: 5, typ: 'knapp', id: 'lfTeman', etikett: 'Färgtema', legacyId: '.lf-preset-grid' },
      // 6 · Animation: rörelsen i strömmen och popen vid varje like-paket.
      { sektion: 6, typ: 'knapp', id: 'lfRorelse', etikett: 'Rörelsestil', legacyId: '.lf-motion-grid' },
      { sektion: 6, typ: 'tal', falt: 'fountainSpeed', etikett: 'Flygtid', enhet: 's', legacyId: '#fountainSpeed' },
      { sektion: 6, typ: 'tal', falt: 'fountainHeight', etikett: 'Flyghöjd', enhet: 'px', legacyId: '#fountainHeight' },
      { sektion: 6, typ: 'tal', falt: 'fountainDrift', etikett: 'Spridning', enhet: '°', legacyId: '#fountainDrift' },
      ...POP.map(([falt, etikett]) => ({ sektion: 6, typ: 'kryss', falt, etikett: 'Pop: ' + etikett, legacyId: '#' + falt })),
      { sektion: 6, typ: 'val', falt: 'fountainPopEntrance', etikett: 'Popens start', legacyId: '#fountainPopEntrance' },
      { sektion: 6, typ: 'tal', falt: 'fountainPopDuration', etikett: 'Popens längd', enhet: 's', legacyId: '#fountainPopDuration' },
      { sektion: 6, typ: 'tal', falt: 'fountainParticleCount', etikett: 'Antal partiklar', enhet: 'st', legacyId: '#fountainParticleCount' },
      { sektion: 6, typ: 'tal', falt: 'fountainParticleSize', etikett: 'Partikelstorlek', enhet: 'px', legacyId: '#fountainParticleSize' },
      // Värdet är 80–400 med 200 som normal fart; omslaget sist i filen visar det som en faktor (1.00 ×).
      { sektion: 6, typ: 'tal', falt: 'fountainParticleSpeed', etikett: 'Partikelhastighet', enhet: '×', legacyId: '#fountainParticleSpeed' },
      aterstall,
    ],
    utseendeFalt: ['fountainPalette', 'fountainColor', 'fountainColor2', 'fountainCustomPalette', 'fountainPreset', 'fountainMotion',
      'fountainSize', 'fountainSpeed', 'fountainHeight', 'fountainDrift', 'fountainPopEntrance', 'fountainPopDuration',
      'fountainParticleCount', 'fountainParticleSize', 'fountainParticleSpeed', ...POP.map(p => p[0]), 'inheritBrandKit'],
  });

  // ---- 1b. Like Fountain Portal (spec 5.15) ------------------------------------------------------
  const PALETTNAMN = { portal: 'Rosa & lila', rainbow: 'Regnbåge', neon: 'Neon', fire: 'Eld', ice: 'Is', gold: 'Guld',
    aurora: 'Norrsken', pastel: 'Pastell', mono: 'Enfärgad', custom: 'egna färger' };
  const egna = w => w.fountainPalette === 'custom';
  R.definiera({
    typ: 'templateLikeFountain',
    modell: w => (arPortal(w) ? 'portal' : 'klassisk'),
    galler: ['portal'],
    rubrik: () => 'Like Fountain · Portal',
    marke: w => 'Fontän · Portal · ' + (PALETTNAMN[w.fountainPalette] || PALETTNAMN.portal),
    katalognyckel: w => 'catalog:likefountain:portal' + (PALETTNAMN[w.fountainPalette] && w.fountainPalette !== 'custom' ? ':' + w.fountainPalette : ''),
    test: 'portal',
    ersatter: ['#lfpTest', '#lfpTestPop'],
    utanText: true,
    kontroller: [
      { sektion: 2, typ: 'tal', falt: 'fountainPerLike', etikett: 'Hjärtan per like-paket', enhet: 'st', legacyId: '#lfpPer' },
      { sektion: 2, typ: 'kryss', falt: 'fountainAvatarHearts', etikett: 'Profilbild stiger med', legacyId: '#lfpBubblor' },
      { sektion: 2, typ: 'tal', falt: 'fountainPopEvery', etikett: 'Stort hjärta var (likes), 0 = av', legacyId: '#lfpPop' },
      live('Hämtas från sändningen: likes, tittarens namn och profilbild. Hjärtan stiger ur portalen när tittarna tappar.'),
      position,
      { sektion: 5, typ: 'val', falt: 'fountainPalette', etikett: 'Färgpalett', legacyId: '#lfpPalett' },
      // Färg 1–3 finns bara i Egna färger (förut gav paletten fasta standardfärger som inte gick att ändra).
      { sektion: 5, typ: 'farg', falt: 'fountainColor', etikett: 'Färg 1', standard: '#ff3c88', arv: 'highlight', om: egna },
      { sektion: 5, typ: 'farg', falt: 'fountainColor2', etikett: 'Färg 2', standard: '#b94cff', arv: 'secondary', om: egna },
      { sektion: 5, typ: 'farg', falt: 'fountainColor3', etikett: 'Färg 3', standard: '#ff86bd', om: egna },
      aterstall,
    ],
    utseendeFalt: ['fountainPalette', 'fountainColor', 'fountainColor2', 'fountainColor3', 'inheritBrandKit'],
  });

  // ---- 1c. Gift Jar (spec 5.16) ------------------------------------------------------------------
  const burkNamn = w => {
    try { const m = window.VyraWidgets.variants('giftjar.model'); const id = window.VyraAnimalGiftJars ? window.VyraAnimalGiftJars.resolve(w.jarModel) : w.jarModel; return (m[id] || m.lion).label; } catch (_) { return ''; }
  };
  R.definiera({
    typ: 'templateGiftJar',
    rubrik: () => 'Gift Jar',
    marke: w => { const n = burkNamn(w); return n ? 'Gåvoburk · ' + n : 'Gåvoburk'; },
    katalognyckel: w => 'catalog:giftjar:' + (window.VyraAnimalGiftJars ? window.VyraAnimalGiftJars.resolve(w.jarModel) : (w.jarModel || 'lion')),
    test: 'burk',
    ersatter: ['#jarDropTest', '#jarReset', '#jarDefaults'],
    utanText: true,
    kontroller: [
      { sektion: 2, typ: 'val', falt: 'jarModel', etikett: 'Modell', legacyId: '#jarModel' },
      { sektion: 2, typ: 'tal', falt: 'jarCapacity', etikett: 'Full vid (st)', legacyId: '#jarCapacity' },
      // Sekunder i panelen, millisekunder i fältet (jarAutoResetMs) — omslaget sist i filen räknar om.
      { sektion: 2, typ: 'tal', falt: 'jarAutoResetMs', etikett: 'Töm automatiskt efter full burk (s)', legacyId: '#jarAutoReset' },
      // En uttalad åtgärd mot den RIKTIGA räknaren, med bekräftelse. Raden visar också hur full burken är.
      { sektion: 2, typ: 'knapp', id: 'jarTom', etikett: 'Töm burken', klick: w => tomBurken(w) },
      live('Riktiga gåvor i sändningen fyller burken. ▶ Testa widget använder en egen burk och rör inte räkningen.'),
      position,
      aterstall,
    ],
    // Modellen är burkens utseende: Återställ utseende tar tillbaka katalogkortets modell (förut bytte
    // "Återställ till standard" alltid till Royal Lion). Full vid, tömningen och placeringen rörs inte.
    utseendeFalt: ['jarModel', 'jarAccent', 'jarLight', 'jarSymbol'],
  });

  const burkLage = w => {
    try {
      const n = typeof giftJarState === 'function' ? giftJarState(w).count : 0;   // eslint-disable-line no-undef
      return { antal: n, full: Math.max(1, Number(w.jarCapacity) || 50) };
    } catch (_) { return null; }
  };
  function visaFyllnad(w) {
    const rad = document.querySelector('.properties [data-pr-kontroll="id:jarTom"]');
    if (!rad || !w) return;
    const l = burkLage(w);
    if (!l) return;
    let s = rad.querySelector(':scope > .pr-burk-fylld');
    if (!s) { s = document.createElement('small'); s.className = 'pr-burk-fylld'; s.style.cssText = 'display:block;margin-top:4px;opacity:.8'; rad.append(s); }
    const text = 'Fylld nu: ' + l.antal + ' av ' + l.full + ' gåvor';
    if (s.textContent !== text) s.textContent = text;
  }
  function tomBurken(w) {
    if (typeof resetGiftJar !== 'function') return;                               // eslint-disable-line no-undef
    let ok = false;
    try { ok = window.confirm('Töm burken? Gåvorna som räknats i sändningen tas bort ur burken.'); } catch (_) { ok = false; }
    if (!ok) return;
    resetGiftJar(w);                                                               // eslint-disable-line no-undef
    visaFyllnad(w);
  }

  // ---- 2. Exempeldata ----------------------------------------------------------------------------
  // Fontänerna: 15 likes i 5 paket från Alex (med profilbild). Burken: 5 gåvor ur exempelgåvorna, sedan full burk.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function') {
    if (!(E.har && E.har('fontan'))) E.definiera('fontan', () => ({ paket: [3, 3, 3, 3, 3] }));
    if (!(E.har && E.har('portal'))) E.definiera('portal', () => ({ paket: [3, 3, 3, 3, 3] }));
    if (!(E.har && E.har('burk'))) E.definiera('burk', () => ({ antal: 5 }));
  }

  // ---- 3. Testadaptrarna ---------------------------------------------------------------------------
  //
  // Varje adapter spelar på KLONENS nod med klonens inställningar. Det som ska hända senare går via
  // ctl.setTimeout (vaktat). Allt testet lämnar efter sig — fontänens kö och timrar, portalens klon i klockan
  // och dess tillstånd, burkens bildruta och klonens runtime-post — tas bort i stoppa(), som motorn kör vid ■,
  // Esc, byte av widget, render() och när testet gått klart.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;
  const vidAvbrott = (ctl, fn) => { try { ctl.signal.addEventListener('abort', fn, { once: true }); } catch (_) {} };
  const efter = (ctl, ms, fn) => { if (ms <= 0) fn(); else ctl.setTimeout(fn, ms); };
  const tittare = ex => ({ username: ex.namn, profileImage: ex.bild(ex.profil) });

  // Klassisk: ett paket i sekunden under 5 s. Hjärtana flyger Flygtid sekunder; den sista sekunden är utgången.
  const FONTAN_STEG = 1000;
  if (!(T.harAdapter && T.harAdapter('fontan'))) T.registrera('fontan', {
    spela(nod, k, ex, ctl) {
      const L = window.VyraLikeFountain;
      if (!L || typeof L.spelaPa !== 'function') throw new Error('media.js saknar VyraLikeFountain.spelaPa');
      if (!nod.querySelector('.lf-stream')) throw new Error('klonen saknar fontänens ström');
      vidAvbrott(ctl, () => L.glom(k));
      const paket = ex.paket || [3, 3, 3, 3, 3];
      paket.forEach((antal, i) => efter(ctl, i * FONTAN_STEG, () => L.spelaPa(k, Object.assign({ count: antal }, tittare(ex)))));
      const flyg = Math.max(2, Math.min(10, Number(k.fountainSpeed) || 4)) * 1000;
      const total = (paket.length - 1) * FONTAN_STEG + 300 + flyg;
      return { entre: 500, visning: total - 1500, utgang: 1000 };
    },
    stoppa(nod, k) { if (window.VyraLikeFountain) window.VyraLikeFountain.glom(k); },
  });

  // Portal: fem paket på 1,6 s, hjärtana stiger, sedan det stora hjärtat (om Stort hjärta var … inte är 0).
  const PORTAL_STEG = 400, PORTAL_FORM = 2400;
  if (!(T.harAdapter && T.harAdapter('portal'))) T.registrera('portal', {
    spela(nod, k, ex, ctl) {
      const P = window.VyraLikePortal;
      if (!P || typeof P.spelaPa !== 'function') throw new Error('like-fountain-portal.js saknar VyraLikePortal.spelaPa');
      if (!P.spelaPa(nod, k)) throw new Error('klonen saknar portalens duk');
      vidAvbrott(ctl, () => P.glom(k.id));
      const paket = ex.paket || [3, 3, 3, 3, 3];
      paket.forEach((antal, i) => efter(ctl, i * PORTAL_STEG, () => P.tappaPa(k, antal, tittare(ex))));
      const sista = (paket.length - 1) * PORTAL_STEG;
      const varje = Number.isFinite(Number(k.fountainPopEvery)) ? Number(k.fountainPopEvery) : 1000;
      let total;
      if (varje > 0) {
        ctl.setTimeout(() => P.stortHjarta(k), sista + PORTAL_FORM);
        total = sista + PORTAL_FORM + P.formMs();
      } else total = sista + 700 + P.stigMs();
      return { entre: 500, visning: total - 1500, utgang: 1000 };
    },
    stoppa(nod, k) { if (window.VyraLikePortal && window.VyraLikePortal.glom) window.VyraLikePortal.glom(k.id); },
  });

  // Burk: fem gåvor, en var halv sekund, sedan resten till Full vid i ett paket. Finalen startar 2,2 s efter att
  // burken blev full och pågår 7 s (gift-jar-animals.js); de två sista sekunderna tonar den ut.
  const BURK_STEG = 500, BURK_FINAL = 2200 + 7000;
  function stadaBurk(nod, k) {
    if (nod.__burkMotor) { try { nod.__burkMotor.destroy(); } catch (_) {} nod.__burkMotor = null; }
    if (window.VyraAnimalGiftJars && window.VyraAnimalGiftJars.glom) window.VyraAnimalGiftJars.glom(k);
  }
  if (!(T.harAdapter && T.harAdapter('burk'))) T.registrera('burk', {
    spela(nod, k, ex, ctl) {
      const J = window.VyraAnimalGiftJars;
      if (!J || typeof J.spelaPa !== 'function') throw new Error('gift-jar-animals.js saknar VyraAnimalGiftJars.spelaPa');
      if (typeof dropIntoGiftJar !== 'function') throw new Error('media.js saknar dropIntoGiftJar');   // eslint-disable-line no-undef
      k.jarCount = 0;                                    // klonens burk börjar tom, oavsett vad den riktiga räknat
      const motor = J.spelaPa(nod, k);
      if (!motor) throw new Error('klonen saknar burkens duk');
      nod.__burkMotor = motor;
      vidAvbrott(ctl, () => stadaBurk(nod, k));
      const full = Math.max(1, Number(k.jarCapacity) || 50);
      const gavor = ex.gavor && ex.gavor.length ? ex.gavor : [ex.gava];
      const enstaka = Math.min(ex.antal || 5, full - 1);
      const gava = i => { const g = gavor[i % gavor.length]; return { giftName: g.namn, giftImage: ex.bild(g.bild) }; };
      for (let i = 0; i < enstaka; i++) efter(ctl, i * BURK_STEG, () => dropIntoGiftJar(k, gava(i), 1));   // eslint-disable-line no-undef
      const fullVid = enstaka * BURK_STEG + BURK_STEG;
      ctl.setTimeout(() => dropIntoGiftJar(k, gava(enstaka), full - enstaka), fullVid);                      // eslint-disable-line no-undef
      const total = fullVid + BURK_FINAL;
      return { entre: 600, visning: total - 2600, utgang: 2000 };
    },
    stoppa(nod, k) { stadaBurk(nod, k); },
  });

  // ---- Bind-omslaget ----------------------------------------------------------------------------------
  //
  // Tre saker på flyttade kontroller, efter ramens avstämning:
  //   * Partikelhastighet visas som en faktor: 200 (normal fart) = 1.00 ×. Värdet i fältet är detsamma.
  //   * Töm automatiskt visas i sekunder; fältet jarAutoResetMs är i millisekunder (0 = töm aldrig).
  //   * Töm burken-raden visar hur full den riktiga burken är, och följer med när riktiga gåvor kommer.
  const faktor = v => (Math.max(0, Number(v) || 200) / 200).toFixed(2) + ' ×';
  function efterBind() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    const P = window.VyraPanelram;
    const w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null;
    if (!w || !P || !P.ager || !P.ager(w)) return;
    if (w.type === 'templateLikeFountain' && !arPortal(w)) {
      const el = document.querySelector('.properties [data-panelram-sektion] #fountainParticleSpeed');
      const b = el && el.parentElement && el.parentElement.querySelector(':scope > b');
      if (b) {
        const text = faktor(el.value);
        if (b.textContent !== text) b.textContent = text;
        if (!el.dataset.prFaktor) {
          el.dataset.prFaktor = '1';
          // Efter media.js oninput (vyraLivePatch skriver råvärdet): visa faktorn igen.
          el.addEventListener('input', () => { const bb = el.parentElement && el.parentElement.querySelector(':scope > b'); if (bb) bb.textContent = faktor(el.value); });
        }
      }
    }
    if (w.type === 'templateGiftJar') {
      const el = document.querySelector('.properties [data-panelram-sektion] #jarAutoReset');
      if (el && !el.dataset.prSekunder) {
        el.dataset.prSekunder = '1';
        el.min = '0'; el.max = '60'; el.step = '0.5';
        el.value = String(Math.round((Number(w.jarAutoResetMs) || 0) / 100) / 10);
        el.onchange = e => {
          const s = Math.max(0, Math.min(60, Number(e.target.value) || 0));
          w.jarAutoResetMs = Math.round(s * 1000);
          if (typeof save === 'function') save();
          if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
        };
      }
      visaFyllnad(w);
    }
  }
  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      try { efterBind(); } catch (e) { console.error('[VyraFontanPanel]', e); }
      Promise.resolve().then(() => { try { efterBind(); } catch (_) {} });
      return ut;
    };
  }
  // Riktiga gåvor fyller burken utan omritning; raden följer med (media.js lyssnar först och har räknat klart).
  window.addEventListener('vyra-live-event', ev => {
    const d = ev && ev.detail;
    if (!d || !/gift/i.test(String(d.type || d.event || ''))) return;
    const w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null;
    if (w && w.type === 'templateGiftJar') { try { visaFyllnad(w); } catch (_) {} }
  });

  // KORTEN I RÖRELSESTIL OCH FÄRGTEMA (slutgranskning B-015, 2026-10-20). Ramen lägger rubriken (.pr-etikett) först
  // i kortrutnätet, och där blev den en egen rutnätscell bredvid första kortet. Beskrivningarna klipptes med ellips
  // ("Mjuka individuell…") i 72 px breda kort. Rubriken spänner nu över hela raden och beskrivningen bryts i stället.
  if (!document.getElementById('vyra-fontan-panel-stil')) {
    const s = document.createElement('style');
    s.id = 'vyra-fontan-panel-stil';
    s.textContent = '.properties .lf-motion-grid>.pr-etikett,.properties .lf-preset-grid>.pr-etikett{grid-column:1/-1}'
      + '.properties .lf-motion-card{align-items:flex-start}'
      + '.properties .lf-motion-card small{white-space:normal;overflow:visible;text-overflow:clip;font-size:9px;line-height:1.3}';
    (document.head || document.documentElement).append(s);
  }
})();
