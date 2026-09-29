// battle-fx.js — Chrome Battle FX. VYRA:s motsvarighet till ttlive:s "After Effect / Event
// Animation": en fullskarms 9:16 cover-effekt som spelar en KROM-bild med en skriptad entre nar ett
// battle-event triggas (Bonus x2/x3, Boosting Glove, Snipe, Tap Tap).
//
// VARFOR BILD + CSS OCH INTE VIDEO. Rorelsen i ttlive ar en 2D-motion-graphics-entre (glod -> texten
// slar upp underifran till ett LAGT lage -> flash -> hall -> ut), inte organisk video. Sant gors
// exakt och konsekvent i kod. Bilderna ar ChatGPT-genererade krom-effekter med akta alfa (svart/vit
// bakgrund redan bortnyckad), sa de ligger additivt over sandningen utan ruta. Rorelsen bor i
// battle-fx.css; den har filen bestammer NAR (trigger) och VILKEN bild (kind).
//
// TRIGGERN. battle-fx-session.js lindar routeLiveBattleEvent och anropar triggerBattleFX({kind}) for
// tap/snipe/glove/x2/x3 — samma kallor som Glove Snipe redan lyssnar pa. Test-knapparna i panelen
// anropar samma triggerBattleFX, sa editor och live delar kodvag.
(function (root) {
  'use strict';
  const safe = root.VyraSafe;
  const KINDS = ['x2', 'x3', 'glove', 'snipe', 'tap'];
  const FILE = { x2: 'x2', x3: 'x3', glove: 'glove', snipe: 'snipe', tap: 'taptap' };
  const LABEL = { x2: 'Bonus ×2', x3: 'Bonus ×3', glove: 'Boosting Glove', snipe: 'Snipe', tap: 'Tap Tap' };
  const VER = '?v=20260929-1';
  const artOf = k => 'assets/images/battle/chrome/' + (FILE[k] || 'x2') + '.png' + VER;
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const kindOf = w => KINDS.includes(w && w.bfxKind) ? w.bfxKind : 'x2';
  const cssEsc = s => (root.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&');

  // ---- renderare: fullskarms cover, vilande (opacity 0 via CSS tills bfx-active) --------------------
  function battleFxHtml(w) {
    const kind = kindOf(w);
    const low = num(w.bfxLow, 14, -50, 70);
    const enter = num(w.bfxEnter, 0.62, 0.2, 2);
    return `<div class="widget battle-fx${selected === w.id ? ' selected' : ''}" data-id="${safe.text(w.id)}" data-kind="${kind}" style="z-index:${num(w.layer, 40, 0, 99)};${w.hidden ? 'display:none;' : ''}--bfx-low:${low}%;--bfx-enter:${enter}s">
      <div class="bfx-stage"><img class="bfx-art" src="${artOf(kind)}" alt=""><div class="bfx-flash"></div></div>
      ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
    </div>`;
  }

  const prevWh = wh;
  wh = function (w) { return w && w.type === 'templateBattleFX' ? battleFxHtml(w) : prevWh(w); };

  // ---- panel -------------------------------------------------------------------------------------
  const prevProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateBattleFX') return prevProps();
    const dur = num(w.bfxDuration, 6, 2, 15);
    const low = num(w.bfxLow, 14, -50, 70);
    const rows = KINDS.map(k =>
      `<button class="bfx-test" data-kind="${k}" type="button">▶ ${LABEL[k]}</button>`).join('');
    return `<h3>CHROME BATTLE FX</h3><div class="template-badge">EVENT-EFFEKT · x2/x3/glove/snipe/tap</div>
      <div hidden><input id="pt" value="${safe.text(w.title, 'Chrome Battle FX')}"><input id="pv" value=""></div>
      <div class="property-group"><h4>EFFEKTER</h4>
        <small>Spelas fullskarm nar battle-eventet triggas. Testa varje:</small>
        <div class="bfx-tests">${rows}</div></div>
      <div class="property-group"><h4>VISNING</h4>
        <label class="range-label">Visningstid <b>${dur} sek</b><input id="bfxDuration" type="range" min="2" max="15" value="${dur}"></label>
        <label class="range-label">Lage (lagt) <b>${low}%</b><input id="bfxLow" type="range" min="-50" max="70" value="${low}"></label>
        <div class="switch-row one"><label><input id="bfxAuto" type="checkbox" ${w.autoTrigger === false ? '' : 'checked'}> Automatisk trigger</label></div>
      </div>
      <div class="property-group"><h4>LAGER</h4><label>Lager<input id="propLayer" type="number" min="0" max="99" value="${num(w.layer, 40, 0, 99)}"></label></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  const prevBind = bind;
  bind = function () {
    prevBind();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateBattleFX') return;
    document.querySelectorAll('.bfx-test').forEach(btn => {
      btn.onclick = () => triggerBattleFX({ kind: btn.dataset.kind, __test: true });
    });
    const dur = document.querySelector('#bfxDuration');
    if (dur) { dur.oninput = e => { w.bfxDuration = +e.target.value; const b = dur.parentElement.querySelector('b'); if (b) b.textContent = (+e.target.value) + ' sek'; }; dur.onchange = e => { w.bfxDuration = +e.target.value; save(); }; }
    const low = document.querySelector('#bfxLow');
    if (low) { low.oninput = e => { w.bfxLow = +e.target.value; const box = document.querySelector(`[data-id="${cssEsc(w.id)}"]`); if (box) box.style.setProperty('--bfx-low', (+e.target.value) + '%'); const b = low.parentElement.querySelector('b'); if (b) b.textContent = (+e.target.value) + '%'; }; low.onchange = e => { w.bfxLow = +e.target.value; save(); }; }
    const auto = document.querySelector('#bfxAuto');
    if (auto) auto.onchange = e => { w.autoTrigger = e.target.checked; save(); };
  };

  // ---- katalog -----------------------------------------------------------------------------------
  const prevCatalog = bind;
  bind = function () {
    prevCatalog();
    if (view !== 'editor' && view !== 'overlay') return;
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog || catalog.querySelector('[data-bfx]')) return;
    const section = document.createElement('section');
    section.dataset.bfx = '1';
    section.className = 'battle-fx-template-section';
    section.innerHTML = '<h4>⚡ CHROME BATTLE FX</h4>' +
      `<button data-catalog-key="catalog:battlefx:chrome"><i>⚡</i><span><b>Chrome Battle FX</b><small>x2 · x3 · glove · snipe · tap</small></span></button>`;
    catalog.prepend(section);
    section.querySelector('button').onclick = () => {
      const created = VyraWidgets.create('catalog:battlefx:chrome');
      state.widgets.push(created); selected = created.id; save(); render();
      toast('Chrome Battle FX skapad');
    };
  };

  // ---- trigger -----------------------------------------------------------------------------------
  function triggerBattleFX(event = {}) {
    const kind = KINDS.includes(String(event.kind).toLowerCase()) ? String(event.kind).toLowerCase() : 'x2';
    const widgets = (root.state && Array.isArray(root.state.widgets) ? root.state.widgets : [])
      .filter(w => w && w.type === 'templateBattleFX' && !w.hidden);
    if (!widgets.length) return;
    widgets.forEach(w => {
      if (!event.__test && w.autoTrigger === false) return;
      const box = document.querySelector(`[data-id="${cssEsc(w.id)}"]`); if (!box) return;
      const img = box.querySelector('.bfx-art');
      if (img) img.src = artOf(kind);
      box.dataset.kind = kind;
      box.classList.remove('bfx-active'); void box.offsetWidth; box.classList.add('bfx-active');
      clearTimeout(box._bfxTimer);
      box._bfxTimer = root.setTimeout(() => box.classList.remove('bfx-active'), num(w.bfxDuration, 6, 2, 15) * 1000);
    });
    if (root.toast && event.__test) toast('Battle FX · ' + (LABEL[kind] || kind));
  }
  root.triggerBattleFX = triggerBattleFX;
  root.VyraBattleFX = { KINDS, triggerBattleFX, artOf };

  if (typeof render === 'function') render();
})(window);
