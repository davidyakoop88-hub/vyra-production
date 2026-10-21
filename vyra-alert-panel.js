(function () {
  'use strict';
  // ALERTFAMILJERNA I PANELRAMEN — PR 6 i panelspecifikationen (avsnitt 5.10, 5.11 och 5.12).
  //
  // Fyra familjer, 26 modeller:
  //   * Fan Level Up (templateFanLevel) — åtta modeller (fanLayout),
  //   * Gifter Level Up (templateGifterLevel) — nio modeller (gifterLayout),
  //   * Follower Spotlight (templateFollowerAlert) — tre teman (followTheme),
  //   * Guardian Emblem (templateGuardianEmblem) — Guld i fyra praktsteg, Blå kristall och Grön aura.
  //
  // Filen har fyra delar, som vyra-topgift-panel.js och vyra-lastx-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens små tillägg: informationsrader och Video per nivå (props/bind-omslag nedan),
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptrarna 'fanlevel', 'gifterlevel', 'follower' och 'guardian' (vyra-testspel.js).
  //      Uppspelningen är fanSpelaPa, gifterSpelaPa, followerSpelaPa och guardianSpelaPa i media.js:
  //      samma kod som en riktig händelse kör per widget, men på klonens nod, utan kö och utan save().
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Lager verkar: vyra-lager.js skriver z-index = lagret på den yttre lådan (PR 16),
  //   * Nivåtext i Gifter Level Up syns aldrig (den skrivs till .gifter-level-badge span, som ingen
  //     modell visar) och är borta. I Fan Level Up visas den i nivåpillen — men inte i Welcome Ribbon,
  //     vars banderoll är ett fast "FAN LEVEL 12" (referensen, tests/browser/fan-level-referens),
  //   * Ljus färg i Gifter Orbitnivå och Kompakt duo (0 px i vila och aktiv) är borta,
  //   * Profilbild och Profilram i Rising Hearts, där profilbilden är dold, och Profilram i Gifter
  //     Stort nivånummer, där ramen sitter på den dolda orbitbilden,
  //   * Skugga i Blå kristall och Grön aura (0 px), och Inträdeseffekt i samma två (modellerna har sin
  //     egen entré och ignorerar valet),
  //   * SKALA i Follower Spotlight heter nu Storlek och står bland storleken, och testknapparna
  //     (▶ Testa level up, ▶ Testa gifter level up, ▶ Testa ny följare, Testa Guardian-emblemet) och
  //     sökvägsfälten för profilbilden är borta.
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // BREDD. Alla fyra är färdiga kompositioner: Bredd visar den ritade bredden och ändras med Storlek
  // (vyra-proportioner.js). I de modeller där level-lasbar.js dessutom låser bredden (Fan Heartbeat
  // Side och Community Duo, Gifter Sidobadge, Myntvändning och Kompakt duo) står det under fältet.
  //
  // EGEN TEXT OCH LIVEDATA. Namn, nivå och profilbild kommer från tittaren i sändningen. Panelen har
  // varken exempeldata eller bildväljare för profilbilden (David 2026-10-20): ▶ Testa widget spelar
  // vyra-exempeldata.js, och renderaren ritar sin automatiska reserv tills tittarens egen kommer.
  // Rubrik, Meddelande och Egen text är egen text som syns i sändningen.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];
  const ENTREFALT = ['entranceAnimation', 'entranceDuration'];

  const FAN = { hero: 'Hero Card', stack: 'Original Fan Stack', heartbeat: 'Heartbeat Side', badgereveal: 'Fan Badge Reveal',
    loyalty: 'Loyalty Ring', hearts: 'Rising Hearts', ribbon: 'Welcome Ribbon', duo: 'Community Duo' };
  const GIFTER = { profile: 'Profil i orbit', number: 'Stort nivånummer', stack: 'Diamantstapel', sidebadge: 'Sidobadge',
    reveal: 'Diamantreveal', orbitlevel: 'Orbitnivå', risingtier: 'Stigande nivåer', flip: 'Myntvändning', duo: 'Kompakt duo' };
  const FOLJARE = { gold: 'Guld', ocean: 'Hav', blush: 'Rosa' };
  const GE_MODELL = { classic: 'Guld', sapphire: 'Blå kristall', emerald: 'Grön aura' };
  const GE_STEG = { 1: 'Ram', 2: 'Hjort', 3: 'Krona', 4: 'Kungakrona' };

  // Modellerna där level-lasbar.js låser bredden (FAST). Läses därifrån när filen finns.
  const FAST_RESERV = { templateGifterLevel: ['sidebadge', 'flip', 'duo'], templateFanLevel: ['heartbeat', 'duo'] };
  function fastBredd(typ, modell) {
    const L = window.VyraLevelLasbar;
    if (L && L.FAST && L.FAST[typ]) return Object.prototype.hasOwnProperty.call(L.FAST[typ], modell);
    return (FAST_RESERV[typ] || []).includes(modell);
  }

  const fanModell = w => (w && FAN[w.fanLayout] ? w.fanLayout : 'hero');
  const gifterModell = w => (w && GIFTER[w.gifterLayout] ? w.gifterLayout : 'profile');
  const geModell = w => {
    const M = window.VyraGuardianModels;
    if (M && typeof M.modell === 'function') { try { return M.modell(w); } catch (_) { /* nedan */ } }
    return w && (w.guardianModel === 'sapphire' || w.guardianModel === 'emerald') ? w.guardianModel : 'classic';
  };
  const geSteg = w => { const n = Math.round(Number(w && w.guardianStep)); return n >= 1 && n <= 4 ? n : 3; };

  // Gemensamma rader.
  const typsnitt = (arv) => Object.assign({ sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont' }, arv ? { arv: 'fontFamily' } : {});
  const profilram = { sektion: 5, typ: 'knapp', id: 'profilram', legacyId: '.gaf-frame-group .pro-frame-picker', etikett: 'Profilram' };
  const narDenVisas = { sektion: 2, typ: 'text', falt: 'prNarDenVisas', legacyId: '#prNarDenVisas' };
  const fastBreddRad = { sektion: 3, typ: 'text', falt: 'prFastBredd', legacyId: '#prFastBredd' };

  // ---- 1a. Fan Level Up --------------------------------------------------------------------------
  function fanLevel(modell) {
    const profil = modell !== 'hearts';
    const nivatext = modell !== 'ribbon';
    const kontroller = [
      // 2 · Innehåll
      { sektion: 2, typ: 'text', falt: 'fanHeadline', etikett: 'Rubrik', legacyId: '#fanHeadline' },
      ...(nivatext ? [{ sektion: 2, typ: 'text', falt: 'fanLevelLabel', etikett: 'Nivåtext', legacyId: '#fanLevelLabel' }] : []),
      { sektion: 2, typ: 'text', falt: 'fanMessage', etikett: 'Meddelande', legacyId: '#fanMessage' },
      { sektion: 2, typ: 'kryss', falt: 'levelVideoMode', etikett: 'Spela en egen video för vissa nivåer', legacyId: '#fanLevelVideoMode' },
      { sektion: 2, typ: 'text', falt: 'prNivavideo', legacyId: '#prNivavideo' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från TikTok: namn, nivå och profilbild för den som går upp en nivå.' },
      narDenVisas,
      { sektion: 2, typ: 'kryss', falt: 'fanTeamOnly', etikett: 'Bara medlemmar i ditt team', legacyId: '#fanTeamOnly' },
      { sektion: 2, typ: 'kryss', falt: 'autoTrigger', etikett: 'Visa automatiskt vid en nivåhöjning', legacyId: '#fanAutoTrigger' },
      { sektion: 2, typ: 'tal', falt: 'minLevel', etikett: 'Minsta nivå', legacyId: '#fanMinLevel' },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      ...(fastBredd('templateFanLevel', modell) ? [fastBreddRad] : []),
      // 4 · Text
      typsnitt(true),
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      // 5 · Utseende
      { sektion: 5, typ: 'val', falt: 'fanTheme', etikett: 'Tema', legacyId: '#fanTheme' },
      { sektion: 5, typ: 'farg', falt: 'fanColor', etikett: 'Huvudfärg', legacyId: '#fanColor', arv: 'highlight' },
      { sektion: 5, typ: 'farg', falt: 'fanLight', etikett: 'Ljus färg', legacyId: '#fanLight', arv: 'secondary' },
      ...(profil ? [profilram] : []),
      { sektion: 5, typ: 'std-bakgrund' },
      // 6 · Animation
      { sektion: 6, typ: 'std-entre' },
      { sektion: 6, typ: 'tal', falt: 'fanDuration', etikett: 'Visningstid', enhet: 's', legacyId: '#fanDuration' },
      // 7 · Återställ utseende
      { sektion: 7, typ: 'std-aterstall' },
    ];
    return {
      typ: 'templateFanLevel',
      modell: fanModell,
      galler: [modell],
      rubrik: () => 'Fan Level Up',
      marke: () => FAN[modell] + ' · nivåhöjning',
      katalognyckel: () => 'catalog:fanlevel:layout:' + modell,
      test: 'fanlevel',
      ersatter: ['#testFanLevel', '#fanProfile'],
      // Spec 4.2: Huvudfärg och Ljus färg ärvdes redan; textfärgen (rubrik och namn, alertTextfarg i
      // media.js) och typsnittet (vyra-textgrupp.js) är inkopplade.
      arv: ['highlight', 'secondary', 'text', 'fontFamily'],
      kontroller,
      utseendeFalt: ['fanTheme', 'fanColor', 'fanLight', 'profileFrame', 'inheritBrandKit', ...ENTREFALT, ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  // ---- 1b. Gifter Level Up -----------------------------------------------------------------------
  function gifterLevel(modell) {
    const ljus = modell !== 'orbitlevel' && modell !== 'duo';
    const ram = modell !== 'number';
    const kontroller = [
      { sektion: 2, typ: 'text', falt: 'gifterHeadline', etikett: 'Rubrik', legacyId: '#gifterHeadline' },
      { sektion: 2, typ: 'text', falt: 'gifterMessage', etikett: 'Meddelande', legacyId: '#gifterMessage' },
      { sektion: 2, typ: 'kryss', falt: 'levelVideoMode', etikett: 'Spela en egen video för vissa nivåer', legacyId: '#gifterLevelVideoMode' },
      { sektion: 2, typ: 'text', falt: 'prNivavideo', legacyId: '#prNivavideo' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från TikTok: namn, nivå och profilbild för den som går upp en gåvonivå.' },
      narDenVisas,
      { sektion: 2, typ: 'kryss', falt: 'autoTrigger', etikett: 'Visa automatiskt vid en nivåhöjning', legacyId: '#gifterAutoTrigger' },
      { sektion: 2, typ: 'tal', falt: 'minLevel', etikett: 'Minsta nivå', legacyId: '#gifterMinLevel' },
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      ...(fastBredd('templateGifterLevel', modell) ? [fastBreddRad] : []),
      typsnitt(true),
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      { sektion: 5, typ: 'val', falt: 'gifterTheme', etikett: 'Tema', legacyId: '#gifterTheme' },
      { sektion: 5, typ: 'farg', falt: 'gifterColor', etikett: 'Huvudfärg', legacyId: '#gifterColor', arv: 'highlight' },
      ...(ljus ? [{ sektion: 5, typ: 'farg', falt: 'gifterLight', etikett: 'Ljus färg', legacyId: '#gifterLight', arv: 'secondary' }] : []),
      ...(ram ? [profilram] : []),
      { sektion: 5, typ: 'std-bakgrund' },
      { sektion: 6, typ: 'std-entre' },
      { sektion: 6, typ: 'tal', falt: 'gifterDuration', etikett: 'Visningstid', enhet: 's', legacyId: '#gifterDuration' },
      { sektion: 7, typ: 'std-aterstall' },
    ];
    return {
      typ: 'templateGifterLevel',
      modell: gifterModell,
      galler: [modell],
      rubrik: () => 'Gifter Level Up',
      marke: () => GIFTER[modell] + ' · gåvonivå',
      katalognyckel: () => 'catalog:gifterlevel:' + modell,
      test: 'gifterlevel',
      ersatter: ['#testGifterLevel', '#gifterProfile'],
      arv: ljus ? ['highlight', 'secondary', 'text', 'fontFamily'] : ['highlight', 'text', 'fontFamily'],
      kontroller,
      utseendeFalt: ['gifterTheme', 'gifterColor', 'gifterLight', 'profileFrame', 'inheritBrandKit', ...ENTREFALT, ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  // ---- 1c. Follower Spotlight --------------------------------------------------------------------
  // En post för alla tre teman: panelen är densamma, temat är ett val i Utseende.
  const foljare = {
    typ: 'templateFollowerAlert',
    rubrik: () => 'Follower Spotlight',
    marke: w => (FOLJARE[w && w.followTheme] || 'Guld') + ' · ny följare',
    katalognyckel: w => 'catalog:followeralert:' + (FOLJARE[w && w.followTheme] ? w.followTheme : 'gold'),
    test: 'follower',
    ersatter: ['#testFollowerAlert', '#followProfile'],
    // Spec 4.2: accenten ärvdes redan; textfärgen (namnet) och typsnittet är inkopplade. Den andra
    // färgen når ingenting i modellen och listas inte.
    arv: ['highlight', 'text', 'fontFamily'],
    kontroller: [
      { sektion: 2, typ: 'text', falt: 'followLabel', etikett: 'Rubrik', legacyId: '#followLabel' },
      { sektion: 2, typ: 'text', falt: 'followMessage', etikett: 'Text under', legacyId: '#followMessage' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från TikTok: namn och profilbild för den nya följaren.' },
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las', 'storlek'] },
      // SKALA flyttas HEL, inte bara reglaget: gift-fireworks.js binder #followScale med en referens
      // till sin egen grupp (size.querySelector('b')), och ett utflyttat reglage kastade vid första
      // dragningen. Gruppens rubrik göms och etiketten heter Storlek (svenska() nedan).
      { sektion: 3, typ: 'tal', falt: 'widgetScale', legacyId: '.follower-size-editor' },
      typsnitt(true),
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      { sektion: 5, typ: 'val', falt: 'followTheme', etikett: 'Tema', legacyId: '#followTheme' },
      { sektion: 5, typ: 'farg', falt: 'followColor', etikett: 'Accentfärg', legacyId: '#followColor', arv: 'highlight' },
      profilram,
      { sektion: 5, typ: 'std-bakgrund' },
      { sektion: 6, typ: 'std-entre' },
      { sektion: 6, typ: 'tal', falt: 'followDuration', etikett: 'Visningstid', enhet: 's', legacyId: '#followDuration' },
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['followTheme', 'followColor', 'profileFrame', 'inheritBrandKit', ...ENTREFALT, ...TEXTFALT, ...BAKGRUNDSFALT],
  };

  // ---- 1d. Guardian Emblem -----------------------------------------------------------------------
  // Arvet erbjuds inte (spec 4.2): emblemet är ett fast bildmotiv, och ett påtvingat arv gav 0 px.
  function guardian(guld) {
    const SKUGGA = ['vtShadowBlur', 'vtShadowColor', 'vtShadowX', 'vtShadowY'];
    return {
      typ: 'templateGuardianEmblem',
      modell: geModell,
      galler: guld ? ['classic'] : ['sapphire', 'emerald'],
      rubrik: () => 'Guardian Emblem',
      marke: w => guld ? 'Guld · ' + GE_STEG[geSteg(w)] : GE_MODELL[geModell(w)],
      katalognyckel: w => guld ? 'catalog:guardianemblem:' + geSteg(w) : 'catalog:guardianemblem:model:' + geModell(w),
      test: 'guardian',
      ersatter: ['#testGuardianEmblem'],
      arv: [],
      kontroller: [
        { sektion: 2, typ: 'text', falt: 'guardianCustomText', etikett: 'Egen text', legacyId: '#geCustomText' },
        { sektion: 2, typ: 'kryss', falt: 'guardianShowUsername', etikett: 'Visa användarnamnet', legacyId: '#geShowUsername' },
        { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Hämtas från TikTok: Guardians namn och profilbild.' },
        { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
        typsnitt(false),
        { sektion: 4, typ: 'std-text', utan: guld ? ['vtFont'] : ['vtFont', ...SKUGGA] },
        { sektion: 5, typ: 'val', falt: 'guardianModel', etikett: 'Modell', legacyId: '#geModel' },
        ...(guld ? [{ sektion: 5, typ: 'val', falt: 'guardianStep', etikett: 'Praktsteg', legacyId: '#geStep' }] : []),
        { sektion: 5, typ: 'val', falt: 'guardianLang', etikett: 'Språk', legacyId: '#geLang' },
        { sektion: 5, typ: 'text', falt: 'prFastBild', legacyId: '#prFastBild' },
        { sektion: 5, typ: 'std-bakgrund' },
        ...(guld ? [{ sektion: 6, typ: 'std-entre' }] : []),
        { sektion: 7, typ: 'std-aterstall' },
      ],
      utseendeFalt: [...ENTREFALT, ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  Object.keys(FAN).forEach(m => R.definiera(fanLevel(m)));
  Object.keys(GIFTER).forEach(m => R.definiera(gifterLevel(m)));
  R.definiera(foljare);
  R.definiera(guardian(true));
  R.definiera(guardian(false));

  // ---- 2. Panelens tillägg -----------------------------------------------------------------------
  //
  // Informationsraderna och Video per nivå byggs som element i en dold grupp sist i props(). Ramen
  // flyttar dem till sina sektioner med legacyId, precis som andra befintliga kontroller, och den
  // dolda gruppen parkeras som alla andra gamla grupper. Bara editorn, och bara de fyra typerna.
  const TYPER = ['templateFanLevel', 'templateGifterLevel', 'templateFollowerAlert', 'templateGuardianEmblem'];
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function tillaggHtml(w) {
    const delar = [];
    if (w.type === 'templateFanLevel' || w.type === 'templateGifterLevel') {
      delar.push('<small id="prNarDenVisas" class="pr-underrubrik">När den visas</small>');
      delar.push('<div id="prNivavideo" class="pr-nivavideo"></div>');
      const modell = w.type === 'templateFanLevel' ? fanModell(w) : gifterModell(w);
      if (fastBredd(w.type, modell)) delar.push('<small id="prFastBredd" class="pr-info">Fast bredd i den här modellen – ändra storleken med Storlek.</small>');
    }
    if (w.type === 'templateGuardianEmblem') {
      delar.push('<small id="prFastBild" class="pr-info">Emblemet är en fast bild; texten går att ändra.</small>');
    }
    return delar.length ? `<div class="property-group pr-alert-tillagg" hidden>${delar.join('')}</div>` : '';
  }

  if (typeof props === 'function' && !iOverlay()) {
    const tidigareProps = props;
    props = function () {
      const html = tidigareProps.apply(this, arguments);
      const w = vald();
      if (!w || !TYPER.includes(w.type) || typeof html !== 'string') return html;
      return html + tillaggHtml(w);
    };
  }

  // Video per nivå (spec 5.10): en rad per nivå med mediaväljaren för video, och en rad för att lägga
  // till en ny nivå. Fältet är detsamma som förut: w.levelVideos[nivå] = videons adress, och
  // w.levelVideoMode slår på uppspelningen (playLevelVideo i media.js). Adressen visas aldrig.
  const nyNiva = new Map();                     // widget-id → nivån för nästa video; bara i minnet
  function byggNivavideo(w) {
    const rot = document.querySelector('.properties #prNivavideo');
    const M = window.VyraMediaval;
    if (!rot || !M || typeof M.falt !== 'function') return;
    if (rot.dataset.prNivavideoFor === String(w.id) && rot.dataset.prNivavideoVarde === JSON.stringify(w.levelVideos || {})) return;
    rot.dataset.prNivavideoFor = String(w.id);
    rot.dataset.prNivavideoVarde = JSON.stringify(w.levelVideos || {});
    rot.textContent = '';
    const nivaer = Object.keys(w.levelVideos || {}).map(Number).filter(n => n >= 1 && n <= 50).sort((a, b) => a - b);
    for (const niva of nivaer) {
      const nod = M.falt({ w, falt: 'levelVideo' + niva, typ: 'video', etikett: 'Video för nivå ' + niva,
        las: x => (x.levelVideos || {})[niva] || '',
        skriv: (x, v) => { x.levelVideos = Object.assign({}, x.levelVideos || {}); if (v) x.levelVideos[niva] = v; else delete x.levelVideos[niva]; } });
      if (nod) rot.append(nod);
    }
    const rad = document.createElement('label');
    const start = nyNiva.get(w.id) || 1;
    rad.innerHTML = `Videons nivå<input id="pr-nivavideo-niva" type="number" min="1" max="50" value="${esc(start)}">`;
    rad.querySelector('input').onchange = e => {
      const n = Math.max(1, Math.min(50, Math.round(Number(e.target.value)) || 1));
      nyNiva.set(w.id, n);
    };
    rot.append(rad);
    const ny = M.falt({ w, falt: 'levelVideoNy', typ: 'video', etikett: 'Ny video för nivån ovan',
      las: () => '',
      skriv: (x, v) => {
        if (!v) return;
        const n = nyNiva.get(x.id) || 1;
        x.levelVideos = Object.assign({}, x.levelVideos || {}, { [n]: v });
        x.levelVideoMode = true;
      } });
    if (ny) rot.append(ny);
  }

  // Temanamnen på svenska (spec 5.10: inga engelska namn i panelen). Värdena är desamma.
  const TEMANAMN = {
    fanTheme: { gold: 'Guld', neon: 'Neon', ice: 'Is', emerald: 'Smaragd', fire: 'Eld', sakura: 'Sakura', storm: 'Storm', royal: 'Kunglig' },
    gifterTheme: { royal: 'Kunglig', emerald: 'Smaragd', crimson: 'Karmosin' },
    followTheme: { gold: 'Guld', ocean: 'Hav', blush: 'Rosa' },
  };
  const PRAKTSTEG = { 1: 'Steg 1 · Ram', 2: 'Steg 2 · Hjort', 3: 'Steg 3 · Krona', 4: 'Steg 4 · Kungakrona' };
  function svenska() {
    for (const [id, namn] of Object.entries(TEMANAMN)) {
      const sel = document.querySelector('.properties #' + id);
      if (!sel) continue;
      for (const o of sel.options) if (namn[o.value] && o.textContent !== namn[o.value]) o.textContent = namn[o.value];
    }
    // Praktstegen: namn och mått ur fabrikens register (GE_MATT, widget-factory.js), inte ur en kopia.
    const steg = document.querySelector('.properties #geStep');
    if (steg && window.VyraWidgets && typeof window.VyraWidgets.variants === 'function') {
      let matt = {};
      try { matt = window.VyraWidgets.variants('guardianemblem.matt') || {}; } catch (_) {}
      for (const o of steg.options) {
        const m = matt[o.value];
        const t = PRAKTSTEG[o.value] ? PRAKTSTEG[o.value] + (m ? ` (${m[0]}×${m[1]})` : '') : null;
        if (t && o.textContent !== t) o.textContent = t;
      }
    }
  }

  function storlekEtikett() {
    const lab = document.querySelector('.properties .follower-size-editor label');
    if (!lab) return;
    const t = [...lab.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (t && t.textContent.trim() !== 'Storlek') t.textContent = 'Storlek ';
  }

  function stil() {
    if (document.getElementById('vyra-alert-panel-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-alert-panel-stil';
    s.textContent = '.properties .pr-info{display:block;opacity:.75;font-size:11px;margin:2px 0 6px}'
      + '.properties .pr-underrubrik{display:block;margin:12px 0 2px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.8}'
      + '.properties .pr-nivavideo{display:grid;gap:4px}'
      + '.properties [data-panelram-sektion] .follower-size-editor{margin:0;padding:0;border:0;background:none;box-shadow:none}'
      + '.properties [data-panelram-sektion] .follower-size-editor>h4{display:none}';
    (document.head || document.documentElement).append(s);
  }

  if (typeof bind === 'function' && !iOverlay()) {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        const w = vald();
        if (typeof view !== 'undefined' && view === 'editor' && w && TYPER.includes(w.type)) {
          stil();
          svenska();
          if (w.type === 'templateFanLevel' || w.type === 'templateGifterLevel') byggNivavideo(w);
          // Follower Spotlights reglage byggs av ett yttre bind-omslag (gift-fireworks.js), alltså efter
          // det här — etiketten byts när det har körts.
          if (w.type === 'templateFollowerAlert') Promise.resolve().then(storlekEtikett);
        }
      } catch (e) { console.error('[VyraAlertPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Namn, nivå och användarnamn är widgetens egna exempel (sektion 1); grunden fyller i där de saknas.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function') {
    if (!(E.har && E.har('fanlevel'))) E.definiera('fanlevel', g => ({ niva: g.niva }));
    if (!(E.har && E.har('gifterlevel'))) E.definiera('gifterlevel', () => ({ niva: { fran: 14, till: 15 } }));
    if (!(E.har && E.har('follower'))) E.definiera('follower', g => ({ namn: g.namn }));
    if (!(E.har && E.har('guardian'))) E.definiera('guardian', () => ({ namn: '@Guardian' }));
  }

  // ---- 4. Testadaptrarna -------------------------------------------------------------------------
  //
  // Var och en spelar EN händelse på klonens nod med familjens per-nod-funktion i media.js och
  // testmotorns klocka, och returnerar faserna: ENTRÉ = koreografin (och widgetens inträdeseffekt),
  // VISNING = resten av widgetens visningstid, UTGÅNG = uttoningen. Ingen kö, inget filter på
  // state.widgets, ingen skrivning på widgeten och ingen save() — motorn vaktar det.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;

  const klocka = ctl => ({ setTimeout: ctl.setTimeout, clearTimeout: ctl.clearTimeout });
  const textgrupp = (nod, k) => { if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k); };
  const entreMs = k => (k.entranceAnimation && k.entranceAnimation !== 'none' ? (Number(k.entranceDuration) || 600) : 0);
  const fasTotal = (F, nod) => { try { return F && typeof F.total === 'function' ? F.total(F.layoutAv(nod)) || 0 : 0; } catch (_) { return 0; } };
  const sek = (v, standard) => Math.max(0, (Number(v) || standard) * 1000);
  function faser(entre, visningstid, utgang) {
    return { entre, visning: Math.max(0, visningstid - entre), utgang };
  }
  function tystVideo(nod) {
    const v = nod.querySelector('video.level-up-video');
    if (v) { try { v.pause(); } catch (_) {} v.removeAttribute('src'); }
  }
  // Namnet i testet skrivs som i vilan: fanNamnHtml/gifterNamnHtml i media.js sätter @ framför
  // widgetens namn, så testet visade "HeartRiser" medan vilan och overlayn visade "@HeartRiser"
  // (slutgranskningen 2026-10-20, A-014).
  const medAt = n => { const s = String(n || '').trim(); return s && s[0] !== '@' ? '@' + s : s; };

  if (!(T.harAdapter && T.harAdapter('fanlevel'))) T.registrera('fanlevel', {
    spela(nod, k, ex, ctl) {
      if (typeof window.fanSpelaPa !== 'function') throw new Error('media.js saknar fanSpelaPa');
      textgrupp(nod, k);
      const till = ex.niva.till;
      window.fanSpelaPa(nod, k, { name: medAt(ex.namn), level: till, fromLevel: Math.max(1, till - 1), isTeamMember: true }, klocka(ctl));
      const F = window.VyraFanFas;
      if (F && typeof F.spela === 'function') F.spela(nod);
      const entre = Math.max(fasTotal(F, nod), entreMs(k));
      return faser(entre, sek(k.fanDuration, 6), sek(k.fanExitDuration, 0.5));
    },
    stoppa(nod) {
      const F = window.VyraFanFas;
      if (F && typeof F.avbryt === 'function') F.avbryt(nod);
      tystVideo(nod);
      nod.classList.remove('fan-active', 'fan-exit', 'playing-level-video');
    },
  });

  if (!(T.harAdapter && T.harAdapter('gifterlevel'))) T.registrera('gifterlevel', {
    spela(nod, k, ex, ctl) {
      if (typeof window.gifterSpelaPa !== 'function') throw new Error('media.js saknar gifterSpelaPa');
      textgrupp(nod, k);
      const till = ex.niva.till;
      window.gifterSpelaPa(nod, k, { name: medAt(ex.namn), level: till, fromLevel: Math.max(1, till - 1) }, klocka(ctl));
      const F = window.VyraGifterFas;
      if (F && typeof F.spela === 'function') F.spela(nod);
      // Nivåbytet (gifterTransform, 1250 ms) hör till entrén i alla modeller.
      const xform = typeof XFORM_TOTAL === 'number' ? XFORM_TOTAL : 1250;
      const entre = Math.max(xform, fasTotal(F, nod), entreMs(k));
      return faser(entre, sek(k.gifterDuration, 6), sek(k.gifterExitDuration, 0.5));
    },
    stoppa(nod) {
      const F = window.VyraGifterFas;
      if (F && typeof F.avbryt === 'function') F.avbryt(nod);
      tystVideo(nod);
      nod.classList.remove('gifter-active', 'gifter-exit', 'playing-level-video', 'gifter-xform-old', 'gifter-xform-burst', 'gifter-xform-new');
    },
  });

  // Follower Spotlight tonar in och ut med en övergång på 0,45 s (studio.css .follower-spotlight).
  const FOLJ_OVERGANG = 450;
  if (!(T.harAdapter && T.harAdapter('follower'))) T.registrera('follower', {
    spela(nod, k, ex, ctl) {
      if (typeof window.followerSpelaPa !== 'function') throw new Error('media.js saknar followerSpelaPa');
      textgrupp(nod, k);
      window.followerSpelaPa(nod, k, { name: ex.namn }, klocka(ctl));
      const entre = Math.max(FOLJ_OVERGANG, entreMs(k));
      return faser(entre, sek(k.followDuration, 6), FOLJ_OVERGANG);
    },
    stoppa(nod) { nod.classList.remove('follow-active'); },
  });

  if (!(T.harAdapter && T.harAdapter('guardian'))) T.registrera('guardian', {
    spela(nod, k, ex, ctl) {
      if (typeof window.guardianSpelaPa !== 'function') throw new Error('media.js saknar guardianSpelaPa');
      textgrupp(nod, k);
      window.guardianSpelaPa(nod, k, { username: ex.namn }, klocka(ctl));
      // Faserna ur koreografins register: ljus + öppna är entrén, hyllningen visningen, upplösningen
      // utgången. Emblemet står tänt till max(koreografin, 6,5 s), som triggern.
      const F = window.VyraGuardianEmblemFas;
      const t = (F && F.TIDER) || { ljus: 600, oppna: 1200, hyllning: 3500, upplosning: 800 };
      const total = Math.max(F && typeof F.total === 'function' ? F.total() : 0, 6500);
      return { entre: t.ljus + t.oppna, visning: Math.max(0, total - t.ljus - t.oppna - t.upplosning), utgang: t.upplosning };
    },
    stoppa(nod) {
      const F = window.VyraGuardianEmblemFas;
      if (F && typeof F.avbryt === 'function') F.avbryt(nod);
      nod.classList.remove('ge-active', 'ge-koreografi');
    },
  });
})();
