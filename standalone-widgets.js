// Embeds the 14 standalone OBS-widget pages (public/widgets/*.html, built on base-widget.js's own
// SSE engine) as real, draggable items inside Studio's existing Overlay/Layout canvas — so a
// streamer never has to juggle a separate widget URL per source. Each embed is a same-origin
// iframe; Caddyfile.production's frame-ancestors was loosened from 'none' to 'self' specifically to
// allow this (still refuses every other origin). "last-x-alerts" is deliberately excluded from the
// catalog below — VYRA's native Last-X Alerts (last-x-alerts.js) already covers that with 5 designs
// and is what everything else in Studio talks to; listing this older standalone build alongside it
// would just be a confusing near-duplicate.
(function () {
  const CATALOG = [
    ['gift-alert', 'Gift Alert', 'Visar senaste gåvan'],
    ['follow-alert', 'Follow Alert', 'Visar ny följare'],
    ['like-counter', 'Like Counter', 'Räknar likes live'],
    ['top-gifters', 'Top Gifters', 'Rankad gåvolista'],
    ['combo-counter', 'Combo Counter', 'Gåvo-combo räknare'],
    ['goal-tracker', 'Goal Tracker', 'Mål med progressbar'],
    ['diamond-counter', 'Diamond Counter', 'Totala diamanter'],
    ['vip-zone', 'VIP Zone', 'Toppgivare/prenumeranter'],
    ['welcome-viewer', 'Welcome Viewer', 'Hälsar nya tittare'],
    ['screen-takeover', 'Screen Takeover', 'Helskärms-alert'],
    ['crystal-garden', 'Crystal Garden', 'Gift Campaign · 1-6 mål'],
    ['battle-mvp', 'Battle MVP', '9s hyllningsanimation'],
    ['goal-crystal-path', 'Goal · Crystal Path', 'Målmätare, kristalltema'],
    ['goal-neon-pulse', 'Goal · Neon Pulse', 'Målmätare, neontema']
  ];
  const TYPE = 'standaloneWidget';

  // The same "Säker OBS-länk" token Studio already issues/revokes via overlay-access.js's manager
  // dialog — reused here instead of minting a second, parallel token system. Two different places
  // this token can come from, checked in this order:
  // 1. The page's OWN URL (?access=xyz) — this is the real OBS/overlay.html case: overlay.html
  //    forwards its own ?access= into studio.html?overlay=1&access=xyz (see overlay.html), which is
  //    a fresh browser context (OBS's browser source) with no sessionStorage carried over from the
  //    Studio tab that created the link.
  // 2. sessionStorage['vyra-overlay-access-url'] — the editor-canvas-preview case: openManager()
  //    stores the full URL there right after creating a link IN THIS SAME Studio tab, so a widget
  //    just added to the canvas can preview immediately without needing to reload with ?access=.
  function currentAccessToken() {
    const fromUrl = new URLSearchParams(location.search).get('access');
    if (fromUrl) return fromUrl;
    try {
      const raw = sessionStorage.getItem('vyra-overlay-access-url');
      if (!raw) return '';
      return new URL(raw, location.origin).searchParams.get('access') || '';
    } catch { return ''; }
  }

  function standaloneHtml(w) {
    const entry = CATALOG.find(c => c[0] === w.widgetSlug);
    const token = currentAccessToken();
    const box = `left:${w.x}px;top:${w.y}px;width:${w.width || 320}px;height:${w.height || 220}px`;
    if (!token) {
      return `<div class="widget standalone-widget-frame no-token${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="${box}">
        <div class="sw-missing-token"><b>${entry ? entry[1] : 'VYRA-widget'}</b><small>Skapa en Säker OBS-länk (Overlay → Länk & åtkomst) för att aktivera förhandsvisning.</small></div>
        ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
      </div>`;
    }
    const src = `public/widgets/${w.widgetSlug}.html?uid=${encodeURIComponent(token)}${w.widgetVariant ? '&variant=' + encodeURIComponent(w.widgetVariant) : ''}`;
    return `<div class="widget standalone-widget-frame${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="${box}">
      <iframe src="${src}" loading="lazy" title="${entry ? entry[1] : 'VYRA-widget'}"></iframe>
      ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
    </div>`;
  }

  const standaloneWh = wh;
  wh = function (w) { return w.type === TYPE ? standaloneHtml(w) : standaloneWh(w) };

  // Own props() panel (not an append into a shared .property-group, which the base props()
  // fallback never creates for an unrecognized type) — X/Y/Width/Layer field IDs match media.js's
  // generic advancedPropertyBind exactly, so those get real editing for free without duplicating
  // that binding logic here. Height has no numeric field anywhere in the app (every widget with an
  // explicit height, e.g. templateCustomVideo, relies on the canvas resize-handle drag instead).
  const standaloneProps = props;
  props = function () {
    const w = state.widgets.find(x => x.id === selected);
    if (!w || w.type !== TYPE) return standaloneProps();
    const entry = CATALOG.find(c => c[0] === w.widgetSlug);
    return `<h3>${(entry ? entry[1] : 'VYRA-WIDGET').toUpperCase()}</h3><div hidden><input id="pt" value="${w.title || ''}"><input id="pv" value=""></div>
      <div class="property-group"><h4>KÄLLA</h4><p class="topgift-help">${entry ? entry[2] : ''} · public/widgets/${w.widgetSlug}.html</p><label>Variant (valfritt)<input id="swVariant" placeholder="t.ex. cyber, celestial" value="${w.widgetVariant || ''}"></label></div>
      <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 320}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  const standaloneCatalogBind = bind;
  bind = function () {
    standaloneCatalogBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const catalog = document.querySelector('.widget-catalog');
    if (catalog && !catalog.querySelector('[data-standalone-widgets]')) {
      const section = document.createElement('section');
      section.dataset.standaloneWidgets = '1';
      section.className = 'toplike-template-section';
      section.innerHTML = '<h4>VYRA WIDGETS · OBS-KÄLLOR</h4>' + CATALOG.map(([slug, name, desc]) =>
        `<button data-standalone="${slug}"><i>▣</i><span><b>${name}</b><small>${desc}</small></span></button>`
      ).join('');
      catalog.prepend(section);
      section.querySelectorAll('[data-standalone]').forEach(button => button.onclick = () => {
        const slug = button.dataset.standalone, entry = CATALOG.find(c => c[0] === slug);
        const id = TYPE + Date.now();
        state.widgets.push({ id, type: TYPE, widgetSlug: slug, x: 80, y: 120, width: 320, height: 220, title: entry[1] });
        selected = id; save(); render();
        toast(currentAccessToken() ? entry[1] + ' skapad' : entry[1] + ' skapad — skapa en Säker OBS-länk för att se förhandsvisning');
      });
    }
    const w = state.widgets.find(x => x.id === selected);
    if (!w || w.type !== TYPE) return;
    const variant = document.querySelector('#swVariant');
    if (variant) variant.onchange = e => { w.widgetVariant = e.target.value.trim(); save(); render() };
  };

  // Re-render active standalone widgets whenever a new OBS-link is created so they pick up the
  // fresh token immediately instead of staying stuck on "no token yet" until the next unrelated edit.
  addEventListener('vyra-overlay-access-created', () => {
    if (typeof state !== 'undefined' && state.widgets.some(w => w.type === TYPE)) render();
  });

  const style = document.createElement('style');
  style.textContent = `
    .standalone-widget-frame{padding:0!important;background:transparent!important;border:1px dashed #7359ea99!important;overflow:hidden}
    .standalone-widget-frame iframe{width:100%;height:100%;border:0;pointer-events:none;display:block}
    .standalone-widget-frame.no-token{display:grid;place-items:center;background:#17101fcc!important}
    .sw-missing-token{padding:14px;text-align:center;color:#c9a8de;font-size:10px;line-height:1.5}
    .sw-missing-token b{display:block;color:#fff;font-size:12px;margin-bottom:4px}
  `;
  document.head.append(style);
})();
