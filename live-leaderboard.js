(function () {
  // Aggregates real per-user totals (likes, gift coins) from the live event stream so the Top Like /
  // Top Coins / Top Points widgets can show real activity instead of the hardcoded demo names in
  // media.js's topLikePeople array. Opt-in and independent PER WIDGET (w.useLiveData / w.liveMetric,
  // set via toplike-studio.js's Content-tab controls) — two widgets of the same type can independently
  // show demo data and real data side by side, or rank by a different metric.
  //
  // Applies via a DOM-patching interval (same technique media.js's own updateRankingCycles already
  // uses for its cycle feature) rather than mutating topLikePeople + calling render(), so it never
  // disrupts whatever the user is doing in the editor (selection, scroll, open panels).

  const totals = {}; // username -> {name, profileImage, likes, coins, lastLikeAt, present}
  const LIKE_IDLE_MS = 10 * 60 * 1000;

  // Day-bucketed persistence so a widget's "Period" (Today/Week/Month/Year/Alltid) means something —
  // `totals` above is session-only (resets on reload), which is exactly "Denna stream" and nothing
  // more. dailyTotals survives reloads via localStorage, keyed by calendar day (viewer's local time),
  // so longer ranges can be summed from real history instead of only ever showing the current session.
  const DAILY_KEY = 'vyra-leaderboard-daily-v1';
  const MAX_DAYS_KEPT = 400; // covers "Detta år" with margin without the key growing forever
  let dailyTotals = (() => { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}'); } catch { return {}; } })();
  let dailyDirty = false;

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function saveDailyIfDirty() {
    if (!dailyDirty) return;
    const keys = Object.keys(dailyTotals).sort();
    if (keys.length > MAX_DAYS_KEPT) keys.slice(0, keys.length - MAX_DAYS_KEPT).forEach(k => delete dailyTotals[k]);
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(dailyTotals)); dailyDirty = false; } catch {}
  }
  setInterval(saveDailyIfDirty, 5000);
  addEventListener('beforeunload', saveDailyIfDirty);

  function recordDaily(username, name, profileImage, likeCount, coinCount) {
    const day = todayKey();
    const bucket = dailyTotals[day] || (dailyTotals[day] = {});
    const t = bucket[username] || (bucket[username] = { name: name || username, profileImage: profileImage || '', likes: 0, coins: 0 });
    if (name) t.name = name;
    if (profileImage) t.profileImage = profileImage;
    if (likeCount) t.likes += likeCount;
    if (coinCount) t.coins += coinCount;
    dailyDirty = true;
  }
  function rangeDayKeys(range) {
    const days = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : range === 'year' ? 365 : null;
    const keys = Object.keys(dailyTotals).sort();
    if (days == null) return keys; // 'all'
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (days - 1));
    const cutoffKey = todayKey(cutoff);
    return keys.filter(k => k >= cutoffKey);
  }
  function sortedTopForRange(metric, range) {
    const merged = {};
    rangeDayKeys(range).forEach(day => {
      Object.entries(dailyTotals[day] || {}).forEach(([username, t]) => {
        const m = merged[username] || (merged[username] = { name: t.name, profileImage: t.profileImage, likes: 0, coins: 0 });
        m.likes += t.likes || 0; m.coins += t.coins || 0;
        if (t.name) m.name = t.name;
        if (t.profileImage) m.profileImage = t.profileImage;
      });
    });
    return Object.values(merged).filter(t => t[metric] > 0).sort((a, b) => b[metric] - a[metric]);
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function record(e) {
    if (!e) return;
    const username = e.username || e.uniqueId || e.userId || e.name;
    if (!username) return;
    const type = String(e.type || e.event || '').toLowerCase();
    const t = totals[username] || (totals[username] = { name: e.name || username, profileImage: e.profileImage || '', likes: 0, activeLikes: 0, likeEvents: [], coins: 0, lastLikeAt: 0, present: true });
    if (e.name) t.name = e.name;
    if (e.profileImage) t.profileImage = e.profileImage;
    if (type === 'join' || type.includes('enter')) t.present = true;
    if (type === 'leave' || type.includes('viewer_leave') || type.includes('member_leave') || type.includes('exit')) t.present = false;
    if (type === 'likes' || type === 'like' || type.includes('tap')) {
      const count = Number(e.count || e.likes || e.value) || 0;
      t.likes += count;
      t.likeEvents.push([Date.now(), count]);
      t.lastLikeAt = Date.now();
      t.present = true;
      recordDaily(username, t.name, t.profileImage, count, 0);
    }
    if (type === 'gift' || type === 'gift_combo' || type === 'giftcombo') {
      const coins = Number(e.coins || e.diamondCount || e.value) || 0;
      t.coins += coins;
      t.present = true;
      updateTopGift(e, t);
      recordDaily(username, t.name, t.profileImage, 0, coins);
    }
  }

  function sortedTop(metric) {
    const now = Date.now();
    if (metric === 'likes') Object.values(totals).forEach(t => {
      t.likeEvents = (t.likeEvents || []).filter(([at]) => now - at < LIKE_IDLE_MS);
      t.activeLikes = t.likeEvents.reduce((sum, [, count]) => sum + count, 0);
    });
    return Object.values(totals).filter(t => metric === 'likes' ? (t.present !== false && t.activeLikes > 0) : t[metric] > 0).sort((a, b) => metric === 'likes' ? b.activeLikes - a.activeLikes : b[metric] - a[metric]);
  }

  function updateTopGift(e, person) {
    if (typeof state === 'undefined' || !state?.widgets) return;
    const image = e.giftImage || e.image || e.giftPicture || e.gift?.image || '';
    const value = Number(e.coins || e.diamondCount || e.value) || person.coins;
    let changed = false;
    state.widgets.filter(w => w.type === 'templateTopGift').forEach(w => {
      w.dataName = person.name;
      w.profileImage = person.profileImage || w.profileImage;
      if (image) w.giftImage = image;
      w.dataValue = value;
      changed = true;
      const el = document.querySelector(`.vyra-topgift[data-id="${w.id}"]`);
      if (!el) return;
      const profile = el.querySelector('.vyra-profile-face img');
      const gift = el.querySelector('.vyra-gift-face img');
      const name = el.querySelector(':scope > strong');
      const coins = el.querySelector(':scope > em');
      if (profile && person.profileImage) profile.src = person.profileImage;
      if (gift && image) gift.src = image;
      if (name) name.textContent = person.name;
      if (coins) coins.textContent = '◉ ' + formatNum(value);
      el.classList.remove('play');
      void el.offsetWidth;
      el.classList.add('play');
    });
    if (changed && typeof save === 'function') save();
  }

  function updateLiveLeaderboards() {
    if (typeof state === 'undefined' || !state?.widgets) return;
    document.querySelectorAll('.vyra-toplike[data-id]').forEach(el => {
      const w = state.widgets.find(x => x.id === el.dataset.id);
      // A cycling widget (media.js's "CYKEL · ALLA TRE I SAMMA WIDGET") owns its own rows —
      // it rotates through likes/coins/points itself and pulls real data per metric via
      // window.VyraLeaderboard directly. If this loop also repainted the same rows on its own
      // 1s tick using the widget's single fixed w.liveMetric, it would fight the cycle: e.g. a
      // coins-ranked repaint landing on top of a "TOP POINTS" cycle step, showing a real coins
      // leader's name next to demo values or vice versa.
      if (!w || w.useLiveData === false || w.rankingCycle) return;
      const rows = el.querySelectorAll('.toplike-row');
      const metric = w.liveMetric || (w.type === 'templateTopCoins' ? 'coins' : 'likes');
      const range = w.dateRange || 'stream';
      const top = (range === 'stream' ? sortedTop(metric) : sortedTopForRange(metric, range)).slice(0, rows.length);
      if (!top.length) return;
      rows.forEach((row, i) => {
        const person = top[i];
        row.style.display = person ? '' : 'none';
        if (!person) return;
        const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
        if (strong) strong.textContent = person.name;
        if (small) small.textContent = '@' + person.name.toLowerCase().replace(/\s+/g, '');
        if (em) { const icon = em.textContent.trim().split(' ')[0] || '♥'; const displayValue = range === 'stream' && metric === 'likes' ? person.activeLikes : person[metric]; em.textContent = icon + ' ' + formatNum(displayValue); }
        const img = row.querySelector('img:not(.pro-frame-art)');
        if (img && person.profileImage) img.src = person.profileImage;
      });
    });
  }

  // Backfill from whatever's still in the server's rolling event buffer, then keep listening live.
  fetch('/api/events?after=0').then(r => r.json()).then(d => { (d.events || []).forEach(record); }).catch(() => {});
  addEventListener('vyra-live-event', e => record(e.detail || {}));
  setInterval(updateLiveLeaderboards, 1000);

  window.VyraLeaderboard = {
    getTop: (metric = 'likes', count = 10) => sortedTop(metric).slice(0, count),
    remove: username => { if (totals[username]) totals[username].present = false; },
    LIKE_IDLE_MS
  };
})();
