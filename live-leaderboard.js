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

  // media.js has its own VYRA_OVERLAY, but it is a module-scope const there and not reachable from
  // this file. Same source of truth (the ?overlay flag studio.html is loaded with), read locally.
  const VYRA_OVERLAY = new URLSearchParams(location.search).has('overlay');

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
    const t = totals[username] || (totals[username] = { username, name: e.name || username, profileImage: e.profileImage || '', likes: 0, activeLikes: 0, likeEvents: [], coins: 0, lastLikeAt: 0, present: true });
    if (e.name) t.name = e.name;
    if (e.profileImage) t.profileImage = e.profileImage;
    if (type === 'join' || type.includes('enter')) t.present = true;
    if (type === 'leave' || type.includes('viewer_leave') || type.includes('member_leave') || type.includes('exit')) t.present = false;
    if (type === 'likes' || type === 'like' || type.includes('tap')) {
      // Increment fields only. cloudEvent() fills `value` from coins ?? points ?? score, and a like
      // has no coins — so `value` is TikTok's running room-wide like total, the same number the
      // protocol calls total/totalLikeCount. Falling back to it would credit one viewer with the
      // whole room's likes on a single tap, once per event. `??` rather than `||` so a genuine
      // count of 0 stays 0 instead of reaching for the next field.
      const count = Number(e.count ?? e.likes) || 0;
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

  // A gift landing while the flip is still running must update the name, value and both pictures
  // without rewinding the animation — see window.VyraFlip in media.js for why. That helper owns the
  // timing for both Top Gift and Top Streak; this file only says which of the two things happened.
  // The fallback keeps the old behaviour if media.js has not run, rather than skipping the flip.
  function armFlip(el) {
    const flip = window.VyraFlip;
    if (flip) {
      if (!flip.resume(el)) flip.start(el);
      // Enda anroparen är updateTopGift, efter att rekordgrinden släppt igenom en ny toppgåva —
      // alltså är ett anrop hit per definition ett nytt rekord. Flippen snurrar numera hela
      // sändningen och får inte startas om; markeringen är det enda som säger att något hänt.
      flip.mark?.(el);
      return;
    }
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
  }

  function updateTopGift(e, person) {
    if (typeof state === 'undefined' || !state?.widgets) return;
    const image = e.giftImage || e.image || e.giftPicture || e.gift?.image || '';
    // Top Gift är en topplista, inte "senaste gåvan". Den här funktionen skrev tidigare över namn,
    // bild och värde på VARJE gåva, så en 1-coins-gåva slog ut en 30 000-coins-gåva direkt.
    // Rekordet ägs av gift-event-images.js, som är den andra skrivaren till samma widget — två
    // egna högvattenmärken för samma värde hade blivit två sanningar. Saknas modulen (äldre
    // överlägg som inte laddar den) faller vi tillbaka på det gamla beteendet i stället för att
    // sluta uppdatera helt.
    const records = window.VyraGiftRecords;
    // Det som jämförs är GÅVANS värde, inte combons summa: elva rosor är 1, inte 11. Regeln och
    // motiveringen bor hos records.styckvarde i gift-event-images.js. Fallbacken räknar likadant
    // lokalt i stället för att falla tillbaka på totalen — annars kunde ett gammalt överlägg utan
    // modulen visa ett annat tal än det som ligger i rekordet.
    const styck = records?.styckvarde || ((coins, antal) => {
      const summa = Number(coins);
      if (!Number.isFinite(summa) || summa <= 0) return 0;
      const n = Math.round(Number(antal));
      return Math.round(summa / (Number.isFinite(n) && n >= 1 ? n : 1));
    });
    const summa = Number(e.coins || e.diamondCount || e.value);
    // person.coins är tittarens ACKUMULERADE bidrag, inte en gåva — den får aldrig delas med antalet.
    const value = Number.isFinite(summa) && summa > 0 ? styck(summa, e.count) : person.coins;
    if (records && value < records.giftCoins) return;
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
      if (profile && person.profileImage) profile.src = VyraSafe.src(person.profileImage);
      if (gift && image) gift.src = VyraSafe.src(image);
      if (name) name.textContent = person.name;
      if (coins) coins.textContent = '◉ ' + formatNum(value);
      armFlip(el);
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
      // Points come from action-runtime.js's Add/Remove-points ledger (window.VyraPoints), not
      // from raw live events, so there's no day-bucketed history to range-filter — always the
      // ledger's current all-time totals, same as its own "Top Points" leaderboard would show.
      const top = metric === 'points'
        ? (window.VyraPoints?.getTop(rows.length) || [])
        : (range === 'stream' ? sortedTop(metric) : sortedTopForRange(metric, range)).slice(0, rows.length);
      // An empty tally used to mean "leave the DOM alone", which in the editor is right — the demo
      // rows are what the streamer is designing against. In the overlay it meant a live audience
      // saw shipped placeholder people with invented totals, and kept seeing them: sortedTop
      // filters on activeLikes > 0, so a like stream whose events carry count 0 never produces a
      // single entry, and the rows are never reached. Zero the rows instead of inventing anything.
      if (!top.length) {
        if (!VYRA_OVERLAY) return;
        // SKRIV ALDRIG SAMMA VARDE TILLBAKA.
        //
        // UPPMATT 2026-08-21: den har slingan skrev om alla fem raderna till "◆ 0" var ~1000:e ms
        // i evighet, aven nar de REDAN stod pa "◆ 0". Att satta textContent byter ut textnoden
        // aven nar strangen ar identisk, sa varje varv blev en riktig DOM-mutation — som i sin tur
        // vacker observatorer som kallar hit igen.
        //
        // Kostnaden ar dubbel. I OBS ar det fem onodiga DOM-skrivningar i sekunden sa lange
        // overlayn ar uppe. Och i den visuella riggen betydde det att widgetens text ALDRIG blev
        // tyst: ett forsok att fotografera "nar sidan star still" slog i sitt tak varje gang och
        // tog sviten fran 25 s till 79 s per prov.
        //
        // live-zero-state.js har redan exakt den har vakten, med kommentaren "Writing the same
        // value back still counts as a DOM mutation, which would wake the observer that called us
        // and spin forever". Samma regel galler har.
        const satt = (el, varde) => { if (el && el.textContent !== varde) el.textContent = varde };
        rows.forEach(row => {
          const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
          satt(strong, '');
          satt(small, '');
          if (em) { const icon = em.textContent.trim().split(' ')[0] || '♥'; satt(em, icon + ' 0') }
        });
        return;
      }
      rows.forEach((row, i) => {
        const person = top[i];
        row.style.display = person ? '' : 'none';
        if (!person) return;
        const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
        if (strong) strong.textContent = person.name;
        if (small) small.textContent = '@' + person.name.toLowerCase().replace(/\s+/g, '');
        if (em) { const icon = em.textContent.trim().split(' ')[0] || '♥'; const displayValue = range === 'stream' && metric === 'likes' ? person.activeLikes : person[metric]; em.textContent = icon + ' ' + formatNum(displayValue); }
        const img = row.querySelector('img:not(.pro-frame-art)');
        if (img && person.profileImage) img.src = VyraSafe.src(person.profileImage);
      });
    });
  }

  // Backfill from whatever's still in the server's rolling event buffer, then keep listening live.
  // The history fetch used to call record() directly, which meant it bypassed the one place that
  // knows what this source has already handled — so a reload re-counted the whole rolling buffer
  // into the localStorage day buckets. It goes through ingest() now like every other source of
  // events; the vyra-live-event listener below then receives whatever survives the gate.
  fetch('/api/events?after=0').then(r => r.json()).then(d => {
    (d.events || []).forEach(event => {
      if (typeof window.VyraLive?.ingest === 'function') window.VyraLive.ingest(event);
      else record(event);
    });
  }).catch(() => {});
  addEventListener('vyra-live-event', e => record(e.detail || {}));
  setInterval(updateLiveLeaderboards, 1000);
  // MALA GENAST NAR NAGON RITAT OM WIDGETARNA.
  //
  // UPPMATT 2026-08-22: en widget som byggs pa nytt kommer upp med sina DEMOSIFFROR (Alex 98,7K,
  // Mia 82,4K ...) och star sa tills tickern ovan gar. Fore konfigurationsuppdateringen hande det
  // bara vid sidladdning, dar ingen sett nagot annat. Nu ritas widgetarna om mitt i en sandning,
  // och da blev det en halv sekund med PAHITTADE siffror i OBS vid varje andring: uppmatt 439 ms
  // demodata, live tillbaka forst vid 990 ms.
  //
  // Signalen ar generell med flit. Topplistan ar bara den forsta live-drivna ytan som far det har
  // problemet - mal, streaks och koer star pa samma grund, och de ska kunna haka pa samma event
  // i stallet for att var och en uppfinna sin egen vag.
  addEventListener('vyra-live-repaint', () => { try { updateLiveLeaderboards() } catch (e) {} });

  window.VyraLeaderboard = {
    getTop: (metric = 'likes', count = 10) => sortedTop(metric).slice(0, count),
    remove: username => { if (totals[username]) totals[username].present = false; },
    LIKE_IDLE_MS
  };
})();
