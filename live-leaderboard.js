(function () {
  // Aggregates real per-user totals (likes, gift diamonds) from the live event stream so the Top Like /
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

  const totals = {}; // username -> {name, profileImage, likes, diamonds, lastLikeAt, present}
  // Rummets like-total mot det VYRA fått — underlaget för like-uppskattningen, se likeFaktor().
  const rum = { start: null, senast: 0, mottaget: 0 };
  const LIKE_FAKTOR_MIN_MOTTAGET = 100, LIKE_FAKTOR_MAX = 20;

  // #133 STEG 2: TALET HETER `diamonds`, inte `coins`. Det har alltid varit diamanter (bryggans
  // kallfalt ar `diamondCount`) — bara namnet ljog. Tva saker bar fortfarande det gamla namnet och
  // maste lasas bada vagarna tills steg 3:
  //   * SPARAD STATE. Dagshinkarna i localStorage och ogonblicksbilden i sessionStorage skrevs med
  //     `coins`. migreraPost() lyfter over talet till `diamonds` vid inlasning — ingen historik
  //     far forsvinna for att nyckeln bytte namn.
  //   * METRIKNAMNET. Widgetar ar sparade med `liveMetric: 'coins'` och media.js:s cykel fragar
  //     efter 'coins'. matt() oversatter, sa getTop('coins') och getTop('diamonds') ar samma lista.
  const matt = metric => metric === 'coins' ? 'diamonds' : metric;
  function migreraPost(t) {
    if (!t || typeof t !== 'object') return false;
    if (!('coins' in t)) return false;
    const gammal = Number(t.coins) || 0;
    // Bada nycklarna i samma post kan bara uppsta om en ny klient skrev diamonds ovanpa en gammal
    // post utan att migrera — da ar de skilda bidrag och SUMMAN ar det sanna, inte det ena.
    t.diamonds = (Number(t.diamonds) || 0) + gammal;
    delete t.coins;
    return true;
  }

  // SANDNINGENS RAKNARE FAR INTE NOLLSTALLAS AV EN SIDLADDNING.
  //
  // `totals` ar "Denna stream" och lag i en vanlig variabel: en omladdning mitt i sandningen (F5 i
  // studion, "Refresh" pa OBS-kallan, ett byte av overlay-lank) tomde den. Det som kom tillbaka var
  // bara serverns rullande buffert via /api/events?after=0 — som mest 250 handelser — sa en
  // sandning som pagatt en timme borjade om fran nastan noll framfor publiken. Uppmatt i
  // livetestet 2026-09-21: Top Likes stod pa fyra namn efter en omladdning, mot tjugoatta fore.
  //
  // Regeln ar densamma som live:start-lyssnaren langst ner redan bar: listan nollstalls nar
  // SANDNINGEN borjar om, inte nar sidan gor det.
  //
  // SESSIONSTORAGE, inte localStorage, och valet ar hela sakerheten i den har ogonblicksbilden:
  // event-dedupe.js lagger sin grind i exakt samma lagring och darmed i exakt samma livslangd.
  // Overlever grinden en omladdning gor ogonblicksbilden det ocksa, och backfyllnaden dedupas bort
  // — raknaren blir inte dubblerad. Rivs kontexten (OBS forstor kallan vid scenbyte med "Shutdown
  // source when not visible") forsvinner BADA, och bufferten raknas en gang i en tom raknare,
  // precis som i dag. En delad localStorage hade gett ogonblicksbild PLUS oderdupad backfyllnad,
  // alltsa dubbelraknade siffror mitt i en sandning — varre an det som lagas har.
  //
  // Nyckeln bar sessionId: forra sandningens ogonblicksbild hor inte hemma i den har, och utan en
  // pagaende sandning atertas ingenting alls.
  const STREAM_KEY = 'vyra-leaderboard-stream-v1';
  let streamDirty = false;
  // Senaste Top Gift i den har sandningen (namn, bilder, varde). Foljer med i samma ogonblicksbild
  // som `totals`, sa att Top Gift overlever en omladdning utan att nagon save() kors per gava.
  let senasteTopGift = null;
  // PER WIDGETOBJEKT, INTE PER ID (Top Gift fladdrade i sandningen 2026-10-21: Jan Erik -> Mela ->
  // Jan Erik). En omhamtad konfiguration — OBS-lanken vid varje Studio-sparning, vid varje
  // SSE-ateranslutning och vid live:start; Studion nar cloud-sync.js foljaren projicerar en annan
  // enhets sparning — byter ut state.widgets mot NYA objekt med det dataName/dataValue som senast
  // sparades. Med ett Set av ID:n var aterstallningen redan forbrukad, sa det sparade (aldre)
  // rekordet stod kvar, och grinden nedan holl kvar troskeln pa det nyare sa ingenting rattade det.
  // Ett nytt objekt ar en ny chans; samma objekt rors bara en gang, sa en handskriven andring i
  // Studions falt star kvar som forut.
  const aterstalldaTopGift = new WeakSet();

  // live-session-client.js laddas i en parallell kedja och kan komma EFTER den har filen. Da lases
  // dess egen nyckel direkt (samma lagring den valjer forst) - annars atertogs ingenting, och en
  // aterskapad OBS-kalla stod med tom topplista mitt i sandningen (uppmatt 2026-10-21, ordningsberoende).
  function aktivSession() {
    try { const rt = window.VyraLiveSession?.runtime?.(); if (rt) return rt.aktivSession() || null } catch (e) {}
    try { return window.localStorage.getItem('vyra-live-session-aktiv') || window.sessionStorage.getItem('vyra-live-session-aktiv') || null } catch (e) { return null }
  }
  // EN ATERSKAPAD OBS-KALLA (2026-10-21). OBS river webblasarkallan vid scenbyte ("Shutdown source
  // when not visible") och vid omstart, och da forsvinner sessionStorage - listan blev tom och
  // widgeten doldes mitt i sandningen tills nasta handelse. For en MOLNLANK (?overlay med ?access=)
  // skrivs darfor samma ogonblicksbild ocksa till localStorage, per lank (envagshash av nyckeln,
  // aldrig nyckeln sjalv) och per sandning. Dubbelrakningsrisken ovan galler inte dar: molnet har
  // ingen /api/events-backfyllnad och en ny SSE-anslutning utan Last-Event-ID spelar inte upp
  // nagonting, sa ingenting kan raknas tva ganger. Skrivbordsappens lokala lank (som HAR
  // backfyllnaden) foljer den gamla regeln. Nollstalls vid live:start som allt annat.
  const MOLNLANK = (() => { try { const p = new URLSearchParams(location.search); return VYRA_OVERLAY && p.get('access') ? p.get('access') : null } catch (e) { return null } })();
  const STREAM_LS_KEY = MOLNLANK ? (() => { let h = 0x811c9dc5; for (let i = 0; i < MOLNLANK.length; i++) { h ^= MOLNLANK.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return STREAM_KEY + ':' + h.toString(36) })() : null;
  function lasLokal() {
    if (!STREAM_LS_KEY) return null;
    try { return JSON.parse(window.localStorage.getItem(STREAM_LS_KEY) || 'null') } catch (e) { return null }
  }
  function aterstallStream() {
    const session = aktivSession();
    if (!session) return;
    try {
      let sparad = JSON.parse(window.sessionStorage.getItem(STREAM_KEY) || 'null');
      if (!sparad || sparad.sessionId !== session || !sparad.totals) sparad = lasLokal();
      if (!sparad || sparad.sessionId !== session || !sparad.totals) return;
      // Rumsräkningen bakom like-uppskattningen följer med, annars hade kvoten börjat om från 1
      // efter en omladdning medan de sparade talen låg kvar.
      const r = sparad.rum;
      if (r && typeof r === 'object' && Number(r.start) > 0) {
        rum.start = Number(r.start); rum.senast = Math.max(rum.start, Number(r.senast) || 0); rum.mottaget = Math.max(0, Number(r.mottaget) || 0);
      }
      const tg = sparad.topGift;
      if (tg && typeof tg === 'object' && tg.name) {
        senasteTopGift = { name: String(tg.name), profileImage: String(tg.profileImage || ''),
          giftImage: String(tg.giftImage || ''), giftName: String(tg.giftName || ''), value: Number(tg.value) || 0 };
      }
      Object.entries(sparad.totals).forEach(([username, t]) => {
        if (!t || typeof t !== 'object') return;
        totals[username] = {
          username, name: t.name || username, profileImage: t.profileImage || '',
          likes: Number(t.likes) || 0, diamonds: (Number(t.diamonds) || 0) + (Number(t.coins) || 0),
          lastLikeAt: Number(t.lastLikeAt) || 0, present: t.present !== false
        };
      });
    } catch (e) {}
  }
  function saveStreamIfDirty() {
    if (!streamDirty) return;
    streamDirty = false;
    const session = aktivSession();
    try {
      if (!session) window.sessionStorage.removeItem(STREAM_KEY);
      else window.sessionStorage.setItem(STREAM_KEY, JSON.stringify({ sessionId: session, totals, topGift: senasteTopGift, rum }));
    } catch (e) {}
    if (STREAM_LS_KEY) {
      try {
        if (!session) window.localStorage.removeItem(STREAM_LS_KEY);
        else window.localStorage.setItem(STREAM_LS_KEY, JSON.stringify({ sessionId: session, totals, topGift: senasteTopGift, rum }));
      } catch (e) {}
    }
  }
  aterstallStream();

  // TROSKELN FOLJER MED TOP GIFT. Rekordgrinden (gift-event-images.js records.giftCoins) ligger bara
  // i sessionStorage, medan Top Gift for en molnlank ocksa tas tillbaka ur localStorage. En
  // aterskapad OBS-kalla (scenbyte, omstart) visade darfor ratt Top Gift med troskeln pa 0, och
  // nasta ros blev "nytt rekord" over en gava pa hundratals coins. Sandningens Top Gift ar per
  // definition rekordet, sa troskeln far aldrig ligga under det. live:start nollar senasteTopGift
  // har och records dar, sa en ny sandning borjar fortfarande om fran noll.
  function lyftTroskel() {
    const records = window.VyraGiftRecords;
    if (!records || !senasteTopGift) return;
    const v = Number(senasteTopGift.value) || 0;
    if (v > (Number(records.giftCoins) || 0)) records.giftCoins = v;
  }
  lyftTroskel();

  // Day-bucketed persistence so a widget's "Period" (Today/Week/Month/Year/Alltid) means something —
  // `totals` above is session-only (resets on reload), which is exactly "Denna stream" and nothing
  // more. dailyTotals survives reloads via localStorage, keyed by calendar day (viewer's local time),
  // so longer ranges can be summed from real history instead of only ever showing the current session.
  const DAILY_KEY = 'vyra-leaderboard-daily-v1';
  const MAX_DAYS_KEPT = 400; // covers "Detta år" with margin without the key growing forever
  let dailyTotals = (() => { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}'); } catch { return {}; } })();
  if (!dailyTotals || typeof dailyTotals !== 'object' || Array.isArray(dailyTotals)) dailyTotals = {};
  let dailyDirty = false;
  // Migreringen av sparad historik (#133): varje dagshink skriven av en aldre klient bar `coins`.
  // Lyfts over en gang vid inlasning och skrivs ner vid nasta sparning — nyckeln DAILY_KEY ar
  // densamma, sa en aldre flik som laser den nya formen tappar bara diamanterna i sin egen vy,
  // aldrig i lagringen (den skriver tillbaka sina egna dagars `coins`, som migreras igen har).
  Object.values(dailyTotals).forEach(bucket => {
    if (!bucket || typeof bucket !== 'object') return;
    Object.values(bucket).forEach(t => { if (migreraPost(t)) dailyDirty = true; });
  });

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function saveDailyIfDirty() {
    if (!dailyDirty) return;
    const keys = Object.keys(dailyTotals).sort();
    if (keys.length > MAX_DAYS_KEPT) keys.slice(0, keys.length - MAX_DAYS_KEPT).forEach(k => delete dailyTotals[k]);
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(dailyTotals)); dailyDirty = false; } catch {}
  }
  function saveIfDirty() { saveDailyIfDirty(); saveStreamIfDirty(); }
  setInterval(saveIfDirty, 5000);
  addEventListener('beforeunload', saveIfDirty);
  // `pagehide` ocksa: i OBS och pa mobil ar `beforeunload` inte garanterad att fyra, och en
  // ogonblicksbild som aldrig skrivs ner ar samma bugg som ingen ogonblicksbild alls.
  addEventListener('pagehide', saveIfDirty);

  function recordDaily(username, name, profileImage, likeCount, diamondCount) {
    const day = todayKey();
    const bucket = dailyTotals[day] || (dailyTotals[day] = {});
    const t = bucket[username] || (bucket[username] = { name: name || username, profileImage: profileImage || '', likes: 0, diamonds: 0 });
    if (name) t.name = name;
    if (profileImage) t.profileImage = profileImage;
    if (likeCount) t.likes += likeCount;
    if (diamondCount) t.diamonds += diamondCount;
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
    metric = matt(metric);
    const merged = {};
    rangeDayKeys(range).forEach(day => {
      Object.entries(dailyTotals[day] || {}).forEach(([username, t]) => {
        const m = merged[username] || (merged[username] = { name: t.name, profileImage: t.profileImage, likes: 0, diamonds: 0 });
        // `?? t.coins`: en hink som en aldre flik skrivit EFTER inlasningen har aldrig migrerats.
        m.likes += t.likes || 0; m.diamonds += Number(t.diamonds ?? t.coins) || 0;
        if (t.name) m.name = t.name;
        if (t.profileImage) m.profileImage = t.profileImage;
      });
    });
    return Object.values(merged).filter(t => t[metric] > 0).sort((a, b) => b[metric] - a[metric]);
  }

  // Svenskt talformat, samma som media.js vyraRankingTal (slutgranskning N-AB-007): "98 700" med hårt
  // tusentalsmellanslag, från en miljon "1,2 mn". Förut "98.7K".
  function formatNum(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + '\u00a0mn';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  function record(e) {
    if (!e) return;
    const username = e.username || e.uniqueId || e.userId || e.name;
    if (!username) return;
    const type = String(e.type || e.event || '').toLowerCase();
    const t = totals[username] || (totals[username] = { username, name: e.name || username, profileImage: e.profileImage || '', likes: 0, diamonds: 0, lastLikeAt: 0, present: true });
    streamDirty = true;   // ogonblicksbilden skrivs ner av tickern nedan, inte per handelse
    if (e.name) t.name = e.name;
    if (e.profileImage) t.profileImage = e.profileImage;
    if (type === 'join' || type.includes('enter')) t.present = true;
    // ATT LÄMNA SÄNDNINGEN TAR INTE BORT NÅGON. Här satte en rad `present = false` på leave/exit,
    // och filtret i sortedTop() släpper bara igenom `present !== false` — så den som gick ur rummet
    // FÖRSVANN ur toppen i samma sekund, mitt i sina egna likes.
    //
    // Listan visar vad folk GETT, inte vem som råkar stå i rummet. Den som gav femhundra likes och
    // stängde appen har fortfarande gett dem. TikToks leave-event är dessutom inte pålitliga nog
    // att radera någon på: en tittare som tappar nätet ett ögonblick ska inte tömmas ur listan.
    //
    // (Uppmätt 2026-09-05 över två sändningar: TikTok skickade 511 member-event, ALLA med action=1,
    // alltså "kommer in". Inte ett enda lämna-event. Raden reagerade på något som knappt händer.)
    //
    // `present` och VyraLeaderboard.remove() finns kvar för UTTRYCKLIG borttagning. Skillnaden är
    // att det nu krävs ett beslut, inte bara att någon lämnar.

    if (type === 'likes' || type === 'like' || type.includes('tap')) {
      // Increment fields only. cloudEvent() fills `value` from coins ?? points ?? score, and a like
      // has no coins — so `value` is TikTok's running room-wide like total, the same number the
      // protocol calls total/totalLikeCount. Falling back to it would credit one viewer with the
      // whole room's likes on a single tap, once per event. `??` rather than `||` so a genuine
      // count of 0 stays 0 instead of reaching for the next field.
      const count = Number(e.count ?? e.likes) || 0;
      t.likes += count;
      noteraRum(e, count);
      t.lastLikeAt = Date.now();
      t.present = true;
      recordDaily(username, t.name, t.profileImage, count, 0);
    }
    if (type === 'gift' || type === 'gift_combo' || type === 'giftcombo') {
      // MEDVARDSGAVOR RAKNAS INTE. I ett flervardsrum gar en del gavor till en medvard, och de ar
      // inte streamerns. Bryggan markerar dem med `tillVarden: false` — den ar ensam om att veta vem
      // varden ar, servern kan inte harleda det. Uppmatt 2026-09-06: 604 av 887 diamanter i en
      // sandning tillhorde nagon annan, och Top Gifters visade dem som streamerns egna. #360
      //
      // `=== false` och inte `!== true`: en aldre brygga skickar inte faltet, och da ska gavan
      // raknas precis som i dag. Filtret far bara utesluta det vi ar SAKRA pa.
      if (e.tillVarden === false) return;
      // `diamonds` forst; `coins` ar reserven for en aldre .exe som bara skickar det namnet (#133).
      const diamonds = Number(e.diamonds || e.coins || e.diamondCount || e.value) || 0;
      t.diamonds += diamonds;
      t.present = true;
      updateTopGift(e, t);
      recordDaily(username, t.name, t.profileImage, 0, diamonds);
    }
  }

  // TOPPLISTAN VISAR HELA SÄNDNINGENS TOTAL, inte de senaste tio minuterna.
  //
  // Likes räknades tidigare i ett rullande fönster (`LIKE_IDLE_MS`): bara likes yngre än tio
  // minuter räknades, resten åldrades bort. Följden i drift var att folk föll ur listan för att de
  // slutat tappa — inte för att någon gett mer. David bad 2026-09-05 om totalen: den som gav
  // femhundra likes har gett dem, och ska ligga kvar.
  //
  // BYTET AV MODELL, inte bara av tal. Ett fönster gör listan till en tävling om vem som är aktiv
  // just nu; totalen gör den till en ställning över hela sändningen. Toppen rör sig därför mindre
  // ju längre sändningen går, och det är meningen.
  //
  // `likeEvents` och `activeLikes` är borta med samma ändring. De var en array per person som växte
  // med varje like och filtrerades om vid VARJE sortering — i OBS flera gånger i sekunden, hela
  // sändningen. Att låta den ligga kvar oanvänd hade varit en kostnad utan syfte i just den fil som
  // en gång bar en 5 Hz-loop.
  //
  // NÄRVAROKRAVET GÄLLER NU ALLA TRE måtten, inte bara likes. Sedan 2026-09-05 sätts `present` bara
  // av VyraLeaderboard.remove(), alltså ett uttryckligt beslut — och då ska det gälla överallt. Att
  // en borttagen person försvann ur Top Likes men låg kvar i Top Coins var svårt att förstå som en
  // regel.
  function sortedTop(metric) {
    metric = matt(metric);
    const lista = Object.values(totals)
      .filter(t => t.present !== false && t[metric] > 0)
      .sort((a, b) => b[metric] - a[metric]);
    if (metric !== 'likes') return lista;
    const f = likeFaktor();
    return f === 1 ? lista : lista.map(t => Object.assign({}, t, { likes: Math.round(t.likes * f) }));
  }

  // TIKTOK SKICKAR INTE VARJE LIKE (David 2026-10-23, skärmbild från sändningen: Top Likes visade
  // fadwa 2 929, TikToks profilkort 6 289 för samma sändning). tiktok-live-connector säger det själv:
  // "For streams with many viewers, this event is not always triggered by TikTok." Like-meddelandet
  // bär ingen total per tittare — bara inkrementet (`count`) och RUMMETS löpande total (`total`,
  // hos oss `points` lokalt och `value` på molnvägen, se record()). Det som fattas går därför inte
  // att läsa, bara uppskatta.
  //
  // Uppskattningen: hur mycket rummets total steg sedan VYRA började se den, delat med summan av de
  // inkrement VYRA faktiskt fick under samma tid. Kvoten är andelen TikTok inte skickade, och varje
  // tittares tal skalas med den vid VISNING. De lagrade talen (`totals`, dagshinkarna) är de som
  // verkligen kom — ordningen ändras inte av skalningen, bara talen. Davids val 2026-10-23.
  //
  // Golvet (100 mottagna) håller kvoten borta från sändningens första sekunder, där två event ger
  // vilken kvot som helst. Taket (20) hindrar en felaktig total från att blåsa upp listan.
  function noteraRum(e, count) {
    if (e.__test || e.__simulerad || /^test-/.test(String(e.id || ''))) return;
    const total = Number(e.points ?? e.value);
    if (!(total > 0)) return;
    // Första totalen är startpunkten: likes före den räknades av TikTok men inte av oss, så det
    // egna inkrementet hör inte heller med.
    if (rum.start === null) { rum.start = total; rum.senast = total; return; }
    if (total < rum.start) rum.start = total;          // ett event i otakt flyttar bara startpunkten
    if (total > rum.senast) rum.senast = total;
    rum.mottaget += count;
  }
  function likeFaktor() {
    const steg = rum.senast - (rum.start ?? rum.senast);
    if (rum.mottaget < LIKE_FAKTOR_MIN_MOTTAGET || steg <= rum.mottaget) return 1;
    return Math.min(LIKE_FAKTOR_MAX, steg / rum.mottaget);
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

  // Samma vaeljare som gift-event-images.js SHAPES.templateTopGift, lasta darifran nar modulen
  // finns. ':scope > strong/em' ar den klassiska markupen (media.js vyraTopGift) och finns kvar for
  // den; neon, royal och fokus har namnet i .topgift-copy och ramen i .tgf-plate. Tidigare letade
  // den har filen BARA efter ':scope > strong', som inte traffar nagon av de tre designerna — bilden
  // byttes men namnet stod kvar (uppmatt 2026-10-18 i Edge, Heart Me fran tva tittare).
  function topGiftValjare(falt) {
    const shape = window.VyraGiftImages?.shapes?.templateTopGift;
    const reserv = falt === 'name' ? '.topgift-copy strong, .tgf-plate strong' : '.topgift-copy em, .tgf-plate em';
    return (shape?.[falt] || reserv) + (falt === 'name' ? ', :scope > strong' : ', :scope > em');
  }

  function skrivTopGift(w, el, tg) {
    if (!el) return;
    const profile = el.querySelector('.vyra-profile-face img');
    const gift = el.querySelector('.vyra-gift-face img');
    if (profile && tg.profileImage) {
      const url = VyraSafe.src(tg.profileImage);
      if (profile.getAttribute('src') !== url) profile.src = url;
    }
    if (gift && tg.giftImage) {
      const url = VyraSafe.src(tg.giftImage);
      if (gift.getAttribute('src') !== url) gift.src = url;
    }
    el.querySelectorAll(topGiftValjare('name')).forEach(n => { if (n.textContent !== tg.name) n.textContent = tg.name; });
    // Gavans namn under bilden (klassiska markupen, media.js vyraTopGift). Utan den stod det gamla
    // rekordets gavonamn kvar bredvid den nya bilden efter en omhamtad konfiguration.
    const giftLabel = tg.giftName ? el.querySelector('.vyra-gift-face span') : null;
    if (giftLabel && giftLabel.textContent !== tg.giftName) giftLabel.textContent = tg.giftName;
    // Tecknet framfor siffran ar designens (◉ i neon, inget i royal/fokus dar CSS ritar det), sa
    // det behalls — samma regel som patchen i gift-event-images.js, och samma tal, annars skriver
    // de tva skrivarna olika text i samma nod.
    // Design 1 (premium neon) ritar myntet som ett <i> forst i <em> (ranking-sixpack.js enkelLasbar):
    // da skrivs bara textnoden efter det, som i skrivTal nedan — textContent rev myntet vid forsta
    // gavan (slutgranskningen 2026-10-20, A-001).
    el.querySelectorAll(topGiftValjare('value')).forEach(n => {
      const ikon = n.firstElementChild;
      if (ikon && ikon.tagName === 'I') { skrivTal(n, tg.value, true); return; }
      const text = String(n.textContent || '').match(/^\D*/)[0] + tg.value;
      if (n.textContent !== text) n.textContent = text;
    });
  }

  function updateTopGift(e, person) {
    if (typeof state === 'undefined' || !state?.widgets) return;
    const image = e.giftImage || e.image || e.giftPicture || e.gift?.image || '';
    // Top Gift är en topplista, inte "senaste gåvan": bara en STRIKT större gåva byter person.
    //
    // Beslutet fattas EN gång per händelse, i gift-event-images.js (records.bedom), och den här
    // filen läser det. Tidigare hade den egen jämförelse (`value < records.giftCoins` ⇒ hoppa över),
    // som släppte igenom en gåva LIKA stor som rekordet medan gift-event-images.js räknade strikt —
    // två regler för samma rekord. Det gick inte att bara byta till `<=`: gift-event-images.js laddas
    // först och har redan höjt rekordet för samma händelse, så då hade varje riktigt rekord stoppats.
    //
    // Saknas modulen (äldre överlägg som inte laddar den) faller vi tillbaka på det gamla
    // beteendet — varje gåva — i stället för att sluta uppdatera helt.
    const records = window.VyraGiftRecords;
    let value;
    if (records && typeof records.bedom === 'function') {
      const beslut = records.bedom(e);
      if (!beslut || !beslut.gift) return;
      value = beslut.giftVarde;
    } else {
      // Det som jämförs är GÅVANS värde, inte combons summa: elva rosor är 1, inte 11.
      const summa = Number(e.diamonds || e.coins || e.diamondCount || e.value);
      const n = Math.round(Number(e.count));
      // person.diamonds är tittarens ACKUMULERADE bidrag, inte en gåva — den får aldrig delas med antalet.
      value = Number.isFinite(summa) && summa > 0
        ? Math.round(summa / (Number.isFinite(n) && n >= 1 ? n : 1)) : person.diamonds;
      if (records && !(value > records.giftCoins)) return;
    }
    const tg = { name: person.name, profileImage: person.profileImage || '', giftImage: image,
      giftName: String(e.giftName || e.gift || ''), value };
    senasteTopGift = tg;
    streamDirty = true;
    // INGEN save() och ingen render(). save() här gav i overlayn en ny konfiguration och en hel
    // omritning per gåva — widgetar som blinkade (uppmätt 2026-10-18). Livedata patchas i state (så
    // att en senare render() ritar rätt) och i DOM, precis som Top Like och Top Streak.
    state.widgets.filter(w => w.type === 'templateTopGift').forEach(w => {
      aterstalldaTopGift.add(w);   // objektet bar redan livevardet; tickern behover inte skriva det igen
      w.dataName = tg.name;
      w.profileImage = tg.profileImage || w.profileImage;
      if (image) w.giftImage = image;
      w.dataValue = value;
      const el = document.querySelector(`.vyra-topgift[data-id="${w.id}"]`);
      if (!el) return;
      skrivTopGift(w, el, { ...tg, profileImage: w.profileImage, giftImage: w.giftImage });
      armFlip(el);
    });
  }

  // Efter en omladdning: lägg tillbaka sändningens Top Gift EN gång per widget, i state och DOM.
  // Konfigurationen bär inte längre livevärdet (ingen save() per gåva), så utan det här hade Top
  // Gift stått på det sparade/demo-värdet tills nästa rekord.
  function aterstallTopGift() {
    if (!senasteTopGift || typeof state === 'undefined' || !state?.widgets) return;
    lyftTroskel();
    state.widgets.forEach(w => {
      if (!w || w.type !== 'templateTopGift' || aterstalldaTopGift.has(w)) return;
      aterstalldaTopGift.add(w);
      w.dataName = senasteTopGift.name;
      if (senasteTopGift.profileImage) w.profileImage = senasteTopGift.profileImage;
      if (senasteTopGift.giftImage) w.giftImage = senasteTopGift.giftImage;
      if (senasteTopGift.giftName) w.giftName = senasteTopGift.giftName;
      w.dataValue = senasteTopGift.value;
      skrivTopGift(w, document.querySelector(`.vyra-topgift[data-id="${w.id}"]`),
        { ...senasteTopGift, profileImage: w.profileImage, giftImage: w.giftImage });
    });
  }

  // SKRIV TALET UTAN ATT RIVA IKONEN. Top Coins v2 (topcoins-v2.js) ritar myntet som ett stylat
  // <i> forst i <em>: `<em><i>V</i>44 999 COINS</em>`. textContent byter ut ALLA barn, sa det
  // forsta livevardet gjorde myntet till ett vanligt "V" i lopande text — och ikonen som lastes ur
  // textContent.trim().split(' ')[0] blev "V44", inte "V". Uppmatt 2026-09-20 (PR #487).
  //
  // Finns ett <i> forst i <em> star det kvar och talet skrivs i textnoden EFTER det. Rader utan
  // <i> (Top Like: ikonen ar text, ♥) tar exakt den gamla vagen: ikonen ar forsta ordet i texten
  // och hela strangen skrivs om. `baraOmAndrat` ar nollningsgrenens regel (se `satt` dar) och
  // galler ikonvagen i BADA grenarna — en identisk skrivning ar anda en DOM-mutation.
  //
  // firstElementChild, inte querySelector: ikonen ar per design det forsta barnet, och egenskapen
  // saknas helt i den handbyggda DOM:en i tests/overlay-live-leaderboards.test.js, som da tar den
  // gamla vagen utan att nagot kastar.
  function skrivTal(em, tal, baraOmAndrat) {
    const ikon = em.firstElementChild;
    if (!ikon || ikon.tagName !== 'I') {
      const text = (em.textContent.trim().split(' ')[0] || '♥') + ' ' + tal;
      if (!baraOmAndrat || em.textContent !== text) em.textContent = text;
      return;
    }
    const text = ' ' + tal;
    const sista = em.lastChild;
    if (sista && sista.nodeType === 3) { if (sista.nodeValue !== text) sista.nodeValue = text; }
    else em.append(text);
  }

  function updateLiveLeaderboards() {
    if (typeof state === 'undefined' || !state?.widgets) return;
    try { aterstallTopGift() } catch (e) {}
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
      const metric = matt(w.liveMetric || (w.type === 'templateTopCoins' ? 'diamonds' : 'likes'));
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
      // filters on likes > 0, so a like stream whose events carry count 0 never produces a
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
        // NOLLRADEN TAR DEMORADENS PLATS (2026-10-20): texten som töms sparas i data-noll-plats och
        // ritas osynligt av ranking-sixpack.css, så lådan är lika stor i OBS som i Layout. Samma
        // regel som zeroRankingRows() i live-zero-state.js.
        const reservera = (el, varde) => {
          varde = String(varde || '').trim();
          if (el && varde && typeof el.setAttribute === 'function' && !/^\D*0$/.test(varde) && el.getAttribute('data-noll-plats') !== varde) el.setAttribute('data-noll-plats', varde);
        };
        rows.forEach(row => {
          const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
          if (strong) reservera(strong, strong.textContent);
          if (small) reservera(small, small.textContent);
          if (em && /\d/.test(em.textContent || '')) {
            const sista = em.lastChild;
            reservera(em, sista && sista.nodeType === 3 && em.firstElementChild ? sista.nodeValue : em.textContent);
          }
          satt(strong, '');
          satt(small, '');
          if (em) skrivTal(em, '0', true);
        });
        return;
      }
      rows.forEach((row, i) => {
        const person = top[i];
        // `!important`, INTE en vanlig inline-stil. Temana deklarerar radens layout med samma
        // vapen (studio.css: `.toplike-row:has(>.pro-avatar-frame){display:grid!important}`,
        // podiet `.toplike-row:nth-child(-n+3){display:flex!important}` — 31 sådana regler), och
        // `row.style.display = 'none'` förlorade mot dem. UPPMÄTT 2026-10-11, overlay med en
        // likare: inline 'none', prioritet '', beräknat 'grid', 58 px hög — fyra tomma rader med
        // "0 ♥" under det enda namnet, i alla 20 rankingdesigner. Davids regel nr 1: en likare =
        // en rad. Samma fälla som vyra-tom-widget.js redan dokumenterar för hela widgeten.
        if (person) row.style.removeProperty('display');
        else row.style.setProperty('display', 'none', 'important');
        if (!person) return;
        const strong = row.querySelector('strong'), em = row.querySelector('em'), small = row.querySelector('small');
        if (strong) strong.textContent = person.name;
        if (small) small.textContent = '@' + person.name.toLowerCase().replace(/\s+/g, '');
        if (em) skrivTal(em, formatNum(person[metric]), false);
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
  // vyra-stor-avatar.js: profilsidans 1080 px-bild ersätter 72 px-eventbilden i registret, så nästa
  // repaint (tickern) ritar den stora i raderna och i Top Gift.
  addEventListener('vyra-stor-avatar', e => {
    const d = e.detail || {}, t = totals[d.username];
    if (t && d.stor && (t.profileImage === d.liten || !t.profileImage)) t.profileImage = d.stor;
    if (senasteTopGift && d.stor && senasteTopGift.profileImage === d.liten) { senasteTopGift.profileImage = d.stor; streamDirty = true; }
  });
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

  // NY SANDNING => "Denna stream" borjar om. `totals` ar sessionsraknaren och ingenting annat;
  // dailyTotals (localStorage) ar historiken bakom periodvalen Idag/Vecka/Manad/Ar och ska INTE
  // roras — den forra sandningens siffror hor hemma i gar, inte i den nya sandningens topplista.
  // Bara live:start: nar sandningen tar slut ska den sista listan sta kvar pa skarmen.
  addEventListener('vyra-live-session', event => {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    try {
      saveDailyIfDirty();                       // historiken skrivs ner INNAN raknaren nollas
      for (const key of Object.keys(totals)) delete totals[key];
      senasteTopGift = null;
      rum.start = null; rum.senast = 0; rum.mottaget = 0;
      // Ogonblicksbilden skrivs om DIREKT, inte vid nasta tick: ett OBS som river kallan i
      // samma sekund som sandningen borjar skulle annars hitta forra sandningens siffror.
      streamDirty = true;
      saveStreamIfDirty();
      updateLiveLeaderboards();
    } catch (e) {}
  });

  window.VyraLeaderboard = {
    getTop: (metric = 'likes', count = 10) => sortedTop(metric).slice(0, count),
    remove: username => { if (totals[username]) totals[username].present = false; },
    // Hur mycket TikTok inte skickade: faktorn topplistan skalar likes med, och underlaget för den.
    likeTackning: () => ({ faktor: likeFaktor(), mottaget: rum.mottaget, rummetSteg: rum.start === null ? 0 : rum.senast - rum.start })
  };
})();
