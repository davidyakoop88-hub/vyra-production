// "Bästa tid att gå live" — TikControl's Home dashboard has a data-driven recommendation
// telling the streamer the best day/time to go live based on their own historical gift data
// (e.g. "Stream Fri-Sat 18:00-00:00, Friday captures +498% vs your average"). VYRA had no
// historical-time tracking of any kind before this — live-leaderboard.js's dailyTotals are
// bucketed by calendar day (for the Period control), not by hour-of-day/day-of-week, so they
// can't answer "when" a streamer's audience is most active.
(function () {
  const HOURLY_KEY = 'vyra-stream-time-v1';
  let hourly = (() => { try { return JSON.parse(localStorage.getItem(HOURLY_KEY) || '{}'); } catch { return {}; } })();
  let dirty = false;

  function slotKey(dow, hour) { return dow + '-' + hour; }

  // Gifts count 3x a like's weight — coins are the real monetization signal TikControl's own
  // recommendation is built on, likes are a weaker but still real engagement signal. A join is
  // the weakest signal (presence, not action) so it counts for 1.
  function record(score) {
    if (!score) return;
    const now = new Date();
    const key = slotKey(now.getDay(), now.getHours());
    const today = now.toISOString().slice(0, 10);
    const slot = hourly[key] || (hourly[key] = { sum: 0, days: {} });
    slot.sum += score;
    slot.days[today] = true;
    dirty = true;
  }

  function saveIfDirty() {
    if (!dirty) return;
    try { localStorage.setItem(HOURLY_KEY, JSON.stringify(hourly)); dirty = false; } catch {}
  }
  setInterval(saveIfDirty, 5000);
  addEventListener('beforeunload', saveIfDirty);

  function totalDaysTracked() {
    const days = new Set();
    Object.values(hourly).forEach(slot => Object.keys(slot.days || {}).forEach(d => days.add(d)));
    return days.size;
  }

  const DOW_NAMES = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

  // Best contiguous 6-hour window across all 7×24 slots, scored by each slot's own per-day
  // average (so one huge one-off stream doesn't permanently skew a slot that's normally quiet).
  function bestWindow() {
    const avg = {};
    for (let dow = 0; dow < 7; dow++) for (let h = 0; h < 24; h++) {
      const slot = hourly[slotKey(dow, h)];
      const dayCount = slot ? Object.keys(slot.days).length : 0;
      avg[slotKey(dow, h)] = dayCount ? slot.sum / dayCount : 0;
    }
    const values = Object.values(avg);
    const overallAvg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    if (overallAvg <= 0) return null;
    let best = null;
    for (let dow = 0; dow < 7; dow++) {
      for (let start = 0; start < 24; start++) {
        let sum = 0;
        for (let i = 0; i < 6; i++) sum += avg[slotKey(dow, (start + i) % 24)];
        const windowAvg = sum / 6;
        if (!best || windowAvg > best.windowAvg) best = { dow, start, windowAvg };
      }
    }
    const pct = Math.round((best.windowAvg / overallAvg - 1) * 100);
    return { dow: best.dow, dowName: DOW_NAMES[best.dow], start: best.start, end: (best.start + 6) % 24, pct };
  }

  window.VyraStreamTimeAnalytics = { record, bestWindow, totalDaysTracked };

  addEventListener('vyra-live-event', e => {
    const ev = e.detail || {};
    const type = String(ev.type || ev.event || '').toLowerCase();
    let score = 0;
    if (type === 'like' || type === 'likes' || type.includes('tap')) score = Number(ev.count || ev.likes || ev.value) || 1;
    else if (type === 'gift' || type === 'gift_combo' || type === 'giftcombo') score = (Number(ev.coins || ev.diamondCount || ev.value) || 0) * 3;
    else if (type === 'join' || type.includes('enter')) score = 1;
    if (score) record(score);
  });

  const MIN_DAYS = 3;
  const oldAnalytics = analytics;
  analytics = function () {
    const html = oldAnalytics();
    const days = totalDaysTracked();
    const best = days >= MIN_DAYS ? bestWindow() : null;
    const pad = n => String(n).padStart(2, '0');
    const card = best
      ? `<article class="card stream-time-card"><h2>Bästa tid att gå live</h2><p>${best.dowName} ${pad(best.start)}:00–${pad(best.end)}:00${best.pct > 0 ? ` fångar +${best.pct}% jämfört med ditt snitt` : ''}</p><small>Baserat på ${days} dagars aktivitet</small></article>`
      : `<article class="card stream-time-card"><h2>Bästa tid att gå live</h2><p data-tom="statistik-basta-tid">Behöver minst ${MIN_DAYS} dagars livedata (har ${days} just nu). Sänd ${MIN_DAYS} dagar i rad så räknar VYRA ut din bästa sändningstid.</p></article>`;
    // Anchored to the END of the string (the outer .analytics-grid wrapper's own closing tag),
    // not the first '</div>' anywhere in the HTML — a plain first-match replace would silently
    // misplace this card the moment analytics()'s own markup grows a nested <div> before that point.
    return html.replace(/<\/div>\s*$/, card + '</div>');
  };
})();
