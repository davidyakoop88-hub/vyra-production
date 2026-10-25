// topstreak-designer.js — Top Streak · Design 1, 2 och 3 (godkända i widget-playgrounden 2026-10-17).
// Stilarna ligger i topstreak-designer.css.
//
//   Design 1  en cirkel som vänder mellan profilbild och gåva, strålar bakom, extra ljus på profilen
//   Design 2  profil och gåva sida vid sida, lysande guldlinje (Top Gift Design 2 som streak)
//   Design 3  gåvan i en glasruta, profil i bubbelbrickan, åtta färgstilar (Top Gift Design 3 som streak)
//
// INGEN EGEN WRAPPER. approved-rankings.js ligger ytterst i wh/props/bind-kedjan och ritar varje
// Top Streak; den frågar den här modulen (har/html/props/bind) när widgeten har ett streakDesign.
// Då gäller samma regler som för Clean Flip utan att något dubbleras: demovärdena nollas i overlayn,
// en tömd widget döljs, och Dölj/Lager/Opacitet skrivs på roten.
//
// LIVE UTAN NYA KROKAR. Markupen behåller exakt det gift-event-images.js patchar för templateTopStreak:
// .vyra-streak[data-id] som rot, .streak-gift-face img, .streak-profile-face img, namnet i
// .approved-streak-copy strong och talet i ett eget <b>. Prefixet (🔥 ×) och STREAK står kvar.
(function () {
  'use strict';
  const SAFE = window.VyraSafe;
  const txt = (v, f) => (SAFE ? SAFE.text(v, f) : String(v == null ? f : v));

  const BAS = { 1: 210, 2: 276, 3: 236 };                 // designbredd i px, som i playgrounden
  const FARG = { 1: '#ff4fa3', 2: '#d9a441', 3: '#19d3ff' };
  const FARG2 = { 1: '#7c4dff', 2: '#7c4dff', 3: '#1f6bff' };
  // Design 3:s åtta färgstilar. En stil sätter Färg 1 och Färg 2; reglagen kan sedan finjustera.
  const STILAR = [
    ['is', 'Is', '#19d3ff', '#1f6bff'], ['ametist', 'Ametist', '#c58bff', '#7c4dff'], ['rosa', 'Rosa', '#ff6fb5', '#c02c7a'],
    ['guld', 'Guld', '#ffd24a', '#c27a12'], ['smaragd', 'Smaragd', '#3ef08a', '#0f8f55'], ['glod', 'Glöd', '#ff8a3d', '#e0244a'],
    ['natt', 'Natt', '#e6e9f2', '#5a6378'], ['aurora', 'Aurora', '#3ef0d0', '#a64dff']
  ];
  const hex = (v, f) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : f);
  const design = w => (w && w.type === 'templateTopStreak' && [1, 2, 3].includes(Number(w.streakDesign)) ? Number(w.streakDesign) : 0);
  // ÄRV FÄRGSCHEMA (panelspecifikationen 4.2, vyra-streak-panel.js): Färg 1 tar färgschemats accent och
  // Färg 2 dess andra färg, med media.js bk() — samma regel som de andra familjerna. Utan arv, eller där
  // bk() saknas (proven som laddar filen ensam), gäller widgetens egna färger som förut. Design 1 ritar
  // inte Färg 2 och ärver den därför inte heller.
  const farg = (w, egen, falt) => (typeof bk === 'function' ? bk(w, egen, falt, '') : egen);

  function rot(w, d, o, inner) {
    const k = ((Number(w.width) || BAS[d]) / BAS[d]).toFixed(3);
    // SAMMA KOMPOSITION I ALLA STORLEKAR (granskningen 2026-10-25): golven i CSS:en gäller designen i
    // full storlek, inte den totala förstoringen — annars växer texten relativt resten när widgeten krymps.
    const z = '1';
    const g = ((w.streakGlow ?? 55) / 55 * 0.8).toFixed(3);
    // Gift-redigerarens kryssrutor och typsnitt (media.js "GIFT EDITOR · VISA / TA BORT") gäller även här.
    const utan = [['showGift', 'utan-gava'], ['showProfile', 'utan-profil'], ['showDataName', 'utan-namn'], ['showDataValue', 'utan-varde']]
      .filter(([key]) => w[key] === false).map(([, c]) => ' ' + c).join('');
    const stil = `${o.dold}left:${w.x || 0}px;top:${w.y || 0}px;width:${Number(w.width) || BAS[d]}px;opacity:${(w.opacity ?? 100) / 100};z-index:${w.layer || 1};`
      + `zoom:${w.widgetScale || 1};font-family:${txt(w.fontFamily, 'Inter')};font-style:${w.fontStyle === 'italic' ? 'italic' : 'normal'};`
      + `--streak:${hex(farg(w, w.accent, 'highlight'), FARG[d])};--a2:${hex(d === 1 ? w.accent2 : farg(w, w.accent2, 'secondaryText'), FARG2[d])};--g:${g};--t:${hex(w.dataColor, '#ffffff')};`
      + `--tsd-text:${Number(w.dataSize) || 20}px;--tsd-z:${z};--tsd-flip:${Math.max(4, Number(w.streakFlipSeconds) || 7)}s`;
    return `<div class="widget vyra-streak tsd tsd${d}${d === 2 ? ' ram-farg' : ''}${utan}${w.hidden ? ' widget-hidden' : ''}${o.valt ? ' selected' : ''}" data-id="${w.id}" style="${stil}">`
      + `<div class="tsd-in" style="zoom:${k}">${inner}</div>${o.valt ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  }

  const profil = o => `<div class="streak-profile-face"><img src="${o.profile}" alt=""></div>`;
  const gava = o => `<div class="streak-gift-face"><img src="${o.gift}" alt=""></div>`;
  const BUBBLOR = [[9, 7.2, 0, 14], [5, 6.0, 1.3, 30], [7, 7.8, 2.6, 48], [4, 6.4, .7, 62], [10, 8.4, 3.4, 78], [6, 6.6, 4.2, 24], [5, 7.4, 2.0, 88], [4, 6.8, 5.1, 40], [6, 7.6, 5.8, 70]]
    .map(([b, t, dl, l]) => `<i style="--b:${b}px;--t:${t}s;--d:${dl}s;left:${l}%"></i>`).join('');

  // o: { name, value, vila, profile, gift, dold, valt } — redan säkrade och demonollade av approved-rankings.js.
  function html(w, o) {
    const d = design(w);
    const namn = `<strong>${o.name}</strong>`;
    if (d === 1) return rot(w, d, o,
      `<div class="tsd1-cirkel"><div class="tsd1-flip"><div class="streak-profile-face"><img src="${o.profile}" alt=""><i class="tsd-ljus"></i></div>${gava(o)}</div></div>`
      + `<div class="approved-streak-copy">${namn}<em${o.vila || ''}>🔥 ×<b>${o.value}</b> <small>STREAK</small></em></div>`);
    if (d === 2) return rot(w, d, o,
      `<div class="rad"><div class="pw">${profil(o)}<i class="glans"></i></div>${gava(o)}</div>`
      + `<div class="approved-streak-copy">${namn}<span class="linje"></span><em${o.vila || ''}>×<b>${o.value}</b> <small>STREAK</small></em></div>`);
    return rot(w, d, o,
      `<div class="ruta"><div class="bubblor">${BUBBLOR}</div>${gava(o)}<div class="stank"><i></i><i></i><i></i><i></i></div><span class="landring"></span>`
      + `<div class="bw">${profil(o)}<i></i><i></i></div></div>`
      + `<div class="approved-streak-copy">${namn}<em${o.vila || ''}>🔥 ×<b>${o.value}</b> <small>STREAK</small></em></div>`);
  }

  // PANELEN. Samma innehåll som Clean Flip (namn, streak, bilder) och det designen faktiskt använder.
  // Varje reglage ändrar widgeten: Vänder var finns bara i Design 1 (den enda som vänder), Stil bara i
  // Design 3 (den enda med färgstilar) och Färg 2 bara i Design 2 och 3 (Design 1 använder den inte).
  function props(w) {
    const d = design(w);
    const v = (id, value, extra = '') => `<input id="${id}" value="${value}"${extra}>`;
    const rad = [];
    if (d === 3) {
      const nu = w.streakStil || '';
      rad.push(`<label>Stil<select id="tsdStil">${STILAR.map(([id, namn]) => `<option value="${id}" ${nu === id ? 'selected' : ''}>${namn}</option>`).join('')}${STILAR.some(([id]) => id === nu) ? '' : '<option value="" selected>Egna färger</option>'}</select></label>`);
    }
    rad.push(`<label>Färg 1<input id="tsdFarg" type="color" value="${hex(w.accent, FARG[d])}"></label>`);
    if (d !== 1) rad.push(`<label>Färg 2<input id="tsdFarg2" type="color" value="${hex(w.accent2, FARG2[d])}"></label>`);
    rad.push(`<label class="range-label">Text <b>${Number(w.dataSize) || 20}px</b><input id="tsdText" type="range" min="12" max="40" value="${Number(w.dataSize) || 20}"></label>`);
    rad.push(`<label class="range-label">Ljus <b>${w.streakGlow ?? 55}%</b><input id="tsdLjus" type="range" min="0" max="100" value="${w.streakGlow ?? 55}"></label>`);
    if (d === 1) rad.push(`<label class="range-label">Vänder var <b>${Math.max(4, Number(w.streakFlipSeconds) || 7)} sek</b><input id="tsdFlip" type="range" min="4" max="20" value="${Math.max(4, Number(w.streakFlipSeconds) || 7)}"></label>`);
    return `<h3>VYRA TOP STREAK</h3><div class="template-badge">DESIGN ${d}</div>`
      + `<div hidden><input id="pt" value="${txt(w.title, 'Top Streak')}"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>INNEHÅLL</h4><label>Namn${v('approvedStreakName', txt(w.dataName, 'MAYA'))}</label>`
      + `<label>Streak<input id="approvedStreakValue" type="number" min="1" value="${Number(w.dataValue) || 18}"></label>`
      + `<label>Profilbild${v('approvedStreakProfile', SAFE ? SAFE.url(w.profileImage, 'assets/images/test-profile.svg') : (w.profileImage || ''))}</label>`
      + `<label>Gåvobild${v('approvedStreakGift', SAFE ? SAFE.url(w.giftImage, 'assets/gifts/events/0001_Rose.png') : (w.giftImage || ''))}</label></div>`
      + `<div class="property-group"><h4>DESIGN</h4>${rad.join('')}</div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label>`
      + `<label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" min="150" max="600" value="${Number(w.width) || BAS[d]}"></label>`
      + `<label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  }

  // Innehållsfälten (namn, streak, bilder) binds av approved-rankings.js:s bindControls, som för Clean Flip.
  // REGLAGE UTAN VERKAN TAS BORT. media.js skjuter in sin streaktext-redigerare (Text under, Prefix,
  // Rubrik/Namn/Streaktext/Effekt, Namn- och nummerstorlek, Animation) i varje Top Streaks DESIGN-grupp,
  // och Gift-redigeraren har Rubrik och Giftstorlek. Inget av det läses av Design 1–3 — uppmätt
  // 2026-10-17: widgeten ändrades inte av något av dem. Samma grepp som approved-rankings.js använder
  // för Clean Flips döda kontroller. (Höjd visas skrivskyddad av vyra-proportioner.js: höjden är designens.)
  //
  // CLEAN FLIP HAR SAMMA DÖDA REGLAGE OCH FLER (2026-10-19, panelspecifikationen 5.4). cleanStreakHtml i
  // approved-rankings.js läser inte heller Gift-redigerarens kryssrutor eller Textstil: granskningen
  // mätte alla 18 utan verkan (scratchpad panel-fynd.json). Inträdeseffekten "Gilded Invite" förlorar mot
  // widgetens egen entré (streakEnter i studio.css) och tas bort ur listan; ett sparat val av den står
  // kvar, så att listan visar det som faktiskt är valt. GIFT EDITOR-gruppen döljs när inget finns kvar i
  // den — den tas inte bort, för media.js bygger om gruppen när den saknas.
  //
  // REGLAGEN TAS BORT, INTE FÄLTEN. Inget fält raderas ur state, och media.js-omslagen som byggde
  // reglagen binder bara i samma svep som de bygger (de kollar #streakExtraOptions och
  // #universalGiftEditor först), så ett senare bind utan omritning kastar inte.
  const UTAN_VERKAN = ['streakLabel', 'streakPrefix', 'showStreakTitle', 'showStreakName', 'showStreakLabel', 'showStreakEffect',
    'streakNameSize', 'streakNumberSize', 'streakSpeed', 'universalShowTitle', 'universalGiftSize'];
  const UTAN_VERKAN_CLEAN = ['universalShowGift', 'universalShowProfile', 'universalShowName', 'universalShowValue', 'universalFontStyle'];
  function rensa(w) {
    const clean = !design(w);
    const ids = clean ? UTAN_VERKAN.concat(UTAN_VERKAN_CLEAN) : UTAN_VERKAN;
    const gor = () => {
      ids.forEach(id => { const el = document.querySelector('.properties #' + id); const l = el && el.closest('label'); if (l) l.remove(); else if (el) el.remove(); });
      if (!clean) return;
      const val = document.querySelector('.properties #gafEntrance');
      const gilded = val && val.querySelector('option[value="gilded"]');
      if (gilded && val.value !== 'gilded') gilded.remove();
      const redigerare = document.querySelector('.properties #universalGiftEditor');
      if (redigerare && !redigerare.querySelector('input, select, textarea, button')) redigerare.hidden = true;
    };
    gor(); setTimeout(gor, 0);
  }
  function bind(w) {
    rensa(w);
    const commit = () => { if (typeof save === 'function') save(); if (typeof render === 'function') render(); };
    const set = (id, fn) => { const el = document.getElementById(id); if (el) el.onchange = e => { fn(e.target.value); commit(); }; };
    set('tsdFarg', val => { w.accent = val; if (design(w) === 3) w.streakStil = ''; });
    set('tsdFarg2', val => { w.accent2 = val; if (design(w) === 3) w.streakStil = ''; });
    set('tsdText', val => { w.dataSize = Number(val); });
    set('tsdLjus', val => { w.streakGlow = Number(val); });
    set('tsdFlip', val => { w.streakFlipSeconds = Number(val); });
    set('tsdStil', val => { const s = STILAR.find(([id]) => id === val); w.streakStil = val; if (s) { w.accent = s[2]; w.accent2 = s[3]; } });
  }

  // LANDNING i Design 3: bara när gåvan faktiskt byts — live-patchen byter img.src, och en omritning
  // med en ny gåva bygger om noden. Båda fångas genom att jämföra mot senast sedda bild per widget.
  const senast = new Map();
  let planerad = 0;
  function kollaLandning() {
    planerad = 0;
    document.querySelectorAll('.vyra-streak.tsd3').forEach(el => {
      const img = el.querySelector('.streak-gift-face img'); if (!img) return;
      const id = el.dataset.id, nu = img.getAttribute('src'), forut = senast.get(id);
      senast.set(id, nu);
      if (!forut || forut === nu) return;
      el.classList.remove('landar'); void el.offsetWidth; el.classList.add('landar');
      clearTimeout(el.__tsdLand); el.__tsdLand = setTimeout(() => el.classList.remove('landar'), 2300);
    });
  }
  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(muts => {
      if (planerad) return;
      for (const m of muts) {
        const t = m.target.nodeType === 1 ? m.target : null;
        if ((t && t.closest && t.closest('.tsd3')) || [...(m.addedNodes || [])].some(n => n.nodeType === 1 && (n.matches('.tsd3') || n.querySelector('.tsd3')))) {
          planerad = (window.requestAnimationFrame || (f => setTimeout(f, 16)))(kollaLandning); return;
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  }

  window.VyraStreakDesigner = Object.freeze({
    har: w => design(w) > 0, design, html, props, bind, rensa,
    stilar: STILAR.map(([id, namn, a, b]) => ({ id, namn, farg: a, farg2: b }))
  });
})();
