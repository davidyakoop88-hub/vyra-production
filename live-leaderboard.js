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

  const totals = {}; // username -> {name, profileImage, likes, coins, lastActive}
  const LIKE_ACTIVE_MS = 10 * 60 * 1000;

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function record(e) {
    if (!e || !e.username) return;
    const t = totals[e.username] || (totals[e.username] = { name: e.name || e.username, profileImage: e.profileImage || '', likes: 0, coins: 0, lastActive: 0 });
    if (e.name) t.name = e.name;
    if (e.profileImage) t.profileImage = e.profileImage;
    if (e.type === 'likes' || e.type === 'like') t.likes += Number(e.count) || 0;
    if (e.type === 'gift') t.coins += Number(e.coins) || 0;
    t.lastActive = Date.now();
  }

  function sortedTop(metric) {
    const now=Date.now();
    return Object.values(totals).filter(t => t[metric] > 0 && (metric!=='likes'||now-t.lastActive<LIKE_ACTIVE_MS)).sort((a, b) => b[metric] - a[metric]);
  }

  function updateLiveLeaderboards() {
    if (typeof state === 'undefined' || !state?.widgets) return;
    document.querySelectorAll('.vyra-toplike[data-id]').forEach(el => {
      const w = state.widgets.find(x => x.id === el.dataset.id);
      if (!w || !w.useLiveData) return;
      const rows = el.querySelectorAll('.toplike-row');
      const metric = w.liveMetric || (w.type === 'templateTopCoins' ? 'coins' : 'likes');
      const top = sortedTop(metric).slice(0, rows.length);
      if (!top.length) return;
      rows.forEach((row, i) => {
        const person = top[i];
        if (!person) return;
        const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
        if (strong) strong.textContent = person.name;
        if (small) small.textContent = '@' + person.name.toLowerCase().replace(/\s+/g, '');
        if (em) { const icon = em.textContent.trim().split(' ')[0] || '♥'; em.textContent = icon + ' ' + formatNum(person[metric]); }
        const img = row.querySelector('img:not(.pro-frame-art)');
        if (img && person.profileImage) img.src = person.profileImage;
      });
    });
  }

  // Backfill from whatever's still in the server's rolling event buffer, then keep listening live.
  fetch('/api/events?after=0').then(r => r.json()).then(d => { (d.events || []).forEach(record); }).catch(() => {});
  addEventListener('vyra-live-event', e => record(e.detail || {}));
  setInterval(updateLiveLeaderboards, 1000);
  setInterval(()=>{const now=Date.now();Object.keys(totals).forEach(key=>{const t=totals[key];if(now-t.lastActive>24*60*60*1000)delete totals[key]})},60000);

  window.VyraLeaderboard = {
    getTop: (metric = 'likes', count = 10) => sortedTop(metric).slice(0, count)
  };
})();
