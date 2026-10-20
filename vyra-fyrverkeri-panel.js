(function () {
  'use strict';
  // FYRVERKERIERNA I PANELRAMEN — PR 12 i panelspecifikationen (avsnitt 5.13, 5.14, 4.2, 2.3–2.5).
  //
  // Tre typer, alla gåvoeffekter som ritas på en duk (vfx):
  //   * Gift Fireworks (templateGiftFireworks) — sex teman på duk: festival, royal, ice, rose, comet och
  //     supernova (gift-fireworks.js + gift-supernova-panel.js + gift-festival-engine.js). En sparad widget
  //     med ett äldre CSS-tema (inget fwTheme) har ingen post och behåller sin gamla panel,
  //   * Heart Fireworks (templateHeartFireworks, heart-fireworks.js),
  //   * Gift Bubbles (templateGiftBubbles, gift-bubbles.js).
  //
  // Filen har tre delar, som vyra-playground-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   3. testadaptrarna 'fyrverkeri', 'hjartfyr' och 'bubblor' (vyra-testspel.js).
  //
  // TESTKNAPPARNA ÄR BORTA (spec 2.3). ▶ Testa fyrverkeriet med Antal testgåvor, ▶ Testa Heart Fireworks och
  // ▶ Testa Gift Bubbles gick genom triggerGiftFireworks/-HeartFireworks/-GiftBubbles, som tänder ALLA
  // synliga widgetar av typen (granskningen: B spelade också, 4151 tända pixlar). Testet spelar nu familjens
  // per-nod-funktion på klonen — fwSpelaPa, hfSpelaPa och gbSpelaPa — som också är det triggerna anropar
  // för varje widget i sändningen. Kön, dubblettspärren och ljudet för livet ligger kvar i triggerna.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json; tests/browser/panel-krav och
  // fyrverkeri-livevag.browser.test.js, som mäter varje kontroll mot det motorn läser, med frö):
  //   * TEXT (Typsnitt, Textstorlek, Skugga, Kontur …) visas inte i någon av de tre: allt ritas på duken och
  //     gruppen når inget textblad (utanText, vyra-textgrupp.js). Gift Fireworks har sina egna Typsnitt,
  //     Textfärg och Namneffekt för namnet i duken — med frö mätt med verkan,
  //   * BAKGRUND visas inte: effekterna är transparenta, Ta bort bakgrund gjorde ingenting och Färg la en
  //     fylld ruta över effekten,
  //   * Höjd och Lås proportioner visas inte (höjden följer bredden). Lager visas: vyra-lager.js skriver
  //     z-index = lagret på lådan (PR 16). Bredd är skrivskyddad: storleken ändras med Storlek och handtagen,
  //   * Position (Överst/Mitten/Nederst) i Gift Fireworks är en dubblett av Y och är borta,
  //   * reservbildens textfält i Gift Bubbles finns inte, och ingen väljare för en egen reservgåva heller
  //     (David 2026-10-20: ingen widget väljer gåvobild i panelen). Den skickade gåvan vinner, annars en ros;
  //     en sparad egen reservgåva ligger kvar i state men ritas inte (gift-bubbles.js, vyraReservbild).
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // FÄRGARV (spec 4.2): bara Gift Fireworks — Färg 1 → accentfärg, Färg 2 → andra färgen och namnets
  // typsnitt i duken → typsnitt (gift-fireworks.js fwSpela och gift-supernova-engine.js rendererFor läser
  // bk()). Heart Fireworks och Gift Bubbles har inga färgreglage och erbjuder inget arv.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const DUKTEMAN = ['festival', 'royal', 'ice', 'rose', 'comet', 'supernova'];
  const temanamn = tema => {
    try { const t = window.VyraWidgets.variants('giftfireworks.theme')[tema]; return t ? t.label : ''; } catch (_) { return ''; }
  };
  const position = { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] };
  const live = text => ({ sektion: 2, kalla: 'live', typ: 'text', etikett: text });
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const anonyma = legacyId => ({ sektion: 2, typ: 'kryss', falt: legacyId.slice(1), etikett: 'Exkludera anonyma tittare', legacyId });

  // ---- 1a. Gift Fireworks (spec 5.13) ------------------------------------------------------------
  R.definiera({
    typ: 'templateGiftFireworks',
    modell: w => w.fwTheme,
    galler: DUKTEMAN,
    rubrik: () => 'Gift Fireworks',
    marke: w => { const n = temanamn(w.fwTheme); return n ? 'Fyrverkeri · ' + n : 'Fyrverkeri'; },
    katalognyckel: w => 'catalog:giftfireworks:' + w.fwTheme,
    test: 'fyrverkeri',
    ersatter: ['#testFw', '.fw-combo-control', '#fwCombo'],
    utanText: true,
    // Textfärgen ärvs inte: specen (4.2) ger Gift Fireworks accent, andra färgen och typsnittet.
    arv: ['highlight', 'secondary', 'fontFamily'],
    kontroller: [
      // 2 · Innehåll: vilket fyrverkeri och vilka gåvor som tänder det.
      { sektion: 2, typ: 'val', falt: 'fwTheme', etikett: 'Tema', legacyId: '#fwCanvasTheme' },
      { sektion: 2, typ: 'tal', falt: 'fwMin', etikett: 'Minsta gåva', enhet: 'mynt', legacyId: '#fwMin' },
      { sektion: 2, typ: 'tal', falt: 'fwFinal', etikett: 'Final vid', enhet: 'mynt', legacyId: '#fwFinal' },
      { sektion: 2, typ: 'tal', falt: 'fwLanes', etikett: 'Samtidiga fyrverkerier', enhet: 'st', legacyId: '#fwLanes' },
      anonyma('#fwExcludeAnon'),
      live('Hämtas från sändningen: gåvan, avsändarens namn och profilbild. Gåvans värde avgör hur stort fyrverkeriet blir.'),
      // 3 · Storlek och placering. Effektstorleken skalar fyrverkeriet i widgeten (Storlek skalar widgeten).
      position,
      { sektion: 3, typ: 'tal', falt: 'fwScale', etikett: 'Effektstorlek', enhet: '×', legacyId: '#fwScale' },
      // 4 · Text: namnet som ritas under gåvan i duken.
      { sektion: 4, typ: 'val', falt: 'fwFont', etikett: 'Typsnitt', legacyId: '#fwFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'farg', falt: 'fwTextColor', etikett: 'Textfärg', legacyId: '#fwTextColor' },
      { sektion: 4, typ: 'val', falt: 'fwNameFx', etikett: 'Namneffekt', legacyId: '#fwNameFx' },
      // 5 · Utseende. Paletten fyller Färg 1 och 2; raden har sin egen rubrik (Färgpalett).
      { sektion: 5, typ: 'knapp', id: 'fwPalett', legacyId: '#fwFarger', arv: 'highlight' },
      { sektion: 5, typ: 'farg', falt: 'fwColor', etikett: 'Färg 1', legacyId: '#fwColor', arv: 'highlight' },
      { sektion: 5, typ: 'farg', falt: 'fwColor2', etikett: 'Färg 2', legacyId: '#fwColor2', arv: 'secondary' },
      { sektion: 5, typ: 'tal', falt: 'fwGlow', etikett: 'Glöd', enhet: '×', legacyId: '#fwGlow' },
      { sektion: 5, typ: 'tal', falt: 'fwRadius', etikett: 'Rundning', enhet: 'px', legacyId: '#fwRadius' },
      // 6 · Animation
      { sektion: 6, typ: 'val', falt: 'fwEnter', etikett: 'Entré / utgång', legacyId: '#fwEnter' },
      { sektion: 6, typ: 'tal', falt: 'fwPlaySpeed', etikett: 'Rörelsehastighet', enhet: '×', legacyId: '#fwPlaySpeed' },
      { sektion: 6, typ: 'kryss', falt: 'fwSound', etikett: 'Ljud', legacyId: '#fwSound' },
      // Volymen bär redan sin enhet i <b> ("60%", gift-supernova-panel.js), som ramen låter stå.
      { sektion: 6, typ: 'tal', falt: 'fwVolume', etikett: 'Volym', legacyId: '#fwVolume',
        beror: { falt: 'fwSound', villkor: v => v !== false, text: 'Aktiv när Ljud är på.' } },
      aterstall,
    ],
    utseendeFalt: ['fwColor', 'fwColor2', 'fwTextColor', 'fwFont', 'fwNameFx', 'fwGlow', 'fwRadius', 'fwScale', 'fwPlaySpeed', 'fwEnter', 'inheritBrandKit'],
  });

  // ---- 1b. Heart Fireworks (spec 5.14) -----------------------------------------------------------
  // Ingen Inträdeseffekt: widgeten har ingen (vyra-intro.js lägger ingen grupp på den). Storlek, färger,
  // mängd och ljud saknas i motorn — ny funktion, inte en del av ombyggnaden.
  R.definiera({
    typ: 'templateHeartFireworks',
    rubrik: () => 'Heart Fireworks',
    marke: () => 'Fyrverkeri · hjärtan',
    katalognyckel: () => 'catalog:heartfireworks',
    test: 'hjartfyr',
    ersatter: ['#testHf', '#hfCombo'],
    utanText: true,
    kontroller: [
      { sektion: 2, typ: 'tal', falt: 'hfMin', etikett: 'Minsta gåvovärde (mynt)', legacyId: '#hfMin' },
      anonyma('#hfExcludeAnon'),
      { sektion: 2, typ: 'kryss', falt: 'hfGold', etikett: 'Guldskott i mitten (från combo ×15)', legacyId: '#hfGold' },
      { sektion: 2, typ: 'kryss', falt: 'hfShowCombo', etikett: 'Combo-räknare (×N)', legacyId: '#hfShowCombo' },
      live('Hämtas från sändningen: gåvan och combon. Combon avgör hur många hjärtan som skjuts upp.'),
      position,
      aterstall,
    ],
    utseendeFalt: ['hfGold', 'hfShowCombo'],
  });

  // ---- 1c. Gift Bubbles (spec 5.14) --------------------------------------------------------------
  R.definiera({
    typ: 'templateGiftBubbles',
    rubrik: () => 'Gift Bubbles',
    marke: () => 'Bubblor · gåvor',
    katalognyckel: () => 'catalog:giftbubbles',
    test: 'bubblor',
    ersatter: ['#testGb', '#gbCombo'],
    utanText: true,
    kontroller: [
      { sektion: 2, typ: 'tal', falt: 'gbMin', etikett: 'Minsta gåvovärde (mynt)', legacyId: '#gbMin' },
      anonyma('#gbExcludeAnon'),
      { sektion: 2, typ: 'kryss', falt: 'gbGiftIn', etikett: 'Gåva i bubblorna', legacyId: '#gbGiftIn' },
      { sektion: 2, typ: 'kryss', falt: 'gbHearts', etikett: 'Hjärtbubblor', legacyId: '#gbHearts' },
      { sektion: 2, typ: 'kryss', falt: 'gbShowCombo', etikett: 'Combo-räknare (×N)', legacyId: '#gbShowCombo' },
      live('Hämtas från sändningen: gåvan och combon. Combon avgör hur många bubblor som stiger.'),
      position,
      { sektion: 3, typ: 'val', falt: 'gbSize', etikett: 'Grundstorlek', legacyId: '#gbSize' },
      aterstall,
    ],
    utseendeFalt: ['gbSize', 'gbGiftIn', 'gbHearts', 'gbShowCombo', 'gbGiftImage'],
  });

  // ---- 2. Exempeldata ----------------------------------------------------------------------------
  // Gift Fireworks: Alex skickar Rose — Antal 1 (en uppskjutning), 10 (firande) eller Final (en gåva värd
  // widgetens Final vid, adaptern läser beloppet ur klonen). Heart Fireworks: combo 1, 15 eller 20 (från 15
  // syns guldskottet). Gift Bubbles: combo 10.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function') {
    if (!(E.har && E.har('fyrverkeri'))) E.definiera('fyrverkeri', (g, typ) => ({ antal: typ === '10' ? 10 : 1, final: typ === 'final' }));
    if (!(E.har && E.har('hjartfyr'))) E.definiera('hjartfyr', (g, typ) => ({ combo: [1, 15, 20].includes(Number(typ)) ? Number(typ) : 1 }));
    if (!(E.har && E.har('bubblor'))) E.definiera('bubblor', () => ({ combo: 10 }));
  }

  // ---- 3. Testadaptrarna ---------------------------------------------------------------------------
  //
  // Varje adapter spelar familjens per-nod-funktion på KLONENS nod med klonens inställningar och
  // exempeldatan. Faserna kommer ur motorns egen tidslinje (tiderFor), så de är samma vid varje omspelning.
  // Allt testet skapar — fyrverkeriets duk och dess prenumeration på VFX-tickern, sekvensräknaren för
  // klonens id, Heart Fireworks och Gift Bubbles motor med timrar, bildrutor och animationer, och ljudet —
  // tas bort i stoppa(), som motorn kör vid ■, Esc, byte av widget, render() och när testet gått klart.
  // ctl.signal fångar dessutom ett avbrott som inte går genom stoppa().
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;
  const FW_LJUD = 'assets/sounds/freesound/gift-fireworks.mp3';
  const faser = t => ({ entre: Math.round(t.entre), visning: Math.round(t.visning), utgang: Math.round(t.utgang) });
  const gava = ex => ({ username: ex.namn, giftName: ex.gava.namn, giftImage: ex.bild(ex.gava.bild), profileImage: ex.bild(ex.profil) });
  const vidAvbrott = (ctl, fn) => { try { ctl.signal.addEventListener('abort', fn, { once: true }); } catch (_) {} };

  function stadaFyrverkeri(nod, k) {
    const S = window.VyraSupernova;
    nod.querySelectorAll('.fw-event').forEach(g => { try { if (S && S.dispose) S.dispose(g); } catch (_) {} g.remove(); });
    try { if (S && typeof S.glom === 'function') S.glom(k.id); } catch (_) {}
    if (nod.__fwLjud) { try { nod.__fwLjud.pause(); } catch (_) {} nod.__fwLjud = null; }
    const fx = nod.querySelector('.gift-fireworks-fx');
    if (fx) fx.classList.remove('play');
  }

  if (!(T.harAdapter && T.harAdapter('fyrverkeri'))) T.registrera('fyrverkeri', {
    typer: [['1', '1'], ['10', '10'], ['final', 'Final']],
    typEtikett: 'Antal gåvor',
    spela(nod, k, ex, ctl) {
      const F = window.VyraFireworks;
      if (!F || typeof F.spelaPa !== 'function') throw new Error('gift-fireworks.js saknar VyraFireworks.spelaPa');
      const ev = Object.assign(gava(ex), { combo: ex.antal || 1 });
      // Finalen: en gåva värd widgetens egen Final vid (samma standard som gift-fireworks.js fwFinalOf).
      if (ex.final) { const f = Number(k.fwFinal); ev.coins = Number.isFinite(f) && f > 0 ? f : 1000; }
      const t = F.tiderFor(k, ev);
      if (!F.spelaPa(nod, k, ev)) throw new Error('klonen saknar fyrverkeriets yta');
      vidAvbrott(ctl, () => stadaFyrverkeri(nod, k));
      // Ljudet spelas lokalt med widgetens volym, som i sändningen (en gång per fyrverkeri).
      const vol = typeof F.ljudVolym === 'function' ? F.ljudVolym(k) : 0;
      if (vol > 0 && typeof Audio === 'function') {
        try { const a = new Audio(FW_LJUD); a.volume = vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); nod.__fwLjud = a; } catch (_) {}
      }
      return faser(t);
    },
    stoppa(nod, k) { stadaFyrverkeri(nod, k); },
  });

  function stadaMotor(nod) {
    if (nod.__fyrMotor) { try { nod.__fyrMotor.destroy(); } catch (_) {} nod.__fyrMotor = null; }
  }

  if (!(T.harAdapter && T.harAdapter('hjartfyr'))) T.registrera('hjartfyr', {
    typer: [['1', '1'], ['15', '15'], ['20', '20']],
    typEtikett: 'Combo',
    spela(nod, k, ex, ctl) {
      const H = window.VyraHeartFireworksFx;
      if (typeof window.hfSpelaPa !== 'function' || !H || typeof H.tiderFor !== 'function') throw new Error('heart-fireworks.js saknar hfSpelaPa');
      const motor = window.hfSpelaPa(nod, k, Object.assign(gava(ex), { combo: ex.combo }));
      if (!motor) throw new Error('klonen saknar Heart Fireworks yta');
      nod.__fyrMotor = motor;
      vidAvbrott(ctl, () => stadaMotor(nod));
      return faser(H.tiderFor(ex.combo, k.hfShowCombo !== false));
    },
    stoppa(nod) { stadaMotor(nod); },
  });

  if (!(T.harAdapter && T.harAdapter('bubblor'))) T.registrera('bubblor', {
    spela(nod, k, ex, ctl) {
      const G = window.VyraGiftBubblesFx;
      if (typeof window.gbSpelaPa !== 'function' || !G || typeof G.tiderFor !== 'function') throw new Error('gift-bubbles.js saknar gbSpelaPa');
      const motor = window.gbSpelaPa(nod, k, Object.assign(gava(ex), { combo: ex.combo }));
      if (!motor) throw new Error('klonen saknar Gift Bubbles yta');
      nod.__fyrMotor = motor;
      vidAvbrott(ctl, () => stadaMotor(nod));
      return faser(G.tiderFor(ex.combo));
    },
    stoppa(nod) { stadaMotor(nod); },
  });
})();
