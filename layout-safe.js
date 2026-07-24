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

  var fullGo = go;
  var MAX_LAYOUT_ITEMS = 30;

  function layoutItems() {
    return state.widgets.slice(0, MAX_LAYOUT_ITEMS);
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
      var widget = state.widgets.find(function (item) { return item.id === row.dataset.safeLayer; });
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
    var widget = state.widgets.find(function (item) { return item.id === selected; });
    if (!widget) return;
    var title = document.querySelector('#pt');
    var value = document.querySelector('#pv');
    var remove = document.querySelector('#del');
    if (title) title.onchange = function (event) { widget.title = event.target.value; save(); renderSafeLayout(); };
    if (value) value.onchange = function (event) { widget.value = event.target.value; save(); renderSafeLayout(); };
    if (remove) remove.onclick = function () {
      state.widgets = state.widgets.filter(function (item) { return item.id !== selected; });
      selected = null;
      save();
      renderSafeLayout();
    };
  }

  function renderSafeLayout() {
    view = 'editor';
    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === 'editor');
    });
    var items = layoutItems();
    document.querySelector('#view').innerHTML =
      '<div class="editor-shell">' +
        '<div class="elements"></div>' +
        '<div class="workarea">' +
          '<div class="editor-toolbar"><button id="testEvent">▶ Testevent</button><button id="saveProject">Spara</button></div>' +
          '<div class="canvas">' + items.map(wh).join('') + '</div>' +
        '</div>' +
        '<div class="properties"><div class="panel-title">EGENSKAPER</div>' + props() + '</div>' +
      '</div>';
    document.querySelector('#title').textContent = 'Layout';
    var elements = document.querySelector('.editor-shell .elements');
    if (elements) renderLayerList(elements);
    bindCanvas();
    bindProperties();
    var test = document.querySelector('#testEvent');
    var saveButton = document.querySelector('#saveProject');
    if (test) test.onclick = send;
    if (saveButton) saveButton.onclick = function () { save(); toast('Layout sparad'); };
  }

  go = function (nextView) {
    if (nextView === 'editor') {
      renderSafeLayout();
      return;
    }
    fullGo(nextView);
  };
})();
