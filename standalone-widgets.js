// Embeds standalone OBS-widget pages (public/widgets/*.html, built on base-widget.js's own
// SSE engine) as real, draggable items inside Studio's existing Overlay/Layout canvas — so a
// streamer never has to juggle a separate widget URL per source. Each embed is a same-origin
// iframe; Caddyfile.production's frame-ancestors was loosened from 'none' to 'self' specifically to
// allow this (still refuses every other origin). 2026-08-01: the 14 first-generation standalone
// widgets (gift-alert, follow-alert, goal-crystal-path m.fl.) were retired on David's request —
// their pages are deleted and only Goal · Image Frame remains; RETIRED below keeps already-placed
// copies of the old ones from crashing saved layouts (they render a friendly "utgått" card, same
// compatibility approach as the old Last-X Alerts shim).
(function () {
  const CATALOG = [
    ['goal-image-frame', 'Goal · Image Frame', 'Målmätare, 25 ramdesigner', [['rose-pink','Goal · Rose Pink','Mätarram · rosa ros'],['royal-gold','Goal · Royal Gold','Mätarram · guldkrona'],['winged-amethyst','Goal · Winged Amethyst','Mätarram · bevingat hjärta'],['lotus-violet','Goal · Lotus Violet','Mätarram · lotus'],['crescent-star','Goal · Crescent Star','Mätarram · halvmåne'],['crystal-bloom','Goal · Crystal Bloom','Mätarram · kristallblom'],['heart-wings','Goal · Heart Wings','Mätarram · hjärtkrona'],['moon-clouds','Goal · Moon Clouds','Mätarram · måne & moln'],['crystal-spike','Goal · Crystal Spike','Mätarram · kristallspets'],['rose-heart','Goal · Rose Heart','Mätarram · roshjärta'],['badge-gold-wings','Badge · Gold Wings','Progress-ring · guldvingar'],['badge-crystal-violet','Badge · Crystal Violet','Progress-ring · lila kristall'],['badge-pink-heartwings','Badge · Pink Heartwings','Progress-ring · rosa hjärta'],['badge-dark-raven','Badge · Dark Raven','Progress-ring · svarta vingar'],['badge-ice-blue','Badge · Ice Blue','Progress-ring · isblå'],['badge-rose-garden','Badge · Rose Garden','Progress-ring · rosenträdgård'],['badge-moon-mist','Badge · Moon Mist','Progress-ring · måndimma'],['amethyst-spire','Goal · Amethyst Spire','Mätarram · kristallspira'],['luna-pearl','Goal · Luna Pearl','Mätarram · guldmåne'],['heart-crown','Goal · Heart Crown','Mätarram · hjärtkrona'],['rosen-arch','Goal · Rosen Arch','Mätarram · rosenbåge'],['angelic-heart','Goal · Angelic Heart','Mätarram · änglahjärta'],['halo-ring','Goal · Halo Ring','Mätarram · gloriaring'],['frost-crystal','Goal · Frost Crystal','Mätarram · issnöflinga'],['nordic-heart','Goal · Nordic Heart','Mätarram · mörkt hjärta']]]
  ];
  const RETIRED = new Set(['gift-alert','follow-alert','like-counter','top-gifters','combo-counter',
    'goal-tracker','diamond-counter','vip-zone','welcome-viewer','screen-takeover','crystal-garden',
    'battle-mvp','goal-crystal-path','goal-neon-pulse']);
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
    if (RETIRED.has(w.widgetSlug)) {
      return `<div class="widget standalone-widget-frame no-token${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="${box}">
        <div class="sw-missing-token"><b>${w.title || 'VYRA-widget'}</b><small>Den här widgeten har utgått — ta bort den och använd Goal · Image Frame istället.</small></div>
        ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
      </div>`;
    }
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
      section.innerHTML = '<h4>VYRA WIDGETS · OBS-KÄLLOR · VARJE DESIGN SEPARAT</h4>' + CATALOG.flatMap(([slug, name, desc, designs]) =>
        (designs || [[null, name, desc]]).map(([designId, designLabel, designDesc]) =>
          `<button data-standalone="${slug}"${designId ? ` data-standalone-design="${designId}"` : ''}><i>▣</i><span><b>${designLabel}</b><small>${designDesc || desc}</small></span></button>`
        )
      ).join('');
      catalog.prepend(section);
      section.querySelectorAll('[data-standalone]').forEach(button => button.onclick = () => {
        const slug = button.dataset.standalone, design = button.dataset.standaloneDesign || '', entry = CATALOG.find(c => c[0] === slug);
        const label = button.querySelector('b').textContent;
        const id = TYPE + Date.now();
        state.widgets.push({ id, type: TYPE, widgetSlug: slug, widgetVariant: design, x: 80, y: 120, width: 320, height: 220, title: label });
        selected = id; save(); render();
        toast(currentAccessToken() ? label + ' skapad' : label + ' skapad — skapa en Säker OBS-länk för att se förhandsvisning');
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
