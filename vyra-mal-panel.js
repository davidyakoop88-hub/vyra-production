(function () {
  'use strict';
  // MÅLEN I PANELRAMEN — PR 9 i panelspecifikationen (avsnitt 5.6, 5.7 och 5.8).
  //
  // Tre typer och 27 modeller:
  //   * Follower/Like/Diamond Goal (templateSocialGoal) — nio rörliga designer, tre sorter × tre format
  //     (cirkel, liggande, stående). Ritas av goal-motion.js; panelen byggs där (props) och flyttas hit.
  //   * Heart Me Goal (templateHeartGoal) — tolv teman. Ritas av media.js (heartGoalHtml).
  //   * Gift Campaign (templateGiftCampaign) — tre designer × två orienteringar. Ritas av
  //     gift-campaign-aura.js, och ljuset av gift-campaign-aura-engine.js.
  //
  // Filen har fyra delar, som vyra-mvp-panel.js och vyra-ranking-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens små tillägg: Fast bredd i Heart Me och svenska temanamn (props/bind-omslag),
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptrarna 'socialgoal', 'heartgoal' och 'kampanj' (vyra-testspel.js).
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Lager finns i alla: Heart Me, goal-motion och kampanjen går förbi styledWh, så vyra-lager.js
  //     skriver z-index = lagret på lådan (PR 16),
  //   * Bredd i Heart Me är skrivskyddad: studio.css:169 låser widgeten till 230 px med !important, och
  //     hjärtat och pillen har fasta mått inuti. En rad säger det, och Storlek skalar hela widgeten,
  //   * Ljus i målen verkar (goal-motion.css räknade med '62%' i en skuggradie, som var ogiltig),
  //   * Antal (talets färg) i Heart Me verkar (studio.css:169 satte color:#fff på talet),
  //   * +1 Test och Testa 100 % (Social Goal) är ersatta av ▶ Testa widget, och kampanjens sökvägsfält
  //     för gåvobilden av gåvoväljaren (mediaväljaren med typ 'gava': gåvans bild och namn, aldrig
  //     sökvägen),
  //   * Nu (kampanjens räknare per gåva) står inte i panelen: den räknas upp live (gift-event-images.js)
  //     och en LIVE-rad säger det. Fältet ligger kvar i state,
  //   * BAKGRUND visas inte: alla tre är genomskinliga motiv.
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // MÅL OCH STARTVÄRDE I SOCIAL GOAL ÄR SERVERDATA. De går som förut till VyraGoals.patchTarget/
  // patchBaseline (premium-final.js bindGoalControl), och utan server visas "Kunde inte spara målet" och
  // fältet återställs. Testet anropar dem aldrig: det spelar klonens egna värden.
  //
  // FÄRGARV (spec 4.2): Social Goal erbjuds inte (modellen har inga färgfält). Heart Me ärver accent
  // (hjärtat), text och andra färgen (talet); typsnitt och bakgrund ärvs inte. Gift Campaign ärver
  // accent (ljuset och mätarna), text och typsnitt.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const ENTREFALT = ['entranceAnimation', 'entranceDuration'];
  const position = utan => ({ sektion: 3, typ: 'std-position', utan: ['hojd', 'las', ...(utan || [])] });
  const aterstall = { sektion: 7, typ: 'std-aterstall' };
  const live = text => ({ sektion: 2, kalla: 'live', typ: 'text', etikett: text });

  // ---- 1a. Follower/Like/Diamond Goal --------------------------------------------------------------
  // Samma nio designer som goal-motion.js DESIGNS, som en egen kopia: registret måste kunna svara utan
  // att renderaren är laddad (goal-motion.js kommer med premiumbunten, och tests/browser/panelram-noop
  // läser registret utan webbläsare). goal-motion.js modelFor() har samma regel: en okänd modell ritas
  // som sortens cirkel.
  const MAL = {
    'crown-orbit': ['followers', 'circle', 'Crown Orbit'], 'crown-rail': ['followers', 'landscape', 'Crown Rail'], 'crown-tower': ['followers', 'portrait', 'Crown Tower'],
    'heart-orbit': ['likes', 'circle', 'Heart Orbit'], 'heart-rail': ['likes', 'landscape', 'Heart Rail'], 'heart-tower': ['likes', 'portrait', 'Heart Tower'],
    'diamond-orbit': ['diamonds', 'circle', 'Diamond Orbit'], 'diamond-rail': ['diamonds', 'landscape', 'Diamond Rail'], 'diamond-tower': ['diamonds', 'portrait', 'Diamond Tower'],
  };
  const MAL_STANDARD = { followers: 'crown-orbit', likes: 'heart-orbit', diamonds: 'diamond-orbit' };
  const MAL_RUBRIK = { followers: 'Follower Goal', likes: 'Like Goal', diamonds: 'Diamond Goal' };
  const FORMAT = { circle: 'cirkel', landscape: 'liggande', portrait: 'stående' };
  const malModell = w => (w && MAL[w.goalModel] ? w.goalModel : MAL_STANDARD[w && w.goalKind] || 'crown-orbit');

  function socialGoal(id) {
    const [sort, format, namn] = MAL[id];
    return {
      typ: 'templateSocialGoal',
      modell: malModell,
      galler: [id],
      rubrik: () => MAL_RUBRIK[sort],
      marke: () => namn + ' · ' + FORMAT[format],
      katalognyckel: () => `catalog:socialgoal:${sort}:${id}:${format}`,
      test: 'socialgoal',
      ersatter: ['#pfGoalPlus', '#pfGoalComplete'],
      kontroller: [
        // 2 · Innehåll
        { sektion: 2, typ: 'val', falt: 'goalKind', etikett: 'Vad räknas', legacyId: '#gmKind' },
        // Cirkelns rubrik är målad i konsten (B-005): fältet visas inte där, en rad säger varför.
        { sektion: 2, typ: 'text', falt: 'goalTitle', etikett: 'Rubrik', legacyId: '#gmTitle', om: () => format !== 'circle' },
        { sektion: 2, typ: 'text', falt: 'prRubrikIBilden', legacyId: '#gmTitleBild', om: () => format === 'circle' },
        { sektion: 2, typ: 'tal', falt: 'goalTarget', etikett: 'Mål', legacyId: '#pfGoalTarget' },
        { sektion: 2, typ: 'tal', falt: 'goalCurrent', etikett: 'Startvärde', legacyId: '#pfGoalCurrent' },
        { sektion: 2, typ: 'kryss', falt: 'goalShowPercent', etikett: 'Visa procent', legacyId: '#gmShowPct' },
        { sektion: 2, typ: 'kryss', falt: 'goalShowCount', etikett: 'Visa antal', legacyId: '#gmShowCount' },
        { sektion: 2, typ: 'kryss', falt: 'goalShowRemaining', etikett: 'Visa återstående', legacyId: '#gmShowRemaining' },
        live('Värdet räknas av servern från TikTok under sändningen. Mål och startvärde sparas i målet på servern.'),
        // 3 · Storlek och placering
        position(),
        // 4 · Text
        { sektion: 4, typ: 'std-text' },
        // 5 · Utseende. Design visar bara den valda sortens tre format (goal-motion.js).
        { sektion: 5, typ: 'val', falt: 'goalModel', etikett: 'Design', legacyId: '#gmModel' },
        { sektion: 5, typ: 'tal', falt: 'goalGlow', etikett: 'Ljus', enhet: '%', legacyId: '#gmGlow' },
        // 6 · Animation
        { sektion: 6, typ: 'std-entre' },
        aterstall,
      ],
      utseendeFalt: ['goalGlow', ...ENTREFALT, ...TEXTFALT],
    };
  }
  Object.keys(MAL).forEach(id => R.definiera(socialGoal(id)));

  // ---- 1b. Heart Me Goal ---------------------------------------------------------------------------
  // Teman ur fabrikens register (widget-factory.js 'heartgoal.theme'), med svenska namn.
  const HJARTTEMA = { classic: 'Klassisk', dark: 'Mörk', emerald: 'Smaragd', galaxy: 'Galax', golden: 'Guld', ice: 'Is',
    neon: 'Neon', ocean: 'Hav', sakura: 'Sakura', frost: 'Frost', midnight: 'Midnatt', citrus: 'Citrus' };
  // Samma regel som renderaren (media.js heartGoalHtml): utan tema är det Neon.
  const hjartModell = w => { const t = (w && w.heartTheme) || 'neon'; return HJARTTEMA[t] ? t : null; };

  function heartGoal(tema) {
    return {
      typ: 'templateHeartGoal',
      modell: hjartModell,
      galler: [tema],
      rubrik: () => 'Heart Me Goal',
      marke: () => 'Tema ' + HJARTTEMA[tema],
      katalognyckel: () => 'catalog:heartgoal:' + tema,
      test: 'heartgoal',
      // Den gamla arvsrutan (bkCheckbox) — ramens Ärv färgschema ersätter den.
      ersatter: ['#bkInherit'],
      arv: ['highlight', 'text', 'secondary'],
      kontroller: [
        // 2 · Innehåll
        { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#heartTitle' },
        { sektion: 2, typ: 'text', falt: 'heartIcon', etikett: 'Hjärtsymbol', legacyId: '#heartIcon' },
        { sektion: 2, typ: 'tal', falt: 'heartTarget', etikett: 'Mål', legacyId: '#heartTarget' },
        { sektion: 2, typ: 'tal', falt: 'heartCurrent', etikett: 'Startvärde', legacyId: '#heartCurrent' },
        { sektion: 2, typ: 'kryss', falt: 'heartShowPercent', etikett: 'Visa procent', legacyId: '#heartShowPercent' },
        { sektion: 2, typ: 'kryss', falt: 'heartShowCount', etikett: 'Visa antal', legacyId: '#heartShowCount' },
        live('Under sändningen ersätter livemålet från TikTok startvärdet och målet.'),
        // 3 · Storlek och placering. Bredden är fast (studio.css:169); bind-omslaget nedan gör fältet
        // skrivskyddat, och raden säger varför.
        position(),
        { sektion: 3, typ: 'text', falt: 'prFastBredd', legacyId: '#prFastBredd' },
        // 4 · Text
        { sektion: 4, typ: 'std-text' },
        // 5 · Utseende
        { sektion: 5, typ: 'val', falt: 'heartTheme', etikett: 'Tema', legacyId: '#heartTheme' },
        { sektion: 5, typ: 'farg', falt: 'heartColor', etikett: 'Hjärta', legacyId: '#heartColor', arv: 'highlight' },
        { sektion: 5, typ: 'farg', falt: 'heartTextColor', etikett: 'Text', legacyId: '#heartTextColor', arv: 'text' },
        { sektion: 5, typ: 'farg', falt: 'heartNumberColor', etikett: 'Antal', legacyId: '#heartNumberColor', arv: 'secondary' },
        // 6 · Animation
        { sektion: 6, typ: 'std-entre' },
        { sektion: 6, typ: 'kryss', falt: 'heartFirande', etikett: 'Firande vid uppnått mål', legacyId: '#heartFirande' },
        aterstall,
      ],
      utseendeFalt: ['heartColor', 'heartTextColor', 'heartNumberColor', 'inheritBrandKit', 'heartFirande', ...ENTREFALT, ...TEXTFALT],
    };
  }
  Object.keys(HJARTTEMA).forEach(t => R.definiera(heartGoal(t)));

  // ---- 1c. Gift Campaign ---------------------------------------------------------------------------
  // Samma temaregel som gift-campaign-aura.js theme(): de äldre temana ritas som en av de tre.
  const KAMPANJTEMA = { gold: 'Guldslöja', platinum: 'Platinum Light', emerald: 'Emerald Mist' };
  const KAMPANJ_ALIAS = { glass: 'platinum', minimal: 'platinum', aurora: 'emerald', 'crystal-garden': 'emerald' };
  const kampanjTema = w => { const t = w && w.campaignTheme; return KAMPANJTEMA[t] ? t : KAMPANJ_ALIAS[t] || 'gold'; };
  const orientering = w => (w && w.campaignOrientation === 'portrait' ? 'portrait' : 'landscape');
  const kampanjModell = w => kampanjTema(w) + ':' + orientering(w);
  // Samma som media.js campaignGiftCount (1–6, standard 4).
  const antalGavor = w => Math.min(6, Math.max(1, +(w && w.giftCount) || 4));
  const ljudPa = w => !!(w && w.campaignSound);

  function gavoKontroller() {
    const ut = [];
    for (let i = 0; i < 6; i++) {
      const om = w => antalGavor(w) > i;
      ut.push(
        { sektion: 2, typ: 'media', medietyp: 'gava', falt: 'giftImage' + i, etikett: 'Gåva ' + (i + 1), om,
          // Galleriet är det befintliga (media.js openPagedGiftPicker): samma värde som förut, och namnet
          // följer med gåvan.
          valj: w => { if (typeof openPagedGiftPicker === 'function') openPagedGiftPicker(w, i); },
          // Miniatyren visar den gåva widgeten faktiskt ritar — platsens standardgåva när fältet är tomt.
          las: w => w['giftImage' + i] || ((typeof window.VyraCampaignItems === 'function' && window.VyraCampaignItems(w)[i]) || {}).image || '',
          // Namnet som widgeten visar (galleriet skriver namn och bild tillsammans).
          gavonamn: w => {
            const lista = typeof window.VyraCampaignItems === 'function' ? window.VyraCampaignItems(w) : [];
            return lista[i] ? lista[i].name : '';
          } },
        { sektion: 2, typ: 'text', falt: 'giftName' + i, etikett: `Gåva ${i + 1}: namn`, legacyId: '#giftName' + i, om },
        { sektion: 2, typ: 'tal', falt: 'giftTarget' + i, etikett: `Gåva ${i + 1}: mål`, legacyId: '#giftTarget' + i, om },
      );
    }
    return ut;
  }

  function kampanj(tema, orient) {
    return {
      typ: 'templateGiftCampaign',
      modell: kampanjModell,
      galler: [tema + ':' + orient],
      rubrik: () => 'Gift Campaign',
      marke: () => KAMPANJTEMA[tema] + ' · ' + (orient === 'portrait' ? 'stående' : 'liggande'),
      katalognyckel: () => `catalog:giftcampaign:${tema}:${orient}`,
      test: 'kampanj',
      // Sökvägsfälten för gåvobilden och knappen som öppnade galleriet bredvid dem: gåvoväljaren ersätter
      // båda.
      ersatter: ['#giftImage0', '#giftImage1', '#giftImage2', '#giftImage3', '#giftImage4', '#giftImage5', '.open-gift-picker'],
      arv: ['highlight', 'text', 'fontFamily'],
      kontroller: [
        // 2 · Innehåll
        { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#campaignTitle' },
        { sektion: 2, typ: 'text', falt: 'campaignSubtitle', etikett: 'Text under', legacyId: '#campaignSubtitle' },
        { sektion: 2, typ: 'val', falt: 'giftCount', etikett: 'Antal gåvor', legacyId: '#campaignGiftCount' },
        ...gavoKontroller(),
        live('Nu räknas upp live: varje gåva i sändningen räknas på sin rad. I editorn står ett exempelvärde.'),
        // 3 · Storlek och placering
        position(),
        { sektion: 3, typ: 'val', falt: 'campaignOrientation', etikett: 'Orientering', legacyId: '#campaignOrientation' },
        // 4 · Text
        { sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont', arv: 'fontFamily' },
        { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
        // 5 · Utseende
        { sektion: 5, typ: 'val', falt: 'campaignTheme', etikett: 'Design', legacyId: '#campaignTheme' },
        // 6 · Animation
        { sektion: 6, typ: 'val', falt: 'campaignDirection', etikett: 'Entré från', legacyId: '#campaignDirection' },
        { sektion: 6, typ: 'val', falt: 'campaignMotion', etikett: 'Rörelse', legacyId: '#campaignMotion' },
        { sektion: 6, typ: 'kryss', falt: 'campaignSound', etikett: 'Ljud vid gåva', legacyId: '#campaignSound' },
        { sektion: 6, typ: 'tal', falt: 'campaignVolume', etikett: 'Volym', enhet: '%', legacyId: '#campaignVolume', om: ljudPa },
        aterstall,
      ],
      utseendeFalt: ['campaignMotion', 'campaignDirection', 'campaignSound', 'campaignVolume', 'inheritBrandKit', ...TEXTFALT],
    };
  }
  for (const tema of Object.keys(KAMPANJTEMA)) for (const o of ['landscape', 'portrait']) R.definiera(kampanj(tema, o));

  // ---- 2. Panelens tillägg -----------------------------------------------------------------------
  //
  // Raden om Heart Me:s fasta bredd byggs som ett element i en dold grupp sist i props(). Ramen flyttar
  // den till sektion 3 med legacyId, och den dolda gruppen parkeras som alla andra gamla grupper. Bara
  // editorn, och bara Heart Me med post. (Social Goals panel byggs av goal-motion.js, som avslutar
  // props-kedjan själv — dess kontroller står därför där.)
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const TYPER = ['templateSocialGoal', 'templateHeartGoal', 'templateGiftCampaign'];
  const medPost = w => !!(w && TYPER.includes(w.type) && R.hitta(w));
  const FAST_BREDD = 230;            // studio.css:169 .vyra-heart-goal{width:230px!important}

  if (typeof props === 'function' && !iOverlay()) {
    const tidigareProps = props;
    props = function () {
      const html = tidigareProps.apply(this, arguments);
      const w = vald();
      if (!medPost(w) || w.type !== 'templateHeartGoal' || typeof html !== 'string') return html;
      return html + '<div class="property-group pr-mal-tillagg" hidden><small id="prFastBredd" class="pr-info">Fast bredd i den här modellen – ändra storleken med Storlek.</small></div>';
    };
  }

  function svenska(w) {
    if (w.type !== 'templateHeartGoal') return;
    const sel = document.querySelector('.properties #heartTheme');
    if (sel) for (const o of sel.options) if (HJARTTEMA[o.value] && o.textContent !== HJARTTEMA[o.value]) o.textContent = HJARTTEMA[o.value];
  }
  // Bredden i Heart Me är låst av CSS:en (FAST_BREDD px före Storlek): fältet går inte att ändra. Värdet
  // är vyra-proportioner.js:s — den ritade lådan, alltså med Storlek inräknad — och rörs inte här.
  function fastBredd(w) {
    if (w.type !== 'templateHeartGoal') return;
    const el = document.querySelector('.properties #propWidth');
    if (!el) return;
    if (!el.disabled) el.disabled = true;
    el.readOnly = true;
    el.title = 'Fast bredd i den här modellen (' + FAST_BREDD + ' px före Storlek)';
    // Hjälpraden hamnade sist i sektionen, efter Lager, tre rader under fältet den förklarar
    // (slutgranskning B-027). Den flyttas till raden direkt under Bredd.
    const info = document.querySelector('.properties #prFastBredd');
    const breddRad = el.closest('label');
    if (info && breddRad && breddRad.nextElementSibling !== info) breddRad.after(info);
  }

  function stil() {
    if (document.getElementById('vyra-mal-panel-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-mal-panel-stil';
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
          stil();
          svenska(w);
          fastBredd(w);
          // vyra-proportioner.js och panelramen binder Bredd i yttre omslag; en gång till när kedjan kört.
          Promise.resolve().then(() => { try { const x = vald(); if (medPost(x) && x.id === w.id) { svenska(x); fastBredd(x); } } catch (e) { console.error('[VyraMalPanel]', e); } });
        }
      } catch (e) { console.error('[VyraMalPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Målen går 0 → 60 % → 100 % (grunden: mal). Kampanjen får fyra gåvor och en följd av bidrag
  // [gåvans plats, antal] som testet spelar; den sista gåvan i följden når sitt mål.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function') {
    if (!(E.har && E.har('socialgoal'))) E.definiera('socialgoal', g => ({ mal: g.mal }));
    if (!(E.har && E.har('heartgoal'))) E.definiera('heartgoal', g => ({ mal: g.mal }));
    if (!(E.har && E.har('kampanj'))) E.definiera('kampanj', g => ({ gavor: g.gavor,
      bidrag: [[0, 3], [1, 2], [2, 1], [3, 1], [0, 5], [1, 3], [2, 2]] }));
  }

  // ---- 4. Testadaptrarna -------------------------------------------------------------------------
  //
  // Var och en spelar på KLONENS nod med familjens egen, redan lokala väg — aldrig målruntimen
  // (VyraGoals), kampanjens livebrygga (gift-event-images.js, VyraCampaignAuraSession), save() eller
  // nätet. Motorn vaktar det. Klonen ritas med klonens id (w.id + '__prov'); renderarna läser då
  // aldrig runtimen (media.js goalLiveFor, goal-motion.js), så klonen visar testets värden.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;

  const textgrupp = (nod, k) => { if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k); };
  const entreMs = k => (k.entranceAnimation && k.entranceAnimation !== 'none' ? (Number(k.entranceDuration) || 600) : 0);
  const UTGANG = 500;
  function tonaUt(nod) {
    if (typeof nod.animate === 'function') nod.__malUt = nod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UTGANG, fill: 'forwards' });
    else nod.style.opacity = '0';
  }
  function rensaUt(nod) {
    if (nod.__malUt) { try { nod.__malUt.cancel(); } catch (_) {} nod.__malUt = null; }
  }

  // MÅLEN: 0 → 1 → 60 % → 100 % (uppnått) med VyraGoalDom.patch (media.js patchGoalDom), samma riktade
  // väg som en riktig målram tar — men mot klonens id, som bara klonen bär. Patchen söker i .canvas
  // och jämför id exakt, så varken den riktiga widgeten eller en granne nås.
  const STEG_MS = [700, 1900, 3300], MAL_VISNING = 5000;
  function malAdapter(malFalt, stegFor) {
    return {
      utanEntre: w => entreMs(w) === 0,
      spela(nod, k, ex, ctl) {
        const P = window.VyraGoalDom;
        if (!P || typeof P.patch !== 'function') throw new Error('media.js saknar VyraGoalDom');
        textgrupp(nod, k);
        const mal = Math.max(1, Math.round(Number(k[malFalt]) || (malFalt === 'goalTarget' ? 1000 : 50)));
        const steg = stegFor(mal, ex.mal || { mitt: 60 });
        const satt = v => P.patch(k.id, { value: v, target: mal });
        satt(0);
        const entre = entreMs(k);
        steg.forEach((v, i) => ctl.setTimeout(() => satt(v), entre + STEG_MS[i]));
        ctl.setTimeout(() => tonaUt(nod), entre + MAL_VISNING);
        return { entre, visning: MAL_VISNING, utgang: UTGANG };
      },
      stoppa(nod) { rensaUt(nod); },
    };
  }
  const mitten = (mal, ex) => Math.max(1, Math.round(mal * (Number(ex.mitt) || 60) / 100));
  T.registrera('socialgoal', malAdapter('goalTarget', (mal, ex) => [Math.min(1, mal), mitten(mal, ex), mal]));
  T.registrera('heartgoal', malAdapter('heartTarget', (mal, ex) => [Math.max(1, Math.round(mal / 4)), mitten(mal, ex), mal]));

  // KAMPANJEN: klonens räknare börjar på noll, och bidragen kommer in en i taget genom motorns
  // receive() (gift-campaign-aura-engine.js) — ljuset, räknaren som rullar upp och ljudet vid gåva,
  // med widgetens egna Ljud och Volym. Den sista gåvan i följden når sitt mål ("MÅL KLART" och
  // gnistorna). Motorn monteras på klonens nod och ritas av den enda tickern (vfx-ticker.js), precis som
  // en riktig kampanj; den river sig själv när klonen tas bort, och stoppa() river den direkt.
  // Klonens räknare ändras bara på k, som aldrig finns i state.
  const BIDRAG_MS = 600, KAMPANJ_EFTER = 1400;
  T.registrera('kampanj', {
    spela(nod, k, ex, ctl) {
      const M = window.VyraCampaignAuraEngine;
      if (!M || typeof M.mount !== 'function') throw new Error('gift-campaign-aura-engine.js saknas');
      const n = antalGavor(k);
      for (let i = 0; i < n; i++) k['giftCurrent' + i] = 0;
      const mall = document.createElement('div');
      mall.innerHTML = typeof wh === 'function' ? wh(k) : '';
      const ny = mall.firstElementChild;
      if (ny) nod.innerHTML = ny.innerHTML;
      textgrupp(nod, k);
      M.mount(nod, k);
      const lista = typeof window.VyraCampaignItems === 'function' ? window.VyraCampaignItems(k) : [];
      const bidrag = (ex.bidrag || []).filter(([i]) => i < n).map(b => b.slice());
      // Den sista gåvan i följden får det som saknas till sitt mål.
      if (bidrag.length && lista.length) {
        const sista = bidrag[bidrag.length - 1], i = sista[0];
        const fore = bidrag.slice(0, -1).filter(b => b[0] === i).reduce((s, b) => s + b[1], 0);
        sista[1] = Math.max(1, Math.round(Number(lista[i] && lista[i].target) || 1) - fore);
      }
      // Entrén: rubriken glider in på 0,75 s och gåvorna efter den, 0,1 s isär (motorns drawEntrance).
      const entre = Math.round((0.75 + 0.15 + (n - 1) * 0.1) * 1000);
      bidrag.forEach(([i, antal], j) => ctl.setTimeout(() => M.receive(nod, i, antal), entre + j * BIDRAG_MS));
      const visning = bidrag.length * BIDRAG_MS + KAMPANJ_EFTER;
      ctl.setTimeout(() => tonaUt(nod), entre + visning);
      return { entre, visning, utgang: UTGANG };
    },
    stoppa(nod) {
      rensaUt(nod);
      const M = window.VyraCampaignAuraEngine;
      if (M && typeof M.dispose === 'function') M.dispose(nod);
    },
  });
})();
