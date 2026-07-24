(function () {
  'use strict';

  var FORMATS = {
    mobile: { label: 'Mobil', ratio: '9:16', width: 432, height: 768 },
    widescreen: { label: 'Dator', ratio: '16:9 · 1920 × 1080', width: 768, height: 432 }
  };

  function currentState() {
    try {
      return typeof state !== 'undefined' ? state : JSON.parse(localStorage.getItem('vyra-state') || '{}');
    } catch {
      return {};
    }
  }

  function selectedFormat() {
    var value = currentState().layoutFormat;
    return FORMATS[value] ? value : 'mobile';
  }

  function persist(format) {
    var value = FORMATS[format] ? format : 'mobile';
    var data = currentState();
    data.layoutFormat = value;
    localStorage.setItem('vyra-state', JSON.stringify(data));
  }

  function applyFormat() {
    var canvas = document.querySelector('.editor-shell .canvas');
    if (!canvas) return;

    var format = selectedFormat();
    canvas.dataset.layoutFormat = format;
    canvas.style.setProperty('--layout-width', FORMATS[format].width + 'px');
    canvas.style.setProperty('--layout-height', FORMATS[format].height + 'px');

    document.querySelectorAll('[data-format]').forEach(function (button) {
      var active = button.dataset.format === format;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var status = document.querySelector('.layout-format-status');
    if (status) {
      status.textContent = FORMATS[format].label + ' · ' + FORMATS[format].ratio;
    }
  }

  function addControls() {
    var toolbar = document.querySelector('.editor-shell .editor-toolbar');
    if (!toolbar || toolbar.querySelector('.layout-format-picker')) {
      applyFormat();
      return;
    }

    var picker = document.createElement('div');
    picker.className = 'layout-format-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Overlayformat');
    picker.innerHTML =
      '<span>Format</span>' +
      '<button type="button" data-format="mobile">Mobil <small>9:16</small></button>' +
      '<button type="button" data-format="widescreen">Dator <small>16:9 · 1920 × 1080</small></button>' +
      '<output class="layout-format-status" aria-live="polite"></output>';

    toolbar.prepend(picker);
    picker.addEventListener('click', function (event) {
      var button = event.target.closest('[data-format]');
      if (!button) return;
      persist(button.dataset.format);
      applyFormat();
      window.dispatchEvent(new CustomEvent('vyra:layout-format', {
        detail: { format: button.dataset.format }
      }));
    });
    applyFormat();
  }

  var observer = new MutationObserver(addControls);
  observer.observe(document.getElementById('view'), { childList: true, subtree: true });
  addControls();
})();
