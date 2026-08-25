// TTS Chat — TikFinity's dedicated "Text-to-Speech Chat" page (tikfinity.zerody.one/tiktok/tts):
// reads viewer chat comments aloud automatically via the browser's own SpeechSynthesis engine, no
// overlay required. Distinct from the TTS Action type already in Actions & Events (action-runtime.js's
// tts()), which reads a fixed pre-written line when a specific Event fires — this instead listens to
// EVERY live chat message continuously and decides per-message whether to read it, with the same
// settings surface TikFinity exposes: audience gating, comment-type triggers, points cost, per-user
// voice overrides, spam protection, and a message template.
(() => {
  const KEY = 'vyra-tts-chat-v1';
  const LOG_KEY = 'vyra-tts-chat-log-v1';
  const DEFAULTS = {
    enabled: false,
    language: '',
    voice: '',
    randomVoice: false,
    speed: 1,
    pitch: 1,
    volume: 80,
    audience: { all: true, follower: false, subscriber: false, moderator: false, team: false, teamMinLevel: 1, topGifter: false, topGifterCount: 3, list: false },
    allowedUsernames: [],
    commentType: 'any',
    command: '!tts',
    chargePoints: false,
    costPerMessage: 10,
    specialUsers: [],
    cooldownSeconds: 5,
    maxQueueLength: 5,
    maxCommentLength: 200,
    filterLetterSpam: true,
    filterMentions: true,
    filterCommands: true,
    messageTemplate: '{nickname} säger {comment}'
  };
  const getSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}'), audience: { ...DEFAULTS.audience, ...(JSON.parse(localStorage.getItem(KEY) || '{}').audience || {}) } } } catch { return { ...DEFAULTS } } };
  const setSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} };
  const getLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] } };
  const pushLog = entry => { const log = [entry, ...getLog()].slice(0, 50); try { localStorage.setItem(LOG_KEY, JSON.stringify(log)) } catch {} };
  const clearLog = () => { try { localStorage.removeItem(LOG_KEY) } catch {} };

  // --- Cloud voices: TikFinity's own "Female Voice"/"Male Voice" free tier turned out to be
  // backed by their own server (confirmed via a POST to their /api/tts/auth-token when testing
  // it), not the browser's native voice list — that's the only way to guarantee a real
  // male/female voice regardless of what's installed on a viewer's own OS. VYRA's equivalent
  // (server/tts.js) is free and needs no account: it's backed by the same neural voice service
  // behind Microsoft Edge's "Read Aloud" feature. Cloud voice values are stored/passed around as
  // plain strings prefixed "cloud:<voiceName>" so the existing single `voice` field can hold
  // either a local SpeechSynthesis voice name or a cloud one without a second settings field.
  function isCloudVoice(v) { return typeof v === 'string' && v.startsWith('cloud:'); }
  function cloudVoiceName(v) { return v.slice(6); }
  function currentWorkspaceId() { return window.VyraAuth?.lastDetail?.()?.workspaces?.[0]?.id || null; }
  const cloudVoiceCache = {};
  async function fetchCloudVoices(languageCode) {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !window.VyraAuth) return [];
    const cacheKey = languageCode || '*';
    if (cloudVoiceCache[cacheKey]) return cloudVoiceCache[cacheKey];
    try {
      const q = languageCode ? `?languageCode=${encodeURIComponent(languageCode)}` : '';
      const res = await window.VyraAuth.api(`/api/workspaces/${workspaceId}/tts/voices${q}`);
      cloudVoiceCache[cacheKey] = res.voices || [];
      return cloudVoiceCache[cacheKey];
    } catch { return [] }
  }

  // Treats only null/undefined/'' as "unset" — unlike `||`, this correctly keeps an explicit 0
  // (e.g. a special user's pitch deliberately set to the lowest allowed value).
  function numOrFallback(v, fallback) { return (v === '' || v === null || v === undefined) ? fallback : v; }

  // --- Speech queue: the browser can only speak one utterance cleanly at a time, so a burst of
  // matching chat messages has to queue rather than overlap. maxQueueLength mirrors the same
  // "drop new arrivals once full" pattern action-runtime.js already uses for overlay scene queues.
  //
  // KÖN LEVER NUMERA I vyra-tal.js (§14). Den här filens kö var talspecifik — enheten var
  // {text, opts} — medan det verkliga villkoret är "ett ljud i taget". Actions hade ingen väg in,
  // så en TTS-action startade mitt i en uppläsning: uppmätt 12 ms in, två röster samtidigt.
  //
  // Uppspelningen ligger kvar HÄR, för det är här kunskapen om cloud:-röster och Special Users
  // finns. Bara serialiseringen flyttade. `tala()` nedan är samma väg, exponerad så att en action
  // kan använda den — och därmed nå molnrösterna, som var §14:s andra halva.
  //
  // Den lokala kön finns kvar som reservväg. Saknas vyra-tal.js (laddningsfel, cacheskev) läser
  // chatten upp precis som förr, en i taget.
  const queue = [];
  let speaking = false;
  function hasQueueRoom(maxQueueLength) {
    const tal = window.VyraTal;
    const langd = tal ? tal.koLangdDelad() : queue.length;
    return langd < Math.max(1, Number(maxQueueLength) || 5);
  }
  // Det <audio>-element molnrosten spelar just nu, sa att ett pagaende yttrande gar att tysta.
  let pagaendeLjud = null;
  function tystaPagaende() {
    try { window.speechSynthesis && window.speechSynthesis.cancel() } catch (e) {}
    if (pagaendeLjud) {
      try { pagaendeLjud.pause(); pagaendeLjud.src = '' } catch (e) {}
      pagaendeLjud = null;
    }
  }

  // Ett löfte som håller tills rösten faktiskt tystnat — det är kontraktet VyraTal.koa vilar på.
  function spelaUpp(text, opts) {
    if (isCloudVoice(opts.voice)) {
      return speakCloud(text, opts).catch(err => { console.warn('[VYRA TTS Chat] molnröst misslyckades', err) });
    }
    return new Promise(klar => speakLocal(text, opts, klar));
  }
  function playNext() {
    if (speaking || !queue.length) return;
    const { text, opts } = queue.shift();
    speaking = true;
    let finished = false;
    const done = () => { if (finished) return; finished = true; speaking = false; playNext() };
    // Real browser flakiness (documented, e.g. around tab backgrounding): SpeechSynthesis
    // sometimes never fires onend/onerror at all. Without a fallback, `speaking` stays true
    // forever and the whole queue jams permanently until the page is reloaded.
    const safety = setTimeout(done, Math.max(8000, text.length * 120));
    const wrappedDone = () => { clearTimeout(safety); done() };
    spelaUpp(text, opts).then(wrappedDone, wrappedDone);
  }
  function speakLocal(text, opts, done) {
    const u = new SpeechSynthesisUtterance(text);
    if (opts.language) u.lang = opts.language;
    u.rate = Number(opts.speed) || 1;
    u.pitch = Number(opts.pitch) ?? 1;
    u.volume = (Number(opts.volume) ?? 80) / 100;
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      if (opts.randomVoice) u.voice = voices[Math.floor(Math.random() * voices.length)];
      else if (opts.voice && !isCloudVoice(opts.voice)) u.voice = voices.find(v => v.name === opts.voice) || null;
    }
    u.onend = u.onerror = done;
    try { speechSynthesis.speak(u) } catch { done() }
  }
  async function speakCloud(text, opts) {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !window.VyraAuth) throw new Error('Molnröster kräver ett inloggat workspace');
    const result = await window.VyraAuth.api(`/api/workspaces/${workspaceId}/tts/synthesize`, {
      method: 'POST',
      body: JSON.stringify({ text, languageCode: opts.language || undefined, voiceName: cloudVoiceName(opts.voice), speed: opts.speed, pitch: opts.pitch })
    });
    const audio = new Audio('data:audio/mpeg;base64,' + result.audioContent);
    audio.volume = (Number(opts.volume) ?? 80) / 100;
    pagaendeLjud = audio;
    try {
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        // En PAUS raknas som klart, inte som fel: det ar sa ett avbrutet yttrande slutar, och ett
        // kast dar hade bara blivit en varning i loggen om nagot vi sjalva bad om.
        audio.onpause = resolve;
        audio.onerror = () => reject(new Error('Uppspelning misslyckades'));
        audio.play().catch(reject);
      });
    } finally { if (pagaendeLjud === audio) pagaendeLjud = null }
  }
  function enqueueSpeech(text, opts, maxQueueLength) {
    if (!text) return false;
    if (!isCloudVoice(opts.voice) && !window.speechSynthesis) return false;
    if (!hasQueueRoom(maxQueueLength)) return false;
    const tal = window.VyraTal;
    if (tal?.koa) return tal.koa({ kalla: 'tts-chat', maxKo: maxQueueLength, maxMs: text.length * 120,
      spela: () => spelaUpp(text, opts),
      // Hur just DEN har posten tystas. Lokal rost stoppas av speechSynthesis.cancel(); molnrosten
      // ar ett <audio>-element som pausas. Loftet i spela() loser sig da av sig sjalvt.
      avbryt: () => tystaPagaende() });
    queue.push({ text, opts });
    playNext();
    return true;
  }

  // --- Matching pipeline ---------------------------------------------------------------------
  const cooldowns = {};
  function specialUserFor(settings, username) {
    return (settings.specialUsers || []).find(s => String(s.username || '').toLowerCase() === String(username || '').toLowerCase());
  }
  // Special Users is a permission override ("allow and disallow users to use TTS"), not a trigger
  // override — it decides WHO may use TTS, separate from Comment Types which decides WHAT counts
  // as a TTS-triggering message. An allowed special user still has to match Comment Types below.
  function matchesAudience(settings, ev) {
    const a = settings.audience || {};
    if (a.all) return true;
    if (a.follower && ev.isFollower) return true;
    if (a.subscriber && (ev.isSubscriber || ev.isMember)) return true;
    if (a.moderator && ev.isModerator) return true;
    if (a.team && Number(ev.teamLevel || 0) >= Number(a.teamMinLevel || 1)) return true;
    if (a.topGifter && ev.isTopGifter) return true;
    if (a.list && (settings.allowedUsernames || []).some(u => String(u).replace(/^@/, '').toLowerCase() === String(ev.username || '').toLowerCase())) return true;
    return false;
  }
  // Comment Types decides WHAT gets read, and for command mode strips the command word itself —
  // this is also what fixes the earlier-noted rough edge in the generic Actions & Events TTS
  // action, where {comment} included the "!tts " prefix verbatim.
  function extractContent(settings, text) {
    const t = text.trim();
    if (settings.commentType === 'dot') return t.startsWith('.') ? t.slice(1).trim() : null;
    if (settings.commentType === 'slash') return t.startsWith('/') ? t.slice(1).trim() : null;
    if (settings.commentType === 'command') {
      const cmd = String(settings.command || '!tts').trim();
      if (!cmd) return null;
      // Require a word boundary after the command — a plain prefix match would let "!ttsyeah"
      // match the "!tts" command and get read as "yeah", which isn't the command at all.
      const lower = t.toLowerCase(), cmdLower = cmd.toLowerCase();
      if (lower !== cmdLower && !lower.startsWith(cmdLower + ' ')) return null;
      return t.slice(cmd.length).trim();
    }
    return t;
  }
  function filterContent(settings, content) {
    let c = content;
    if (settings.filterMentions) c = c.replace(/@\S+/g, '').trim();
    if (settings.filterLetterSpam) c = c.replace(/(.)\1{3,}/g, '$1$1$1');
    if (settings.maxCommentLength && c.length > settings.maxCommentLength) c = c.slice(0, settings.maxCommentLength);
    return c.trim();
  }

  function handleChat(ev) {
    const settings = getSettings();
    if (!settings.enabled) return;
    const username = ev.username || ev.uniqueId || ev.user;
    if (!username) return;
    const text = String(ev.comment || ev.name || '');
    if (!text.trim()) return;
    if (settings.filterCommands && settings.commentType !== 'command' && text.trim().startsWith('!')) return;
    const special = specialUserFor(settings, username);
    if (special && special.allowed === false) return;
    if (!special && !matchesAudience(settings, ev)) return;
    let content = extractContent(settings, text);
    if (content === null) return;
    content = filterContent(settings, content);
    if (!content) return;
    const key = String(username).toLowerCase();
    const now = Date.now();
    if (cooldowns[key] && now - cooldowns[key] < settings.cooldownSeconds * 1000) return;
    // Check queue capacity BEFORE charging points or setting the cooldown — charging a viewer (or
    // burning their cooldown) for a message that then gets silently dropped because the queue was
    // full would be an unfair, invisible charge.
    if (!hasQueueRoom(settings.maxQueueLength)) return;
    // AVDRAGET HOR TILL AUTOMATIONSMASTERN (§14/§15a). Utan den har graden lasers samma chattrad
    // upp av VARJE oppen flik och kostar en gang per flik — uppmatt 2026-08-17 med tre flikar:
    // tre roster i mun pa varandra och tre avdrag for EN rad. Kostnaden ar en ekonomifraga och
    // dras dar automationen redan har sin enda forare; VAR det later avgors separat, av
    // rost-mastern i vyra-tal.js. Saknas modulen kor vi som forr (fail-open).
    if (window.VyraAutomationMaster && !window.VyraAutomationMaster.farKora()) return;
    if (settings.chargePoints) {
      if (!window.VyraPoints || !window.VyraPoints.spend(username, settings.costPerMessage)) return;
    }
    cooldowns[key] = now;
    const nickname = ev.name || username;
    const spoken = String(settings.messageTemplate || '{comment}')
      .replace(/\{nickname\}/g, nickname)
      .replace(/\{username\}/g, username)
      .replace(/\{comment\}/g, content);
    // `??`, not `||` — a special user explicitly set to speed/pitch 0 must not fall back to the
    // global default just because 0 is falsy.
    const opts = { language: settings.language, voice: special?.voice || settings.voice, randomVoice: !special?.voice && settings.randomVoice, speed: numOrFallback(special?.speed, settings.speed), pitch: numOrFallback(special?.pitch, settings.pitch), volume: settings.volume };
    if (sandTal(spoken, opts, settings.maxQueueLength)) {
      pushLog({ time: now, username, nickname, text: spoken });
      statusLage.upplasta++;
      statusLage.senasteNamn = String(nickname || username);
      malaTtsStatus();
    }
  }
  // VEM BETALAR OCH VEM LATER AR TVA OLIKA FRAGOR (§14).
  //
  // Automationsmastern bestammer OM raden ska lasas upp och drar kostnaden — en gang. Sedan gar
  // beslutet ut till alla flikar, och rost-mastern ar den som faktiskt talar. De tva ar sallan
  // samma flik: automationen foredrar studion (den far skriva), rosten foredrar en overlay (den
  // hors i OBS). Se vyra-masterval.js for varfor prioriteringen ar inverterad.
  //
  // Tva vagar ut, precis som actions redan skickas: ett document-event nar den EGNA fliken (ett
  // storage-event nar aldrig sin egen skribent) och localStorage nar de andra.
  const TAL_KANAL = 'vyra-tal-utskick';
  function sandTal(text, opts, maxKo) {
    const bud = { id: 'tal-' + Date.now() + '-' + Math.random().toString(36).slice(2), text, opts, maxKo };
    document.dispatchEvent(new CustomEvent('vyra:tal', { detail: bud }));
    try { localStorage.setItem(TAL_KANAL, JSON.stringify(bud)) } catch {}
    return true;
  }
  const hordaBud = new Set();
  function taEmotTal(bud) {
    if (!bud?.text || hordaBud.has(bud.id)) return;
    hordaBud.add(bud.id);
    setTimeout(() => hordaBud.delete(bud.id), 30000);
    if (window.VyraRostMaster && !window.VyraRostMaster.farKora()) return;
    enqueueSpeech(bud.text, bud.opts || {}, bud.maxKo);
  }
  const statusLage = { inkomna: 0, upplasta: 0, senasteNamn: '' };
  document.addEventListener('vyra:tal', e => taEmotTal(e.detail));
  addEventListener('storage', e => { if (e.key === TAL_KANAL && e.newValue) try { taEmotTal(JSON.parse(e.newValue)) } catch {} });

  // Uppspelningen exponerad. action-runtime.js:s tts() anropar den har for att na SAMMA vag som
  // chatten — inklusive molnrosterna, som var oatkomliga for Actions eftersom `cloud:`-prefixet
  // inte sager speechSynthesis nagonting. Serialiseringen skoter VyraTal; det har ar bara talandet.
  window.VyraTtsChat = { tala: (text, opts) => spelaUpp(text, opts || {}), installningar: getSettings };

  addEventListener('vyra-live-event', e => {
    const ev = e.detail || {};
    const type = String(ev.type || ev.event || '').toLowerCase().replace(/[\s_-]/g, '');
    if (type !== 'chat' && type !== 'comment') return;
    // Rakna INNAN filtren. Skillnaden mellan inkommen och upplast chatt ar precis vad
    // panelen behover kunna saga: "jag hor dig, men ingenting passerar dina filter" ar
    // ett helt annat besked an "ingen chatt kommer in".
    statusLage.inkomna++;
    handleChat(ev);
    malaTtsStatus();
  });

  // ---- STATUSRADEN -----------------------------------------------------------------
  //
  // Davids fraga: "hur vet man att den ar kopplad till live?" Svaret var tidigare att det
  // inte gick att se. Kryssrutan "Aktiverad" sager att FUNKTIONEN ar pa, inte att det
  // kommer in nagon chatt, och testknappen bevisar bara att rosten later.
  //
  // Anslutningslaget lases ur `.connection` — SAMMA element som sidhuvudet redan malar ur
  // vyra-server-status (studio-live.js). En egen kalla hade blivit en andra sanning om
  // samma sak, och tva vyer som sager emot varandra kostade en hel kvall tidigare.
  // Laget lases i FORSTA hand ur handelsen sjalv, i andra hand ur `.connection`.
  //
  // Uppmatt i Chrome: med bara DOM-avlasningen lag raden ETT STEG EFTER. Bade studio-live.js och
  // den har filen lyssnar pa vyra-server-status, och ordningen mellan tva lyssnare pa samma
  // handelse ar inte garanterad — sprang vi forst hade sidhuvudet inte hunnit satta klassen an,
  // sa vi malade foregaende lage. Handelsen bar sanningen; DOM-klassen ar bara ett eko av den.
  //
  // Reserven behalls for forsta ritningen, da ingen handelse annu kommit in i den har fliken.
  let sistaAnslutning = null;
  function anslutningsLage() {
    if (sistaAnslutning) return String(sistaAnslutning.state || (sistaAnslutning.connected ? 'live' : 'idle'));
    const e = document.querySelector('.connection');
    if (!e) return 'idle';
    if (e.classList.contains('pausad')) return 'paused';
    return e.classList.contains('connected') ? 'live' : 'idle';
  }
  function ttsPausad() { const l = anslutningsLage(); return l === 'paused' || l === 'suspended' }
  function ttsAnsluten() {
    return ttsPausad() || anslutningsLage() === 'live'
      || !!document.querySelector('.connection')?.classList.contains('connected');
  }

  function ttsStatusText() {
    if (!getSettings().enabled) {
      // Panelen sparar forst nar man trycker Spara, och det ar det SPARADE vardet som styr om
      // chatten lases upp. Raden visar darfor sanningen — men sager rakt ut nar kryssrutan ar
      // i och sparningen glomd, annars ser det ut som att kryssrutan inte fungerar.
      const ikryssad = !!document.querySelector('#ttsEnabled')?.checked;
      return { klass: 'av', text: 'Avstängd',
        detalj: ikryssad ? 'Kryssrutan är i men inte sparad — tryck Spara inställningar.'
                         : 'Kryssa i Aktiverad och tryck Spara för att läsa upp chatten.' };
    }
    // Pausen far sitt EGET besked. "Väntar på chatt" vore ett lofte som inte kan hallas: under
    // en paus kommer det ingen chatt, och det ar inte ett fel. Laget lases ur samma element som
    // sidhuvudet malar, sa de tva kan inte saga emot varandra.
    if (ttsPausad()) {
      return { klass: 'vantar', text: 'Sändningen pausad',
        detalj: 'Ingen chatt kommer in medan pausen varar. Upplasningen fortsätter när du kör igång igen.' };
    }
    if (!ttsAnsluten()) return { klass: 'ingen', text: 'Ingen live ansluten', detalj: 'Anslut TikTok i sidhuvudet — utan anslutning kommer ingen chatt hit.' };
    if (statusLage.upplasta > 0) {
      return { klass: 'lyssnar', text: 'Lyssnar',
        detalj: statusLage.upplasta + (statusLage.upplasta === 1 ? ' uppläst' : ' upplästa')
          + (statusLage.senasteNamn ? ' · senast ' : ''), namn: statusLage.senasteNamn };
    }
    // Chatt kommer in men inget passerar filtren — utan det har beskedet ser det ut som
    // att TTS ar trasig, nar det i sjalva verket ar installningarna som ar for harda.
    if (statusLage.inkomna > 0) {
      return { klass: 'filtrerad', text: 'Hör chatten, men inget passerar filtren',
        detalj: statusLage.inkomna + ' meddelanden in, 0 upplästa — se filter och målgrupp nedan.' };
    }
    return { klass: 'vantar', text: 'Väntar på chatt', detalj: 'Anslutningen är uppe. Nästa kommentar läses upp.' };
  }

  // Malar EN nod. Aldrig innerHTML: tittarnamnet kommer fran TikTok och ska visas som
  // text, inte tolkas. Saknas raden ar en annan vy oppen, och det ar inte ett fel.
  function malaTtsStatus() {
    const rad = document.querySelector('[data-tts-status]');
    if (!rad) return;
    const s = ttsStatusText();
    rad.className = 'tts-status tts-status-' + s.klass;
    rad.textContent = '';
    const prick = document.createElement('i');
    const rubrik = document.createElement('b');
    rubrik.textContent = s.text;
    const detalj = document.createElement('span');
    detalj.textContent = s.detalj;
    if (s.namn) {
      const namn = document.createElement('em');
      namn.textContent = '@' + String(s.namn).replace(/^@/, '');
      detalj.append(namn);
    }
    rad.append(prick, rubrik, detalj);
  }

  addEventListener('vyra-server-status', e => { sistaAnslutning = e.detail?.connection || null; malaTtsStatus() });
  addEventListener('vyra-server-offline', () => { sistaAnslutning = null; malaTtsStatus() });
  // Foregaende kontos siffror far inte folja med in i nasta session.
  addEventListener('vyra-session-ended', () => {
    statusLage.inkomna = 0; statusLage.upplasta = 0; statusLage.senasteNamn = '';
    malaTtsStatus();
  });

  // NY SANDNING => kon toms. En kommentar fran den FORRA sandningen som fortfarande ligger och
  // vantar ska aldrig lasas upp i den nya — den ar da bade inaktuell och forvirrande for tittarna
  // som just kom in. Rost, volym och ovriga installningar (localStorage) lamnas ororda: de ar
  // streamerns val, inte sandningens tillstand.
  addEventListener('vyra-live-session', event => {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    queue.length = 0;
    // DEN DELADE kon ar den som faktiskt talar (vyra-tal.js). Att bara toma den lokala listan
    // lamnade bade den kon och det PAGAENDE yttrandet orort — och ett pagaende yttrande ar flera
    // sekunder langt, alltsa det forsta tittarna hor i den nya sandningen.
    try { window.VyraTal?.tomKo?.({ avbrytPagaende: true, kalla: 'tts-chat' }) } catch (e) {}
    tystaPagaende();
    statusLage.inkomna = 0; statusLage.upplasta = 0; statusLage.senasteNamn = '';
    try { malaTtsStatus() } catch (e) {}
  });

  // --- UI --------------------------------------------------------------------------------------
  function voiceOptionsHtml(localVoices, cloudVoices, selected) {
    const local = localVoices.map(v => `<option value="${v.name}"${v.name === selected ? ' selected' : ''}>${v.name} (${v.lang})</option>`).join('');
    const cloud = cloudVoices.map(v => {
      const value = 'cloud:' + v.name;
      const genderLabel = v.gender === 'FEMALE' ? 'Kvinna' : v.gender === 'MALE' ? 'Man' : '';
      const label = `☁ ${v.friendlyName || v.name}${genderLabel ? ' · ' + genderLabel : ''}`;
      return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`;
    }).join('');
    return '<option value="">Standardröst (lokal)</option>'
      + (local ? `<optgroup label="Lokala röster (den här datorn)">${local}</optgroup>` : '')
      + (cloud ? `<optgroup label="☁ Molnröster (ingår i Premium, funkar överallt)">${cloud}</optgroup>` : '');
  }

  function specialUserRow(s, i) {
    return `<div class="tts-special-row" data-i="${i}">
      <input class="ttsSuUser" placeholder="@användarnamn" value="${s.username || ''}">
      <label class="tts-inline-check"><input type="checkbox" class="ttsSuAllowed" ${s.allowed === false ? '' : 'checked'}>Tillåten</label>
      <select class="ttsSuVoice"><option value="">Standardröst</option></select>
      <input class="ttsSuSpeed" type="number" min="0.5" max="2" step="0.1" placeholder="Hastighet" value="${s.speed || ''}">
      <input class="ttsSuPitch" type="number" min="0" max="2" step="0.1" placeholder="Tonhöjd" value="${s.pitch || ''}">
      <button type="button" class="tts-su-remove" data-i="${i}">×</button>
    </div>`;
  }

  function ttsChatHtml() {
    const s = getSettings();
    const log = getLog();
    return `<div class="page-header section-head"><div><h2>TTS Chat</h2><p>Läs upp tittarnas chattkommentarer automatiskt via Text-to-Speech. Rösten spelas direkt i webbläsaren — ingen overlay krävs. (En egen TTS finns även i Action &amp; Event för mer flexibilitet, t.ex. läsa upp gåvor.)</p></div></div>
    <div class="tts-chat-grid">
      <section class="card tts-general">
        <header><h3>Allmänna inställningar</h3></header>
        <div class="tts-status" data-tts-status></div>
        <label class="tts-enabled-row"><input type="checkbox" id="ttsEnabled" ${s.enabled ? 'checked' : ''}> Aktiverad</label>
        <div class="ae-grid">
          <label>Språk<input id="ttsLanguage" placeholder="t.ex. sv-SE" value="${s.language}"></label>
          <label>Röst<select id="ttsVoice"></select></label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsRandomVoice" ${s.randomVoice ? 'checked' : ''}> Slumpad röst</label>
          <label>Volym<input id="ttsVolume" type="range" min="0" max="100" value="${s.volume}"></label>
          <label>Hastighet<input id="ttsSpeed" type="number" min="0.5" max="2" step="0.1" value="${s.speed}"></label>
          <label>Tonhöjd<input id="ttsPitch" type="number" min="0" max="2" step="0.1" value="${s.pitch}"></label>
        </div>
      </section>
      <section class="card tts-audience">
        <header><h3>Tillåtna användare</h3></header>
        <div class="tts-audience-list">
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudAll" ${s.audience.all ? 'checked' : ''}> Alla användare</label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudFollower" ${s.audience.follower ? 'checked' : ''}> Följare</label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudSubscriber" ${s.audience.subscriber ? 'checked' : ''}> Prenumeranter</label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudModerator" ${s.audience.moderator ? 'checked' : ''}> Moderatorer</label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudTeam" ${s.audience.team ? 'checked' : ''}> <span>Team-medlemmar</span> <span class="tts-inline-num">Min. nivå <input id="ttsAudTeamLevel" type="number" min="1" value="${s.audience.teamMinLevel}"></span></label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudTopGifter" ${s.audience.topGifter ? 'checked' : ''}> <span>Top Gifters</span> <span class="tts-inline-num">Topp <input id="ttsAudTopGifterCount" type="number" min="1" value="${s.audience.topGifterCount}"></span></label>
          <label class="tts-inline-check"><input type="checkbox" id="ttsAudList" ${s.audience.list ? 'checked' : ''}> Tillåtna användare från lista</label>
        </div>
        <label>Lista (ett användarnamn per rad)<textarea id="ttsAllowedList" rows="3" placeholder="@användare1&#10;@användare2">${(s.allowedUsernames || []).join('\n')}</textarea></label>
      </section>
      <section class="card tts-trigger">
        <header><h3>Kommentarstyp</h3></header>
        <div class="ae-radio-list">
          <label><input type="radio" name="ttsCommentType" value="any" ${s.commentType === 'any' ? 'checked' : ''}> Alla kommentarer</label>
          <label><input type="radio" name="ttsCommentType" value="dot" ${s.commentType === 'dot' ? 'checked' : ''}> Kommentarer som börjar med punkt (.)</label>
          <label><input type="radio" name="ttsCommentType" value="slash" ${s.commentType === 'slash' ? 'checked' : ''}> Kommentarer som börjar med snedstreck (/)</label>
          <label><input type="radio" name="ttsCommentType" value="command" ${s.commentType === 'command' ? 'checked' : ''}> Kommentarer som börjar med kommando</label>
        </div>
        <label>Kommando<input id="ttsCommand" value="${s.command}" ${s.commentType === 'command' ? '' : 'disabled'}></label>
        <header class="tts-charge-header"><h3>Kosta poäng</h3></header>
        <div class="ae-radio-list">
          <label><input type="radio" name="ttsCharge" value="no" ${s.chargePoints ? '' : 'checked'}> Nej, det är gratis</label>
          <label><input type="radio" name="ttsCharge" value="yes" ${s.chargePoints ? 'checked' : ''}> Ja, dra följande belopp</label>
        </div>
        <label>Kostnad per meddelande<input id="ttsCost" type="number" min="1" value="${s.costPerMessage}" ${s.chargePoints ? '' : 'disabled'}></label>
        <small class="ae-timer-hint">Har användaren inte tillräckligt med poäng läses kommentaren INTE upp.</small>
      </section>
      <section class="card tts-special">
        <header><h3>Specialanvändare</h3></header>
        <small class="ae-timer-hint">Tillåt/blockera specifika användare och ge dem egna röster.</small>
        <div id="ttsSpecialRows">${(s.specialUsers || []).map(specialUserRow).join('') || '<p class="ae-timer-hint" data-tom="tts-special">Inga specialanvändare tillagda. Lägg till en för egen röst eller blockering.</p>'}</div>
        <button type="button" id="ttsAddSpecial" class="primary">＋ Lägg till användare</button>
      </section>
      <section class="card tts-tester">
        <header><h3>Röstprovare</h3></header>
        <div class="tts-tester-row"><input id="ttsTesterText" placeholder="Skriv en text att testa..." value="Hej och välkommen till livet!"><button type="button" id="ttsTesterPlay" class="primary">▶ Spela upp</button></div>
      </section>
      <section class="card tts-logs">
        <header><h3>TTS-logg</h3><button type="button" id="ttsClearLog">Rensa</button></header>
        <div class="tts-log-list">${log.length ? log.map(l => `<div class="tts-log-row"><small>${new Date(l.time).toLocaleTimeString('sv-SE')}</small><b>${l.nickname || l.username}:</b><span>${l.text}</span></div>`).join('') : '<p class="ae-timer-hint" data-tom="tts-logg">Inget uppläst ännu. När chatten läses upp visas raderna här.</p>'}</div>
      </section>
      <section class="card tts-spam">
        <header><h3>Spamskydd</h3></header>
        <div class="ae-grid">
          <label>Cooldown per användare (sekunder)<input id="ttsCooldown" type="number" min="0" value="${s.cooldownSeconds}"></label>
          <label>Max kölängd<input id="ttsMaxQueue" type="number" min="1" value="${s.maxQueueLength}"></label>
          <label>Max meddelandelängd<input id="ttsMaxLength" type="number" min="1" value="${s.maxCommentLength}"></label>
        </div>
        <label class="tts-inline-check"><input type="checkbox" id="ttsFilterSpam" ${s.filterLetterSpam ? 'checked' : ''}> Filtrera bokstavsspam (t.ex. "aaaaaaaa")</label>
        <label class="tts-inline-check"><input type="checkbox" id="ttsFilterMentions" ${s.filterMentions ? 'checked' : ''}> Filtrera @omnämnanden</label>
        <label class="tts-inline-check"><input type="checkbox" id="ttsFilterCommands" ${s.filterCommands ? 'checked' : ''}> Filtrera !kommandon</label>
      </section>
      <section class="card tts-advanced">
        <header><h3>Avancerat</h3></header>
        <label>Meddelandemall<input id="ttsTemplate" value="${s.messageTemplate}"></label>
        <small class="ae-timer-hint">Platshållare: {nickname} {username} {comment} — Exempel: "{nickname} säger {comment}"</small>
      </section>
    </div>
    <button id="ttsSaveSettings" class="primary tts-save">Spara TTS-inställningar</button>`;
  }

  function bindTtsChat() {
    const root = document.querySelector('#view');
    if (!root) return;
    // Mala EN gang direkt. Utan den har raden ar statusraden TOM tills nasta event kommer in —
    // och i det vanligaste laget (ingen live ansluten) kommer inget event alls, sa den hade
    // statt tom precis nar den behovdes som mest. Uppmatt i riktig Chrome.
    malaTtsStatus();
    // Kryssrutan Aktiverad andrar laget direkt, inte forst nar nasta chattrad kommer.
    root.querySelector('#ttsEnabled')?.addEventListener('change', () => setTimeout(malaTtsStatus, 0));

    async function refreshVoiceOptions() {
      const s = getSettings();
      const localVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      const cloudVoices = await fetchCloudVoices(s.language || 'sv-SE');
      const mainSelect = root.querySelector('#ttsVoice');
      if (mainSelect) mainSelect.innerHTML = voiceOptionsHtml(localVoices, cloudVoices, s.voice);
      root.querySelectorAll('.tts-special-row').forEach(row => {
        const su = s.specialUsers?.[+row.dataset.i];
        const sel = row.querySelector('.ttsSuVoice');
        if (sel) sel.innerHTML = voiceOptionsHtml(localVoices, cloudVoices, su?.voice || '');
      });
    }
    refreshVoiceOptions();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = refreshVoiceOptions;
    root.querySelector('#ttsLanguage').onchange = refreshVoiceOptions;

    root.querySelector('[name=ttsCommentType]')?.closest('.ae-radio-list').querySelectorAll('input').forEach(x => x.onchange = () => { root.querySelector('#ttsCommand').disabled = x.value !== 'command' || !x.checked });
    root.querySelectorAll('[name=ttsCharge]').forEach(x => x.onchange = () => { root.querySelector('#ttsCost').disabled = x.value !== 'yes' || !x.checked });

    function wireSpecialRows() {
      root.querySelectorAll('.tts-special-row').forEach(row => {
        row.querySelector('.tts-su-remove').onclick = () => {
          const s = readFormSettings();
          s.specialUsers.splice(+row.dataset.i, 1);
          setSettings(s);
          rerender();
        };
      });
    }
    wireSpecialRows();
    root.querySelector('#ttsAddSpecial').onclick = () => {
      const s = readFormSettings();
      s.specialUsers.push({ username: '', allowed: true, voice: '', speed: '', pitch: '' });
      setSettings(s);
      rerender();
    };

    root.querySelector('#ttsTesterPlay').onclick = async () => {
      const text = root.querySelector('#ttsTesterText').value.trim();
      if (!text) return window.toast?.('Skriv en text att testa');
      const s = getSettings();
      const opts = { language: s.language, voice: s.voice, randomVoice: s.randomVoice, speed: s.speed, pitch: s.pitch, volume: s.volume };
      if (isCloudVoice(s.voice)) {
        const btn = root.querySelector('#ttsTesterPlay');
        btn.disabled = true; btn.textContent = 'Laddar…';
        try { await speakCloud(text, opts) }
        catch (e) { window.toast?.(e.message || 'Kunde inte spela upp molnrösten') }
        finally { btn.disabled = false; btn.textContent = '▶ Spela upp' }
        return;
      }
      // Don't blindly cancel() — the live chat queue shares this same SpeechSynthesis engine, so
      // testing while a real message is being read would cut it off mid-sentence.
      if (speaking) return window.toast?.('TTS-kön läser upp något just nu — vänta en stund och testa igen');
      speakLocal(text, opts, () => {});
    };

    // Captures every currently-typed field from the DOM (not localStorage) — used both by the
    // explicit Save button and by the add/remove-special-user and clear-log actions, so those
    // don't silently discard whatever the user was mid-editing just because they trigger a
    // rerender() (which always rebuilds the form from last-*saved* state).
    function readFormSettings() {
      const specialRows = [...root.querySelectorAll('.tts-special-row')].map(row => ({
        username: row.querySelector('.ttsSuUser').value.trim().replace(/^@/, ''),
        allowed: row.querySelector('.ttsSuAllowed').checked,
        voice: row.querySelector('.ttsSuVoice').value,
        speed: row.querySelector('.ttsSuSpeed').value !== '' ? +row.querySelector('.ttsSuSpeed').value : '',
        pitch: row.querySelector('.ttsSuPitch').value !== '' ? +row.querySelector('.ttsSuPitch').value : ''
      })).filter(u => u.username);
      return {
        enabled: root.querySelector('#ttsEnabled').checked,
        language: root.querySelector('#ttsLanguage').value.trim(),
        voice: root.querySelector('#ttsVoice').value,
        randomVoice: root.querySelector('#ttsRandomVoice').checked,
        // Check the raw string BEFORE converting to a number — `+'' ` is already `0`, which would
        // be indistinguishable from a deliberately-entered 0 if checked after conversion.
        speed: root.querySelector('#ttsSpeed').value === '' ? 1 : +root.querySelector('#ttsSpeed').value,
        pitch: root.querySelector('#ttsPitch').value === '' ? 1 : +root.querySelector('#ttsPitch').value,
        volume: root.querySelector('#ttsVolume').value === '' ? 80 : +root.querySelector('#ttsVolume').value,
        audience: {
          all: root.querySelector('#ttsAudAll').checked,
          follower: root.querySelector('#ttsAudFollower').checked,
          subscriber: root.querySelector('#ttsAudSubscriber').checked,
          moderator: root.querySelector('#ttsAudModerator').checked,
          team: root.querySelector('#ttsAudTeam').checked,
          teamMinLevel: +root.querySelector('#ttsAudTeamLevel').value || 1,
          topGifter: root.querySelector('#ttsAudTopGifter').checked,
          topGifterCount: +root.querySelector('#ttsAudTopGifterCount').value || 3,
          list: root.querySelector('#ttsAudList').checked
        },
        allowedUsernames: root.querySelector('#ttsAllowedList').value.split('\n').map(x => x.trim().replace(/^@/, '')).filter(Boolean),
        commentType: root.querySelector('[name=ttsCommentType]:checked')?.value || 'any',
        command: root.querySelector('#ttsCommand').value.trim() || '!tts',
        chargePoints: root.querySelector('[name=ttsCharge]:checked')?.value === 'yes',
        costPerMessage: +root.querySelector('#ttsCost').value || 1,
        specialUsers: specialRows,
        cooldownSeconds: +root.querySelector('#ttsCooldown').value || 0,
        maxQueueLength: +root.querySelector('#ttsMaxQueue').value || 5,
        maxCommentLength: +root.querySelector('#ttsMaxLength').value || 200,
        filterLetterSpam: root.querySelector('#ttsFilterSpam').checked,
        filterMentions: root.querySelector('#ttsFilterMentions').checked,
        filterCommands: root.querySelector('#ttsFilterCommands').checked,
        messageTemplate: root.querySelector('#ttsTemplate').value.trim() || '{comment}'
      };
    }

    root.querySelector('#ttsClearLog').onclick = () => { setSettings(readFormSettings()); clearLog(); rerender() };

    root.querySelector('#ttsSaveSettings').onclick = () => {
      setSettings(readFormSettings());
      // Mala om DIREKT. Utan detta stod raden kvar pa "inte sparad" anda tills nasta event kom in
      // — och sparade man medan ingen live var ansluten kom inget event alls. Uppmatt i Chrome:
      // raden lag kvar i fel lage i hela sekvensen till nasta vyra-server-status.
      malaTtsStatus();
      window.toast?.('TTS-inställningar sparade');
    };
  }

  function renderTtsChat() {
    if (!document.querySelector('[data-extra="ttsChat"]')?.classList.contains('active')) return;
    document.querySelector('#title').textContent = 'TTS Chat';
    document.querySelector('#view').innerHTML = ttsChatHtml();
    bindTtsChat();
  }
  function rerender() { renderTtsChat() }

  document.addEventListener('click', e => { if (e.target.closest('[data-extra="ttsChat"]')) setTimeout(renderTtsChat, 0) }, true);
})();
