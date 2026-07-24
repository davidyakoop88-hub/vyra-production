(function () {
  'use strict';

  var MAX_ITEMS = 30;
  var selected = null;
  var format = 'mobile';
  var state;

  try {
    state = JSON.parse(localStorage.getItem('vyra-state') || '{}');
  } catch (_) {
    state = {};
  }
  state.user = state.user || 'Streamer';
  state.widgets = Array.isArray(state.widgets) ? state.widgets : [];
  format = state.layoutFormat === 'widescreen' ? 'widescreen' : 'mobile';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function save() {
    state.layoutFormat = format;
    localStorage.setItem('vyra-state', JSON.stringify(state));
  }

  function label(widget) {
    return widget.templateTitle || widget.title || widget.group || widget.type || 'Widget';
  }

  function widgetHtml(widget) {
    var x = Number.isFinite(Number(widget.x)) ? Number(widget.x) : 0;
    var y = Number.isFinite(Number(widget.y)) ? Number(widget.y) : 0;
    return '<button class="widget ' + escapeHtml(widget.type || '') +
      (selected === widget.id ? ' selected' : '') +
      '" type="button" data-widget-id="' + escapeHtml(widget.id) +
      '" style="left:' + x + 'px;top:' + y + 'px">' +
      '<b>' + escapeHtml(label(widget)) + '</b>' +
      '<span>' + escapeHtml(widget.value || '') + '</span></button>';
  }

  function render() {
    var items = state.widgets.slice(0, MAX_ITEMS);
    document.getElementById('userName').textContent = state.user;
    document.getElementById('view').innerHTML =
      '<div class="editor-shell">' +
        '<div class="elements">' +
          '<div class="panel-title">LIVE-LAGER</div>' +
          '<div class="live-layer-list">' +
            (items.length ? items.map(function (widget) {
              return '<article class="' + (selected === widget.id ? 'active' : '') +
                '" data-layer-id="' + escapeHtml(widget.id) + '">' +
                '<button class="layer-select" type="button"><span><b>' +
                escapeHtml(label(widget)) + '</b><small>' +
                (widget.hidden ? 'Dold för publiken' : 'Synlig för publiken') +
                '</small></span></button></article>';
            }).join('') : '<p>Inga widgets har lagts till ännu.</p>') +
          '</div>' +
          '<a class="live-layer-add" href="studio.html?open=overlay">+ Lägg till widget</a>' +
        '</div>' +
        '<div class="workarea">' +
          '<div class="editor-toolbar">' +
            '<div class="layout-format-picker" role="group" aria-label="Overlayformat">' +
              '<span>Format</span>' +
              '<button type="button" data-format="mobile" class="' + (format === 'mobile' ? 'active' : '') + '">Mobil <small>9:16</small></button>' +
              '<button type="button" data-format="widescreen" class="' + (format === 'widescreen' ? 'active' : '') + '">Dator <small>16:9</small></button>' +
            '</div>' +
            '<button id="saveProject" type="button">Spara</button>' +
          '</div>' +
          '<div class="canvas" data-layout-format="' + format + '" style="--layout-width:' +
            (format === 'widescreen' ? '768px;--layout-height:432px' : '432px;--layout-height:768px') + '">' +
            items.filter(function (widget) { return !widget.hidden; }).map(widgetHtml).join('') +
          '</div>' +
        '</div>' +
        '<div class="properties"><div class="panel-title">EGENSKAPER</div>' +
          propertiesHtml() +
        '</div>' +
      '</div>';
    bind();
  }

  function propertiesHtml() {
    var widget = state.widgets.find(function (item) { return item.id === selected; });
    if (!widget) return '<p>Välj ett element på canvas.</p>';
    return '<h3>' + escapeHtml(label(widget)) + '</h3>' +
      '<label>Rubrik<input id="propertyTitle" value="' + escapeHtml(widget.title || '') + '"></label>' +
      '<label>Värde<input id="propertyValue" value="' + escapeHtml(widget.value || '') + '"></label>' +
      '<button class="delete" id="deleteWidget" type="button">Ta bort</button>';
  }

  function bind() {
    document.querySelectorAll('[data-layer-id]').forEach(function (element) {
      element.querySelector('button').onclick = function () {
        selected = element.dataset.layerId;
        render();
      };
    });
    document.querySelectorAll('[data-widget-id]').forEach(function (element) {
      element.onclick = function () {
        selected = element.dataset.widgetId;
        render();
      };
    });
    document.querySelectorAll('[data-format]').forEach(function (button) {
      button.onclick = function () {
        format = button.dataset.format;
        save();
        render();
      };
    });
    document.getElementById('saveProject').onclick = function () {
      save();
      var toast = document.querySelector('.toast');
      toast.textContent = 'Layout sparad';
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 1700);
    };
    var widget = state.widgets.find(function (item) { return item.id === selected; });
    if (!widget) return;
    document.getElementById('propertyTitle').onchange = function (event) {
      widget.title = event.target.value;
      save();
      render();
    };
    document.getElementById('propertyValue').onchange = function (event) {
      widget.value = event.target.value;
      save();
      render();
    };
    document.getElementById('deleteWidget').onclick = function () {
      state.widgets = state.widgets.filter(function (item) { return item.id !== selected; });
      selected = null;
      save();
      render();
    };
  }

  render();
})();
