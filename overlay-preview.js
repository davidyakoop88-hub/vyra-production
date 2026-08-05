// Overlay tab: what's currently visible on the live output, a live preview of the widget you
// just added (or are just previewing), plus the full widget catalog as cards — each showing a
// real scaled-down render of that widget (via wh(), the exact function the real canvas uses)
// instead of a generic icon, with Preview/Configure/Copy link/favorite actions per card.

let overlayPreviewWidgetId = null;
let overlayDraftPreviewHtml = null;
let overlayDraftPreviewName = null;

const OWG_FAV_KEY = 'vyra-favorite-widgets';
function owgGetFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(OWG_FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function owgSaveFavorites(set) { window.VyraSessionState.writeActive(OWG_FAV_KEY, JSON.stringify([...set])); }

function owgOverlayUrl() {
  return location.protocol === 'file:' ? 'http://127.0.0.1:4173/overlay.html' : new URL('overlay.html', location.href).href;
}

function owgWidgetUrl(widgetId) {
  if (typeof overlayShareUrl === 'function') return overlayShareUrl(widgetId);
  const url = new URL(owgOverlayUrl(), location.href);
  if (widgetId) url.searchParams.set('widget', widgetId);
  return url.href;
}

async function owgCopyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.append(input);
  input.select();
  input.setSelectionRange(0, input.value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  input.remove();
  return copied;
}

async function owgCopyWidgetLink(widgetId, label = 'Widgetlänken') {
  const url = owgWidgetUrl(widgetId);
  if (location.protocol !== 'file:' && !new URL(url).searchParams.has('access')) {
    document.querySelector('.oa-open')?.click();
    toast('Skapa en säker OBS-länk först');
    return false;
  }
  const copied = await owgCopyText(url);
  toast(copied ? label + ' kopierad' : 'Kunde inte kopiera länken');
  return copied;
}

function overlayPreviewHtml() {
  const visibleWidgets = state.widgets.filter(w => !w.hidden);
  const previewWidget = state.widgets.find(w => w.id === overlayPreviewWidgetId);
  const stageHtml = overlayDraftPreviewHtml || (previewWidget ? wh(previewWidget) : null);
  const stageName = overlayDraftPreviewHtml ? overlayDraftPreviewName : (previewWidget ? liveLayerName(previewWidget) : null);
  const emptyStateIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>';
  return `<div class="page-header section-head"><div><h2>Overlay</h2><p>Widgets du lägger till här dyker upp direkt i din layout.</p></div></div>
  <div class="overlay-preview-sidebar">
    <span class="section-header-eyebrow">Vad som visas nu · ${visibleWidgets.length}</span>
    <div class="overlay-widget-list">${visibleWidgets.length ? visibleWidgets.map(w => `<article><i>◇</i><span>${liveLayerName(w)}</span><button type="button" data-copy-widget-link="${w.id}" title="Kopiera endast denna widget">Kopiera länk</button></article>`).join('') : `<div class="empty-state">${emptyStateIcon}<h3>Inga widgets ännu</h3><p>Lägg till en widget från katalogen nedan så visas den här direkt.</p></div>`}</div>
  </div>
  ${stageHtml ? `<div class="overlay-live-preview">
    <span class="section-header-eyebrow">Så här ser den ut · ${stageName}</span>
    <div class="overlay-live-preview-stage">${stageHtml}</div>
  </div>` : ''}
  <div class="overlay-widget-gallery">
    <span class="section-header-eyebrow">Alla widgets</span>
    <p>Klicka på en widget för att lägga till den i din layout, eller använd Preview/Configure/länk-knapparna på kortet.</p>
    <div class="search-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input class="widget-search" placeholder="Sök widget..."></div>
    <div class="widget-catalog"></div>
  </div>`;
}

// Dry-runs a catalog button's own creation logic (push+save+render+toast), reads back the widget
// it would have created via wh() — the exact renderer the real canvas uses — then undoes the push.
// render/toast are reassignable (matching this codebase's monkey-patch convention) so they're
// swapped for no-ops here to avoid a real re-render/toast per button; save() is declared `const`
// in studio.js and can't be swapped the same way, so it writes for real — and this function
// therefore does its own corrective save() after restoring, at the bottom.
//
// It used to rely on styleOverlayCatalogCards() doing ONE corrective save() after the whole batch.
// That stopped being true when thumbnails went lazy: owgThumbObserver renders one card at a time
// as it scrolls into view, long after that save has run. Every lazily rendered card then left its
// throwaway widget in localStorage — which is what cloud-sync's one-second ticker reads and pushes.
// En miniatyr behover ETT widgetobjekt att rendera — ingenting mer. Tidigare togs det genom att
// anropa kortets riktiga "lagg till i layout"-handler och sedan angra, vilket lade widgeten i
// anvandarens layout pa vagen. Handlern sparar, och save() gar inte att stanga av: den ar `const`
// i studio.js. Sa lange alla kort ritades i en batch stadade en avslutande save() upp; nar
// miniatyrerna blev lazy — ett kort i taget vid scroll — fanns ingen sadan stadning kvar, och
// varje renderat kort lamnade sin engangswidget efter sig. Uppmatt i produktion: ett klick i
// katalogen gav 9 widgets i localStorage medan state.widgets stod pa 0.
//
// Varje kort bar redan vilket objekt det representerar, sa objektet kan byggas direkt. Ingen
// handler anropas, ingenting laggs i layouten, ingenting sparas.
function overlayPreviewWidget(btn) {
  const d = (btn && btn.dataset) || {};

  if (d.catalogKey) {
    // window, inte root: den har filen ar ett vanligt toppnivaskript utan IIFE, sa `root`
    // ar odeklarerat och kastade ReferenceError for VARJE knapp. try/catch svalde det, sa
    // resolvern gav null och ingen miniatyr ritades nagonsin.
    try { return window.VyraWidgets.create(d.catalogKey) } catch (e) { return null }
  }

  // last-x-alerts.js:373 — samma falt som knappen sjalv satter.
  if (d.lastXAdd) {
    return { id: 'owg-preview-lastx', type: 'templateLastX', x: 0, y: 0, width: 500,
      title: 'Last-X Alerts', lastXType: 'all', lastXDesign: d.lastXAdd,
      lastXEntrance: 'slide-left', followDuration: 5 };
  }

  // custom-widgets.js:27 — text, bild och video, med knappens egna defaults.
  if (d.cw) {
    const type = d.cw === 'text' ? 'templateCustomText'
      : d.cw === 'image' ? 'templateCustomImage'
      : d.cw === 'video' ? 'templateCustomVideo' : null;
    if (!type) return null;
    const extra = d.cw === 'text'
      ? { width: 420, height: 90, customText: 'Skriv din text har' }
      : { width: 300, height: d.cw === 'video' ? 450 : 300 };
    return { id: 'owg-preview-' + d.cw, type, x: 0, y: 0, ...extra };
  }

  return null;   // okant kort: behaller sin ikon, precis som nar previewen misslyckades forut
}

function overlayCatalogPreviewHtml(originalClick) {
  const savedWidgets = state.widgets.slice();
  const savedSelected = selected, savedPreviewId = overlayPreviewWidgetId;
  const realRender = render, realToast = toast;
  render = () => {}; toast = () => {};
  let html = null, name = null;
  try {
    originalClick();
    const w = liveWidget(selected);
    if (w) { html = wh(w); name = liveLayerName(w); }
  } catch (e) { /* leave html null, card falls back to its plain icon */ }
  state.widgets = savedWidgets;
  selected = savedSelected;
  overlayPreviewWidgetId = savedPreviewId;
  render = realRender; toast = realToast;
  // Skriv tillbaka det aterstallda laget direkt. save() gar inte att stanga av — den ar `const` i
  // studio.js — sa originalClick() har redan hunnit spara torrkorningens widget till localStorage.
  // Minnet aterstalls ovan, men utan den har raden star LAGRINGEN kvar smutsig, och det ar
  // lagringen cloud-syncs sekundtickare laser och skickar till servern.
  //
  // Det var tackt sa lange alla miniatyrer ritades i en batch: styleOverlayCatalogCards() gjorde
  // en korrigerande save() pa slutet. Sedan blev miniatyrerna lazy — owgThumbObserver ritar ett
  // kort i taget nar det scrollas in, langt efter att den sparningen redan kort. Varje lat
  // renderat kort lamnade darfor kvar sin engangswidget.
  //
  // Uppmatt i produktion: ett klick i katalogen gav 9 widgets i localStorage medan state.widgets
  // stod pa 0.
  save();
  return { html, name };
}

function scaleThumbnailToFit(thumb) {
  const inner = thumb.querySelector('.owg-thumb-inner');
  const widget = inner && inner.firstElementChild;
  if (!widget) return;
  const w = widget.offsetWidth || 300, h = widget.offsetHeight || 150;
  const scale = Math.min((thumb.clientWidth - 16) / w, (thumb.clientHeight - 16) / h, 1);
  inner.style.transform = `translate(-50%,-50%) scale(${scale})`;
}

// Renders a real thumbnail for one card, on demand — used by the lazy observer below so only
// cards that actually scroll near the viewport ever run overlayCatalogPreviewHtml()'s dry-run,
// instead of all ~50+ catalog widgets at once (which is what used to lock the renderer).
function owgRenderCardThumb(btn) {
  const preview = overlayPreviewWidget(btn);
  let thumbHtml = null;
  if (preview) {
    try { thumbHtml = wh(preview) } catch (e) { thumbHtml = null }
  } else if (btn._owgOriginalClick) {
    // Enbart for kort som saknar all igenkant markning. Torrkorningen ar kvar som sista utvag,
    // men ingen av katalogens 108 knappar tar den vagen i dag.
    thumbHtml = overlayCatalogPreviewHtml(btn._owgOriginalClick).html;
  }
  if (!thumbHtml) return;
  const icon = btn.querySelector('i');
  const thumb = document.createElement('div');
  thumb.className = 'owg-thumb';
  thumb.innerHTML = `<div class="owg-thumb-inner">${thumbHtml}</div>`;
  btn.prepend(thumb);
  if (icon) icon.remove();
  scaleThumbnailToFit(thumb);
}

const owgThumbObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    owgThumbObserver.unobserve(entry.target);
    owgRenderCardThumb(entry.target);
  });
}, { rootMargin: '200px', threshold: 0.01 });

// A stable per-card key for favorites — derived from the rendered name + its section heading,
// since the underlying catalog buttons don't share one consistent dataset attribute across the
// ~14 files that inject them (data-mvp-style, data-theme-template, data-ranking, etc.).
function owgCardKey(btn) {
  const clone = btn.cloneNode(true);
  clone.querySelector('.owg-thumb')?.remove();
  clone.querySelectorAll('.owg-add,.owg-actions,.owg-star').forEach(el => el.remove());
  const name = clone.querySelector('b')?.textContent?.trim() || clone.textContent.trim();
  const section = btn.closest('section')?.querySelector('h4')?.textContent?.trim() || '';
  return section + '::' + name;
}

// Sections/buttons here are the same catalog markup Layout uses (media.js/toplike-studio.js/
// last-x-alerts.js/custom-widgets.js/gift-fireworks.js all inject into any .widget-catalog they find).
// Clicking the card body still pushes straight into state.widgets like it always has. The extra
// actions (Preview/Configure/Copy link/star) are separate <span>s with stopPropagation — real
// nested <button> tags aren't valid inside the catalog's own <button>, so these stay non-button
// elements with click handlers, matching the .owg-add convention already established here.
function styleOverlayCatalogCards() {
  const gallery = document.querySelector('.overlay-widget-gallery .widget-catalog');
  if (!gallery) return;
  const favorites = owgGetFavorites();
  let generatedAny = false;
  gallery.querySelectorAll('button').forEach(btn => {
    if (btn.dataset.owgWrapped) return;
    const originalClick = btn.onclick;

    // Markeringen satts EFTER att kortet observerats, inte fore. Forr satts den forst, och en knapp
    // vars onclick annu inte hunnit kopplas foll ut pa raden under - permanent, eftersom nasta varv
    // sag markeringen och hoppade over den. Da observerades den aldrig och fick aldrig nagon
    // miniatyr.
    //
    // onclick behovs inte langre for att RITA miniatyren: varje katalogknapp bar en katalognyckel,
    // och resolvern bygger widgeten ur den. Klicket sparas bara som sista utvag for ett kort utan
    // igenkand markning.
    //
    // Att rita alla miniatyrer vid sidladdning skapade och angrade varje katalogwidget pa en gang,
    // vilket kunde lasa renderaren med premiumpaket installerade. Kortet ritas darfor forst nar det
    // narmar sig vyn - owgThumbObserver kor owgRenderCardThumb() ett kort i taget.
    if (originalClick) btn._owgOriginalClick = originalClick;
    owgThumbObserver.observe(btn);
    btn.dataset.owgWrapped = '1';
    if (!originalClick) return;

    const key = owgCardKey(btn);
    const star = document.createElement('span');
    star.className = 'btn btn-icon btn-ghost owg-star' + (favorites.has(key) ? ' owg-star-active' : '');
    star.textContent = favorites.has(key) ? '★' : '☆';
    star.title = 'Favorit';
    star.onclick = e => {
      e.stopPropagation();
      const favs = owgGetFavorites();
      if (favs.has(key)) { favs.delete(key); star.classList.remove('owg-star-active'); star.textContent = '☆'; }
      else { favs.add(key); star.classList.add('owg-star-active'); star.textContent = '★'; }
      owgSaveFavorites(favs);
    };
    btn.prepend(star);

    const actions = document.createElement('div');
    actions.className = 'owg-actions';

    const configureBtn = document.createElement('span');
    configureBtn.className = 'btn btn-secondary btn-sm owg-configure';
    configureBtn.textContent = '⚙ Configure';
    configureBtn.onclick = e => {
      e.stopPropagation();
      originalClick.call(btn, e);
      overlayPreviewWidgetId = selected;
      openConfigureModal(selected, true);
    };

    const previewBtn = document.createElement('span');
    previewBtn.className = 'btn btn-secondary btn-sm owg-preview';
    previewBtn.textContent = '▶ Preview';
    previewBtn.onclick = e => {
      e.stopPropagation();
      const fresh = overlayCatalogPreviewHtml(originalClick);
      overlayDraftPreviewHtml = fresh.html;
      overlayDraftPreviewName = fresh.name;
      overlayPreviewWidgetId = null;
      render();
    };

    const linkBtn = document.createElement('span');
    linkBtn.className = 'btn btn-icon btn-ghost owg-copylink';
    linkBtn.textContent = '🔗';
    linkBtn.title = 'Lägg till widgeten och kopiera dess egen länk';
    linkBtn.onclick = async e => {
      e.stopPropagation();
      // The catalog key is internal metadata published by the catalog handler itself — it is never
      // assembled here and never comes from anything the streamer typed.
      const catalogKey = btn.dataset.catalogKey;
      if (!catalogKey) return toast('Widgeten kunde inte skapas');
      // Without a secure link there is nothing to copy, so the token flow opens first and no
      // candidate is built.
      if (location.protocol !== 'file:' && !new URL(owgWidgetUrl('')).searchParams.has('access')) {
        document.querySelector('.oa-open')?.click();
        return toast('Skapa en säker länk först');
      }
      let result;
      try {
        result = await window.VyraStandalone.create(catalogKey);
      } catch (err) {
        // Whatever the flow refuses with is already a finished sentence; nothing from a server
        // response or a URL reaches the streamer.
        return toast(err && err.message ? err.message : 'Widgeten kunde inte skapas');
      }
      // Only now, with the server's yes in hand, is there a link to copy. A clipboard failure after
      // this point is a copy problem, not a reason to remove a widget the server accepted.
      overlayPreviewWidgetId = result.widget.id;
      overlayDraftPreviewHtml = null;
      overlayDraftPreviewName = null;
      await owgCopyWidgetLink(result.widget.id);
      render();
    };

    const row = document.createElement('div');
    row.className = 'owg-action-row';
    row.append(previewBtn, linkBtn);
    actions.append(configureBtn, row);
    btn.append(actions);

    const add = document.createElement('span');
    add.className = 'btn btn-primary owg-add';
    add.textContent = '+ Lägg till i Layout';
    btn.append(add);

    btn.onclick = function (e) {
      originalClick.call(btn, e);
      overlayPreviewWidgetId = selected;
      overlayDraftPreviewHtml = null;
      overlayDraftPreviewName = null;
      render();
    };
  });
  if (generatedAny) save();
}

function bindOverlayPreview() {
  styleOverlayCatalogCards();
  document.querySelectorAll('[data-copy-widget-link]').forEach(button => {
    button.onclick = async event => {
      event.stopPropagation();
      await owgCopyWidgetLink(button.dataset.copyWidgetLink);
    };
  });
}

// The Configure modal: the widget is already added (selected === owgConfigureWidgetId) by the
// time this opens, so this reuses the SAME props()/wh() functions Layout's own properties panel
// uses — no per-widget settings UI to duplicate. The tricky part is that every existing bind()
// wrap across ~14 files gates its input-wiring on `view==='editor'`, and this modal is shown while
// view is still 'overlay'. Rather than touch every one of those files, bindConfigureModal()
// briefly flips the global `view` to 'editor' (a plain variable, not tied to which DOM is visible)
// so that existing chain runs and finds this modal's inputs by the same ids it always looks for
// (#propX, #dataColor, etc.), then flips it back — the modal's own DOM is untouched by that,
// since render() only ever rewrites #view's contents and this modal lives outside of it.
let owgConfigureWidgetId = null;
let owgConfigureIsNew = false;

function openConfigureModal(widgetId, isNew = false) {
  owgConfigureWidgetId = widgetId;
  owgConfigureIsNew = isNew;
  renderConfigureModal();
}

function closeConfigureModal(commit = false) {
  const widgetId = owgConfigureWidgetId;
  if (!commit && owgConfigureIsNew && widgetId) {
    state.widgets = state.widgets.filter(x => x.id !== widgetId);
    if (selected === widgetId) selected = null;
  }
  if (commit) save();
  owgConfigureWidgetId = null;
  owgConfigureIsNew = false;
  document.querySelector('.owg-configure-modal')?.remove();
  if (commit && widgetId) {
    selected = widgetId;
    location.href = 'layout.html';
  } else {
    save();
    render();
  }
}

function renderConfigureModal() {
  const w = state.widgets.find(x => x.id === owgConfigureWidgetId);
  if (!w) { closeConfigureModal(false); return; }
  let modal = document.querySelector('.owg-configure-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'owg-configure-modal modal-backdrop';
    document.body.append(modal);
  }
  modal.innerHTML = `<div class="owg-configure-panel">
    <header><h3>Configure ${liveLayerName(w)}</h3><button class="btn btn-icon btn-ghost owg-configure-close" type="button">×</button></header>
    <div class="owg-configure-settings properties">${props()}</div>
  </div>
  <div class="owg-configure-preview">
    <span class="section-header-eyebrow">Preview</span>
    <div class="owg-configure-preview-stage">${wh(w)}</div>
  </div>
  <button class="btn btn-primary owg-configure-done" type="button">Klar · lägg till i Layout</button>
  <button id="testEvent" hidden></button><button id="saveProject" hidden></button>`;
  modal.querySelector('.owg-configure-close').onclick = () => closeConfigureModal(false);
  modal.querySelector('.owg-configure-done').onclick = () => closeConfigureModal(true);
  bindConfigureModal();
}

// studio.js's base bind() unconditionally wires #testEvent/#saveProject (the Layout
// toolbar buttons) whenever view==='editor', with no null-check — since this modal
// never renders the real Layout DOM, those two hidden dummy buttons above exist purely
// so that unguarded access doesn't throw and abort the rest of the bind() chain before
// it reaches each widget's own settings wiring (e.g. heartGoalBind).
function bindConfigureModal() {
  if (!owgConfigureWidgetId) return;
  const realView = view;
  view = 'editor';
  try { bind(); } finally { view = realView; }
}

const overlayPreviewRender = render;
render = function () {
  // While the Configure modal is open, only refresh the modal itself — the gallery behind it is
  // hidden anyway, and rebuilding all 52 cards' thumbnails on every settings tweak inside the
  // modal would be pure waste. closeConfigureModal() calls render() again once it's gone, which
  // brings the (by-then-visible) Overlay view back in sync in one go.
  if (owgConfigureWidgetId) { renderConfigureModal(); return; }
  if (view === 'overlay') {
    $('#view').innerHTML = overlayPreviewHtml();
    $('#title').textContent = 'Overlay';
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    bind();
    return;
  }
  overlayPreviewRender();
};
const overlayPreviewBind = bind;
bind = function () { overlayPreviewBind(); if (view === 'overlay') bindOverlayPreview(); };

// Replaces studio.js's plain "Välj ett element på canvas." placeholder (a bare <p>, styled like
// nothing in the panel) with an empty-state that actually matches the rest of the properties panel.
const overlayPreviewProps = props;
props = function () {
  const h = overlayPreviewProps();
  if (h === '<p>Välj ett element på canvas.</p>') return '<div class="properties-empty">Klicka på en widget i LIVE-LAGER eller på canvasen för att redigera den.</div>';
  return h;
};

window.VyraOverlayPreviewReady = true;
if (new URLSearchParams(location.search).get('open') === 'overlay') go('overlay');
