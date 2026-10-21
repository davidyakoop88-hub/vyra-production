(function () {
  'use strict';
  // PLAYGROUND-WIDGETARNA I PANELRAMEN — PR 11 i panelspecifikationen (avsnitt 5.3, 5.5, 4.2, 2.3–2.5).
  //
  // Tre typer, alla ritade av playground-widgets.js:
  //   * Top Gifter Podium (templatePgPodium) — 13 modeller: kodad ram och tolv HD-ramar (pg.frameImg),
  //   * Top Streak Flip (templatePgStreak) — 5 modeller (pg.x.model),
  //   * Goal Pro (templatePgGoal) — 9 designer (pg.x.design).
  // En post per typ gäller alla modeller av typen; panelerna skiljer sig inte mellan modellerna.
  //
  // Filen har fyra delar, som vyra-streak-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens tillägg: Återställ utseende för fälten i w.pg (bind-omslag) och stilen för färgrutorna,
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptern 'pg' (vyra-testspel.js). Själva uppspelningen är VyraPlayground.sandlada i
  //      playground-widgets.js: en egen session och egen runtime-state för klonen, aldrig sändningens.
  //
  // TESTRADEN ÄR BORTA. "Skicka gåva / Combo ×10 / Likes ×50 / Följ / Dela / Kommentar / Nollställ" körde
  // pgTest() → feed() i sändningens session: en annan Goal Pro i layouten gick 0 % → 40 %, en annan Top Streak
  // Flip bytte namn, och Nollställ (resetAll) tömde all målprogress — under sändning (spec 2.3). Raden är
  // borttagen ur playground-widgets.js props(); ersatter nedan tar dessutom bort den om en äldre version av
  // filen skulle rita den.
  //
  // FÄLTEN LIGGER I w.pg. Kontrollerna är playground-widgets.js egna (pgg_*, pgx_*) och binds av dess
  // bind-omslag, som skriver w.pg[nyckel] och w.pg.x[nyckel]. Ramen flyttar dem bara (legacyId). falt-namnen
  // nedan ('pg.accent', 'pg.x.model' …) är därför nycklar för ramen och proven, inte fält på w.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Storlek (pgg_storlek) och Position (pgg_placering) är dubbletter av Storlek/Bredd och Y — borta,
  //   * Lager visas: pg-skalet skriver inget z-index själv, så vyra-lager.js gör det (PR 16),
  //   * Höjd och Lås proportioner visas inte: höjden följer bredden, och låset hade ingen verkan,
  //   * Ramlager på avatar och Namneffekt finns bara i podiet. I Top Streak Flip byter de bara ett
  //     data-attribut, och i Goal Pro träffar ingen stilregel något (ingen .fxbox, inget .nm) — inte ens
  //     med Visa senaste bidrag på och ett bidrag ritat (mätt i pg-livevag.browser.test.js),
  //   * Rundning finns inte i Top Streak Flip (ingen verkan),
  //   * Färgpaletten och Färg 1/2 skriver samma två fält och är en kontroll (#pgFarger). I Top Streak Flip
  //     visas den bara när Färger är Egna — med Färger från modellen har den ingen verkan — och utan Färg 2,
  //     som ingen stilregel för streaken läser.
  // Fälten ligger kvar i w.pg — ingenting byter namn och ingenting raderas.
  //
  // FÄRGARV (spec 4.2): Färg 1 → accentfärg, Färg 2 → andra färgen, Textfärg → textfärg och Typsnitt →
  // typsnitt, i podiet och Goal Pro; i Top Streak Flip allt utom andra färgen. playground-widgets.js cfgOf
  // läser bk(). I Top Streak Flip ersätter arvet också "Färger från modellen".

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];
  const harEgenBakgrund = w => !!(w && (w.hideBackground || w.bgColor || w.bgStrength != null || w.bgRadius != null || w.bgPadding != null));
  const pgx = w => (w && w.pg && w.pg.x) || {};
  // Modellnamnen kommer från playground-widgets.js (laddas asynkront från media.js). Saknas den ännu
  // visas bara typens namn.
  const modellnamn = (typ, id) => {
    try {
      const M = window.VyraPlaygroundWidgets && window.VyraPlaygroundWidgets.modeller;
      const hit = M && M[typ] ? M[typ]().find(m => String(m.id) === String(id)) : null;
      return hit ? hit.namn : '';
    } catch (_) { return ''; }
  };
  const forstaRam = () => { try { return window.VYRA_PG.frames[0].id; } catch (_) { return 'none'; } };
  const podiumModell = w => (w.pg && w.pg.frameImg) || forstaRam();
  const streakModell = w => pgx(w).model || 'royal-wings';
  const malDesign = w => String(pgx(w).design || '1');
  const marke = (forled, namn) => namn ? forled + ' · ' + namn : forled;

  // Gemensamma rader.
  const live = text => ({ sektion: 2, kalla: 'live', typ: 'text', etikett: text });
  const position = { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] };
  const textfarg = { sektion: 4, typ: 'farg', falt: 'pg.text', etikett: 'Textfärg', legacyId: '#pgg_text', arv: 'text' };
  const typsnitt = { sektion: 4, typ: 'val', falt: 'pg.font', etikett: 'Typsnitt', legacyId: '#pgg_font', arv: 'fontFamily' };
  // Paletten och Färg 1/2 i en rad. Raden har sin egen rubrik (Färgpalett), så ramen skriver ingen etikett.
  const farger = om => Object.assign({ sektion: 5, typ: 'farg', falt: 'pg.accent', legacyId: '#pgFarger', arv: 'highlight' }, om ? { om } : {});
  const glod = { sektion: 5, typ: 'tal', falt: 'pg.glow', etikett: 'Glöd', enhet: '×', legacyId: '#pgg_glow' };
  const rundning = { sektion: 5, typ: 'tal', falt: 'pg.radius', etikett: 'Rundning', enhet: 'px', legacyId: '#pgg_radius' };
  const bakgrund = { sektion: 5, typ: 'std-bakgrund', om: harEgenBakgrund };
  const entre = { sektion: 6, typ: 'val', falt: 'pg.enter', etikett: 'Entré / utgång', legacyId: '#pgg_enter' };
  const hastighet = { sektion: 6, typ: 'tal', falt: 'pg.speed', etikett: 'Rörelsehastighet', enhet: '×', legacyId: '#pgg_speed' };
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const ARV = ['highlight', 'secondary', 'text', 'fontFamily'];
  const ersatter = ['[data-pgtest]', '.pg-test'];
  // Det "Återställ utseende" tar tillbaka. Ramen sköter fälten direkt på w; fälten i w.pg sköts av
  // aterstallPg nedan (PG_UTSEENDE och PG_UTSEENDE_X). Innehåll — rubrik, mål, mätare, design,
  // visningsval och streakens regler — och placeringen rörs inte.
  const utseendeFalt = ['inheritBrandKit', ...BAKGRUNDSFALT];
  const PG_UTSEENDE = ['accent', 'accent2', 'text', 'font', 'glow', 'radius', 'speed', 'enter', 'frame', 'namefx', 'frameImg'];
  const PG_UTSEENDE_X = ['model', 'mcol', 'skin'];

  // ---- 1a. Top Gifter Podium (spec 5.3) --------------------------------------------------------
  R.definiera({
    typ: 'templatePgPodium',
    rubrik: () => 'Top Gifter Podium',
    marke: w => marke('Pallplats', modellnamn('podium', podiumModell(w))),
    katalognyckel: w => 'catalog:pgpodium:' + podiumModell(w),
    test: 'pg',
    ersatter,
    arv: ARV,
    kontroller: [
      // 2 · Innehåll
      { sektion: 2, typ: 'text', falt: 'pg.title', etikett: 'Rubrik', legacyId: '#pgg_title' },
      live('Hämtas från sändningen: namn, profilbild och coins för de tre största givarna.'),
      // 3 · Storlek och placering
      position,
      // 4 · Text
      textfarg,
      typsnitt,
      { sektion: 4, typ: 'val', falt: 'pg.namefx', etikett: 'Namneffekt', legacyId: '#pgg_namefx' },
      // 5 · Utseende
      farger(),
      { sektion: 5, typ: 'val', falt: 'pg.frameImg', etikett: 'Bildram (HD)', legacyId: '#pgg_frameImg' },
      { sektion: 5, typ: 'val', falt: 'pg.frame', etikett: 'Ramlager på avatar', legacyId: '#pgg_frame' },
      glod,
      rundning,
      bakgrund,
      // 6 · Animation
      entre,
      hastighet,
      aterstall,
    ],
    utseendeFalt,
  });

  // ---- 1b. Top Streak Flip (spec 5.5) ----------------------------------------------------------
  const egnaFarger = w => pgx(w).mcol === '0';
  const flipPa = w => pgx(w).flip !== '0';
  R.definiera({
    typ: 'templatePgStreak',
    rubrik: () => 'Top Streak Flip',
    marke: w => marke('Flip', modellnamn('streak', streakModell(w))),
    katalognyckel: w => 'catalog:pgstreak:' + streakModell(w),
    test: 'pg',
    ersatter,
    // Färg 2 når ingenting i Top Streak Flip (ingen stilregel läser --b), så andra färgen ärvs inte.
    arv: ['highlight', 'text', 'fontFamily'],
    kontroller: [
      // 2 · Innehåll: vem som visas och när.
      { sektion: 2, typ: 'val', falt: 'pg.x.showname', etikett: 'Visa namn', legacyId: '#pgx_showname' },
      { sektion: 2, typ: 'tal', falt: 'pg.x.minn', etikett: 'Visa från streak', enhet: 'st', legacyId: '#pgx_minn' },
      { sektion: 2, typ: 'tal', falt: 'pg.x.gap', etikett: 'Streak bryts efter', enhet: 's', legacyId: '#pgx_gap' },
      { sektion: 2, typ: 'val', falt: 'pg.x.flip', etikett: 'Flippa mellan profil och gåva', legacyId: '#pgx_flip' },
      { sektion: 2, typ: 'tal', falt: 'pg.x.flipt', etikett: 'Flip-tid', enhet: 's', legacyId: '#pgx_flipt',
        beror: { falt: 'pg', villkor: (_, w) => flipPa(w), text: 'Aktiv när Flippa mellan profil och gåva är Ja.' } },
      live('Hämtas från sändningen: namn, profilbild, gåva och streak för den längsta combon.'),
      // 3 · Storlek och placering
      position,
      // 4 · Text
      textfarg,
      typsnitt,
      // 5 · Utseende. Färger från modellen eller egna; arvet ersätter båda.
      { sektion: 5, typ: 'val', falt: 'pg.x.model', etikett: 'Modell', legacyId: '#pgx_model' },
      { sektion: 5, typ: 'val', falt: 'pg.x.mcol', etikett: 'Färger', legacyId: '#pgx_mcol', arv: 'highlight' },
      farger(egnaFarger),
      glod,
      bakgrund,
      // 6 · Animation
      entre,
      hastighet,
      aterstall,
    ],
    utseendeFalt,
  });

  // ---- 1c. Goal Pro (spec 5.5) -----------------------------------------------------------------
  R.definiera({
    typ: 'templatePgGoal',
    rubrik: () => 'Goal Pro',
    marke: w => marke('Mål', modellnamn('goal', malDesign(w))),
    katalognyckel: w => 'catalog:pggoal:' + malDesign(w),
    test: 'pg',
    ersatter,
    arv: ARV,
    kontroller: [
      // 2 · Innehåll
      { sektion: 2, typ: 'text', falt: 'pg.title', etikett: 'Rubrik', legacyId: '#pgg_title' },
      { sektion: 2, typ: 'val', falt: 'pg.x.design', etikett: 'Design', legacyId: '#pgx_design' },
      { sektion: 2, typ: 'val', falt: 'pg.x.metric', etikett: 'Mäter', legacyId: '#pgx_metric' },
      // Målets enhet (mynt, likes, följare …) står redan i <b> och följer Mäter (playground-widgets.js).
      { sektion: 2, typ: 'tal', falt: 'pg.x.target', etikett: 'Mål', legacyId: '#pgx_target' },
      { sektion: 2, typ: 'val', falt: 'pg.x.last', etikett: 'Visa senaste bidrag', legacyId: '#pgx_last' },
      { sektion: 2, typ: 'val', falt: 'pg.x.pace', etikett: 'Visa takt och tid kvar', legacyId: '#pgx_pace' },
      { sektion: 2, typ: 'val', falt: 'pg.x.toasts', etikett: 'Milstolpe-meddelanden', legacyId: '#pgx_toasts' },
      { sektion: 2, typ: 'val', falt: 'pg.x.badge', etikett: 'Procentbricka', legacyId: '#pgx_badge' },
      { sektion: 2, typ: 'val', falt: 'pg.x.cap', etikett: 'Visa designnamn', legacyId: '#pgx_cap' },
      live('Hämtas från sändningen: värdet räknas upp med det som Mäter väljer.'),
      // 3 · Storlek och placering
      position,
      // 4 · Text
      textfarg,
      typsnitt,
      // 5 · Utseende
      farger(),
      { sektion: 5, typ: 'val', falt: 'pg.x.skin', etikett: 'Stilskinn', legacyId: '#pgx_skin' },
      glod,
      rundning,
      bakgrund,
      // 6 · Animation
      entre,
      hastighet,
      aterstall,
    ],
    utseendeFalt,
  });

  // ---- 2. Panelens tillägg ---------------------------------------------------------------------
  const TYPER = ['templatePgPodium', 'templatePgStreak', 'templatePgGoal'];
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const klon = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;

  // Återställ utseende: ramens återställning rör bara fält direkt på w. Utseendet i w.pg tas tillbaka
  // här, från en ny widget av samma katalognyckel (fabriken är ren och lägger inget i state). Ett fält
  // som fabriken inte sätter tas bort, så att playground-widgets.js standard gäller.
  function aterstallPg(w, post) {
    if (!window.VyraWidgets || typeof window.VyraWidgets.create !== 'function') return false;
    let nyckel = w.createdFrom;
    if (!nyckel) { try { nyckel = post.katalognyckel(w); } catch (_) {} }
    let ny;
    try { ny = window.VyraWidgets.create(nyckel); } catch (_) { return false; }
    for (const f of post.utseendeFalt) {
      if (Object.prototype.hasOwnProperty.call(ny, f)) w[f] = klon(ny[f]);
      else delete w[f];
    }
    const np = ny.pg || {}, npx = np.x || {};
    w.pg = w.pg || {};
    for (const f of PG_UTSEENDE) { if (Object.prototype.hasOwnProperty.call(np, f)) w.pg[f] = klon(np[f]); else delete w.pg[f]; }
    if (w.pg.x) for (const f of PG_UTSEENDE_X) { if (Object.prototype.hasOwnProperty.call(npx, f)) w.pg.x[f] = klon(npx[f]); else delete w.pg.x[f]; }
    if (typeof save === 'function') save();
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else if (typeof render === 'function') render();
    return true;
  }

  function kopplaAterstall(w) {
    const knapp = document.querySelector('.properties #pr-aterstall-utseende');
    const post = R.hitta(w);
    if (!knapp || !post || knapp.dataset.pgAterstall === w.id) return;
    knapp.dataset.pgAterstall = w.id;
    knapp.onclick = () => aterstallPg(w, post);
  }

  // Ramens knappstil (min-höjd och utfyllnad) hade gjort färgrutorna till avlånga knappar.
  function stil() {
    if (document.getElementById('vyra-playground-panel-stil')) return;
    const st = document.createElement('style');
    st.id = 'vyra-playground-panel-stil';
    st.textContent = '.properties [data-panelram-sektion] .pg-farger .pg-pal button.pg-sw.pg-sw{min-height:0;padding:0;border:2px solid #ffffff22;border-radius:8px}'
      + '.properties [data-panelram-sektion] .pg-farger .pg-pal button.pg-sw.pg-sw.on{border-color:#fff;box-shadow:0 0 0 2px #7c5cff}'
      + '.properties [data-panelram-sektion] .pg-farger{display:grid;gap:6px}';
    (document.head || document.documentElement).append(st);
  }

  if (typeof bind === 'function' && !iOverlay()) {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        const w = vald();
        if (typeof view !== 'undefined' && view === 'editor' && w && TYPER.includes(w.type) && R.hitta(w)) {
          stil();
          kopplaAterstall(w);
          // Ramen bygger knappen i sin egen avstämning, synkront och en gång till i en mikrotask.
          Promise.resolve().then(() => Promise.resolve()).then(() => { try { const x = vald(); if (x && x.id === w.id) kopplaAterstall(x); } catch (e) { console.error('[VyraPlaygroundPanel]', e); } });
        }
      } catch (e) { console.error('[VyraPlaygroundPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Podiet: tre givare med Rose (1), Cap (99) och Crown (799) — i den ordningen, så att varje gåva tar
  // förstaplatsen. Streaken: Alex med en Cap-combo 1 → 12. Målet: 0 → 60 % → 100 % (grundens mal).
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('pg'))) {
    E.definiera('pg', g => {
      const gava = namn => g.gavor.find(x => x.namn === namn);
      return {
        pallplatser: [
          { namn: g.personer[2].namn, bild: g.personer[2].bild, gava: gava('Rose') },
          { namn: g.personer[1].namn, bild: g.personer[1].bild, gava: gava('Cap') },
          { namn: g.personer[0].namn, bild: g.personer[0].bild, gava: gava('Crown') },
        ],
        gava: gava('Cap'),
      };
    });
  }

  // ---- 4. Testadaptern ---------------------------------------------------------------------------
  //
  // ENTRÉ: widgetens egen Entré / utgång (klassen play-in, 0,8 s / Rörelsehastighet). VISNING:
  //   * podiet: tre givare kommer in, var och en tar förstaplatsen (omsortering, kronan),
  //   * Top Streak Flip: Alex med en Cap-combo som räknas upp 1 → 12, sedan vänder widgeten mellan
  //     profil och gåva i sin egen takt (Flip-tid) — visningen räcker till ett helt varv,
  //   * Goal Pro: 0 → 60 % → 100 % (MÅL NÅTT!) i widgetens egen mätare och enhet.
  // UTGÅNG: widgetens egen utgång (klassen play-out, 0,6 s / Rörelsehastighet).
  // Allt sker i VyraPlayground.sandlada på klonens nod; händelserna schemaläggs bara via ctl.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('pg'))) return;

  const FORE_MS = 400, PODIUM_STEG_MS = 1100, STREAK_STEG_MS = 250, MAL_STEG_MS = 1800;
  const gavaPg = (ex, g) => ({ id: String(g.namn).toLowerCase(), n: g.namn, e: '🎁', c: g.coins, img: ex.bild(g.bild) });
  // Målets steg i widgetens egen mätare: samma avrundning som tgt() i playground-widgets.js (nivå 1).
  const malTotal = x => { const b = Number(x.target) || 2000, st = b < 200 ? 5 : 50; return Math.round(b / st) * st || st; };
  function malHandelse(ex, metric, antal) {
    const vem = { user: ex.namn, avatar: ex.bild(ex.profil) };
    if (metric === 'likes') return Object.assign({ type: 'likes', count: antal }, vem);
    if (metric === 'follows') return Object.assign({ type: 'follow', antal }, vem);
    if (metric === 'shares') return Object.assign({ type: 'share', antal }, vem);
    if (metric === 'comments') return Object.assign({ type: 'comment', text: ex.meddelande, antal }, vem);
    // coins och gifts: en Rose-combo, där varje Rose är 1 mynt och 1 gåva.
    const rose = ex.gavor.find(g => g.namn === 'Rose');
    return Object.assign({ type: 'gift', count: antal, gift: gavaPg(ex, rose) }, vem);
  }

  T.registrera('pg', {
    spela(nod, k, ex, ctl) {
      const P = window.VyraPlayground;
      if (!P || typeof P.sandlada !== 'function') throw new Error('playground-widgets.js saknar VyraPlayground.sandlada');
      const host = nod.querySelector('.pgw');
      if (!host) throw new Error('klonen saknar playground-skalet');
      const sb = P.sandlada(host, k);
      nod.__pgSandlada = sb;
      const o = sb.cfg();
      const sp = Math.max(0.4, Number(o.speed) || 1);
      const entreMs = o.enter === 'none' ? 0 : Math.round(800 / sp);
      const utgangMs = o.enter === 'none' ? 300 : Math.round(600 / sp);
      let visning;
      if (k.type === 'templatePgPodium') {
        ex.pallplatser.forEach((p, i) => ctl.setTimeout(() => sb.event({ type: 'gift', user: p.namn, avatar: ex.bild(p.bild), count: 1, gift: gavaPg(ex, p.gava) }),
          entreMs + FORE_MS + i * PODIUM_STEG_MS));
        visning = FORE_MS + ex.pallplatser.length * PODIUM_STEG_MS + 600;
      } else if (k.type === 'templatePgStreak') {
        const fran = Math.max(1, Number(ex.streak && ex.streak.fran) || 1), till = Math.max(fran, Number(ex.streak && ex.streak.till) || 12);
        const gava = gavaPg(ex, ex.gava);
        // Första händelsen startar combon på fran; resten lägger till en gåva i taget, som en riktig combo.
        for (let n = fran; n <= till; n++) {
          ctl.setTimeout(() => sb.event({ type: 'gift', user: ex.namn, avatar: ex.bild(ex.profil), count: n === fran ? fran : 1, gift: gava }),
            entreMs + FORE_MS + (n - fran) * STREAK_STEG_MS);
        }
        visning = FORE_MS + (till - fran) * STREAK_STEG_MS + 1200;
        // Flippen går från monteringen, var Flip-tid:e sekund: ett helt varv (gåva och tillbaka) ska synas.
        if (o.x.flip === '1') visning = Math.max(visning, Math.round(2 * (Number(o.x.flipt) || 3.5) * 1000) + 400 - entreMs);
      } else {
        const total = malTotal(o.x), mitt = Math.round(total * (ex.mal.mitt - ex.mal.fran) / 100), metric = o.x.metric || 'coins';
        ctl.setTimeout(() => sb.event(malHandelse(ex, metric, mitt)), entreMs + FORE_MS);
        ctl.setTimeout(() => sb.event(malHandelse(ex, metric, total - mitt)), entreMs + FORE_MS + MAL_STEG_MS);
        // Målet nås vid det andra steget; widgeten går till nästa nivå efter 2,3 s / Rörelsehastighet.
        visning = FORE_MS + MAL_STEG_MS + Math.min(2000, Math.round(2300 / sp) - 200);
      }
      ctl.setTimeout(() => { host.classList.remove('play-in'); host.classList.add('play-out'); }, entreMs + visning);
      return { entre: entreMs, visning, utgang: utgangMs };
    },
    stoppa(nod) {
      if (nod.__pgSandlada) { try { nod.__pgSandlada.destroy(); } catch (_) {} nod.__pgSandlada = null; }
    },
  });
})();
