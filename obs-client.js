// Browser side of the real OBS integration — talks to electron-app/obs-service.js via
// local-server.js's /api/obs/* routes. Desktop-only (same reasoning as live-client.js's own
// localRuntime check): the OBS WebSocket connection itself has to live in the Electron process
// since a page served over HTTPS can't open an insecure ws:// connection to a local OBS
// instance, so there's nothing for this file to do when running the plain web Studio.
(() => {
  const localRuntime = ['127.0.0.1', 'localhost'].includes(location.hostname);
  if (!localRuntime) return;

  const KEY = 'vyra-obs-settings-v1';
  const getSettings = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } };
  const setSettings = s => localStorage.setItem(KEY, JSON.stringify(s));

  async function api(path, body) {
    const res = await fetch('/api' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    return res.json();
  }

  document.addEventListener('vyra:obs-scene', e => {
    const sceneName = e.detail?.scene;
    if (sceneName) api('/obs/scene', { sceneName }).catch(() => {});
  });
  document.addEventListener('vyra:obs-source', e => {
    const sourceName = e.detail?.source;
    if (sourceName) api('/obs/source', { sourceName, enabled: true }).catch(() => {});
  });

  function render() {
    const anchor = document.querySelector('.ae-points-settings') || document.querySelector('.ae-simulator') || document.querySelector('.ae-timers-overview') || document.querySelector('.ae-scenes-overview') || document.querySelector('.ae-steps');
    if (!anchor || document.querySelector('.ae-obs-settings')) return;
    const s = getSettings();
    const section = document.createElement('section');
    section.className = 'ae-obs-settings card';
    section.innerHTML = `<header><h3>OBS-anslutning</h3><span class="ae-obs-status" data-obs-status>Okänd status</span></header>
      <p class="ae-timer-hint">Krävs för att "Byt OBS-scen"/"Aktivera OBS-källa" i Actions ska göra något på riktigt. I OBS: Verktyg → WebSocket Server Settings → aktivera servern.</p>
      <div class="ae-grid">
        <label>IP<input id="aoiIp" value="${s.ip || '127.0.0.1'}"></label>
        <label>Port<input id="aoiPort" type="number" value="${s.port || 4455}"></label>
        <label>Lösenord<input id="aoiPassword" type="password" value="${s.password || ''}"></label>
      </div>
      <button id="aoiConnect" class="primary">Anslut</button> <button id="aoiTest" type="button">Testa (byt till aktuell scen)</button>`;
    anchor.after(section);
    section.querySelector('#aoiConnect').onclick = async () => {
      const ip = section.querySelector('#aoiIp').value.trim(), port = +section.querySelector('#aoiPort').value, password = section.querySelector('#aoiPassword').value;
      setSettings({ ip, port, password });
      const status = section.querySelector('[data-obs-status]');
      status.textContent = 'Ansluter…';
      const result = await api('/obs/connect', { ip, port, password });
      status.textContent = result.ok ? 'Ansluten' : ('Fel: ' + (result.error || 'okänt fel'));
      status.classList.toggle('online', !!result.ok);
      window.toast?.(result.ok ? 'OBS anslutet' : ('OBS-anslutning misslyckades: ' + result.error));
    };
    section.querySelector('#aoiTest').onclick = async () => {
      const result = await api('/obs/status');
      window.toast?.(result.connected ? 'OBS är anslutet' : 'OBS är inte anslutet');
    };
    updateStatus();
  }

  async function updateStatus() {
    const status = document.querySelector('[data-obs-status]');
    if (!status) return;
    try {
      const result = await api('/obs/status');
      status.textContent = result.connected ? 'Ansluten' : 'Ej ansluten';
      status.classList.toggle('online', !!result.connected);
    } catch { status.textContent = 'Okänd status' }
  }
  setInterval(updateStatus, 5000);

  document.addEventListener('click', e => { if (e.target.closest('[data-extra="actions"]')) setTimeout(render, 190); }, true);

  // Auto-connect once on load if credentials are already saved, so a streamer doesn't have to
  // manually reconnect every time they open Studio.
  const saved = getSettings();
  if (saved.ip) api('/obs/connect', saved).catch(() => {});
})();
