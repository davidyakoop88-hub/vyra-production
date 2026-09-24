// TOP POINTS · FYRA DESIGNER SOM FAKTISKT SKILJER SIG
//
// Katalogen har alltid lovat fyra val — Lista, Tre i mitten, Podium och Neon — men bara ETT av dem
// fanns i koden. media.js hade en enda gren, `likeTheme==='center'`, sa podium och neon foll igenom
// till samma raka lista som clean. Uppmatt 2026-09-21 pa de incheckade referensbilderna:
// ranking_templateTopPoints_neon.png och _podium.png har identiska matt (300x406) och skiljer
// 0,68 procentenheter i fylld yta, vilket ar antialiasing och inte design.
//
// Modulen foljer samma monster som topcoins-v2.js och toplike-design.js: en frusen DESIGNS-tabell,
// en resolver med fallback, en renderare som lindar `wh`, och en egen katalogsektion som tar over
// media.js generiska knappar. KATALOGNYCKLARNA AR OFORANDRADE — clean/center/podium/neon — sa
// docs/katalogkarta.md star still och de fyra referensbilderna behaller sina nycklar.
(function () {
  'use strict';

  const IKON = '◆';

  const DESIGNS = Object.freeze({
    clean: Object.freeze({ label: 'Lista', etikett: 'Stil 1 · Lista', accent: '#c9a227', width: 220 }),
    center: Object.freeze({ label: 'Tre i mitten', etikett: 'Stil 2 · Tre i mitten', accent: '#c9a227', width: 340 }),
    podium: Object.freeze({ label: 'Podium', etikett: 'Stil 3 · Podium', accent: '#ffc94d', width: 300 }),
    neon: Object.freeze({ label: 'Neon', etikett: 'Stil 4 · Neon', accent: '#45e7ff', width: 300 }),
    // Ranking-sixpack (2026-09-24): sex fristående prototyper David godkände som Claude Artifacts,
    // integrerade i Top Points EGEN designtabell (inte via skin-klassen — se skinn-bara-top-like.test.js).
    // Skelettet (tp-chip/tp-portratt/tp-copy/em) är oförändrat, se rad() nedan. Visuellt i ranking-sixpack.css.
    voltage: Object.freeze({ label: 'Voltage', etikett: 'Stil 5 · Voltage', accent: '#ffd700', width: 300 }),
    'basic-v2': Object.freeze({ label: 'Basic v2', etikett: 'Stil 6 · Basic v2', accent: '#ffd97a', width: 260 }),
    'prism-vertical': Object.freeze({ label: 'Prism', etikett: 'Stil 7 · Prism', accent: '#ffb703', width: 260 }),
    'prism-horizontal': Object.freeze({ label: 'Prism horisontal', etikett: 'Stil 8 · Prism horisontal', accent: '#ffb703', width: 340 }),
    celestial: Object.freeze({ label: 'Celestial', etikett: 'Stil 9 · Celestial', accent: '#ffd54a', width: 340 }),
    'royal-rose': Object.freeze({ label: 'Royal Rose', etikett: 'Stil 10 · Royal Rose', accent: '#ffd54a', width: 340 })
  });
  const SIXPACK = new Set(['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);
  // Pensionerade 2026-09-24 (Davids beslut) — inte valbara längre; ranking-sixpack.js ritar en
  // sparad widget med någon av dem som närmaste nya design.
  const PENSIONERADE = new Set(['clean', 'center', 'podium', 'neon']);
  const SIXPACK_ROW = new Set(['prism-horizontal', 'celestial', 'royal-rose']); // horisontell rad, som center/podium

  // Demodata i editorn. I overlay ritas nollformen i stallet — se kommentaren vid rad().
  const DEMO = Object.freeze([
    Object.freeze(['MAYA', 1500]), Object.freeze(['ALEX', 1180]), Object.freeze(['MIA', 940]),
    Object.freeze(['LEO', 720]), Object.freeze(['SARA', 560]), Object.freeze(['ZOE', 430]),
    Object.freeze(['NOAH', 310]), Object.freeze(['EMMA', 240]), Object.freeze(['SOFIA', 160]),
    Object.freeze(['ELIAS', 90])
  ]);

  function designId(w) {
    if (!w) return 'clean';
    if (Object.prototype.hasOwnProperty.call(DESIGNS, w.topPointsDesign)) return w.topPointsDesign;
    if (Object.prototype.hasOwnProperty.call(DESIGNS, w.skin)) return w.skin;
    if (Object.prototype.hasOwnProperty.call(DESIGNS, w.likeTheme)) return w.likeTheme;
    return 'clean';
  }

  const safeText = (v, f) => (window.VyraSafe ? VyraSafe.text(v, f) : (v == null || v === '' ? f : String(v)));
  const safeSrc = (v, f) => (window.VyraSafe ? (VyraSafe.src ? VyraSafe.src(v, f) : VyraSafe.url(v, f)) : (v || f));
  const avatar = w => safeSrc(w.profileImage, 'assets/images/test-profile.svg');
  const tal = v => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : String(v || '0');
  };
  // FARGEN KOMMER UR DESIGNEN, INTE UR w.accent.
  //
  // Uppmatt 2026-09-21: den visuella riggen skapar widgeten med `VyraWidgets.create(nyckel)` rakt
  // ur fabriken och kor aldrig katalogknappens handler. Fabriken satter redan en generisk lila
  // `accent`, sa `w.accent || meta.accent` valde ALLTID lila — podiets trappsteg och neons brickor
  // blev lila i stallet for guld respektive cyan, i referensbilderna och for alla widgetar som
  // aterskapas ur sparat lage. Ett eget falt loser det: designens farg galler tills nagon
  // uttryckligen valjer en annan I DEN HAR WIDGETEN.
  const accent = w => w.topPointsAccent || DESIGNS[designId(w)].accent;

  const arOverlay = () => {
    try { return new URLSearchParams(location.search).has('overlay') } catch (_) { return false }
  };

  // EN RAD, SAMMA SKELETT I ALLA FYRA DESIGNER.
  //
  // live-leaderboard.js skriver live-varden genom att leta upp `strong`, `small` och `em` i varje
  // `.toplike-row`. Byter en design ut det skelettet slutar den att fa livedata — det ar precis den
  // fallan som gjorde fem widgetar "fardiga men doda" (se widget-live-trigger-monstret). Designerna
  // far darfor skilja sig i OMSLAG och KLASSER, aldrig i de tre noderna.
  //
  // I overlay ritas leaderboardens nollform direkt: strong tom, small tom, em = ikonen + ' 0'.
  // Da blir tickets skrivning en no-op i stallet for en DOM-mutation i sekunden, och den visuella
  // vakten far samma bild oavsett vilken sida om ticket fotot hamnar pa (samma lardom som
  // topcoins-v2.js bar sedan 2026-09-20).
  function rad(w, index, design, overlay) {
    const [demoNamn, demoVarde] = DEMO[index] || DEMO[DEMO.length - 1];
    const namn = overlay ? '' : safeText(index === 0 ? w.dataName : null, demoNamn);
    const varde = overlay ? '0' : tal(index === 0 && w.dataValue != null ? w.dataValue : demoVarde);
    const plats = index + 1;
    const glod = design === 'neon' ? '<span class="tp-glod"></span>' : '';
    const steg = design === 'podium' && plats <= 3
      ? `<span class="tp-podium-steg" data-plats="${plats}"></span>` : '';
    // Ranking-sixpack: samma ring/glöd-noder runt tp-portratt som toplike-studio.js:s sex nya
    // skinn använder (.tp-six-backlight/.tp-six-ring), färg/bakgrundsbild sätts i CSS.
    const sixRing = SIXPACK.has(design)
      ? '<span class="tp-six-backlight"></span><span class="tp-six-ring tp-six-a"></span><span class="tp-six-ring tp-six-b"></span><span class="tp-six-art"></span>'
      : '';
    return `<div class="toplike-row rank-${plats}" style="order:${plats}">`
      + steg + glod
      + `<span class="tp-chip">${plats}</span>`
      + `<span class="tp-portratt">${sixRing}<img src="${avatar(w)}" alt=""></span>`
      + `<span class="tp-copy"><strong>${namn}</strong><small></small></span>`
      + `<em>${IKON} ${varde}</em>`
      + '</div>';
  }

  function topPointsHtml(w) {
    const design = designId(w), meta = DESIGNS[design];
    const antal = Math.min(DEMO.length, Math.max(1, Number(w.likeCount) || 5));
    const bredd = Math.max(150, Number(w.width) || meta.width);
    const overlay = arOverlay();
    const paus = w.topPointsMotion === false ? ' toppoints-paused' : '';
    const bakgrund = w.showBackground === true ? ' toppoints-with-background' : '';
    const vald = (typeof selected !== 'undefined' && selected === w.id) ? ' selected' : '';
    let rader = '';
    for (let i = 0; i < antal; i += 1) rader += rad(w, i, design, overlay);
    // PODIUM HAR DOM-ORDNING 1,2,3 MEN VISAS 2,1,3.
    // live-leaderboard.js skriver `rows.forEach((row, i) => ...)`, alltsa plats efter DOM-ordning.
    // Ett podium som bytte plats pa noderna hade gett tvaan etttans varden. Ordningen flyttas
    // darfor i CSS med `order`, inte i DOM:en.
    return `<div class="widget vyra-toplike vyra-templatetoppoints vyra-toppoints-new toppoints-${design}${paus}${bakgrund}${vald}"`
      + ` data-id="${w.id}" data-toppoints-design="${design}"`
      + ` style="left:${w.x || 0}px;top:${w.y || 0}px;width:${bredd}px;--tp-accent:${accent(w)};--tp-scale:${w.widgetScale || 1};z-index:${w.layer || 1}">`
      + `<div class="toplike-list">${rader}</div>`
      + ((typeof selected !== 'undefined' && selected === w.id) ? '<span class="resize-handle">↘</span>' : '')
      + '</div>';
  }

  const previousWh = wh;
  wh = function (w) {
    return w && w.type === 'templateTopPoints' ? topPointsHtml(w) : previousWh(w);
  };

  const previousProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateTopPoints') return previousProps();
    // Panelen visar designen som faktiskt ritas — en pensionerad pekas om av ranking-sixpack.js.
    const ritad = window.VyraRankingSixpack?.designFor?.(w);
    const design = DESIGNS[ritad] ? ritad : designId(w), meta = DESIGNS[design];
    const val = Object.entries(DESIGNS).filter(([id]) => !PENSIONERADE.has(id)).map(([id, m]) =>
      `<button type="button" data-tp-design="${id}" class="${design === id ? 'active' : ''}">${m.label}</button>`).join('');
    return `<h3>TOP POINTS · ${meta.label.toUpperCase()}</h3>`
      + `<div class="template-badge">${meta.etikett.toUpperCase()}</div>`
      + `<div hidden><input id="pt" value="${safeText(w.title, 'Top Points')}"><input id="pv" value="${safeText(w.dataValue, '1500')}"></div>`
      + `<div class="property-group"><h4>INNEHÅLL</h4>`
      + `<label>Namn<input id="tpName" value="${safeText(w.dataName, 'MAYA')}"></label>`
      + `<label>Poäng<input id="tpValue" type="number" min="0" value="${Number(w.dataValue) || 1500}"></label>`
      + `<label>Profilbild<input id="tpAvatar" value="${avatar(w)}"></label>`
      + `<label class="range-label">Antal profiler <b>${Math.min(DEMO.length, Math.max(1, Number(w.likeCount) || 5))}</b>`
      + `<input id="tpCount" type="range" min="1" max="${DEMO.length}" value="${Math.min(DEMO.length, Math.max(1, Number(w.likeCount) || 5))}"></label></div>`
      + `<div class="property-group"><h4>DESIGN</h4><div class="toppoints-design-choice">${val}</div>`
      + `<label>Accent<input id="tpAccent" type="color" value="${accent(w)}"></label>`
      + `<div class="switch-row one"><label><input id="tpMotion" type="checkbox" ${w.topPointsMotion === false ? '' : 'checked'}> Rörelse</label>`
      + `<label><input id="tpBackground" type="checkbox" ${w.showBackground === true ? 'checked' : ''}> Bakgrund</label></div></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid">`
      + `<label>X<input id="propX" type="number" value="${w.x || 0}"></label>`
      + `<label>Y<input id="propY" type="number" value="${w.y || 0}"></label>`
      + `<label>Bredd<input id="propWidth" type="number" min="150" max="500" value="${w.width || meta.width}"></label>`
      + `<label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>`
      + '<button class="delete" id="del">Ta bort</button>';
  };

  function createTopPoints(design) {
    const meta = DESIGNS[design];
    const created = VyraWidgets.create('catalog:ranking:templateTopPoints:' + design);
    Object.assign(created, {
      topPointsDesign: design, skin: design, likeTheme: design, width: meta.width, likeCount: 5,
      dataName: 'MAYA', dataValue: 1500, showTitle: false, showCrown: false, autoMedal: false,
      showBackground: false, rankingCycle: false, topPointsMotion: true,
      useLiveData: true, liveMetric: 'points', topPointsAccent: meta.accent
    });
    state.widgets.push(created);
    selected = created.id;
    save(); render(); toast('Top Points · ' + meta.label + ' skapad');
  }

  // Katalogen far EN uppsattning knappar, inte tva. media.js bygger fyra generiska
  // `[data-ranking="templateTopPoints"]`-knappar som skapar widgetar utan de har defaultvardena;
  // de tas bort och ersatts med modulens egna, med samma katalognycklar.
  // De sex ranking-sixpack-designerna listas i ranking-sixpack.js:s grupperade katalog (en grupp per
  // design, med Top Like / Top Coins / Top Points under), inte har.
  const KATALOG = Object.entries(DESIGNS).filter(([id]) => !SIXPACK.has(id) && !PENSIONERADE.has(id));
  function refreshCatalog() {
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog) return;
    catalog.querySelectorAll('[data-ranking="templateTopPoints"]').forEach(el => el.remove());
    catalog.querySelectorAll('section[data-toppoints-v2]').forEach((el, index) => { if (index) el.remove() });
    // Top Points fyra egna designer är pensionerade (2026-09-24) — ingen egen sektion längre. De sex
    // som finns kvar listas i ranking-sixpack.js:s grupperade katalog.
    if (!KATALOG.length) { catalog.querySelectorAll('section[data-toppoints-v2]').forEach(el => el.remove()); return; }
    if (catalog.querySelector('section[data-toppoints-v2]')) return;
    const section = document.createElement('section');
    section.dataset.toppointsV2 = '1';
    section.className = 'toplike-template-section toppoints-v2-catalog';
    section.innerHTML = `<h4>TOP POINTS · ${KATALOG.length} SEPARATA DESIGNER</h4>`
      + KATALOG.map(([id, meta]) =>
        `<button type="button" data-toppoints-create="${id}" data-catalog-key="catalog:ranking:templateTopPoints:${id}">`
        + `<i>${IKON}</i><span><b>Top Points · ${meta.etikett}</b><small>1–10 profiler · transparent</small></span></button>`).join('');
    catalog.prepend(section);
    section.querySelectorAll('[data-toppoints-create]').forEach(button => {
      button.onclick = () => createTopPoints(button.dataset.toppointsCreate);
    });
  }

  const previousBind = bind;
  bind = function () {
    previousBind();
    refreshCatalog();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateTopPoints') return;
    const assign = (selector, key, convert) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.onchange = e => { w[key] = convert ? convert(e.target) : e.target.value; save(); render(); };
    };
    assign('#tpName', 'dataName');
    assign('#tpValue', 'dataValue', el => Number(el.value) || 0);
    assign('#tpAvatar', 'profileImage');
    assign('#tpCount', 'likeCount', el => Number(el.value) || 5);
    assign('#tpAccent', 'topPointsAccent');
    assign('#tpMotion', 'topPointsMotion', el => el.checked);
    assign('#tpBackground', 'showBackground', el => el.checked);
    document.querySelectorAll('[data-tp-design]').forEach(button => {
      button.onclick = () => {
        const id = button.dataset.tpDesign, meta = DESIGNS[id];
        if (!meta) return;
        w.topPointsDesign = id; w.skin = id; w.likeTheme = id; w.topPointsAccent = meta.accent;
        save(); render();
      };
    });
  };

  window.VyraTopPoints = Object.freeze({ create: createTopPoints, designs: DESIGNS, designId, accent, topPointsHtml });
})();
