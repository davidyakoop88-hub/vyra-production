// "Mina Widgets" — Studio's widget management section (Fas 3 Studio integration). Lists every
// widget built on public/widgets/base-widget.js, lets a streamer pick a variant/config per
// widget, previews it live in an iframe, and generates the exact OBS Browser Source URL using
// their real "Säker OBS-länk" access token — the same token system overlay-access.js already
// manages. No new backend: this only reads/writes the existing
// /api/workspaces/:id/overlays/:id/access-tokens endpoint.
(function (root) {
  'use strict';

  const WIDGET_CATALOG = [
    { id: 'gift-alert', name: 'Gift Alert', file: 'gift-alert.html', color: '#8d3cff', previewHeight: 200,
      desc: 'Visar en alert med användarnamn, gåvans namn och antal diamonds när någon skickar en gåva. Köad så flera gåvor i rad inte krockar.' },
    { id: 'follow-alert', name: 'Follow Alert', file: 'follow-alert.html', color: '#25e2ff', previewHeight: 140,
      desc: '"Ny följare! 🎉 @användare" — glider in från vänster när någon börjar följa dig.' },
    { id: 'like-counter', name: 'Like Counter', file: 'like-counter.html', color: '#ff4d8d', previewHeight: 120,
      desc: 'Alltid synlig räknare i ett hörn som visar totala likes under sessionen, med mjuk räkne-animation.' },
    { id: 'top-gifters', name: 'Top Gifters', file: 'top-gifters.html', color: '#25e2ff', previewHeight: 300,
      desc: 'Topp-5-lista över de mest generösa gåvogivarna just nu, uppdateras i realtid.' },
    { id: 'combo-counter', name: 'Combo Counter', file: 'combo-counter.html', color: '#f6c76b', previewHeight: 180,
      desc: 'Visar "5x COMBO!", "10x MEGA COMBO!" eller "20x LEGENDARY!" när samma person skickar gåvor snabbt i följd.' },
    { id: 'goal-tracker', name: 'Goal Tracker', file: 'goal-tracker.html', color: '#8d3cff', previewHeight: 120,
      desc: 'Progressbar mot ett mål du bestämmer, med ett litet firande när målet nås.',
      config: [
        { key: 'goal', label: 'Mål (antal)', type: 'number', default: 500, min: 1 },
        { key: 'type', label: 'Typ', type: 'select', default: 'diamonds', options: [
          { value: 'diamonds', label: 'Diamonds' }, { value: 'gifts', label: 'Antal gåvor' },
          { value: 'follows', label: 'Följare' }, { value: 'shares', label: 'Delningar' }, { value: 'likes', label: 'Likes' }
        ] }
      ] },
    { id: 'diamond-counter', name: 'Diamond Counter', file: 'diamond-counter.html', color: '#25e2ff', previewHeight: 120,
      desc: 'Sessionens totala diamonds, med ett extra firande vid 100, 500, 1000 och 5000.' },
    { id: 'vip-zone', name: 'VIP Zone', file: 'vip-zone.html', color: '#f6c76b', previewHeight: 340,
      desc: 'Topp-10-lista över dina mest lojala tittare med Bronze/Silver/Gold/Diamond/Legendary-märken.' },
    { id: 'welcome-viewer', name: 'Welcome Viewer', file: 'welcome-viewer.html', color: '#8d3cff', previewHeight: 140,
      desc: '"Välkommen @användare! 👋" — glider in från höger när en ny tittare går med i sändningen.' },
    { id: 'screen-takeover', name: 'Screen Takeover', file: 'screen-takeover.html', color: '#ff4d8d', previewHeight: 260,
      desc: 'Fullskärmsanimation med ljud för riktigt stora gåvor (över 100 diamonds), visas i 5 sekunder.' }
  ];

  const STARTER_PACK = ['gift-alert', 'follow-alert', 'combo-counter', 'top-gifters', 'diamond-counter', 'screen-takeover'];

  const STATE_KEY = 'vyra-widget-library-state';
  const ACTIVATED_KEY = 'vyra-widget-library-activated';

  function byId(id) { return WIDGET_CATALOG.find(w => w.id === id) }

  function loadAllState() { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {} } catch { return {} } }
  function saveAllState(all) { localStorage.setItem(STATE_KEY, JSON.stringify(all)) }
  function getWidgetState(widgetId) {
    const widget = byId(widgetId), all = loadAllState(), saved = all[widgetId] || {};
    const defaultConfig = Object.fromEntries((widget.config || []).map(f => [f.key, f.default]));
    return { variant: saved.variant === 'celestial' ? 'celestial' : 'cyber', config: { ...defaultConfig, ...(saved.config || {}) } };
  }
  function updateWidgetState(widgetId, mutate) {
    const all = loadAllState(), current = getWidgetState(widgetId);
    mutate(current);
    all[widgetId] = current;
    saveAllState(all);
  }

  function getActivatedSet() { try { return new Set(JSON.parse(localStorage.getItem(ACTIVATED_KEY)) || []) } catch { return new Set() } }
  function markActivated(widgetId) {
    const set = getActivatedSet();
    if (set.has(widgetId)) return;
    set.add(widgetId);
    localStorage.setItem(ACTIVATED_KEY, JSON.stringify([...set]));
    const badge = document.querySelector('.wl-stat b');
    if (badge) badge.textContent = `${set.size} / ${WIDGET_CATALOG.length}`;
  }

  // Raw access tokens are shown exactly once at creation and never persisted server-side beyond
  // their hash (see docs/SECURITY.md) — overlay-access.js already caches the full overlay URL of
  // whichever token was created this session under this exact sessionStorage key. Reading the
  // same key here means a token created via either this panel or the existing "Säker OBS-länk"
  // modal is immediately usable by both, with a single source of truth.
  function getCachedAccessToken() {
    const cached = sessionStorage.getItem('vyra-overlay-access-url');
    if (!cached) return null;
    try { return new URL(cached, location.origin).searchParams.get('access') || null } catch { return null }
  }

  async function createAccessToken() {
    const { workspace, overlay } = root.VyraCloudSync?.current?.() || {};
    if (!workspace || !overlay) throw new Error('Vänta tills cloud-synken är ansluten');
    const data = await root.VyraAuth.api(`/api/workspaces/${workspace.id}/overlays/${overlay.id}/access-tokens`, {
      method: 'POST',
      body: JSON.stringify({ label: 'Widget-bibliotek', expiresInDays: null })
    });
    sessionStorage.setItem('vyra-overlay-access-url', data.overlayUrl);
    return data.accessToken;
  }

  function buildWidgetUrl(widget, state, token) {
    // /public/widgets/... — not /widgets/... — because web/Dockerfile copies this repo's
    // directory structure verbatim into /srv (public/widgets/x.html -> /srv/public/widgets/x.html),
    // and Caddyfile.production serves /srv as-is with no rewrite. This is also the path David's
    // already-working gift-alert OBS source must be using today.
    const url = new URL(`/public/widgets/${widget.file}`, location.origin);
    if (token) url.searchParams.set('uid', token);
    url.searchParams.set('variant', state.variant);
    for (const field of widget.config || []) url.searchParams.set(field.key, state.config[field.key]);
    return url.toString();
  }

  function configFieldMarkup(field, value) {
    if (field.type === 'select') {
      return `<label>${field.label}<select data-wl-config="${field.key}">${field.options.map(o =>
        `<option value="${o.value}"${value === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
    }
    return `<label>${field.label}<input type="${field.type}" data-wl-config="${field.key}" value="${value}"${field.min != null ? ` min="${field.min}"` : ''}></label>`;
  }

  function cardMarkup(widget, token) {
    const state = getWidgetState(widget.id);
    const url = buildWidgetUrl(widget, state, token);
    return `<article class="wl-card" data-wl-widget="${widget.id}">
      <div class="wl-thumb" style="--wl-color:${widget.color}"><span>${widget.name}</span></div>
      <div class="wl-body">
        <p class="wl-desc">${widget.desc}</p>
        <div class="wl-controls">
          <label>Variant<select data-wl-variant>
            <option value="cyber"${state.variant === 'cyber' ? ' selected' : ''}>Cyber (lila/cyan)</option>
            <option value="celestial"${state.variant === 'celestial' ? ' selected' : ''}>Celestial (rose gold/guld)</option>
          </select></label>
          ${(widget.config || []).map(field => configFieldMarkup(field, state.config[field.key])).join('')}
        </div>
        <div class="wl-preview-wrap"><iframe data-wl-preview src="${url}" height="${widget.previewHeight}" title="${widget.name} förhandsgranskning" loading="lazy"></iframe></div>
        <div class="wl-actions">
          <button data-wl-copy${token ? '' : ' disabled'}>📋 Kopiera OBS-URL</button>
          <button data-wl-open${token ? '' : ' disabled'}>↗ Öppna i ny flik</button>
        </div>
      </div>
    </article>`;
  }

  // Pure HTML generation — no side effects, called by studio.js's render() the same way
  // home()/flows()/etc. already are. All interactivity is wired up afterward by bind().
  function view() {
    const token = getCachedAccessToken();
    const activated = getActivatedSet();
    return `<div class="wl-head">
        <div><h2>Mina Widgets</h2><p>Lägg till widgets som Browser-källor i OBS för din stream. Alla använder samma säkra OBS-länk.</p></div>
        <div class="wl-stat"><b>${activated.size} / ${WIDGET_CATALOG.length}</b><small>aktiverade</small></div>
      </div>
      ${token
        ? `<div class="wl-banner wl-banner-ok"><div><strong>OBS-länk aktiv ✓</strong><span>URL:erna nedan är redo att användas i OBS.</span></div><button class="primary" data-wl-new-token>Skapa ny länk</button></div>`
        : `<div class="wl-banner"><div><strong>Skapa OBS-länk först</strong><span>Widgetarna behöver en säker OBS-länk för att kunna ansluta till din live-ström.</span></div><button class="primary" data-wl-new-token>Skapa OBS-länk</button></div>`}
      <div class="wl-grid">${WIDGET_CATALOG.map(w => cardMarkup(w, token)).join('')}</div>
      <div class="wl-quickstart">
        <div><strong>📋 Snabbstart</strong><span>Ladda ner en textfil med ${STARTER_PACK.length} rekommenderade widgets, redo att klistras in i OBS.</span></div>
        <button class="primary" data-wl-quickstart${token ? '' : ' disabled'}>Ladda ner snabbstart.txt</button>
      </div>`;
  }

  function downloadQuickstart() {
    const token = getCachedAccessToken();
    if (!token) { root.toast?.('Skapa en OBS-länk först'); return }
    const lines = STARTER_PACK.map(id => {
      const widget = byId(id), state = getWidgetState(id);
      return `${widget.name}\n${buildWidgetUrl(widget, state, token)}`;
    });
    const text = `VYRA — Snabbstart: ${STARTER_PACK.length} rekommenderade widgets\n` +
      `Skapad: ${new Date().toLocaleString('sv-SE')}\n\n` +
      `Lägg till varje URL som en egen källa i OBS: Källor → + → Browser → klistra in URL,\n` +
      `bocka i "Kontrollera ljud via OBS" för widgets med ljud (Screen Takeover).\n\n` +
      lines.join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vyra-snabbstart-widgets.txt';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    STARTER_PACK.forEach(markActivated);
    root.toast?.('Snabbstart nedladdad');
  }

  // Wires up interactivity after view()'s HTML has been inserted — same split as studio.js's own
  // render()/bind(). Variant/config changes only touch that one card's iframe src (via
  // refreshPreview), never a full re-render, so editing one widget's config never reloads and
  // restarts the other nine previews.
  function bind() {
    document.querySelectorAll('[data-wl-new-token]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try {
        await createAccessToken();
        root.toast?.('OBS-länk skapad');
        root.render?.();
      } catch (err) {
        root.toast?.(err.message || 'Kunde inte skapa OBS-länk');
        btn.disabled = false;
      }
    });

    document.querySelectorAll('[data-wl-widget]').forEach(card => {
      const widgetId = card.dataset.wlWidget, widget = byId(widgetId);
      const preview = card.querySelector('[data-wl-preview]');

      function refreshPreview() {
        preview.src = buildWidgetUrl(widget, getWidgetState(widgetId), getCachedAccessToken());
      }

      card.querySelector('[data-wl-variant]').onchange = e => {
        updateWidgetState(widgetId, s => { s.variant = e.target.value });
        refreshPreview();
      };
      card.querySelectorAll('[data-wl-config]').forEach(input => {
        input.onchange = () => {
          updateWidgetState(widgetId, s => { s.config[input.dataset.wlConfig] = input.value });
          refreshPreview();
        };
      });

      const copyBtn = card.querySelector('[data-wl-copy]');
      if (copyBtn) copyBtn.onclick = async () => {
        const url = buildWidgetUrl(widget, getWidgetState(widgetId), getCachedAccessToken());
        try { await navigator.clipboard.writeText(url); root.toast?.('OBS-URL kopierad') }
        catch { root.toast?.('Kunde inte kopiera automatiskt — markera och kopiera: ' + url) }
        markActivated(widgetId);
      };

      const openBtn = card.querySelector('[data-wl-open]');
      if (openBtn) openBtn.onclick = () => {
        window.open(buildWidgetUrl(widget, getWidgetState(widgetId), getCachedAccessToken()), '_blank');
        markActivated(widgetId);
      };
    });

    document.querySelectorAll('[data-wl-quickstart]').forEach(btn => btn.onclick = downloadQuickstart);
  }

  root.VyraWidgetLibrary = { view, bind, WIDGET_CATALOG };
})(typeof window !== 'undefined' ? window : globalThis);
