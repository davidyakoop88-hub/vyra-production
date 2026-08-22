(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var createOverlay = event.target.closest('[data-go="editor"]');
    if (!createOverlay) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = 'layout.html';
  }, true);

  if (typeof go !== 'function' || typeof editor !== 'function') return;

  // The sidebar's "Layout" link used to be a plain <a href="layout.html">, which is a stub
  // page that immediately redirects to studio.html?open=layout — so every click did TWO full
  // page reloads (tear down + rebuild the whole app shell twice) instead of the instant
  // client-side switch every other sidebar item does. That's what caused the visible gap/flash
  // in the sidebar on click, and very likely a major contributor to the reported freeze (each
  // reload re-runs auth-client.js + entitlement-gate.js + cloud-sync.js's full initialization).
  // Intercept it here and switch views the same way the rest of the sidebar does; layout.html
  // itself is left untouched as a working fallback for anyone linking directly to it.
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href="layout.html"]');
    if (!link) return;
    event.preventDefault();
    go('editor');
  }, true);

  var fullGo = go;
  var MAX_LAYOUT_ITEMS = 30;

  function layoutItems() {
    return state.widgets.slice(0, MAX_LAYOUT_ITEMS);
  }

  // OVERLAY-UTDATA KOR MED view === 'editor', och traffar darfor den har renderaren — inte
  // studio.js editor(). Det ar samma arkitekturfaktum som lat Studions lankrad hamna i en LIVE-
  // sandning (#264). Har gav det en annan skada: layoutItems() ar `state.widgets.slice(0, 30)`
  // och konsulterar aldrig ?widget=, sa en INDIVIDUELL widgetlank ritade hela overlayn.
  // Uppmatt i produktion 2026-08-22: widget=<id> gav samma sex widgetar som hela overlayn.
  //
  // Filtret var aldrig trasigt — vyraRenderWidgets() gav ratt urval. Det blev overskrivet:
  // overlay-access.js apply() avslutar med root.render(), som ar wrappad harnere, och varje
  // konfigurationsuppdatering kor samma vag.
  function iOverlayLage() {
    // Samma kalla som studio.html:18 satter overlay-output pa. Las ur URL:en och inte ur en
    // global fran en annan fil: det gor funktionen oberoende av laddningsordningen.
    return new URLSearchParams(location.search).has('overlay');
  }

  // ETT urvalsbeslut i hela appen. VyraWidgets.selectForRender ager redan semantiken och ar
  // provad i tests/widget-placement.test.js: hela overlayn utesluter standalone, en individuell
  // lank hittar sin widget aven om den ar standalone eller dold, och ett okant id ger
  // 'missing-widget'.
  //
  // 30-taket foljer INTE med hit. Det ar en redigeringsgrans pa Studios Layout-sida — en
  // sandning ska inte tappa sin trettioforsta widget for att redigeraren har ett tak.
  function dukensWidgetar() {
    if (!iOverlayLage()) return { widgets: layoutItems(), error: null };
    if (!window.VyraWidgets) return { widgets: state.widgets, error: null };
    var wanted = new URLSearchParams(location.search).get('widget') || '';
    return window.VyraWidgets.selectForRender(state.widgets, { widgetId: wanted });
  }

  function labelFor(widget) {
    return widget.templateTitle || widget.title || widget.group || widget.type || 'Widget';
  }

  function renderLayerList(host) {
    host.innerHTML =
      '<section class="live-layer-panel">' +
        '<header><div><b>LIVE-LAGER</b><span>Visar ' + Math.min(state.widgets.length, MAX_LAYOUT_ITEMS) + ' av ' + state.widgets.length + ' sparade lager</span></div></header>' +
        '<div class="live-layer-list">' +
          (state.widgets.length
            ? layoutItems().map(function (widget) {
                return '<article class="' + (selected === widget.id ? 'active ' : '') + (widget.hidden ? 'is-hidden' : '') + '" data-safe-layer="' + widget.id + '">' +
                  '<button class="layer-select" type="button"><i>◇</i><span><b>' + labelFor(widget) + '</b><small>' +
                  (widget.hidden ? 'Dold för publiken' : 'Synlig för publiken') +
                  '</small></span></button>' +
                  '<button class="layer-eye" type="button">' + (widget.hidden ? '○ Dold' : '● Synlig') + '</button>' +
                '</article>';
              }).join('')
            : '<p>Inga widgets har lagts till ännu.</p>') +
        '</div>' +
        '<button class="live-layer-add" id="safeAddWidget" type="button">+ Lägg till widget</button>' +
      '</section>';

    host.querySelectorAll('[data-safe-layer]').forEach(function (row) {
      var widget = liveWidget(row.dataset.safeLayer);
      if (!widget) return;
      row.querySelector('.layer-select').onclick = function () {
        selected = widget.id;
        renderSafeLayout();
      };
      row.querySelector('.layer-eye').onclick = function () {
        widget.hidden = !widget.hidden;
        save();
        renderSafeLayout();
      };
    });
    host.querySelector('#safeAddWidget').onclick = function () { fullGo('overlay'); };
  }

  function bindCanvas() {
    document.querySelectorAll('.editor-shell .widget').forEach(function (element) {
      var drag;
      element.onclick = function () {
        selected = element.dataset.id;
        renderSafeLayout();
      };
      element.onpointerdown = function (event) {
        drag = {
          x: event.clientX,
          y: event.clientY,
          left: parseInt(element.style.left, 10) || 0,
          top: parseInt(element.style.top, 10) || 0
        };
        element.setPointerCapture(event.pointerId);
      };
      element.onpointermove = function (event) {
        if (!drag) return;
        element.style.left = drag.left + event.clientX - drag.x + 'px';
        element.style.top = drag.top + event.clientY - drag.y + 'px';
      };
      element.onpointerup = function () {
        if (!drag) return;
        var widget = state.widgets.find(function (item) { return item.id === element.dataset.id; });
        if (widget) {
          widget.x = parseInt(element.style.left, 10) || 0;
          widget.y = parseInt(element.style.top, 10) || 0;
          save();
        }
        drag = null;
      };
    });
  }

  function bindProperties() {
    var widget = liveWidget(selected);
    if (!widget) return;
    var title = document.querySelector('#pt');
    var value = document.querySelector('#pv');
    var remove = document.querySelector('#del');
    if (title) title.onchange = function (event) { widget.title = event.target.value; save(); renderSafeLayout(); };
    if (value) value.onchange = function (event) { widget.value = event.target.value; save(); renderSafeLayout(); };
    if (remove) remove.onclick = function () {
      state.widgets = state.widgets.filter(function (item) { return item.id !== selected; });
      if (!state.widgets.length) window.__vyraUserEmptiedWidgets = true;
      selected = null;
      save();
      renderSafeLayout();
    };
  }

  function renderSafeLayout() {
    view = 'editor';
    document.querySelectorAll('[data-view], [data-extra]').forEach(function (button) {
      button.classList.remove('active');
    });
    document.querySelectorAll('aside nav a').forEach(function (link) {
      var isLayout = /(?:^|\/)layout\.html(?:$|[?#])/.test(link.getAttribute('href') || '');
      link.classList.toggle('active', isLayout);
      if (isLayout) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    var val = dukensWidgetar();
    // EN DOD WIDGETLANK GER EN TOM TRANSPARENT OVERLAY — inget felmeddelande. Studions egen
    // "Widgetlanken finns inte langre"-ruta hor hemma i Studio; i OBS-utdata hade den stat mitt
    // i sandningen, synlig for tittarna. Samma klass av fel som lankraden i #264.
    var items = val.error === 'missing-widget' ? [] : val.widgets;
    document.querySelector('#view').innerHTML =
      '<div class="editor-shell">' +
        '<div class="elements"></div>' +
        '<div class="workarea">' +
          // Ingen Spara-knapp: autosparet skriver vid varje andring, och .cloud-status visar
          // nar det senast lyckades. En knapp som gor det som redan skett fick anvandaren att
          // tro att sparning kravde ett tryck.
          '<div class="editor-toolbar"><button id="testEvent">▶ Testevent</button></div>' +
          '<div class="canvas">' + items.map(wh).join('') + '</div>' +
        '</div>' +
        '<div class="properties"><div class="panel-title">EGENSKAPER</div>' + props() + '</div>' +
      '</div>';
    document.querySelector('#title').textContent = 'Layout';
    var elements = document.querySelector('.editor-shell .elements');
    if (elements) renderLayerList(elements);
    // Call the real bind() chain (studio.js + every file that wraps it: media.js's
    // OBS/TikTok overlay-link-bar, gift-fireworks.js's widget-specific property fields,
    // etc.) instead of the bindCanvas()/bindProperties() reimplementation below, which only
    // ever covered drag + title/value/delete and left every other bind()-wired feature dark
    // on this page (missing OBS/TikTok copy buttons + link being the reported symptom).
    if (typeof bind === 'function') bind();
    else { bindCanvas(); bindProperties(); }
  }

  go = function (nextView) {
    if (nextView === 'editor') {
      renderSafeLayout();
      return;
    }
    if (nextView === 'overlay') {
      if (window.VyraOverlayPreviewReady) fullGo('overlay');
      else toast('Widgetkatalogen laddas…');
      return;
    }
    fullGo(nextView);
  };

  // bind()'s own #pt/#pv/#del handlers (and every widget-specific bind() wrapper's own
  // save-then-render() calls) call the plain global render(), not renderSafeLayout() — without
  // this wrap, editing a title/value or deleting a widget on this page would silently replace
  // it with studio.js's original editor() screen the instant render() ran, since render() has
  // no idea this page exists. Mirrors the go() wrap above for the same reason.
  var fullRender = render;
  render = function () {
    if (view === 'editor') {
      renderSafeLayout();
      return;
    }
    fullRender();
  };

  if (new URLSearchParams(location.search).get('open') === 'layout') {
    setTimeout(function () { go('editor'); }, 0);
  }
})();

