// Timer trigger — TikFinity's own wording: "You can execute your actions in adjustable time
// intervals. The timer starts as soon as you are live." VYRA's Actions & Events had every
// TikTok-event-driven trigger already, but nothing that fires on a schedule independent of any
// event — this fills that specific gap without touching anything event-driven.
(() => {
  const KEY = 'vyra-action-event-v2';
  const getState = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{"actions":[],"events":[],"timers":[]}') } catch { return { actions: [], events: [], timers: [] } } };
  const setState = state => window.VyraSessionState.writeActive(KEY, JSON.stringify(state));

  // Tracked from the first real "connected" status this page sees, not from page load — so a
  // timer created mid-stream doesn't immediately fire on its next 10s tick, and a timer left
  // enabled between streams doesn't fire while offline.
  let liveSince = null;
  addEventListener('vyra-server-status', e => { if (e.detail?.connection?.connected && !liveSince) liveSince = Date.now(); });
  addEventListener('vyra-server-offline', () => { liveSince = null; });

  function tick() {
    if (!liveSince) return;
    const state = getState();
    const timers = state.timers || [];
    if (!timers.length) return;
    const now = Date.now();
    let changed = false;
    timers.forEach(t => {
      if (!t.enabled) return;
      const intervalMs = Math.max(1, Number(t.intervalMinutes) || 10) * 60000;
      const last = t.lastRun || liveSince;
      if (now - last >= intervalMs) {
        t.lastRun = now;
        changed = true;
        const action = state.actions.find(a => a.id === t.actionId);
        if (action && window.VyraActionEvent) window.VyraActionEvent.runAction(action, { username: 'Timer' });
      }
    });
    if (changed) setState(state);
  }
  setInterval(tick, 10000);

  function renderTimers() {
    const anchor = document.querySelector('.ae-scenes-overview') || document.querySelector('.ae-steps');
    if (!anchor || document.querySelector('.ae-timers-overview')) return;
    const state = getState();
    const section = document.createElement('section');
    section.className = 'ae-timers-overview card';
    const rows = (state.timers || []).map(t => {
      const action = state.actions.find(a => a.id === t.actionId);
      return `<article class="${t.enabled ? '' : 'off'}"><i>⏱</i><span><b>Var ${t.intervalMinutes} min</b><small>→ ${action ? action.name : 'Ingen Action vald'}</small></span><button data-toggle-timer="${t.id}">${t.enabled ? 'Aktiv' : 'Pausad'}</button><button data-delete-timer="${t.id}">×</button></article>`;
    }).join('');
    section.innerHTML = `<header><h3>Timer</h3><span>${(state.timers || []).length} timers</span></header><p class="ae-timer-hint">Kör en Action med jämna mellanrum medan du är live. Timern börjar räkna när TikTok-anslutningen blir aktiv.</p><button id="newAeTimer" class="primary">＋ Ny Timer</button><div class="ae-list">${rows || '<p>Inga timers ännu.</p>'}</div>`;
    anchor.after(section);
    wireTimers();
  }

  function rerender() { document.querySelector('.ae-timers-overview')?.remove(); renderTimers(); }

  function wireTimers() {
    document.querySelector('#newAeTimer').onclick = () => {
      const state = getState();
      if (!state.actions.length) { window.toast?.('Skapa en Action först'); return; }
      const modal = document.querySelector('#aeModal');
      modal.innerHTML = `<div class="ae-modal"><div><header><h3>Ny Timer</h3><button data-close-ae>×</button></header><label>Intervall (minuter)<input id="aeTimerInterval" type="number" min="1" max="600" value="10"></label><label>Kör denna Action<select id="aeTimerActionId">${state.actions.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select></label><footer><button data-close-ae>Avbryt</button><button id="saveAeTimer" class="primary">Spara Timer</button></footer></div></div>`;
      modal.querySelectorAll('[data-close-ae]').forEach(x => x.onclick = () => { modal.innerHTML = '' });
      modal.querySelector('#saveAeTimer').onclick = () => {
        const s = getState();
        s.timers = s.timers || [];
        s.timers.push({ id: 't' + Date.now(), enabled: true, intervalMinutes: +modal.querySelector('#aeTimerInterval').value, actionId: modal.querySelector('#aeTimerActionId').value });
        setState(s);
        modal.innerHTML = '';
        rerender();
        window.toast?.('Timer sparad');
      };
    };
    document.querySelectorAll('[data-toggle-timer]').forEach(b => b.onclick = () => {
      const s = getState();
      const t = (s.timers || []).find(x => x.id === b.dataset.toggleTimer);
      if (t) t.enabled = !t.enabled;
      setState(s); rerender();
    });
    document.querySelectorAll('[data-delete-timer]').forEach(b => b.onclick = () => {
      const s = getState();
      s.timers = (s.timers || []).filter(x => x.id !== b.dataset.deleteTimer);
      setState(s); rerender();
    });
  }

  // See action-scenes.js for why this registration exists — action-event.js's persist()/
  // renderPage() rebuilds #view.innerHTML on every save/delete/toggle, not just on nav-tab click,
  // which would otherwise silently drop this panel until the user navigates away and back.
  (window.VyraActionsExtras = window.VyraActionsExtras || []).push(renderTimers);

  document.addEventListener('click', event => {
    if (event.target.closest('[data-extra="actions"]')) setTimeout(renderTimers, 150);
  }, true);
})();
