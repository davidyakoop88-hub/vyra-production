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
    // Aterkalla forst efter att webblasaren hunnit starta nedladdningen. En synkron
    // revokeObjectURL direkt efter click() hinner rycka undan blobben i vissa webblasare,
    // och da blir filen tom eller uteblir. state-backup.js gor redan pa det har sattet.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

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

  /**
   * Samma vakt som pa exportsidan, men har ar den viktigare.
   *
   * Exportfiltret skyddar filer SOM DEN HAR versionen skriver. Filen som importeras kan komma
   * fran vad som helst: en aldre version av skriptet (som exporterade allt), en annan dator,
   * eller en handredigerad fil. Utan filter hade `vyra-session-backup:<workspaceId>` och
   * `vyra-cloud-sync-meta:` skrivits rakt in har, och da hade den har datorn havdat ett annat
   * workspaces agarskap. Skrivsidan ar den enda plats som faktiskt kan garantera det.
   *
   * `readAllKeys()` filtrerar ocksa, sa "ersatt allt" rader aldrig den har datorns egen
   * session eller synkko — bara det som verkligen ar flyttbart.
   */
  function writeEntries(entries, shouldReplaceAll) {
    if (shouldReplaceAll) {
      readAllKeys().forEach(function (key) {
        localStorage.removeItem(key);
      });
    }

    var writtenCount = 0;
    var skipped = [];

    Object.keys(entries).forEach(function (key) {
      if (!isExportableKey(key)) {
        skipped.push(key);
        return;
      }
      // Sidotabellerna ar strangar i localStorage. Ett objekt hade lagrats som
      // "[object Object]" och tyst forstort nyckeln — samma typkontroll som
      // cloud-sync.js, state-backup.js och overlay-access.js redan gor.
      if (typeof entries[key] !== 'string') {
        skipped.push(key);
        return;
      }
      localStorage.setItem(key, entries[key]);
      writtenCount++;
    });

    return { written: writtenCount, skipped: skipped };
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

      // Tva steg, for att det forsta utkastet inte gick att avbryta: OK ersatte allt och
      // Avbryt slog ihop, sa fel vald fil skrev over statet oavsett vad man klickade — och
      // det finns ingen versionshistorik har att backa till.
      var proceed = window.confirm(
        'Importera ' + incomingCount + ' nycklar (exporterad ' + exportedDate + ')?\n\n' +
        'Avbryt lämnar allt orört.'
      );
      if (!proceed) {
        showStatus('Importen avbröts — inget ändrades.', 'warn');
        return;
      }

      var shouldReplaceAll = window.confirm(
        'OK = ersätt allt befintligt state (' + existingCount + ' nycklar raderas först).\n' +
        'Avbryt = slå ihop, importerade nycklar skriver över de med samma namn.'
      );

      try {
        var result = writeEntries(snapshot.entries, shouldReplaceAll);
        var message = 'Importerade ' + result.written + ' nycklar';
        if (result.skipped.length) {
          // Aldre exportfiler bar med sig maskinbundna nycklar. Att hoppa over dem tyst hade
          // sett ut som att allt kom med.
          message += ' (' + result.skipped.length + ' maskinbundna hoppades över)';
          console.warn('VYRA State Sync — hoppade över:', result.skipped);
        }
        showStatus(message + '. Laddar om…', 'ok');
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

  // Stilarna ligger i skriptet i stallet for en egen .css: filen ska kunna laggas in
  // och tas bort i ett steg, utan ett stilmallspar att halla ihop.
  function injectStyles() {
    if (document.getElementById('vyra-state-sync-styles')) return;
    var style = document.createElement('style');
    style.id = 'vyra-state-sync-styles';
    style.textContent = [
      '#vyra-state-sync{display:flex;align-items:center;justify-content:space-between;gap:16px;',
      'margin-top:20px;padding:16px;border:1px solid #452656;border-radius:12px;background:#130a1b}',
      '#vyra-state-sync>span{display:grid;gap:4px}',
      '#vyra-state-sync small{color:#8f809a}',
      '#vyra-state-sync .vss-row{display:flex;gap:8px;flex-wrap:wrap}',
      '#vyra-state-sync button{cursor:pointer;padding:10px 14px;border-radius:8px;color:#fff;',
      'background:#24102f;border:1px solid #8e36bd;transition:border-color .15s}',
      '#vyra-state-sync button:hover{border-color:#e05cff}',
      '#vyra-state-sync .vss-status{grid-column:1/-1;margin-top:6px;padding:7px 11px;border-radius:8px;',
      'background:#1a0f24;border:1px solid rgba(178,102,255,.4);color:#f4eaff;display:none}',
      '#vyra-state-sync .vss-status[data-tone="warn"]{border-color:#ffcc66;color:#ffe0a3}',
      '#vyra-state-sync .vss-status[data-tone="error"]{border-color:#ff6b8a;color:#ffc2ce}'
    ].join('');
    document.head.appendChild(style);
  }

  /**
   * Raden bor i Installningar, inte i ett flytande lager over editorn.
   *
   * Ett forsta utkast lade panelen `position:fixed` nere till vanster. Sidopanelen ar 186px
   * bred och gar hela vagen ner, sa panelen la sig 170px in OVANPA menyn — exakt det
   * tests/browser/meny-yta.browser.test.js finns for att fanga. Nere till hoger gar heller
   * inte: `.overlay-link-bar` ar fixed och tacker hela bottenremsan (x 186→1366, y 700→768).
   *
   * Att i stallet mata in raden i Installningar foljer state-backup.js, som ar samma sorts
   * funktion (exportera/importera state) och redan har den vagen. I normalt flode kan den
   * inte lagga sig over nagot alls, och bredden pa menyn behover inte upprepas har.
   */
  function injectSettings() {
    var card = document.querySelector('#view .settings-page');
    if (!card || card.querySelector('#vyra-state-sync')) return;

    var box = document.createElement('div');
    box.id = 'vyra-state-sync';

    var label = document.createElement('span');
    var title = document.createElement('b');
    title.textContent = 'Flytta state mellan datorer';
    var hint = document.createElement('small');
    hint.textContent = 'Exporterar scener, widgets och Action & Event som en JSON-fil.';
    label.appendChild(title);
    label.appendChild(hint);

    statusElement = document.createElement('div');
    statusElement.className = 'vss-status';
    label.appendChild(statusElement);

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

    box.appendChild(label);
    box.appendChild(row);
    box.appendChild(fileInput);
    card.appendChild(box);
  }

  function init() {
    injectStyles();
    // Installningsvyn ritas om vid varje vybyte, sa raden matas in efter klicket — samma
    // hake som state-backup.js anvander. Forsta forsoket tacker fallet dar Studion redan
    // startar i Installningar.
    injectSettings();
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('[data-view="settings"]')) {
        setTimeout(injectSettings, 80);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
