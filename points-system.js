// Automatic point earning — TikFinity's Points System Settings page has "Points per coin",
// "Points per share", "Points per chat minute" (viewers earn a spendable currency just by being
// active) plus a subscriber bonus multiplier. VYRA's window.VyraPoints ledger (action-runtime.js)
// previously only ever changed via explicit "Add/Remove points" Actions — this is what actually
// makes it a living economy instead of a manual streamer tool.
(() => {
  const SETTINGS_KEY = 'vyra-points-settings-v1';
  const DEFAULTS = { perCoin: 1, perShare: 50, perLike: 0.1, perChatMinute: 5, subscriberBonus: 1, levelBasePoints: 100, levelMultiplier: 1.2 };
  function getSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } } catch { return { ...DEFAULTS } } }
  function setSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {} }

  // Chat activity is rewarded once per rolling minute per user (matching "points per chat
  // MINUTE", not per message) — a burst of messages in the same minute only awards once.
  const lastChatAward = {};

  addEventListener('vyra-live-event', e => {
    const ev = e.detail || {};
    const type = String(ev.type || ev.event || '').toLowerCase();
    const username = ev.username || ev.uniqueId || ev.user;
    if (!username || !window.VyraPoints) return;
    const s = getSettings();
    const bonus = (ev.isSubscriber || ev.isMember) ? Math.max(1, Number(s.subscriberBonus) || 1) : 1;
    if (type === 'gift' || type === 'gift_combo' || type === 'giftcombo') {
      const coins = Number(ev.coins || ev.diamondCount || 0);
      if (coins > 0 && s.perCoin) window.VyraPoints.add(username, coins * Number(s.perCoin) * bonus);
    } else if (type === 'share') {
      if (s.perShare) window.VyraPoints.add(username, Number(s.perShare) * bonus);
    } else if (type === 'like' || type === 'likes') {
      const count = Number(ev.count || ev.likes || 1);
      if (s.perLike) window.VyraPoints.add(username, count * Number(s.perLike) * bonus);
    } else if (type === 'chat' || type === 'comment') {
      const now = Date.now(), key = String(username).toLowerCase();
      if (!lastChatAward[key] || now - lastChatAward[key] >= 60000) {
        lastChatAward[key] = now;
        if (s.perChatMinute) window.VyraPoints.add(username, Number(s.perChatMinute) * bonus);
      }
    }
  });

  function render() {
    const anchor = document.querySelector('.ae-simulator') || document.querySelector('.ae-timers-overview') || document.querySelector('.ae-scenes-overview') || document.querySelector('.ae-steps');
    if (!anchor || document.querySelector('.ae-points-settings')) return;
    const s = getSettings();
    const section = document.createElement('section');
    section.className = 'ae-points-settings card';
    section.innerHTML = `<header><h3>Poängsystem</h3><span>Automatisk intjäning</span></header>
      <div class="ae-grid">
        <label>Poäng per coin<input id="apsPerCoin" type="number" min="0" step="0.1" value="${s.perCoin}"></label>
        <label>Poäng per delning<input id="apsPerShare" type="number" min="0" value="${s.perShare}"></label>
        <label>Poäng per like<input id="apsPerLike" type="number" min="0" step="0.01" value="${s.perLike}"></label>
        <label>Poäng per chatt-minut<input id="apsPerChatMinute" type="number" min="0" value="${s.perChatMinute}"></label>
        <label>Prenumerant-bonus (×)<input id="apsSubBonus" type="number" min="1" step="0.1" value="${s.subscriberBonus}"></label>
      </div>
      <p class="ae-timer-hint">Nivåer räknas ut från totalt intjänade poäng (minskar inte när poäng spenderas).</p>
      <div class="ae-grid">
        <label>Poäng för nivå 1<input id="apsLevelBase" type="number" min="1" value="${s.levelBasePoints}"></label>
        <label>Nivå-multiplikator<input id="apsLevelMultiplier" type="number" min="1" step="0.05" value="${s.levelMultiplier}"></label>
      </div>
      <button id="saveApsSettings" class="primary">Spara poänginställningar</button>`;
    anchor.after(section);
    section.querySelector('#saveApsSettings').onclick = () => {
      setSettings({
        perCoin: +section.querySelector('#apsPerCoin').value,
        perShare: +section.querySelector('#apsPerShare').value,
        perLike: +section.querySelector('#apsPerLike').value,
        perChatMinute: +section.querySelector('#apsPerChatMinute').value,
        subscriberBonus: +section.querySelector('#apsSubBonus').value,
        levelBasePoints: +section.querySelector('#apsLevelBase').value,
        levelMultiplier: +section.querySelector('#apsLevelMultiplier').value
      });
      window.toast?.('Poänginställningar sparade');
    };
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-extra="actions"]')) setTimeout(render, 180); }, true);
})();
