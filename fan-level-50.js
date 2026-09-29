// fan-level-50.js — Fan Level 50-tavlan.
//
// En milstolpe-widget: bara fans som natt Fan Level 50 visas, var och en pa en fardig kort-mall
// (bakgrundsbild med inbrand "LEVEL 50") med sin profilbild, sitt namn och lag. Tva rorelselagen:
// slideshow (ett kort i taget, byter var N:e sekund) och rullande band.
//
// ROSTERN. Auto-fansen (de som natt niva 50 i live) samlas i minnet av fan-level-50-session.js och
// forsvinner med sidan — inget sparas. Den handtaggade listan (fanl50Manual) sparas i layouten.
// fanl50Source valjer: 'both' (auto + manuell), 'auto', eller 'manual'.
//
// Geometrin (foto/namn/lag) bor i fan-level-50.css — en mall, en uppsattning matt. Renderaren
// returnerar sin egen rot, sa den bar sjalv width/z-index/display:none (styledWh hoppas over nar en
// wh-patch returnerar tidigt) — en dold widget far aldrig ritas i overlay.
(function (root) {
  'use strict';
  const safe = VyraSafe;
  const DESIGNS = VyraWidgets.variants('fanlevel50.design');           // {flylove:'Fly Love'}
  const ART = { flylove: { art: 'assets/fanlevel50/fly-love-50.jpg?v=20260929-1', level: 50 } };
  const FALLBACK = 'assets/images/test-profile.svg';

  const auto = [];                 // live-roster {name,avatar,team}, bara i minnet
  const idx = new Map();           // widgetId -> aktuellt slideshow-index
  const lastSwap = new Map();      // widgetId -> tidsstampel for senaste byte
  const cssEsc = s => (root.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&');
  const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

  function demo() {
    return [{ name: 'MICHELLY', avatar: '', team: '' }, { name: 'GARY B.', avatar: '', team: '' }, { name: 'NOVA STORM', avatar: '', team: '' }];
  }
  function manualOf(w) { return Array.isArray(w.fanl50Manual) ? w.fanl50Manual : []; }
  function members(w) {
    const src = w.fanl50Source || 'both';
    let list = [];
    if (src !== 'manual') list = list.concat(auto);
    if (src !== 'auto') list = list.concat(manualOf(w));
    const seen = new Set(), out = [];
    for (const m of list) { const k = String(m && m.name || '').toLowerCase().trim(); if (!k || seen.has(k)) continue; seen.add(k); out.push(m); }
    return out.length ? out : demo();
  }

  function cardHtml(w, m, rank) {
    const d = ART[w.fanl50Design] || ART.flylove;
    const team = safe.text(m.team || w.fanl50Team || '');
    return `<div class="fl50-card">
      <img class="fl50-art" src="${d.art}" alt="">
      <div class="fl50-photo"><img src="${safe.url(m.avatar, FALLBACK)}" alt=""></div>
      <div class="fl50-name"><span>${safe.text(m.name, 'FAN')}</span></div>
      ${team ? `<div class="fl50-team"><span>#${team}</span></div>` : ''}
      ${rank ? `<div class="fl50-rank">#${rank}</div>` : ''}
    </div>`;
  }

  function fanLevel50Html(w) {
    const list = members(w);
    const mode = w.fanl50Mode === 'band' ? 'band' : 'slideshow';
    let inner;
    if (mode === 'band') {
      const cards = list.map((m, i) => cardHtml(w, m, i + 1)).join('');
      inner = `<div class="fl50-track">${cards}${cards}</div>`;
    } else {
      let i = idx.get(w.id) || 0; if (i >= list.length) i = 0;
      inner = cardHtml(w, list[i], i + 1);
    }
    const interval = num(w.fanl50Interval, 6, 2, 60);
    return `<div class="widget fan-level-50 fl50-mode-${mode}${selected === w.id ? ' selected' : ''}" data-id="${safe.text(w.id)}" style="left:${num(w.x, 0, -10000, 10000)}px;top:${num(w.y, 0, -10000, 10000)}px;width:${num(w.width, 300, 120, 2000)}px;zoom:${num(w.widgetScale, 1, .1, 5)};z-index:${num(w.layer, 1, 0, 99)};${w.hidden ? 'display:none;' : ''}--fl50-speed:${interval}s"><div class="fl50-viewport">${inner}</div>${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  }

  // ---- render-kedja: patcha wh for den nya typen -------------------------------------------------
  const prevWh = wh;
  wh = function (w) { return w && w.type === 'templateFanLevel50' ? fanLevel50Html(w) : prevWh(w); };

  // ---- inspector --------------------------------------------------------------------------------
  const prevProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateFanLevel50') return prevProps();
    const interval = num(w.fanl50Interval, 6, 2, 60);
    const manualLines = manualOf(w).map(m => m.avatar ? `${m.name}|${m.avatar}` : String(m.name || '')).join('\n');
    const opt = (val, cur, label) => `<option value="${val}"${cur === val ? ' selected' : ''}>${label}</option>`;
    return `<h3>FAN LEVEL 50</h3><div class="template-badge">MILSTOLPE · LIVE + MANUELL</div>
      <div hidden><input id="pt" value="${safe.text(w.title, 'Fan Level 50')}"><input id="pv" value=""></div>
      <div class="property-group"><h4>VISNING</h4>
        <label>Läge<select id="fl50Mode">${opt('slideshow', w.fanl50Mode || 'slideshow', 'Slideshow')}${opt('band', w.fanl50Mode, 'Rullande band')}</select></label>
        <label class="range-label">Bytestid <b>${interval} sek</b><input id="fl50Interval" type="range" min="2" max="20" value="${interval}"></label>
        <label>Källa<select id="fl50Source">${opt('both', w.fanl50Source || 'both', 'Auto + manuell')}${opt('auto', w.fanl50Source, 'Bara auto (live)')}${opt('manual', w.fanl50Source, 'Bara manuell')}</select></label>
        <label>Lagnamn (#)<input id="fl50Team" value="${safe.text(w.fanl50Team, 'FANCLUB')}"></label>
      </div>
      <div class="property-group"><h4>MANUELL LISTA</h4><small>En per rad: <code>namn</code> eller <code>namn|profilbild-url</code></small>
        <textarea id="fl50Manual" rows="4" spellcheck="false">${safe.text(manualLines, '')}</textarea></div>
      <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid">
        <label>X<input id="propX" type="number" value="${num(w.x, 0, -10000, 10000)}"></label>
        <label>Y<input id="propY" type="number" value="${num(w.y, 0, -10000, 10000)}"></label>
        <label>Bredd<input id="propWidth" type="number" min="120" max="1200" value="${num(w.width, 300, 120, 2000)}"></label>
        <label>Lager<input id="propLayer" type="number" min="0" max="99" value="${num(w.layer, 1, 0, 99)}"></label>
      </div></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  const prevBind = bind;
  bind = function () {
    prevBind();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateFanLevel50') return;
    const on = (id, fn) => { const el = document.querySelector(id); if (el) fn(el); };
    on('#fl50Mode', el => { el.value = w.fanl50Mode || 'slideshow'; el.onchange = e => { w.fanl50Mode = e.target.value; save(); render(); }; });
    on('#fl50Source', el => { el.value = w.fanl50Source || 'both'; el.onchange = e => { w.fanl50Source = e.target.value; save(); render(); }; });
    on('#fl50Interval', el => { el.oninput = e => { w.fanl50Interval = +e.target.value; const b = el.parentElement.querySelector('b'); if (b) b.textContent = (+e.target.value) + ' sek'; }; el.onchange = e => { w.fanl50Interval = +e.target.value; save(); }; });
    on('#fl50Team', el => { el.onchange = e => { w.fanl50Team = e.target.value; save(); render(); }; });
    on('#fl50Manual', el => {
      el.onchange = e => {
        w.fanl50Manual = String(e.target.value || '').split('\n').map(rad => rad.trim()).filter(Boolean).map(rad => {
          const bit = rad.split('|'); return { name: bit[0].trim(), avatar: (bit[1] || '').trim() };
        });
        save(); render();
      };
    });
  };

  // ---- katalogsektion ---------------------------------------------------------------------------
  const prevCatalog = bind;
  bind = function () {
    prevCatalog();
    if (view !== 'editor' && view !== 'overlay') return;
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog || catalog.querySelector('[data-fl50]')) return;
    const section = document.createElement('section');
    section.dataset.fl50 = '1';
    section.className = 'fan-level-50-template-section';
    section.innerHTML = '<h4>FAN LEVEL 50 · MILSTOLPE</h4>' + Object.entries(DESIGNS).map(([key, label]) =>
      `<button data-fl50-design="${key}" data-catalog-key="catalog:fanlevel50:${key}"><i>♛</i><span><b>Fan Level 50 · ${label}</b><small>Auto + manuell · namn · foto</small></span></button>`).join('');
    catalog.prepend(section);
    section.querySelectorAll('button').forEach(b => {
      const key = b.dataset.catalogKey;
      b.onclick = () => { const created = VyraWidgets.create(key); state.widgets.push(created); selected = created.id; save(); render(); toast('Fan Level 50 skapad'); };
    });
  };

  // ---- slideshow-motor: byter kort utan att bygga om hela canvasen ------------------------------
  function swap() {
    if (view !== 'editor' && view !== 'overlay') return;
    const now = Date.now();
    const list0 = (root.state && Array.isArray(root.state.widgets)) ? root.state.widgets : [];
    list0.forEach(w => {
      if (!w || w.type !== 'templateFanLevel50' || w.fanl50Mode === 'band') return;
      const list = members(w); if (list.length < 2) return;
      const interval = num(w.fanl50Interval, 6, 2, 60) * 1000;
      if (now - (lastSwap.get(w.id) || 0) < interval) return;
      const box = document.querySelector(`[data-id="${cssEsc(w.id)}"]`); if (!box) return;
      lastSwap.set(w.id, now);
      let i = (idx.get(w.id) || 0) + 1; if (i >= list.length) i = 0; idx.set(w.id, i);
      const card = box.querySelector('.fl50-card'); if (!card) return;
      const m = list[i];
      card.classList.add('fl50-out');
      root.setTimeout(() => {
        const ph = card.querySelector('.fl50-photo img'); if (ph) ph.src = safe.src(m.avatar || FALLBACK, FALLBACK);
        const nm = card.querySelector('.fl50-name span'); if (nm) nm.textContent = safe.text(m.name, 'FAN');
        const teamText = safe.text(m.team || w.fanl50Team || '');
        const tm = card.querySelector('.fl50-team span'); if (tm) tm.textContent = teamText ? ('#' + teamText) : '';
        const rk = card.querySelector('.fl50-rank'); if (rk) rk.textContent = '#' + (i + 1);
        card.classList.remove('fl50-out'); card.classList.add('fl50-in');
        root.setTimeout(() => card.classList.remove('fl50-in'), 520);
      }, 420);
    });
  }
  root.setInterval(swap, 1000);

  // ---- publikt API for sessionen ----------------------------------------------------------------
  let renderTimer = null;
  function schedule() { if (renderTimer) return; renderTimer = root.setTimeout(() => { renderTimer = null; if (typeof render === 'function') render(); }, 300); }
  root.VyraFanLevel50 = {
    roster: () => auto.slice(),
    members,
    addAuto(m) {
      const namn = String(m && m.name || '').trim(); if (!namn) return;
      if (auto.some(x => x.name.toLowerCase() === namn.toLowerCase())) return;
      auto.push({ name: namn, avatar: String(m.avatar || ''), team: String(m.team || '') });
      schedule();
    },
    remove(namn) { const k = String(namn || '').toLowerCase(); const i = auto.findIndex(x => x.name.toLowerCase() === k); if (i >= 0) { auto.splice(i, 1); schedule(); } },
    clear() { auto.length = 0; schedule(); }
  };

  // Stilmallen laddas av media.js-svansen (stylesheet-pairs.test.js vaktar att paret halls ihop dar).
  if (typeof render === 'function') render();
})(window);
