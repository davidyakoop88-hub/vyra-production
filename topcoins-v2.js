(function () {
  'use strict';

  const DESIGNS = Object.freeze({
    halo: { label: 'Halo', accent: '#ffc94d', width: 230 },
    'signal-orbit': { label: 'Signal Orbit', accent: '#45e7ff', width: 230 },
    // Ranking-sixpack (2026-09-24): sex fristående prototyper som David godkände som Claude
    // Artifacts, integrerade i Top Coins EGEN designtabell — inte via skin-klassen, som bara Top
    // Like bär (se skinn-bara-top-like.test.js). Visuellt i ranking-sixpack.css.
    voltage: { label: 'Voltage', accent: '#ffd700', width: 230 },
    'basic-v2': { label: 'Basic v2', accent: '#ffd97a', width: 230 },
    'prism-vertical': { label: 'Prism', accent: '#ffb703', width: 230 },
    'prism-horizontal': { label: 'Prism horisontal', accent: '#ffb703', width: 230 },
    celestial: { label: 'Celestial', accent: '#ffd54a', width: 230 },
    'royal-rose': { label: 'Royal Rose', accent: '#ffd54a', width: 230 }
  });
  const SIXPACK = new Set(['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);

  const designId = w => Object.prototype.hasOwnProperty.call(DESIGNS, w.topCoinsDesign)
    ? w.topCoinsDesign
    : (w.skin === 'signal-orbit' ? 'signal-orbit' : 'halo');
  const number = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n)) return String(value || '44 999');
    return Math.round(n).toLocaleString('sv-SE');
  };
  const avatar = w => VyraSafe.src(w.profileImage, 'assets/images/test-profile.svg');
  const text = (value, fallback) => VyraSafe.text(value, fallback);

  function topCoinsHtml(w) {
    const design = designId(w), meta = DESIGNS[design];
    const width = Math.max(150, Number(w.width) || meta.width);
    const motion = w.topCoinsMotion === false ? ' topcoins-paused' : '';
    const background = w.showBackground === true ? ' topcoins-with-background' : '';
    const selectedClass = selected === w.id ? ' selected' : '';
    // I OVERLAY RITAS DET NOLLADE LAGET DIREKT. live-leaderboard.js nollar varje .toplike-row i
    // overlay utan livedata en gang i sekunden (strong -> '', em -> forsta ordet + ' 0') och
    // skriver sedan livevarden pa samma satt. Uppmatt 2026-09-20: renderaren ritade
    // 'MAYA / V44 999 COINS' och tick:et skrev om till 'V44 999 0' - namnet tomt, <i>-ikonen borta
    // och ett lost "0", for ikonen lases som forsta mellanslagsavgransade ord och det fanns inget
    // mellanslag efter </i>. Varje render() visade den pahittade raden i upp till en sekund i OBS,
    // och den visuella vakten fick olika bild beroende pa vilken sida om tick:et fotot hamnade.
    // Darfor: overlay ritar exakt leaderboardens nollform sa att skrivningen ar en no-op, och
    // ikonen foljs alltid av ett mellanslag sa att ett livevarde blir 'V 12 300', inte
    // 'V44 999 12 300'. Editorn behaller demodatan - den ar vad man designar mot.
    const overlay = new URLSearchParams(location.search).has('overlay');
    const name = overlay ? '' : text(w.dataName, 'MAYA');
    const value = overlay ? '0' : number(w.dataValue ?? 44999) + ' COINS';
    const particles = design === 'halo'
      ? '<i class="tc-coin tc-c1">V</i><i class="tc-coin tc-c2">V</i><i class="tc-coin tc-c3">V</i><i class="tc-spark tc-s1"></i><i class="tc-spark tc-s2"></i>'
      : SIXPACK.has(design)
        // Ranking-sixpack-designerna delar EN riggad ring (energiring + metallring) — samma noder
        // som prototypernas .flame-ring/.metal-ring/.ring-backlight, färg och ev. bakgrundsbild
        // sätts per design i ranking-sixpack.css via .topcoins-<design>.
        ? '<i class="tc-six-backlight"></i><i class="tc-six-ring tc-six-a"></i><i class="tc-six-ring tc-six-b"></i><i class="tc-six-art"></i>'
        : '<i class="tc-orbit tc-o1"></i><i class="tc-orbit tc-o2"></i><i class="tc-orbit tc-o3"></i><i class="tc-orbit-dot tc-d1"></i><i class="tc-orbit-dot tc-d2"></i>';
    return `<div class="widget vyra-toplike vyra-templatetopcoins vyra-topcoins-new topcoins-${design}${motion}${background}${selectedClass}" data-id="${w.id}" data-topcoins-design="${design}" style="left:${w.x || 0}px;top:${w.y || 0}px;width:${width}px;--tc-accent:${w.accent || meta.accent};--tc-scale:${w.widgetScale || 1};z-index:${w.layer || 1}"><div class="toplike-list"><div class="toplike-row rank-1"><div class="tc-portrait"><img src="${avatar(w)}" alt=""><span class="tc-ring tc-ring-a"></span><span class="tc-ring tc-ring-b"></span>${particles}</div><span class="tc-copy"><strong>${name}</strong><small></small></span><em><i>V</i> ${value}</em></div></div>${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  }

  const previousWh = wh;
  wh = function (w) {
    return w && w.type === 'templateTopCoins' ? topCoinsHtml(w) : previousWh(w);
  };

  const previousProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateTopCoins') return previousProps();
    const design = designId(w), meta = DESIGNS[design];
    const designChoice = Object.entries(DESIGNS).map(([id, m]) =>
      `<button type="button" data-tc-design="${id}" class="${design === id ? 'active' : ''}">${m.label}</button>`).join('');
    return `<h3>TOP COINS · ${meta.label.toUpperCase()}</h3><div class="template-badge">EN LEDARE · UTAN PLACERINGSTAL</div><div hidden><input id="pt" value="${text(w.title, 'Top Coins')}"><input id="pv" value="${text(w.dataValue, '44999')}"></div><div class="property-group"><h4>INNEHÅLL</h4><label>Namn<input id="tcName" value="${text(w.dataName, 'MAYA')}"></label><label>Coins<input id="tcValue" type="number" min="0" value="${Number(w.dataValue) || 44999}"></label><label>Profilbild<input id="tcAvatar" value="${avatar(w)}"></label></div><div class="property-group"><h4>DESIGN</h4><div class="topcoins-design-choice">${designChoice}</div><label>Accent<input id="tcAccent" type="color" value="${w.accent || meta.accent}"></label><div class="switch-row one"><label><input id="tcMotion" type="checkbox" ${w.topCoinsMotion === false ? '' : 'checked'}> Rörelse</label><label><input id="tcBackground" type="checkbox" ${w.showBackground === true ? 'checked' : ''}> Bakgrund</label></div></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" min="150" max="500" value="${w.width || meta.width}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  function createTopCoins(design) {
    const meta = DESIGNS[design];
    const created = VyraWidgets.create('catalog:ranking:templateTopCoins:' + design);
    Object.assign(created, {
      topCoinsDesign: design, skin: design, width: meta.width, likeCount: 1,
      dataName: 'MAYA', dataValue: 44999, showTitle: false, showCrown: false,
      autoMedal: false, showBackground: false, rankingCycle: false,
      topCoinsMotion: true, useLiveData: true, liveMetric: 'coins', accent: meta.accent
    });
    state.widgets.push(created);
    selected = created.id;
    save(); render(); toast('Top Coins · ' + meta.label + ' skapad');
  }

  function refreshCatalog() {
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog) return;
    catalog.querySelectorAll('[data-ranking="templateTopCoins"]').forEach(el => el.remove());
    catalog.querySelectorAll('section[data-topcoins-v2]').forEach((el, index) => { if (index) el.remove() });
    if (catalog.querySelector('section[data-topcoins-v2]')) return;
    const section = document.createElement('section');
    section.dataset.topcoinsV2 = '1';
    section.className = 'toplike-template-section topcoins-v2-catalog';
    section.innerHTML = `<h4>TOP COINS · ${Object.keys(DESIGNS).length} DESIGNER</h4>` + Object.entries(DESIGNS).map(([id, meta]) => `<button type="button" data-topcoins-create="${id}" data-catalog-key="catalog:ranking:templateTopCoins:${id}"><i>V</i><span><b>Top Coins · ${meta.label}</b><small>En ledare · transparent · utan placeringstal</small></span></button>`).join('');
    catalog.prepend(section);
    section.querySelectorAll('[data-topcoins-create]').forEach(button => {
      button.onclick = () => createTopCoins(button.dataset.topcoinsCreate);
    });
  }

  const previousBind = bind;
  bind = function () {
    previousBind();
    refreshCatalog();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateTopCoins') return;
    // topCoinsHtml laser aldrig profileFrame, sa ramvaljaren som gift-alert-frames.js/toplike-studio.js
    // skjuter in i panelen gjorde ingenting - uppmatt 2026-09-20: valjaren fanns, ingen ramkonst
    // renderades. En kontroll utan verkan tas bort (samma regel som for Clean Flip).
    document.querySelectorAll('.properties .gaf-frame-group, .properties .ws-frame-grid, .properties [data-ws-frame]').forEach(el => (el.closest('.property-group') || el).remove());
    const assign = (selector, key, convert) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.onchange = e => { w[key] = convert ? convert(e.target) : e.target.value; save(); render(); };
    };
    assign('#tcName', 'dataName');
    assign('#tcValue', 'dataValue', el => Number(el.value) || 0);
    assign('#tcAvatar', 'profileImage');
    assign('#tcAccent', 'accent');
    assign('#tcMotion', 'topCoinsMotion', el => el.checked);
    assign('#tcBackground', 'showBackground', el => el.checked);
    document.querySelectorAll('[data-tc-design]').forEach(button => {
      button.onclick = () => {
        const id = button.dataset.tcDesign, meta = DESIGNS[id];
        w.topCoinsDesign = id; w.skin = id; w.accent = meta.accent;
        save(); render();
      };
    });
  };

  window.VyraTopCoins = Object.freeze({ designs: DESIGNS, designId, topCoinsHtml });
})();
