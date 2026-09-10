(function () {
  // Universal "remove background / background strength" control for every widget on the canvas,
  // regardless of type. Implemented as a DOM post-process (not HTML-string patching like
  // toplike-studio.js) because ~40 widget templates exist across this codebase and they don't share
  // a common markup shape — querying the rendered [data-id] element and setting inline
  // background/background-image with !important reliably wins over whatever CSS that widget type
  // uses, without needing to know its internals.

  // FÄRG, HÖRN OCH INNERKANT (2026-09-09). David om Egen text: "jag vill lägga till bakrund bakom
  // test". Det gick inte: `.custom-text-widget{background:transparent!important}` i studio.css, och
  // den här gruppen kunde bara välja hur SVART bakgrunden skulle vara. Av 21 widgetfamiljer hade
  // noll en riktig platta bakom texten — och en platta är precis det som gör vit text läsbar mot en
  // ljus video, alltså inte en dekoration.
  //
  // `bgStrength` BETYDER FORTFARANDE SAMMA SAK: hur ogenomskinlig plattan är. Den ligger redan
  // sparad i användarnas layouter, och en layout utan `bgColor` får svart precis som förut.
  const hexTillRgb = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  function applyBackground(el, w) {
    // "Ta bort bakgrund" är en nödbroms och vinner över allt annat, även när en färg står kvar i
    // fälten. Ordningen är låst av ett prov, för den är inte självklar åt andra hållet.
    if (w.hideBackground) {
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('background-image', 'none', 'important');
    } else if (w.bgStrength != null || w.bgColor) {
      const rgb = hexTillRgb(w.bgColor) || [0, 0, 0];
      const alpha = (w.bgStrength != null ? w.bgStrength : 100) / 100;
      el.style.setProperty('background', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`, 'important');
      el.style.setProperty('background-image', 'none', 'important');
    } else {
      el.style.removeProperty('background');
      el.style.removeProperty('background-image');
    }

    // HÖRN OCH INNERKANT TAS BARA BORT AV DEN SOM SATTE DEM. Första försöket körde ett villkorslöst
    // removeProperty när fältet var tomt — och nollade då den inline-padding och border-radius som
    // widgetarnas egna renderare sätter. Åtta browserprov föll på det: gåvoramen tappade sina mått
    // ("ramen ändrar varken profilbildens eller gåvobildens mått") och panelen hoppade 1345 -> 749
    // i scroll när ett reglage släpptes, eftersom widgeten bytte storlek mitt i.
    //
    // Markören på elementet säger vem som äger värdet. Utan den kan den här funktionen inte skilja
    // sin egen inline-stil från någon annans.
    const yta = (falt, css, varde) => {
      if (varde != null) {
        el.style.setProperty(css, varde, 'important');
        el.dataset[falt] = '1';
      } else if (el.dataset[falt]) {
        el.style.removeProperty(css);
        delete el.dataset[falt];
      }
    };
    yta('vyraBgRadius', 'border-radius', w.bgRadius != null ? w.bgRadius + 'px' : null);
    yta('vyraBgPadding', 'padding', w.bgPadding != null ? w.bgPadding + 'px' : null);
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
      <label><span>Färg</span><input id="wbColor" type="color" value="${w.bgColor || '#000000'}" ${w.hideBackground ? 'disabled' : ''}></label>
      <label class="range-label">Bakgrundsstyrka <b>${w.bgStrength ?? 100}%</b><input id="wbStrength" type="range" min="0" max="150" value="${w.bgStrength ?? 100}" ${w.hideBackground ? 'disabled' : ''}></label>
      <label class="range-label">Hörn <b>${w.bgRadius ?? 0}px</b><input id="wbRadius" type="range" min="0" max="60" value="${w.bgRadius ?? 0}" ${w.hideBackground ? 'disabled' : ''}></label>
      <label class="range-label">Innerkant <b>${w.bgPadding ?? 0}px</b><input id="wbPadding" type="range" min="0" max="48" value="${w.bgPadding ?? 0}" ${w.hideBackground ? 'disabled' : ''}></label>`;

    const del = panel.querySelector('#del') || panel.querySelector('.delete');
    if (del) del.before(group); else panel.append(group);

    group.querySelector('#wbHide').onchange = e => { w.hideBackground = e.target.checked; save(); render(); };

    // De fyra reglagen målar LIVE via applyAllBackgrounds() och sparar först på change. Att bygga om
    // panelen vid varje pixel hade slagit ut reglaget man håller i — samma skäl som resten av
    // panelen numera följer, dokumenterat i checkpoint 35.
    const koppla = (id, falt, enhet) => {
      const el = group.querySelector('#' + id);
      if (!el) return;
      const las = () => (el.type === 'color' ? el.value : +el.value);
      el.oninput = () => {
        w[falt] = las();
        applyAllBackgrounds();
        const b = el.closest('.range-label')?.querySelector('b');
        if (b) b.textContent = el.value + enhet;
      };
      el.onchange = () => { w[falt] = las(); save(); applyAllBackgrounds(); };
    };
    koppla('wbColor', 'bgColor', '');
    koppla('wbStrength', 'bgStrength', '%');
    koppla('wbRadius', 'bgRadius', 'px');
    koppla('wbPadding', 'bgPadding', 'px');
  };

  // Safety net: the overlay page can render before this dynamically-loaded script attaches (see the
  // same race documented in toplike-studio.js). A MutationObserver re-applies backgrounds whenever the
  // canvas DOM actually changes, regardless of load-order timing.
  new MutationObserver(applyAllBackgrounds).observe(document.documentElement, { childList: true, subtree: true });
  applyAllBackgrounds();
})();
