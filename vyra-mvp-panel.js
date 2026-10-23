(function () {
  'use strict';
  // BATTLE MVP I PANELRAMEN — PR 7 i panelspecifikationen (avsnitt 5.18).
  //
  // En typ (templateBattleMvp), tre grupper och 20 modeller:
  //   * klassiska stilar (6) — inferno, royal, cyber, storm, aurora, samurai (mvpStyle),
  //   * ramar (6) — royal-ribbon, laurel-star, dark-wings, dragon-fire, nautical-helm, shadow-star
  //     (mvpFrame, en fast bild med profilbild och namnskylt),
  //   * firanden (8) — gold-ribbon (rasterbild), lion-clash (egen komposition utan partikelduk),
  //     coronation, wings, portal, rosegold, pearl och moon (battle-mvp-celebrations.js, mvpStyle).
  // De avvecklade stilarna (ice, royal-purple, neon-cyber, diamond-elite) och ramen gold-crown har
  // ingen post: en sparad widget med dem behåller sin äldre panel.
  //
  // Filen har fyra delar, som vyra-alert-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens små tillägg: informationsraderna och Stil-listan med ramarna (props/bind-omslag),
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptern 'mvp' (vyra-testspel.js). Uppspelningen är mvpSpelaPa i media.js: samma kod
  //      som tänder varje MVP-widget när en battle avgörs, men på klonens nod, utan kö och utan save().
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Inträdeseffekt och Varaktighet visas inte: MVP-entrén i sändningen var densamma med Ingen och
  //     med Poppa in (firandets egen entré driver allt),
  //   * Lager visas: renderaren skriver inget z-index själv (uppmätt "auto" före PR 16), så vyra-lager.js
  //     skriver z-index = lagret på lådan, alla tre grupperna,
  //   * Poäng, Poängsymbol och Poängstorlek finns bara där poängen ritas — i de klassiska stilarna,
  //     och där bara när Visa poäng är på. Ramarna och firandena ritar aldrig poängen,
  //   * Färg 1, Färg 2 och Ärv färgschema bara i de klassiska: ramarna och firandena är fasta bilder
  //     (0–0,0025 andel px), och en rad i Utseende säger det,
  //   * firandets partiklar bara i firandena med partikelduk — inte i Lion Clash (ingen duk, 0 px) och
  //     inte i Guldkrona (rasterbild med egen entré),
  //   * Rubrik och Visa rubrik inte i Lion Clash och Guldkrona, där rubriken är en del av motivet,
  //   * Skugga inte i Guldkrona (0 px),
  //   * BAKGRUND visas inte för en ny widget (det finns ingen bakgrund att ta bort). En widget som
  //     redan har en egen bakgrund behåller gruppen — färgen ritas bakom motivet och ska gå att ändra,
  //   * de två knapparna med samma id (#testBattleMvp: ▶ Testa Battle MVP och Testa firandet),
  //     sökvägsfältet för profilbilden och märket "4 DESIGNER" är borta.
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // BILDSTORLEK, RADAVSTÅND OCH RIKTNING (spec 5.18, sektion 3) finns i de sex klassiska stilarna:
  // vyra-bildrad.js lägger dem i posterna nedan och ritar dem (emblemet zoomas, avståndet och bilden
  // bredvid/ovanför texten). Ramarna och firandena får dem inte: profilbilden sitter i motivets hål
  // (fasta procentmått per motiv), så där finns ingen bild att förstora och inga rader att flytta.
  //
  // EGEN TEXT OCH LIVEDATA. Namn, poäng och profilbild kommer från matchens MVP i sändningen
  // (triggerBattleMvp). Panelen har varken exempeldata eller bildväljare för profilbilden (David
  // 2026-10-20): ▶ Testa widget spelar vyra-exempeldata.js, och renderaren ritar sin automatiska
  // reserv tills den första MVP:n kommer. Rubriken är egen text.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];
  const PARTIKELFALT = ['mvpFxIntensity', 'mvpFxSpeed', 'mvpFxSize', 'mvpFxDepth', 'mvpFxHole', 'mvpFxTint'];

  const KLASSISKA = { inferno: 'Inferno', royal: 'Royal', cyber: 'Cyber', storm: 'Storm', aurora: 'Aurora', samurai: 'Samurai' };
  const RAMAR = ['royal-ribbon', 'laurel-star', 'dark-wings', 'dragon-fire', 'nautical-helm', 'shadow-star'];
  const FIRANDEN = ['gold-ribbon', 'lion-clash', 'coronation', 'wings', 'portal', 'rosegold', 'pearl', 'moon'];
  const PREMIUM = ['royal-purple', 'neon-cyber', 'diamond-elite'];
  // Firandena med partikelduk (battle-mvp-particles.js PROFILES).
  const MED_PARTIKLAR = ['coronation', 'wings', 'portal', 'rosegold', 'pearl', 'moon'];

  // Namnen ur fabrikens register (widget-factory.js), inte ur en kopia.
  function varianter(familj) {
    try { return (window.VyraWidgets && window.VyraWidgets.variants(familj)) || {}; } catch (_) { return {}; }
  }
  const RAMDATA = varianter('battlemvp.frame');
  const FIRANDEDATA = varianter('battlemvp.celebration');
  const ramNamn = id => (RAMDATA[id] && RAMDATA[id].label) || id;
  const firandeNamn = id => (FIRANDEDATA[id] && FIRANDEDATA[id].label) || id;
  const har = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Modellnyckeln följer renderarens ordning: ett firande vinner (battle-mvp-celebrations.js läser
  // mvpStyle först), sedan premiumstilarna, sedan ramen, sist den klassiska stilen (inferno som
  // standard, som renderaren).
  function modell(w) {
    const s = w && w.mvpStyle;
    if (s && (har(FIRANDEDATA, s) || FIRANDEN.includes(s))) return 'firande:' + s;
    if (s && PREMIUM.includes(s)) return 'premium:' + s;
    if (w && w.mvpFrame && (har(RAMDATA, w.mvpFrame) || RAMAR.includes(w.mvpFrame))) return 'ram:' + w.mvpFrame;
    return 'klassisk:' + (s || 'inferno');
  }

  const harEgenBakgrund = w => !!(w && (w.hideBackground || w.bgColor || w.bgStrength != null || w.bgRadius != null || w.bgPadding != null));
  const poangPa = w => !!(w && w.mvpShowCoins === true);

  // Gemensamma rader.
  const typsnitt = arv => Object.assign({ sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont' }, arv ? { arv: 'fontFamily' } : {});
  const stil = { sektion: 5, typ: 'val', falt: 'mvpStyle', etikett: 'Stil', legacyId: '#mvpStyle' };
  const fastBild = { sektion: 5, typ: 'text', falt: 'prMvpFast', legacyId: '#prMvpFast' };
  const bakgrund = { sektion: 5, typ: 'std-bakgrund', om: harEgenBakgrund };
  const visningstid = { sektion: 6, typ: 'tal', falt: 'mvpDuration', etikett: 'Visningstid', enhet: 's', legacyId: '#mvpDuration' };
  const position = { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] };
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const live = text => ({ sektion: 2, kalla: 'live', typ: 'text', etikett: text });
  const LIVE_POANG = 'Hämtas från TikTok när en battle avgörs: MVP:ns namn, poäng och profilbild. I lagmatcher kan MVP:n vara en medvärds tittare.';
  const LIVE_NAMN = 'Hämtas från TikTok när en battle avgörs: MVP:ns namn och profilbild. I lagmatcher kan MVP:n vara en medvärds tittare.';

  function post(nyckel, rubrikNamn, grupp, katalognyckel, kontroller, arv, utseende) {
    return {
      typ: 'templateBattleMvp',
      modell,
      galler: [nyckel],
      rubrik: () => 'Battle MVP',
      marke: () => rubrikNamn + ' · ' + grupp,
      katalognyckel: () => katalognyckel,
      test: 'mvp',
      // Båda knapparna med id #testBattleMvp och sökvägsfältet för profilbilden.
      ersatter: ['#testBattleMvp', '#mvpProfile'],
      arv,
      kontroller,
      utseendeFalt: [...utseende, ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  // ---- 1a. Klassiska stilar ----------------------------------------------------------------------
  // Spec 4.2: Färg 1 och Färg 2 ärvdes redan (accent och andra färgen på emblemet, b, strong och i);
  // textfärgen (rubrik och namn, mvpTextfarg i media.js) och typsnittet (vyra-textgrupp.js) är
  // inkopplade.
  function klassisk(s) {
    return post('klassisk:' + s, KLASSISKA[s], 'klassisk', 'catalog:battlemvp:' + s, [
      { sektion: 2, typ: 'text', falt: 'mvpLabel', etikett: 'Rubrik', legacyId: '#mvpLabel' },
      { sektion: 2, typ: 'kryss', falt: 'mvpShowLabel', etikett: 'Visa rubrik', legacyId: '#mvpShowLabelMain' },
      { sektion: 2, typ: 'kryss', falt: 'mvpShowName', etikett: 'Visa namn', legacyId: '#mvpShowNameMain' },
      { sektion: 2, typ: 'kryss', falt: 'mvpShowCoins', etikett: 'Visa poäng', legacyId: '#mvpShowCoins' },
      { sektion: 2, typ: 'text', falt: 'mvpCoinSymbol', etikett: 'Poängsymbol', legacyId: '#mvpCoinSymbol', om: poangPa },
      live(LIVE_POANG),
      position,
      typsnitt(true),
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      stil,
      { sektion: 5, typ: 'farg', falt: 'mvpColor', etikett: 'Färg 1', legacyId: '#mvpColor', arv: 'highlight' },
      { sektion: 5, typ: 'farg', falt: 'mvpColor2', etikett: 'Färg 2', legacyId: '#mvpColor2', arv: 'secondary' },
      bakgrund,
      visningstid,
      aterstall,
    ], ['highlight', 'secondary', 'text', 'fontFamily'], ['mvpColor', 'mvpColor2', 'inheritBrandKit']);
  }

  // ---- 1b. Ramar ---------------------------------------------------------------------------------
  // Ramen visar rubrik, profilbild och namn — aldrig poängen (spec 2026-08-13). Rubrikstorlek och
  // Namnstorlek står bland texten.
  function ram(id) {
    return post('ram:' + id, ramNamn(id), 'ram', 'catalog:battlemvp:frame:' + id, [
      { sektion: 2, typ: 'text', falt: 'mvpLabel', etikett: 'Rubrik', legacyId: '#mvpLabel' },
      { sektion: 2, typ: 'kryss', falt: 'mvpShowLabel', etikett: 'Visa rubrik', legacyId: '#mvpShowLabel' },
      { sektion: 2, typ: 'kryss', falt: 'mvpShowName', etikett: 'Visa namn', legacyId: '#mvpShowName' },
      live(LIVE_NAMN),
      position,
      typsnitt(false),
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      { sektion: 4, typ: 'tal', falt: 'mvpLabelSize', etikett: 'Rubrikstorlek', enhet: 'px', legacyId: '#mvpLabelSize' },
      { sektion: 4, typ: 'tal', falt: 'mvpNameSize', etikett: 'Namnstorlek', enhet: 'px', legacyId: '#mvpNameSize' },
      stil,
      fastBild,
      bakgrund,
      visningstid,
      aterstall,
    ], [], ['mvpLabelSize', 'mvpNameSize']);
  }

  // ---- 1c. Firanden ------------------------------------------------------------------------------
  const SKUGGA = ['vtShadowBlur', 'vtShadowColor', 'vtShadowX', 'vtShadowY'];
  function firande(id) {
    const guld = id === 'gold-ribbon', lejon = id === 'lion-clash';
    const rubrik = !guld && !lejon;
    const partiklar = MED_PARTIKLAR.includes(id);
    return post('firande:' + id, firandeNamn(id), 'firande', 'catalog:battlemvp:celebration:' + id, [
      ...(rubrik ? [
        { sektion: 2, typ: 'text', falt: 'mvpLabel', etikett: 'Rubrik', legacyId: '#mvpLabel' },
        { sektion: 2, typ: 'kryss', falt: 'mvpShowLabel', etikett: 'Visa rubrik', legacyId: '#mvpShowLabelMain' },
      ] : []),
      { sektion: 2, typ: 'kryss', falt: 'mvpShowName', etikett: 'Visa namn', legacyId: '#mvpShowNameMain' },
      live(LIVE_NAMN),
      position,
      typsnitt(false),
      { sektion: 4, typ: 'std-text', utan: guld ? ['vtFont', ...SKUGGA] : ['vtFont'] },
      stil,
      ...(partiklar ? [
        { sektion: 5, typ: 'tal', falt: 'mvpFxIntensity', etikett: 'Partikelintensitet', enhet: '%', legacyId: '#mvpFxIntensity' },
        { sektion: 5, typ: 'tal', falt: 'mvpFxSpeed', etikett: 'Partikelhastighet', enhet: '%', legacyId: '#mvpFxSpeed' },
        { sektion: 5, typ: 'tal', falt: 'mvpFxSize', etikett: 'Partikelstorlek', enhet: '%', legacyId: '#mvpFxSize' },
        { sektion: 5, typ: 'tal', falt: 'mvpFxDepth', etikett: 'Andel framför ramen', enhet: '%', legacyId: '#mvpFxDepth' },
        { sektion: 5, typ: 'tal', falt: 'mvpFxHole', etikett: 'Fri yta runt profilbilden', enhet: '%', legacyId: '#mvpFxHole' },
        { sektion: 5, typ: 'val', falt: 'mvpFxTint', etikett: 'Partikelfärg', legacyId: '#mvpFxTint' },
      ] : []),
      fastBild,
      bakgrund,
      visningstid,
      aterstall,
    ], [], partiklar ? PARTIKELFALT : []);
  }

  Object.keys(KLASSISKA).forEach(s => R.definiera(klassisk(s)));
  RAMAR.forEach(id => R.definiera(ram(id)));
  FIRANDEN.forEach(id => R.definiera(firande(id)));

  // ---- 2. Panelens tillägg -----------------------------------------------------------------------
  //
  // Informationsraden byggs som ett element i en dold grupp sist i props(). Ramen flyttar den till
  // sektion 5 med legacyId, och den dolda gruppen parkeras som alla andra gamla grupper. Bara editorn,
  // och bara modeller med post.
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const medPost = w => !!(w && w.type === 'templateBattleMvp' && R.hitta(w));

  function fastText(w) {
    const m = modell(w);
    if (m === 'firande:gold-ribbon') return 'Guldbandet är en fast bild: färgerna och ordet MVP går inte att ändra.';
    if (m === 'firande:lion-clash') return 'Lion Clash är en fast bild utan rubrik: bara namnet och profilbilden byts.';
    if (m.startsWith('ram:')) return 'Ramen är en fast bild och påverkas inte av färgschemat. Poängen visas inte i ramarna.';
    if (m.startsWith('firande:')) return 'Motivet är en fast bild och påverkas inte av färgschemat. Poängen visas inte i firandena.';
    return '';
  }

  if (typeof props === 'function' && !iOverlay()) {
    const tidigareProps = props;
    props = function () {
      const html = tidigareProps.apply(this, arguments);
      const w = vald();
      if (!medPost(w) || typeof html !== 'string') return html;
      const t = fastText(w);
      return t ? html + `<div class="property-group pr-mvp-tillagg" hidden><small id="prMvpFast" class="pr-info">${t}</small></div>` : html;
    };
  }

  // STIL-LISTAN MED RAMARNA (spec 5.18, sektion 5). Listan hade de klassiska stilarna och firandena,
  // men inte ramarna: en ram som bytts bort gick inte att välja tillbaka. Ramarna läggs in som egna
  // val ("ram:<id>"); ett sådant val sätter mvpFrame och tar bort en stil som annars hade vunnit
  // över ramen (firandet ritas före ramen). Ett vanligt stilval tar bort mvpFrame som förut
  // (battle-mvp-celebrations.js). Rubrik- och namnstorleken får ramens standard om de saknas.
  const RAM_PREFIX = 'ram:';
  function stilLista(w) {
    const sel = document.querySelector('.properties #mvpStyle');
    if (!sel) return;
    if (!sel.querySelector('optgroup[data-pr-ramar]')) {
      const g = document.createElement('optgroup');
      g.label = 'Ram · fast bild';
      g.dataset.prRamar = '1';
      g.innerHTML = RAMAR.map(id => `<option value="${RAM_PREFIX}${id}">${ramNamn(id)}</option>`).join('');
      const forsta = sel.querySelector('optgroup');
      sel.insertBefore(g, forsta || null);
    }
    const m = modell(w);
    const varde = m.startsWith('ram:') ? RAM_PREFIX + w.mvpFrame : (w.mvpStyle || 'inferno');
    if (sel.value !== varde) sel.value = varde;
    if (sel.onchange && !sel.onchange.__prMvp) {
      const forra = sel.onchange;
      const ny = function (e) {
        const v = String(sel.value || '');
        if (!v.startsWith(RAM_PREFIX)) return forra.call(this, e);
        const id = v.slice(RAM_PREFIX.length);
        if (!RAMAR.includes(id)) return undefined;
        const x = vald();
        if (!x || x.type !== 'templateBattleMvp') return undefined;
        x.mvpFrame = id;
        delete x.mvpStyle;
        let mall = null;
        try { mall = window.VyraWidgets.create('catalog:battlemvp:frame:' + id); } catch (_) {}
        if (mall) for (const f of ['mvpLabelSize', 'mvpNameSize']) if (x[f] == null && mall[f] != null) x[f] = mall[f];
        if (typeof save === 'function') save();
        if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else if (typeof render === 'function') render();
        return undefined;
      };
      ny.__prMvp = true;
      sel.onchange = ny;
    }
    // Live-vägen (input) skriver mvpStyle direkt; ett ramval ska bara gå via change ovan.
    if (sel.oninput && !sel.oninput.__prMvp) {
      const forra = sel.oninput;
      const ny = function (e) { if (String(sel.value || '').startsWith(RAM_PREFIX)) return undefined; return forra.call(this, e); };
      ny.__prMvp = true;
      sel.oninput = ny;
    }
  }

  function stilTillagg() {
    if (document.getElementById('vyra-mvp-panel-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-mvp-panel-stil';
    s.textContent = '.properties .pr-info{display:block;opacity:.75;font-size:11px;margin:2px 0 6px}';
    (document.head || document.documentElement).append(s);
  }

  if (typeof bind === 'function' && !iOverlay()) {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        const w = vald();
        if (typeof view !== 'undefined' && view === 'editor' && medPost(w)) {
          stilTillagg();
          stilLista(w);
          // battle-mvp-celebrations.js laddas asynkront av media.js och binder alltså UTANPÅ det här
          // omslaget: den sätter Stil-listans värde och onchange efter oss. En gång till när hela
          // bind-kedjan har kört.
          Promise.resolve().then(() => { try { const x = vald(); if (medPost(x)) stilLista(x); } catch (e) { console.error('[VyraMvpPanel]', e); } });
        }
      } catch (e) { console.error('[VyraMvpPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Namnet och poängen är widgetens egna exempel (sektion 1); grunden fyller i där de saknas.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('mvp'))) {
    E.definiera('mvp', g => ({ namn: g.namn, poang: g.poang, profil: g.profil }));
  }

  // ---- 4. Testadaptern ---------------------------------------------------------------------------
  //
  // Spelar EN MVP på klonens nod med mvpSpelaPa (media.js) och testmotorns klocka. Alla modeller
  // animeras över hela visningstiden (battle-mvp-celebrations.css): entrén är de första 16 % (där
  // firandet landar och partiklarna når toppen), utgången de sista 8 %. Firandets partiklar startar av
  // sig själva på klassen mvp-active (battle-mvp-particles.js) och dör när klassen tas bort eller
  // klonen försvinner. Ingen kö, inget filter på state.widgets, ingen skrivning på widgeten och ingen
  // save() — motorn vaktar det.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('mvp'))) return;

  const ENTRE_ANDEL = 0.16, UTGANG_ANDEL = 0.08;
  T.registrera('mvp', {
    spela(nod, k, ex, ctl) {
      if (typeof window.mvpSpelaPa !== 'function') throw new Error('media.js saknar mvpSpelaPa');
      if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k);
      // Testet spelar alltid exempeldatafilens MVP: widgetens sparade namn, poäng och bild läses inte.
      const poang = ex.poang;
      window.mvpSpelaPa(nod, k, { name: ex.namn, score: poang, profileImage: ex.bild(ex.profil) },
        { setTimeout: ctl.setTimeout });
      const total = Math.max(0, (Number(k.mvpDuration) || 7) * 1000);
      const entre = Math.round(total * ENTRE_ANDEL), utgang = Math.round(total * UTGANG_ANDEL);
      return { entre, visning: Math.max(0, total - entre - utgang), utgang };
    },
    stoppa(nod) {
      nod.classList.remove('mvp-active');
      // Partikeldukarna ligger i klonens scen; de tas bort med den, men rensas här direkt så att
      // ingenting av firandet syns under den sista bildrutan.
      nod.querySelectorAll('canvas.mvc-fx').forEach(c => c.remove());
      const scen = nod.querySelector('.mvc-stage');
      if (scen) scen.classList.remove('mvc-fx-on');
    },
  });
})();
