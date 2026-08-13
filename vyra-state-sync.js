/**
 * VYRA State Sync
 *
 * Exporterar och importerar hela Studio-state (localStorage) som en JSON-fil,
 * så att scener, widgets och Action & Event kan flyttas mellan datorer.
 *
 * Fristående: rör inte studio.js, media.js, extras.js eller monkey-patch-kedjan.
 * Läggs in sist i studio.html:
 *   <script src="vyra-state-sync.js"></script>
 *
 * Renderar aldrig något i overlay-läge — overlay-utdatan förblir ren.
 */
(function () {
  'use strict';

  var SCRIPT_FLAG = '__vyraStateSyncLoaded';
  if (window[SCRIPT_FLAG]) return;
  window[SCRIPT_FLAG] = true;

  // Overlay känns igen på BÅDE ?overlay=1 och ?access=<token>, precis som i state-backup.js.
  // En widgetlänk kan komma in enbart som ?access=… (se standalone-widgets.js), och en vakt
  // som bara läser ?overlay hade ritat den här panelen mitt i OBS-utdatan.
  var params = new URLSearchParams(location.search);
  if (params.has('overlay') || params.has('access')) return;

  var FILE_FORMAT = 'vyra-state';
  var FILE_VERSION = 1;
  var STATUS_TIMEOUT_MS = 4000;

  /**
   * Nycklar som är maskinspecifika och inte ska följa med mellan datorer.
   *
   * De två första mönstren matchar ingen nyckel som VYRA faktiskt skriver — de finns kvar som
   * skydd mot främmande nycklar i samma origin. Resten är de nycklar som verkligen är bundna
   * till EN dator eller EN inloggad workspace, och de är själva poängen med listan:
   *
   *   vyra-session-backup:<workspaceId>   sessionens ägarskap (session-state.js)
   *   vyra-session-orphan:<tidpunkt>      föräldralösa sessioner (cloud-sync.js)
   *   vyra-cloud-sync-meta:<workspaceId>  binder den lokala layouten till workspace + version
   *   vyra-cloud-sync-queue:<...>         köade skrivningar som hör till den här datorn
   *   vyra-scene-heartbeat-<n>            scenernas online/offline-status
   *   vyra-live-event, vyra-action-run    flyktiga signaler mellan flikar
   *
   * Följde de med skulle en importerad fil hävda ett annat workspaces ägarskap på den här
   * datorn, och cloud-sync.js jämför just workspaceId när den avgör vem som äger layouten.
   */
  var EXCLUDED_KEY_PATTERNS = [
    /^__vyra/i,
    /devtools/i,
    /^vyra-session-backup:/,
    /^vyra-session-orphan:/,
    /^vyra-cloud-sync-meta:/,
    /^vyra-cloud-sync-queue:/,
    /^vyra-scene-heartbeat-/,
    /^vyra-live-event$/,
    /^vyra-action-run$/
  ];

  function isExportableKey(key) {
    return !EXCLUDED_KEY_PATTERNS.some(function (pattern) {
      return pattern.test(key);
    });
  }

  function readAllKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && isExportableKey(key)) keys.push(key);
    }
    return keys.sort();
  }

  function buildStateSnapshot() {
    var entries = {};
    readAllKeys().forEach(function (key) {
      entries[key] = localStorage.getItem(key);
    });

    return {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      origin: location.origin + location.pathname,
      entries: entries
    };
  }

  function formatBytes(byteCount) {
    if (byteCount < 1024) return byteCount + ' B';
    if (byteCount < 1024 * 1024) return (byteCount / 1024).toFixed(1) + ' kB';
    return (byteCount / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function buildFileName() {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return 'vyra-state-' + stamp + '.json';
  }

  function downloadSnapshot() {
    var snapshot = buildStateSnapshot();
    var keyCount = Object.keys(snapshot.entries).length;

    if (keyCount === 0) {
      showStatus('Inget state att exportera — localStorage är tomt.', 'warn');
      return;
    }

    var json = JSON.stringify(snapshot, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');

    link.href = url;
    link.download = buildFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showStatus('Exporterade ' + keyCount + ' nycklar (' + formatBytes(blob.size) + ').', 'ok');
  }

  function parseSnapshot(rawText) {
    var parsed = JSON.parse(rawText);

    if (parsed.format !== FILE_FORMAT) {
      throw new Error('Fel filformat — förväntade "' + FILE_FORMAT + '".');
    }
    if (parsed.version > FILE_VERSION) {
      throw new Error('Filen kommer från en nyare version av State Sync.');
    }
    if (!parsed.entries || typeof parsed.entries !== 'object') {
      throw new Error('Filen saknar entries-objektet.');
    }

    return parsed;
  }

  function writeEntries(entries, shouldReplaceAll) {
    if (shouldReplaceAll) {
      readAllKeys().forEach(function (key) {
        localStorage.removeItem(key);
      });
    }

    var writtenCount = 0;
    Object.keys(entries).forEach(function (key) {
      localStorage.setItem(key, entries[key]);
      writtenCount++;
    });

    return writtenCount;
  }

  function importFromFile(file) {
    var reader = new FileReader();

    reader.onerror = function () {
      showStatus('Kunde inte läsa filen.', 'error');
    };

    reader.onload = function () {
      var snapshot;

      try {
        snapshot = parseSnapshot(String(reader.result));
      } catch (error) {
        console.error('VYRA State Sync — ogiltig fil:', error);
        showStatus('Ogiltig fil: ' + error.message, 'error');
        return;
      }

      var incomingCount = Object.keys(snapshot.entries).length;
      var existingCount = readAllKeys().length;
      var exportedDate = snapshot.exportedAt ? snapshot.exportedAt.slice(0, 16).replace('T', ' ') : 'okänt datum';

      var shouldReplaceAll = window.confirm(
        'Importera ' + incomingCount + ' nycklar (exporterad ' + exportedDate + ').\n\n' +
        'OK = ersätt allt befintligt state (' + existingCount + ' nycklar raderas först).\n' +
        'Avbryt = slå ihop, importerade nycklar skriver över de med samma namn.'
      );

      try {
        var writtenCount = writeEntries(snapshot.entries, shouldReplaceAll);
        showStatus('Importerade ' + writtenCount + ' nycklar. Laddar om…', 'ok');
        setTimeout(function () {
          location.reload();
        }, 900);
      } catch (error) {
        console.error('VYRA State Sync — skrivning misslyckades:', error);
        var isQuotaError = error && (error.name === 'QuotaExceededError' || error.code === 22);
        showStatus(
          isQuotaError
            ? 'localStorage är fullt — rensa gammalt state och försök igen.'
            : 'Import misslyckades: ' + error.message,
          'error'
        );
      }
    };

    reader.readAsText(file);
  }

  /* ---------- UI ---------- */

  var statusElement;
  var statusTimer;

  function showStatus(message, tone) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.tone = tone || 'ok';
    statusElement.style.display = 'block';

    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      statusElement.style.display = 'none';
    }, STATUS_TIMEOUT_MS);
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = [
      '#vyra-state-sync{position:fixed;left:16px;bottom:16px;z-index:99999;',
      'font:500 12px/1.4 system-ui,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:6px;align-items:flex-start}',
      '#vyra-state-sync .vss-row{display:flex;gap:6px}',
      '#vyra-state-sync button{cursor:pointer;padding:7px 12px;border-radius:8px;color:#f4eaff;',
      'background:rgba(18,10,30,.92);border:1px solid rgba(178,102,255,.55);',
      'box-shadow:0 2px 14px rgba(178,102,255,.18);transition:border-color .15s,box-shadow .15s}',
      '#vyra-state-sync button:hover{border-color:#e05cff;box-shadow:0 2px 18px rgba(224,92,255,.4)}',
      '#vyra-state-sync .vss-status{max-width:320px;padding:7px 11px;border-radius:8px;',
      'background:rgba(18,10,30,.95);border:1px solid rgba(178,102,255,.4);color:#f4eaff;display:none}',
      '#vyra-state-sync .vss-status[data-tone="warn"]{border-color:#ffcc66;color:#ffe0a3}',
      '#vyra-state-sync .vss-status[data-tone="error"]{border-color:#ff6b8a;color:#ffc2ce}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = 'vyra-state-sync';

    statusElement = document.createElement('div');
    statusElement.className = 'vss-status';

    var exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = '↓ Exportera state';
    exportButton.addEventListener('click', downloadSnapshot);

    var importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = '↑ Importera state';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) importFromFile(fileInput.files[0]);
      fileInput.value = '';
    });
    importButton.addEventListener('click', function () {
      fileInput.click();
    });

    var row = document.createElement('div');
    row.className = 'vss-row';
    row.appendChild(exportButton);
    row.appendChild(importButton);

    panel.appendChild(statusElement);
    panel.appendChild(row);
    panel.appendChild(fileInput);
    document.body.appendChild(panel);
  }

  function init() {
    injectStyles();
    buildPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
