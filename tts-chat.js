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

  // --- Speech queue: the browser can only speak one utterance cleanly at a time, so a burst of
  // matching chat messages has to queue rather than overlap. maxQueueLength mirrors the same
  // "drop new arrivals once full" pattern action-runtime.js already uses for overlay scene queues.
  const queue = [];
  let speaking = false;
  function playNext() {
    if (speaking || !queue.length) return;
    const { text, opts } = queue.shift();
    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    if (opts.language) u.lang = opts.language;
    u.rate = Number(opts.speed) || 1;
    u.pitch = Number(opts.pitch) || 1;
    u.volume = (Number(opts.volume) ?? 80) / 100;
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      if (opts.randomVoice) u.voice = voices[Math.floor(Math.random() * voices.length)];
      else if (opts.voice) u.voice = voices.find(v => v.name === opts.voice) || null;
    }
    u.onend = u.onerror = () => { speaking = false; playNext() };
    speechSynthesis.speak(u);
  }
  function enqueueSpeech(text, opts, maxQueueLength) {
    if (!text || !window.speechSynthesis) return false;
    if (queue.length >= Math.max(1, Number(maxQueueLength) || 5)) return false;
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
      if (!cmd || t.toLowerCase().indexOf(cmd.toLowerCase()) !== 0) return null;
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
    if (settings.chargePoints) {
      if (!window.VyraPoints || !window.VyraPoints.spend(username, settings.costPerMessage)) return;
    }
    cooldowns[key] = now;
    const nickname = ev.name || username;
    const spoken = String(settings.messageTemplate || '{comment}')
      .replace(/\{nickname\}/g, nickname)
      .replace(/\{username\}/g, username)
      .replace(/\{comment\}/g, content);
    const opts = { language: settings.language, voice: special?.voice || settings.voice, randomVoice: !special?.voice && settings.randomVoice, speed: special?.speed || settings.speed, pitch: special?.pitch || settings.pitch, volume: settings.volume };
    if (enqueueSpeech(spoken, opts, settings.maxQueueLength)) pushLog({ time: now, username, nickname, text: spoken });
  }
  addEventListener('vyra-live-event', e => {
    const ev = e.detail || {};
    const type = String(ev.type || ev.event || '').toLowerCase().replace(/[\s_-]/g, '');
    if (type === 'chat' || type === 'comment') handleChat(ev);
  });

  // --- UI --------------------------------------------------------------------------------------
  function populateVoiceSelect(select, selected) {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    select.innerHTML = '<option value="">Standardröst</option>' + voices.map(v => `<option value="${v.name}"${v.name === selected ? ' selected' : ''}>${v.name} (${v.lang})</option>`).join('');
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
        <div id="ttsSpecialRows">${(s.specialUsers || []).map(specialUserRow).join('') || '<p class="ae-timer-hint">Inga specialanvändare tillagda.</p>'}</div>
        <button type="button" id="ttsAddSpecial" class="primary">＋ Lägg till användare</button>
      </section>
      <section class="card tts-tester">
        <header><h3>Röstprovare</h3></header>
        <div class="tts-tester-row"><input id="ttsTesterText" placeholder="Skriv en text att testa..." value="Hej och välkommen till livet!"><button type="button" id="ttsTesterPlay" class="primary">▶ Spela upp</button></div>
      </section>
      <section class="card tts-logs">
        <header><h3>TTS-logg</h3><button type="button" id="ttsClearLog">Rensa</button></header>
        <div class="tts-log-list">${log.length ? log.map(l => `<div class="tts-log-row"><small>${new Date(l.time).toLocaleTimeString('sv-SE')}</small><b>${l.nickname || l.username}:</b><span>${l.text}</span></div>`).join('') : '<p class="ae-timer-hint">Inget upplästs ännu.</p>'}</div>
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
    populateVoiceSelect(root.querySelector('#ttsVoice'), getSettings().voice);
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => populateVoiceSelect(root.querySelector('#ttsVoice'), getSettings().voice);

    root.querySelector('[name=ttsCommentType]')?.closest('.ae-radio-list').querySelectorAll('input').forEach(x => x.onchange = () => { root.querySelector('#ttsCommand').disabled = x.value !== 'command' || !x.checked });
    root.querySelectorAll('[name=ttsCharge]').forEach(x => x.onchange = () => { root.querySelector('#ttsCost').disabled = x.value !== 'yes' || !x.checked });

    function wireSpecialRows() {
      root.querySelectorAll('.tts-special-row').forEach(row => {
        populateVoiceSelect(row.querySelector('.ttsSuVoice'), getSettings().specialUsers?.[+row.dataset.i]?.voice || '');
        row.querySelector('.tts-su-remove').onclick = () => {
          const s = getSettings();
          s.specialUsers.splice(+row.dataset.i, 1);
          setSettings(s);
          rerender();
        };
      });
    }
    wireSpecialRows();
    root.querySelector('#ttsAddSpecial').onclick = () => {
      const s = getSettings();
      s.specialUsers = s.specialUsers || [];
      s.specialUsers.push({ username: '', allowed: true, voice: '', speed: '', pitch: '' });
      setSettings(s);
      rerender();
    };

    root.querySelector('#ttsTesterPlay').onclick = () => {
      const text = root.querySelector('#ttsTesterText').value.trim();
      if (!text) return window.toast?.('Skriv en text att testa');
      const s = getSettings();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (s.language) u.lang = s.language;
      u.rate = Number(s.speed) || 1;
      u.pitch = Number(s.pitch) || 1;
      u.volume = (Number(s.volume) ?? 80) / 100;
      const voices = speechSynthesis.getVoices();
      if (voices.length) { if (s.randomVoice) u.voice = voices[Math.floor(Math.random() * voices.length)]; else if (s.voice) u.voice = voices.find(v => v.name === s.voice) || null }
      speechSynthesis.speak(u);
    };

    root.querySelector('#ttsClearLog').onclick = () => { clearLog(); rerender() };

    root.querySelector('#ttsSaveSettings').onclick = () => {
      const specialRows = [...root.querySelectorAll('.tts-special-row')].map(row => ({
        username: row.querySelector('.ttsSuUser').value.trim().replace(/^@/, ''),
        allowed: row.querySelector('.ttsSuAllowed').checked,
        voice: row.querySelector('.ttsSuVoice').value,
        speed: row.querySelector('.ttsSuSpeed').value ? +row.querySelector('.ttsSuSpeed').value : '',
        pitch: row.querySelector('.ttsSuPitch').value ? +row.querySelector('.ttsSuPitch').value : ''
      })).filter(u => u.username);
      const next = {
        enabled: root.querySelector('#ttsEnabled').checked,
        language: root.querySelector('#ttsLanguage').value.trim(),
        voice: root.querySelector('#ttsVoice').value,
        randomVoice: root.querySelector('#ttsRandomVoice').checked,
        speed: +root.querySelector('#ttsSpeed').value || 1,
        pitch: +root.querySelector('#ttsPitch').value || 1,
        volume: +root.querySelector('#ttsVolume').value || 80,
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
      setSettings(next);
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
