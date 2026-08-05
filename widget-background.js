(function () {
  // Universal "remove background / background strength" control for every widget on the canvas,
  // regardless of type. Implemented as a DOM post-process (not HTML-string patching like
  // toplike-studio.js) because ~40 widget templates exist across this codebase and they don't share
  // a common markup shape — querying the rendered [data-id] element and setting inline
  // background/background-image with !important reliably wins over whatever CSS that widget type
  // uses, without needing to know its internals.

  function applyBackground(el, w) {
    if (w.hideBackground) {
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('background-image', 'none', 'important');
    } else if (w.bgStrength != null) {
      el.style.setProperty('background', `rgba(0,0,0,${w.bgStrength / 100})`, 'important');
      el.style.setProperty('background-image', 'none', 'important');
    } else {
      el.style.removeProperty('background');
      el.style.removeProperty('background-image');
    }
  }

  function applyAllBackgrounds() {
    if (typeof state === 'undefined' || !state?.widgets) return;
    state.widgets.forEach(w => {
      const el = document.querySelector(`[data-id="${w.id}"]`);
      if (el) applyBackground(el, w);
    });
  }

  const wbBind = bind;
  bind = function () {
    wbBind();
    applyAllBackgrounds();
    if (view !== 'editor') return;

    const w = liveWidget(selected);
    const panel = document.querySelector('.properties');
    if (!w || !panel || panel.querySelector('.wb-group')) return;

    const group = document.createElement('div');
    group.className = 'property-group wb-group';
    group.innerHTML = `<h4>BAKGRUND</h4>
      <label><input id="wbHide" type="checkbox" ${w.hideBackground ? 'checked' : ''}> Ta bort bakgrund</label>
      <label class="range-label">Bakgrundsstyrka <b>${w.bgStrength ?? 100}%</b><input id="wbStrength" type="range" min="0" max="150" value="${w.bgStrength ?? 100}" ${w.hideBackground ? 'disabled' : ''}></label>`;

    const del = panel.querySelector('#del') || panel.querySelector('.delete');
    if (del) del.before(group); else panel.append(group);

    group.querySelector('#wbHide').onchange = e => { w.hideBackground = e.target.checked; save(); render(); };
    group.querySelector('#wbStrength').onchange = e => { w.bgStrength = +e.target.value; save(); render(); };
  };

  // Safety net: the overlay page can render before this dynamically-loaded script attaches (see the
  // same race documented in toplike-studio.js). A MutationObserver re-applies backgrounds whenever the
  // canvas DOM actually changes, regardless of load-order timing.
  new MutationObserver(applyAllBackgrounds).observe(document.documentElement, { childList: true, subtree: true });
  applyAllBackgrounds();
})();
