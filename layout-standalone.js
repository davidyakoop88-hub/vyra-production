(function () {
  'use strict';

  var MAX_ITEMS = 30;
  var selected = null;
  var format = 'mobile';
  var state = { user: 'Streamer', widgets: [] };
  var totalItems = 0;
  var rawOriginal = '';
  var deletedIds = [];

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
    localStorage.setItem('vyra-layout-state', JSON.stringify(state));
    if (!rawOriginal || rawOriginal.length > 2 * 1024 * 1024) return;
    try {
      var source = JSON.parse(rawOriginal);
      var updates = new Map(state.widgets.map(function (widget) { return [String(widget.id), widget]; }));
      source.widgets = (Array.isArray(source.widgets) ? source.widgets : [])
        .filter(function (widget) { return !deletedIds.includes(String(widget.id)); })
        .map(function (widget) {
          var update = updates.get(String(widget.id));
          return update ? Object.assign({}, widget, update) : widget;
        });
      source.layoutFormat = format;
      rawOriginal = JSON.stringify(source);
      window.VyraSessionState.writeActive('vyra-state', rawOriginal);
    } catch (_) {}
  }

  function label(widget) {
    return widget.templateTitle || widget.title || widget.group || widget.type || 'Widget';
  }

  function widgetHtml(widget) {
    var x = Number.isFinite(Number(widget.x)) ? Number(widget.x) : 0;
    var y = Number.isFinite(Number(widget.y)) ? Number(widget.y) : 0;
    var width = Number.isFinite(Number(widget.width)) ? Number(widget.width) : 150;
    var height = Number.isFinite(Number(widget.height)) ? Number(widget.height) : 70;
    return '<button class="widget ' + escapeHtml(widget.type || '') +
      (selected === widget.id ? ' selected' : '') +
      '" type="button" data-widget-id="' + escapeHtml(widget.id) +
      '" style="left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;height:' + height + 'px">' +
      '<b>' + escapeHtml(label(widget)) + '</b>' +
      '<span>' + escapeHtml(widget.value || '') + '</span></button>';
  }

  function render() {
    var items = state.widgets.slice(0, MAX_ITEMS);
    document.getElementById('userName').textContent = state.user;
    document.getElementById('view').innerHTML =
      '<div class="editor-shell">' +
        '<div class="elements">' +
          '<div class="panel-title">LIVE-LAGER' +
            (totalItems > items.length ? ' · VISAR ' + items.length + ' AV ' + totalItems : '') +
          '</div>' +
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
    var widget = liveWidget(selected);
    if (!widget) return '<p>Välj ett element på canvas.</p>';
    return '<h3>' + escapeHtml(label(widget)) + '</h3>' +
      '<label>Rubrik<input id="propertyTitle" value="' + escapeHtml(widget.title || '') + '"></label>' +
      '<label>Värde<input id="propertyValue" value="' + escapeHtml(widget.value || '') + '"></label>' +
      '<label class="visibility-setting">Synlig i overlay<input id="propertyVisible" type="checkbox" ' + (widget.hidden ? '' : 'checked') + '></label>' +
      '<div class="property-group"><h4>POSITION</h4><div class="property-grid">' +
        '<label>X<input id="propertyX" type="number" value="' + (Number(widget.x) || 0) + '"></label>' +
        '<label>Y<input id="propertyY" type="number" value="' + (Number(widget.y) || 0) + '"></label>' +
      '</div></div>' +
      '<div class="property-group"><h4>STORLEK</h4><div class="property-grid">' +
        '<label>Bredd<input id="propertyWidth" type="number" min="60" max="1000" value="' + (Number(widget.width) || 150) + '"></label>' +
        '<label>Höjd<input id="propertyHeight" type="number" min="40" max="1000" value="' + (Number(widget.height) || 70) + '"></label>' +
      '</div></div>' +
      '<div class="property-actions"><button id="resetWidgetPosition" type="button">Centrera widget</button></div>' +
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
      var drag;
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
        var moved = state.widgets.find(function (item) { return item.id === element.dataset.widgetId; });
        if (moved) {
          moved.x = parseInt(element.style.left, 10) || 0;
          moved.y = parseInt(element.style.top, 10) || 0;
          save();
        }
        drag = null;
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
    var widget = liveWidget(selected);
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
    document.getElementById('propertyVisible').onchange = function (event) {
      widget.hidden = !event.target.checked;
      save();
      render();
    };
    ['X', 'Y', 'Width', 'Height'].forEach(function (name) {
      document.getElementById('property' + name).onchange = function (event) {
        var key = name.toLowerCase();
        var value = Number(event.target.value) || 0;
        if (key === 'width') value = Math.max(60, Math.min(1000, value));
        if (key === 'height') value = Math.max(40, Math.min(1000, value));
        widget[key] = value;
        save();
        render();
      };
    });
    document.getElementById('resetWidgetPosition').onclick = function () {
      widget.x = format === 'widescreen' ? 309 : 141;
      widget.y = format === 'widescreen' ? 181 : 349;
      save();
      render();
    };
    document.getElementById('deleteWidget').onclick = function () {
      deletedIds.push(String(selected));
      state.widgets = state.widgets.filter(function (item) { return item.id !== selected; });
      selected = null;
      save();
      render();
    };
  }

  function loadState() {
    try {
      rawOriginal = localStorage.getItem('vyra-state') || '{}';
    } catch (_) {
      rawOriginal = '{}';
    }
    var savedLayout;
    try {
      savedLayout = JSON.parse(localStorage.getItem('vyra-layout-state') || 'null');
    } catch (_) {
      savedLayout = null;
    }
    if (savedLayout && Array.isArray(savedLayout.widgets)) {
      state = savedLayout;
      state.user = state.user || 'Streamer';
      totalItems = state.widgets.length;
      format = state.layoutFormat === 'widescreen' ? 'widescreen' : 'mobile';
      render();
      return;
    }

    var raw = rawOriginal;

    var workerSource =
      'self.onmessage=function(event){try{' +
      'var source=JSON.parse(event.data||"{}");' +
      'var all=Array.isArray(source.widgets)?source.widgets:[];' +
      'var widgets=all.slice(0,' + MAX_ITEMS + ').map(function(item,index){return{' +
      'id:String(item.id||("widget-"+index)),' +
      'type:String(item.type||""),title:String(item.title||""),' +
      'templateTitle:String(item.templateTitle||""),group:String(item.group||""),' +
      'value:String(item.value||""),x:Number(item.x)||0,y:Number(item.y)||0,' +
      'width:Number(item.width)||150,height:Number(item.height)||70,' +
      'hidden:!!item.hidden};});' +
      'self.postMessage({ok:true,total:all.length,state:{user:String(source.user||"Streamer"),' +
      'layoutFormat:source.layoutFormat==="widescreen"?"widescreen":"mobile",widgets:widgets}});' +
      '}catch(error){self.postMessage({ok:false});}}';
    var worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
    worker.onmessage = function (event) {
      worker.terminate();
      if (event.data && event.data.ok) {
        state = event.data.state;
        totalItems = event.data.total;
        format = state.layoutFormat;
      }
      render();
    };
    worker.onerror = function () {
      worker.terminate();
      render();
    };
    worker.postMessage(raw);
  }

  document.getElementById('view').innerHTML = '<p class="layout-loading">Laddar layout…</p>';
  loadState();
})();
