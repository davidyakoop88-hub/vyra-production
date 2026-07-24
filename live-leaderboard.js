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
    }
    if (type === 'gift' || type === 'gift_combo' || type === 'giftcombo') {
      t.coins += Number(e.coins || e.diamondCount || e.value) || 0;
      t.present = true;
      updateTopGift(e, t);
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
      if (!w || w.useLiveData === false) return;
      const rows = el.querySelectorAll('.toplike-row');
      const metric = w.liveMetric || (w.type === 'templateTopCoins' ? 'coins' : 'likes');
      const top = sortedTop(metric).slice(0, rows.length);
      if (!top.length) return;
      rows.forEach((row, i) => {
        const person = top[i];
        row.style.display = person ? '' : 'none';
        if (!person) return;
        const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
        if (strong) strong.textContent = person.name;
        if (small) small.textContent = '@' + person.name.toLowerCase().replace(/\s+/g, '');
        if (em) { const icon = em.textContent.trim().split(' ')[0] || '♥'; em.textContent = icon + ' ' + formatNum(metric === 'likes' ? person.activeLikes : person[metric]); }
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
