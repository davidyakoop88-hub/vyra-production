(function () {
  'use strict';
  // RANKING I PANELRAMEN — PR 8 i panelspecifikationen (avsnitt 5.1): EN gemensam rankingpanel.
  //
  // Tre typer och 18 modeller: Top Like (templateTopLike), Top Coins (templateTopCoins) och Top
  // Points (templateTopPoints), var och en i de sex designerna Voltage, Basic v2, Prism vertikal,
  // Prism horisontal, Celestial och Royal Rose. Alla 18 ritas av samma renderare
  // (ranking-sixpack.js), så de får samma panel; det som skiljer är exempeldatans etikett (likes,
  // coins, poäng) och några rader där renderaren faktiskt skiljer sig (se nedan).
  //
  // Vilka widgetar som har post avgörs av samma regel som ranking-sixpack.js:s designFor(): Top Like
  // och Top Points ritas ALLTID som en av de sex (pensionerade designer pekas om), Top Coins bara när
  // topCoinsDesign är en av dem. Top Coins Halo (avvecklad) har ingen post och behåller sin gamla
  // panel, och Signal Orbit har Top Gifts panel (vyra-topgift-panel.js). Regeln står här som en
  // egen kopia i stället för ett anrop: registret måste kunna svara utan att renderaren är laddad
  // (ranking-sixpack.js laddas sist i studio.html, och tests/browser/panelram-noop läser registret
  // utan webbläsare).
  //
  // Filen har fyra delar, som vyra-mvp-panel.js:
  //   1. registerposterna (vyra-panelregister.js),
  //   2. panelens tillägg: rankingpanelens egna kontroller (Rubrik, Visa …, Antal personer, Accentfärg,
  //      och listväxlingen för Top Coins och Top Points), Avatar-ram som EN kollektion och "Ladda upp
  //      typsnitt…" i Typsnitt-listan (props/bind-omslag),
  //   3. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   4. testadaptern 'ranking' (vyra-testspel.js). Uppspelningen ritar klonen med samma renderare
  //      och en egen lista (`k.__provlista`, ranking-sixpack.js), aldrig med den riktiga topplistan.
  //
  // BARA KONTROLLER SOM GÖR NÅGOT (granskningen, scratchpad panel-fynd.json, och
  // tests/browser/panel-krav.browser.test.js):
  //   * Krona och Medaljring finns inte: de sex designerna ritar sin egen krona och sina egna ringar,
  //     och toplike-studio.js:s krona/medaljer träffar bara den gamla markupen som ranking-sixpack.js
  //     ersätter (uppmätt utan verkan i alla 18),
  //   * Rörelse (tcMotion/tpMotion) och kryssrutan Bakgrund i DESIGN finns inte: ingen verkan i de sex
  //     designerna, och Bakgrund var en dubblett av bakgrundsgruppen,
  //   * DESIGN · VÄLJ TEMA och designknapparna finns inte: modellen väljs i katalogen,
  //   * Lager finns i alla tre. Top Coins och Top Points ritar z-index från lagret själva, och Top Like
  //     får det av vyra-lager.js (vyraTopLike i media.js skriver inget, PR 16),
  //   * Rubrik X/Y och Rubrik bara när rubriken visas, Visa placeringar inte i Royal Rose (designen
  //     visar inga placeringstal),
  //   * BAKGRUND bara för en widget som redan har en egen bakgrund (listorna är genomskinliga — samma
  //     regel som Last-X och Battle MVP),
  //   * profilbildens sökvägsfält (BILDER › Profilbild, samma foto på alla rader) finns inte,
  //   * flikarna Content/Design/Animation byggs inte (toplike-studio.js frågar VyraPanelram.ager()).
  // Fälten ligger kvar i state — ingenting byter namn och ingenting raderas.
  //
  // BILDSTORLEK, RADAVSTÅND OCH RIKTNING (spec 5.1, sektion 3) läggs i posterna av vyra-bildrad.js
  // (laddas senare, från media.js skript-svans), direkt efter Position — och ritas av samma fil och
  // vyra-bildrad.css. Riktningen är listans (lodrät/vågrät, Prism horisontal även rak rad), Spegla
  // riktningen vänder den som förut. I kompaktläget (liten widget) visas de tre inte.
  //
  // EGEN TEXT OCH LIVEDATA. Listan kommer från sändningen (live-leaderboard.js) eller, för
  // Top Points, från Actions & Events (VyraPoints). Rubriken är egen text. Panelen har inget
  // exempeldatablock (David 2026-10-20): testet spelar exempeldatafilens personer, där en klättrar från
  // plats 3 till plats 1. Sparade dataName/dataValue ligger kvar i state men läses inte av testet.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TYPER = ['templateTopLike', 'templateTopCoins', 'templateTopPoints'];
  const IDS = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose'];
  const NAMN = { voltage: 'Voltage', 'basic-v2': 'Basic v2', 'prism-vertical': 'Prism vertikal',
    'prism-horizontal': 'Prism horisontal', celestial: 'Celestial', 'royal-rose': 'Royal Rose' };
  const FORM = { voltage: 'lista', 'basic-v2': 'lista', 'prism-vertical': 'lista', 'prism-horizontal': 'podium',
    celestial: 'rad', 'royal-rose': 'rad' };
  // Samma pension som ranking-sixpack.js PENSION.
  const PENSION = { 'clean-bar': 'voltage', 'soft-stack': 'voltage', 'side-rank': 'voltage', 'mini-podium': 'prism-horizontal',
    clean: 'voltage', neon: 'voltage', center: 'prism-horizontal', podium: 'prism-horizontal' };
  const RUBRIK = { templateTopLike: 'Top Like', templateTopCoins: 'Top Coins', templateTopPoints: 'Top Points' };
  const KATALOG = { templateTopLike: id => 'catalog:toplike:' + id,
    templateTopCoins: id => 'catalog:ranking:templateTopCoins:' + id, templateTopPoints: id => 'catalog:ranking:templateTopPoints:' + id };

  // Modellnyckeln = designen ranking-sixpack.js ritar (designFor), eller null.
  function modell(w) {
    if (!w || !TYPER.includes(w.type)) return null;
    if (w.type === 'templateTopCoins') return IDS.includes(w.topCoinsDesign) ? w.topCoinsDesign : null;
    const falt = w.type === 'templateTopLike' ? [w.skin] : [w.topPointsDesign, w.skin, w.likeTheme];
    for (const f of falt) if (IDS.includes(f)) return f;
    for (const f of falt) if (PENSION[f]) return PENSION[f];
    return 'voltage';
  }

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const BAKGRUNDSFALT = ['hideBackground', 'bgColor', 'bgStrength', 'bgRadius', 'bgPadding'];

  const harEgenBakgrund = w => !!(w && (w.hideBackground || w.bgColor || w.bgStrength != null || w.bgRadius != null || w.bgPadding != null));
  const visaRubrik = w => !!w && (w.type === 'templateTopLike' ? w.showTitle !== false : w.showTitle === true);
  const cykel = w => !!(w && w.rankingCycle);

  const LIVE = {
    templateTopLike: 'Listan kommer från TikTok: namn, profilbild och likes för dem som gett mest. Rangordna efter och Period styr vilken lista som visas.',
    templateTopCoins: 'Listan kommer från TikTok: namn, profilbild och coins för dem som gett mest. Rangordna efter och Period styr vilken lista som visas.',
    templateTopPoints: 'Listan kommer från sändningen: namn och poäng ur dina Actions & Events (eller likes/coins, efter Rangordna efter).',
  };

  // Kontrollernas id per typ. Top Like har redan Rubrik, Antal och Visa-rutorna (media.js
  // topLikeProps, bundna av topLikeBind) och Top Points sitt Antal (#tpCount); de flyttas in i stället
  // för att få en andra kontroll för samma fält (tests/browser/panel-inga-dubbletter). Resten byggs
  // av tilläggsgruppen nedan (rk…).
  const EGNA_ID = {
    templateTopLike: { rubrik: '#likeTitle', visaRubrik: '#likeShowTitle', antal: '#likeCount', namn: '#likeShowName', bild: '#likeShowAvatar', varde: '#likeShowValue' },
    templateTopCoins: { rubrik: '#rkRubrik', visaRubrik: '#rkVisaRubrik', antal: '#rkAntal', namn: '#rkVisaNamn', bild: '#rkVisaBild', varde: '#rkVisaVarde' },
    templateTopPoints: { rubrik: '#rkRubrik', visaRubrik: '#rkVisaRubrik', antal: '#tpCount', namn: '#rkVisaNamn', bild: '#rkVisaBild', varde: '#rkVisaVarde' },
  };

  function post(typ, id) {
    const ids = EGNA_ID[typ];
    const kontroller = [
      // 2 · Innehåll
      { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: ids.rubrik, om: visaRubrik },
      { sektion: 2, typ: 'kryss', falt: 'showTitle', etikett: 'Visa rubrik', legacyId: ids.visaRubrik },
      { sektion: 2, typ: 'tal', falt: 'likeCount', etikett: 'Antal personer', enhet: 'st', legacyId: ids.antal },
      { sektion: 2, typ: 'kryss', falt: 'showDataName', etikett: 'Visa namn', legacyId: ids.namn },
      { sektion: 2, typ: 'kryss', falt: 'showProfile', etikett: 'Visa profilbilder', legacyId: ids.bild },
      ...(id !== 'royal-rose' ? [{ sektion: 2, typ: 'kryss', falt: 'showRank', etikett: 'Visa placeringar', legacyId: '#rkVisaPlats' }] : []),
      { sektion: 2, typ: 'kryss', falt: 'showDataValue', etikett: 'Visa värden', legacyId: ids.varde },
      // Avstängd riktig aktivitet (demolistan även i sändningen) går att slå på igen; påslagen är den
      // det normala och syns inte som ett val.
      { sektion: 2, typ: 'kryss', falt: 'useLiveData', etikett: 'Visa riktig aktivitet', legacyId: '#wsLiveData', om: w => w.useLiveData === false },
      { sektion: 2, typ: 'val', falt: 'liveMetric', etikett: 'Rangordna efter', legacyId: '#wsLiveMetric' },
      { sektion: 2, typ: 'val', falt: 'dateRange', etikett: 'Period', legacyId: '#wsDateRange' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: LIVE[typ] },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      { sektion: 3, typ: 'kryss', falt: 'rankingMirror', etikett: 'Spegla riktningen', legacyId: '#wsMirror' },
      { sektion: 3, typ: 'tal', falt: 'titleOffsetX', etikett: 'Rubrik X (px)', legacyId: '#wsTitleOffX', om: visaRubrik },
      { sektion: 3, typ: 'tal', falt: 'titleOffsetY', etikett: 'Rubrik Y (px)', legacyId: '#wsTitleOffY', om: visaRubrik },
      { sektion: 3, typ: 'tal', falt: 'nameOffsetX', etikett: 'Namn X (px)', legacyId: '#wsNameOffX' },
      { sektion: 3, typ: 'tal', falt: 'nameOffsetY', etikett: 'Namn Y (px)', legacyId: '#wsNameOffY' },
      { sektion: 3, typ: 'tal', falt: 'valueOffsetX', etikett: 'Värde X (px)', legacyId: '#wsValueOffX' },
      { sektion: 3, typ: 'tal', falt: 'valueOffsetY', etikett: 'Värde Y (px)', legacyId: '#wsValueOffY' },
      // 4 · Text. Ett typsnittsval: "Ladda upp typsnitt…" är en post i samma lista (filfältet är dolt).
      { sektion: 4, typ: 'val', falt: 'textFont', etikett: 'Typsnitt', legacyId: '#vtFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'text', falt: 'customFontId', legacyId: '#wsCustomFont' },
      { sektion: 4, typ: 'std-text', utan: ['vtFont'] },
      // 5 · Utseende
      { sektion: 5, typ: 'farg', falt: 'rankingAccent', etikett: 'Accentfärg', legacyId: '#rkAccent', arv: 'highlight' },
      { sektion: 5, typ: 'knapp', id: 'profilram', legacyId: '.pro-frame-picker', etikett: 'Avatar-ram' },
      { sektion: 5, typ: 'tal', falt: 'opacity', etikett: 'Opacitet', enhet: '%', legacyId: '#wsOpacity' },
      { sektion: 5, typ: 'std-bakgrund', om: harEgenBakgrund },
      // 6 · Animation. Listväxlingen (förr bara i Top Like) finns nu i alla tre typerna.
      { sektion: 6, typ: 'std-entre' },
      { sektion: 6, typ: 'kryss', falt: 'rankingCycle', etikett: 'Växla mellan listor', legacyId: '#rankingCycle' },
      { sektion: 6, typ: 'kryss', falt: 'cycleLikes', etikett: 'Lista: likes', legacyId: '#cycleLikes', om: cykel },
      { sektion: 6, typ: 'kryss', falt: 'cycleCoins', etikett: 'Lista: coins', legacyId: '#cycleCoins', om: cykel },
      { sektion: 6, typ: 'kryss', falt: 'cyclePoints', etikett: 'Lista: poäng', legacyId: '#cyclePoints', om: cykel },
      { sektion: 6, typ: 'tal', falt: 'cycleSeconds', etikett: 'Tid per lista', enhet: 's', legacyId: '#cycleSeconds', om: cykel },
      // 7 · Återställ utseende
      { sektion: 7, typ: 'std-aterstall' },
    ];
    return {
      typ,
      modell,
      galler: [id],
      rubrik: () => RUBRIK[typ],
      marke: () => NAMN[id] + ' · ' + FORM[id],
      katalognyckel: () => KATALOG[typ](id),
      test: 'ranking',
      // Top Likes flikrad (byggs inte längre, men en kvarglömd tas bort) och profilbildens sökvägsfält.
      ersatter: ['.ws-tabs', '#tcAvatar', '#tpAvatar'],
      arv: ['highlight', 'text', 'fontFamily'],
      kontroller,
      utseendeFalt: ['rankingAccent', 'opacity', 'profileFrame', 'rankingMirror', 'entranceAnimation', 'entranceDuration',
        'nameOffsetX', 'nameOffsetY', 'valueOffsetX', 'valueOffsetY', 'titleOffsetX', 'titleOffsetY', 'inheritBrandKit',
        ...TEXTFALT, ...BAKGRUNDSFALT],
    };
  }

  for (const typ of TYPER) for (const id of IDS) R.definiera(post(typ, id));

  // ---- 2. Panelens tillägg -----------------------------------------------------------------------
  //
  // Top Coins och Top Points hade varken Rubrik, Visa namn/profilbilder/värden eller Antal personer
  // (topcoins-v2.js/toppoints-v2.js bygger egna paneler), och Top Like hade dem med etiketter som
  // "Bilder" och två "Rubrik". Rankingpanelen har en uppsättning för alla tre, byggd här som element i
  // en dold grupp sist i props(). Ramen flyttar dem till sina sektioner med legacyId, och den dolda
  // gruppen parkeras som alla andra gamla grupper. Listväxlingens fält har media.js:s id:n, så att
  // media.js:s egen bindning (cycleRankingBind) binder dem; Top Like har dem redan och får inga nya.
  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const medPost = w => !!(w && TYPER.includes(w.type) && R.hitta(w) && R.hitta(w).test === 'ranking');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const kryss = (id, pa, text) => `<label><input id="${id}" type="checkbox"${pa ? ' checked' : ''}> ${text}</label>`;

  function antalFor(w) {
    const S = window.VyraRankingSixpack;
    if (S && typeof S.antal === 'function') { try { return S.antal(w); } catch (_) {} }
    const n = w.type === 'templateTopCoins' && !(w.likeCount > 1) ? 5 : (w.likeCount || 5);
    return Math.max(1, Math.min(10, n));
  }
  // Accentfärgens visade värde: den egna, annars den ramen eller designen ritar på plats 1.
  function accentFor(w) {
    if (typeof w.rankingAccent === 'string' && /^#[0-9a-f]{6}$/i.test(w.rankingAccent)) return w.rankingAccent;
    const ram = w.profileFrame && w.profileFrame !== 'none' && typeof window.vyraFrameAccent === 'function' ? window.vyraFrameAccent(String(w.profileFrame)) : null;
    if (ram && /^#[0-9a-f]{6}$/i.test(ram)) return ram;
    const S = window.VyraRankingSixpack, d = S && S.designs && S.designs[modell(w)];
    const c = d && d.tiers && d.tiers[0] && d.tiers[0][0];
    return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd700';
  }

  function tillaggHtml(w, html) {
    const tc = w.type === 'templateTopCoins', tl = w.type === 'templateTopLike';
    const n = antalFor(w);
    const titel = w.templateTitle || (tc ? 'TOP COINS' : 'TOP POINTS');
    const delar = [];
    if (!tl) {
      delar.push(`<label>Rubrik<input id="rkRubrik" value="${esc(titel)}"></label>`,
        kryss('rkVisaRubrik', visaRubrik(w), 'Visa rubrik'));
      // Top Coins med likeCount 1 ritas med fem (ranking-sixpack.js antal(): den skapades som en ensam
      // ledare), så reglaget börjar på 2 där — 1 hade visat fem. Top Points har sitt eget (#tpCount).
      if (tc) delar.push(`<label class="range-label">Antal personer <b>${n} st</b><input id="rkAntal" type="range" min="2" max="10" value="${n}"></label>`);
      delar.push(kryss('rkVisaNamn', w.showDataName !== false, 'Visa namn'),
        kryss('rkVisaBild', w.showProfile !== false, 'Visa profilbilder'),
        kryss('rkVisaVarde', w.showDataValue !== false, 'Visa värden'));
    }
    delar.push(kryss('rkVisaPlats', w.showRank !== false, 'Visa placeringar'),
      `<label><span>Accentfärg</span><input id="rkAccent" type="color" value="${esc(accentFor(w))}"></label>`);
    if (!/id="rankingCycle"/.test(html)) {
      delar.push(kryss('rankingCycle', !!w.rankingCycle, 'Växla mellan listor'),
        kryss('cycleLikes', w.cycleLikes !== false, 'Lista: likes'),
        kryss('cycleCoins', w.cycleCoins !== false, 'Lista: coins'),
        kryss('cyclePoints', w.cyclePoints !== false, 'Lista: poäng'),
        `<label class="range-label">Tid per lista <b>${w.cycleSeconds || 4} s</b><input id="cycleSeconds" type="range" min="2" max="15" value="${w.cycleSeconds || 4}"></label>`);
    }
    return `<div class="property-group pr-rk-tillagg" hidden>${delar.join('')}</div>`;
  }

  if (typeof props === 'function' && !iOverlay()) {
    const tidigareProps = props;
    props = function () {
      const html = tidigareProps.apply(this, arguments);
      const w = vald();
      if (!medPost(w) || typeof html !== 'string') return html;
      return html + tillaggHtml(w, html);
    };
  }

  // Bindningen följer giftFieldBind-mallen: input målar om noden (vyraLivePatch), change sparar och
  // ritar om med panelen kvar. Kryssrutor bara på change.
  function andra(w, falt, v) {
    w[falt] = v;
    if (typeof save === 'function') save();
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else if (typeof render === 'function') render();
  }
  function bindEgna(w) {
    const q = id => document.querySelector('.properties #' + id);
    const live = (id, falt, tolk) => {
      const el = q(id);
      if (!el) return;
      el.oninput = () => { if (typeof vyraLivePatch === 'function') vyraLivePatch(w, el, falt, tolk(el.value)); else w[falt] = tolk(el.value); };
      el.onchange = () => andra(w, falt, tolk(el.value));
    };
    live('rkRubrik', 'templateTitle', v => v);
    live('rkAntal', 'likeCount', v => Math.max(1, Math.min(10, Math.round(Number(v)) || 5)));
    live('rkAccent', 'rankingAccent', v => v);
    for (const [id, falt] of [['rkVisaRubrik', 'showTitle'], ['rkVisaNamn', 'showDataName'], ['rkVisaBild', 'showProfile'],
      ['rkVisaPlats', 'showRank'], ['rkVisaVarde', 'showDataValue']]) {
      const el = q(id);
      if (el) el.onchange = () => andra(w, falt, !!el.checked);
    }
  }

  // AVATAR-RAM SOM EN KOLLEKTION (spec 5.1). toplike-studio.js bygger väljaren med två flikar
  // (KOLLEKTION 1/2, där den andra bara bytte flik i galleriet) och tio SVG-platshållare. Här blir det
  // en lista med de riktiga ramarna. Samma fält (w.profileFrame) och samma filer. En redan vald
  // platshållare står kvar, så att den syns som vald och kan väljas bort.
  function ramval(w) {
    const picker = document.querySelector('.properties .pro-frame-picker');
    const F = window.VYRA_FRAMES;
    if (!picker || !F) return;
    const valdRam = w.profileFrame || 'none';
    if (picker.dataset.prRkRam === valdRam && picker.querySelector('[data-ws-frame]') && !picker.querySelector('[data-ws-gender]')) return;
    const sett = new Set();
    const ramar = [...(F.boys || []), ...(F.girls || [])].filter(f => {
      if (!f || sett.has(f[0])) return false;
      sett.add(f[0]);
      return f[3] !== 'svg' || f[0] === valdRam;
    });
    const ruta = ([id, namn, fil, ext]) => `<button type="button" data-ws-frame="${esc(id)}" class="ws-frame-swatch${valdRam === id ? ' active' : ''}"><img src="assets/images/profile-frames/${esc(fil)}.${esc(ext)}" alt=""><b>${esc(namn)}</b></button>`;
    const etikett = picker.querySelector(':scope > .pr-etikett');
    picker.innerHTML = `<div class="ws-frame-grid"><button type="button" data-ws-frame="none" class="ws-frame-swatch${valdRam === 'none' ? ' active' : ''}"><i>×</i><b>Ingen</b></button>${ramar.map(ruta).join('')}</div>`;
    if (etikett) picker.prepend(etikett);
    picker.dataset.prRkRam = valdRam;
    picker.querySelectorAll('[data-ws-frame]').forEach(b => {
      b.onclick = () => {
        const x = vald();
        if (!x || x.id !== w.id) return;
        andra(x, 'profileFrame', b.dataset.wsFrame);
      };
    });
  }

  // "LADDA UPP TYPSNITT…" I TYPSNITT-LISTAN (spec 5.1, sektion 4: ett typsnittsval). Förr låg EGET
  // TYPSNITT i en egen grupp bredvid TEXT-gruppens Typsnitt. Uppladdningen är densamma som förut
  // (toplike-studio.js #wsCustomFont: filen i IndexedDB, w.customFontId/customFontFamily); filfältet
  // står dolt i sektion 4 och öppnas från listan. Ett uppladdat typsnitt blir en post "Eget typsnitt"
  // och väljs direkt — w.textFont får familjenamnet, och vyra-textgrupp.js lägger det på texten i alla
  // tre typerna (förr nådde det bara Top Like, vars rotnod bär font-family).
  const LADDA = '__vyra-ladda-typsnitt';
  function typsnittslista(w) {
    const sel = document.querySelector('.properties #vtFont');
    if (!sel) return;
    const familj = w.customFontFamily ? String(w.customFontFamily) : '';
    if (familj && ![...sel.options].some(o => o.value === familj)) {
      const o = document.createElement('option');
      o.value = familj; o.textContent = 'Eget typsnitt';
      sel.append(o);
    }
    if (![...sel.options].some(o => o.value === LADDA)) {
      const o = document.createElement('option');
      o.value = LADDA; o.textContent = 'Ladda upp typsnitt…';
      sel.append(o);
    }
    const nu = w.textFont || '';
    if (sel.value !== nu && [...sel.options].some(o => o.value === nu)) sel.value = nu;
    for (const h of ['oninput', 'onchange']) {
      const forra = sel[h];
      if (!forra || forra.__prRk) continue;
      const ny = function (e) {
        if (sel.value !== LADDA) return forra.call(this, e);
        const x = vald();
        sel.value = (x && x.textFont) || '';
        if (h === 'onchange') { const fil = document.querySelector('.properties #wsCustomFont'); if (fil) fil.click(); }
        return undefined;
      };
      ny.__prRk = true;
      sel[h] = ny;
    }
    const fil = document.querySelector('.properties #wsCustomFont');
    if (fil && fil.onchange && !fil.onchange.__prRk) {
      const forra = fil.onchange;
      const ny = function (e) {
        const x = vald();
        // Samma familjenamn som toplike-studio.js ger filen ('vyra-font-' + id).
        if (x && e && e.target && e.target.files && e.target.files[0]) x.textFont = 'vyra-font-' + x.id;
        return forra.call(this, e);
      };
      ny.__prRk = true;
      fil.onchange = ny;
    }
  }

  function stil() {
    if (document.getElementById('vyra-ranking-panel-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-ranking-panel-stil';
    s.textContent = '.properties [data-panelram-sektion] [data-pr-kontroll="falt:customFontId"]{display:none!important}'
      + '.properties [data-panelram-sektion] .pro-frame-picker .ws-frame-grid{margin-top:4px}';
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
          bindEgna(w);
          // Emoji-knappen (vyra-emoji.js) läggs på synliga textfält i ett inre bind, när Rubrik ännu
          // låg i den dolda tilläggsgruppen. Ramen har flyttat fram den nu; samma knapp som förut.
          if (window.VyraEmoji && typeof window.VyraEmoji.bygg === 'function') window.VyraEmoji.bygg();
          // toplike-studio.js laddas asynkront av media.js och binder alltså UTANPÅ det här omslaget:
          // den fyller ramväljaren och binder filfältet efter oss. En gång till när kedjan har kört.
          Promise.resolve().then(() => {
            try {
              const x = vald();
              if (!medPost(x) || x.id !== w.id) return;
              ramval(x);
              typsnittslista(x);
            } catch (e) { console.error('[VyraRankingPanel]', e); }
          });
        }
      } catch (e) { console.error('[VyraRankingPanel]', e); }
      return ut;
    };
  }

  // ---- 3. Exempeldata ----------------------------------------------------------------------------
  // Fem personer (Alex, Mia, Leo, Sara, Zoe) med likes, coins och poäng. Adaptern väljer enheten efter
  // widgetens typ och låter widgetens egen exempelperson ta Leos plats.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('ranking'))) {
    E.definiera('ranking', g => ({ personer: g.personer }));
  }

  // ---- 4. Testadaptern ---------------------------------------------------------------------------
  //
  // ENTRÉ med widgetens egen inträdeseffekt (ws-anim-* ligger i klonens markup och spelar när klonen
  // monteras; varaktigheten är widgetens). VISNING med två omsorteringar: exempelpersonen på plats 3
  // går förbi tvåan och sedan ettan, och raderna glider till sina nya platser. UTGÅNG tonar ut klonen.
  // Allt sker på klonens nod med klonens lista (`k.__provlista`, ranking-sixpack.js) — den riktiga
  // topplistan (live-leaderboard.js), poängen (VyraPoints) och state rörs aldrig, och motorn vaktar
  // att ingenting sparas, köas eller går till nätet.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('ranking'))) return;

  const OMSORT_1 = 1200, OMSORT_2 = 2800, VISNING = 4400, UTGANG = 500, GLID = 650;
  const ENHET = { templateTopLike: 'likes', templateTopCoins: 'coins', templateTopPoints: 'poang' };
  const harEntre = k => !!(k.entranceAnimation && k.entranceAnimation !== 'none');

  // Samma kortform som topplistan själv skriver (live-leaderboard.js formatNum).
  // Svenskt: "98 700", från en miljon "1,2 mn" (slutgranskning N-AB-007).
  function tal(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + '\u00a0mn';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  // Exempelpersonen: fast, aldrig widgetens sparade dataName/dataValue (panelen har inget
  // exempeldatablock längre).
  function exempelperson(k) {
    if (k.type === 'templateTopCoins') return { namn: 'MAYA', varde: 44999 };
    if (k.type === 'templateTopPoints') return { namn: 'MAYA', varde: 1500 };
    return { namn: '', varde: 0 };
  }

  // Tre steg av listan. Exempelpersonens slutvärde är exakt det som står i sektion 1; de andra skalas
  // så att den hamnar först (ettan får 89 % av värdet). Utan eget värde klättrar Leo förbi Alex.
  function stegen(k, ex) {
    const enhet = ENHET[k.type] || 'likes';
    const folk = (ex.personer || []).map(p => ({ namn: p.namn, v: Number(p[enhet]) || 0, bild: ex.bild(p.bild) }));
    if (folk.length < 3) return [folk, folk, folk];
    const e = exempelperson(k);
    const slut = e.varde > 0 ? e.varde : Math.round(folk[0].v * 1.12);
    const skala = e.varde > 0 ? (slut / 1.12) / folk[0].v : 1;
    folk.forEach(p => { p.v = Math.max(1, Math.round(p.v * skala)); });
    const klattrare = Object.assign({}, folk[2], e.namn ? { namn: e.namn } : {});
    const andra = folk.filter((_, i) => i !== 2);
    const lista = (v, plats) => {
      const l = andra.map(p => Object.assign({}, p));
      l.splice(plats, 0, Object.assign({}, klattrare, { v }));
      return l.map(p => ({ namn: p.namn, varde: tal(p.v), bild: p.bild }));
    };
    return [
      lista(klattrare.v, 2),
      lista(Math.round((folk[0].v + folk[1].v) / 2), 1),
      lista(slut, 0),
    ];
  }

  // Byter klonens lista mot k.__provlista, ritad av samma renderare. Bara listans innehåll byts —
  // rotnoden (placering, entré, skala) står kvar. Med `glid` flyttas raderna från sina gamla platser
  // (FLIP): rutan före bytet, och en transform som går tillbaka till noll.
  function bytLista(nod, k, glid) {
    const fore = new Map();
    const skalaAv = el => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };
    if (glid) nod.querySelectorAll('.toplike-row[data-prov]').forEach(r => fore.set(r.dataset.prov, r.getBoundingClientRect()));
    const mall = document.createElement('div');
    mall.innerHTML = typeof wh === 'function' ? wh(k) : '';
    const ny = mall.querySelector('.rk6-lista');
    const gammal = nod.querySelector('.rk6-lista');
    if (!ny || !gammal) return;
    gammal.replaceWith(ny);
    if (window.VyraTextgrupp && typeof window.VyraTextgrupp.applicera === 'function') window.VyraTextgrupp.applicera(nod, k);
    if (!glid || typeof Element.prototype.animate !== 'function') return;
    ny.querySelectorAll('.toplike-row[data-prov]').forEach(r => {
      const a = fore.get(r.dataset.prov);
      if (!a) return;
      const b = r.getBoundingClientRect();
      const s = skalaAv(r) || 1;
      const dx = (a.left - b.left) / s, dy = (a.top - b.top) / s;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      try {
        r.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }],
          { duration: GLID, easing: 'cubic-bezier(.2,.8,.2,1)', composite: 'add' });
      } catch (_) {
        r.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: GLID, easing: 'ease-out' });
      }
    });
  }

  T.registrera('ranking', {
    spela(nod, k, ex, ctl) {
      const steg = stegen(k, ex);
      // Klonen ritades av motorn med demolistan; steg 1 byts in direkt, före första bildrutan.
      k.__provlista = steg[0];
      bytLista(nod, k, false);
      const entre = harEntre(k) ? (Number(k.entranceDuration) || 600) : 0;
      ctl.setTimeout(() => { k.__provlista = steg[1]; bytLista(nod, k, true); }, entre + OMSORT_1);
      ctl.setTimeout(() => { k.__provlista = steg[2]; bytLista(nod, k, true); }, entre + OMSORT_2);
      ctl.setTimeout(() => {
        if (typeof nod.animate === 'function') nod.__rkUt = nod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UTGANG, fill: 'forwards' });
        else nod.style.opacity = '0';
      }, entre + VISNING);
      return { entre, visning: VISNING, utgang: UTGANG };
    },
    stoppa(nod, k) {
      if (nod.__rkUt) { try { nod.__rkUt.cancel(); } catch (_) {} nod.__rkUt = null; }
      if (typeof nod.getAnimations === 'function') nod.getAnimations({ subtree: true }).forEach(a => { try { if (a instanceof CSSAnimation) return; a.cancel(); } catch (_) {} });
      if (k) delete k.__provlista;
    },
  });
})();
