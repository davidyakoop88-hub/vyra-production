(() => {
  // FÄLTLEVERANTÖR, INTE POLLNING.
  //
  // Filen byggde förr en egen låda ovanför `.ae-grid` och sparade sina fält genom att var 100:e ms
  // i två sekunder läsa `localStorage` och se om actionlistan vuxit, för att sedan klistra sin
  // config på `state.actions.at(-1)`. Tog sparningen längre tid än fyra sekunder försvann alla
  // inställningar tyst — och redigering av en befintlig action var omöjlig, för "den sista i
  // listan" är fel action så fort man inte skapar en ny.
  //
  // Nu ritas fälten i action-event.js:s luckor och lämnas tillbaka i `collect`. Se fältregistret
  // i action-event.js och docs/referens/tikfinity-actions-facit.md.
  const vars = '{username} {giftname} {repeatcount} {coins} {likecount} {totallikecount} {comment} {submonth} {points}';
  const fill = (text = '', p = {}) => text.replace(/\{(\w+)\}/g, (_, k) => ({username:p.username||'TestUser',giftname:p.giftname||p.gift||'Rose',repeatcount:p.repeatcount||p.combo||1,coins:p.coins||1,likecount:p.likecount||0,totallikecount:p.totallikecount||0,comment:p.comment||'',submonth:p.submonth||1,points:window.VyraPoints?.get(p.username)||0}[k] ?? ''));

  // Facit §7. Namnen till vänster är TikFinitys, nycklarna till höger är våra config-fält.
  const overlaySettingsHtml = c => `<div class="ao-global-panel" id="aoGlobalPanel" hidden>
    <h5>Overlay-inställningar</h5>
    <div class="ao-grid">
      <label>Typsnitt<select id="aoFont">${['Noto Sans','Inter','Georgia','Impact','Arial Black','Courier New'].map(f=>`<option value="${f}"${(c.alertFont||'Noto Sans')===f?' selected':''}>${f}</option>`).join('')}</select></label>
      <label>Textstorlek<input id="aoFontSize" type="number" min="10" max="200" value="${Number(c.alertSize)||45}"></label>
      <label>Radavstånd<input id="aoLineSpacing" type="number" min="0" max="200" value="${Number(c.lineSpacing)||45}"></label>
      <label>Teckenavstånd<input id="aoLetterSpacing" type="number" min="0" max="200" value="${Number(c.letterSpacing)||65}"></label>
    </div>
    <h6>Texteffekter</h6>
    <div class="ao-checks">
      <label class="ae-check"><input id="aoWave" type="checkbox"${c.waveEffect?' checked':''}> Vågeffekt</label>
      <label class="ae-check"><input id="aoMove" type="checkbox"${c.moveEffect?' checked':''}> Rörelseeffekt</label>
      <label class="ae-check"><input id="aoThreeD" type="checkbox"${c.effect3d?' checked':''}> 3D-effekt</label>
      <label class="ae-check"><input id="aoWiggle" type="checkbox"${c.wiggleEffect?' checked':''}> Vickeffekt</label>
      <label class="ae-check"><input id="aoShadow" type="checkbox"${c.textShadow!==false?' checked':''}> Skugga</label>
    </div>
    <h6>Textram</h6>
    <div class="ao-grid">
      <label class="ae-check"><input id="aoBorder" type="checkbox"${c.fontBorder!==false?' checked':''}> Aktivera textram</label>
      <label>Ramfärg<input id="aoBorderColor" type="color" value="${c.borderColor||'#242424'}"></label>
    </div>
    <h6>Användarnamn</h6>
    <div class="ao-grid">
      <label class="ae-check"><input id="aoUserCustomColor" type="checkbox"${c.usernameCustomColor?' checked':''}> Egen färg</label>
      <label>Namnfärg<input id="aoUsernameColor" type="color" value="${c.usernameColor||'#ff3eaa'}"></label>
      <label>Namneffekt<select id="aoUsernameEffect">${[['','Ingen'],['aurora','The Aurora'],['neon','Neon'],['gold','Guld'],['rainbow','Regnbåge']].map(([v,l])=>`<option value="${v}"${(c.usernameEffect||'')===v?' selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <h6>Storlek</h6>
    <div class="ao-grid">
      <label>Bildstorlek<input id="aoPictureSize" type="number" min="0" max="400" value="${Number(c.pictureSize)||85}"></label>
      <label>Namnstorlek<input id="aoUsernameSize" type="number" min="0" max="200" value="${Number(c.usernameSize)||50}"></label>
    </div>
    <h6>Alternativ</h6>
    <div class="ao-checks">
      <label class="ae-check"><input id="aoShowProfile" type="checkbox"${c.showProfilePicture!==false?' checked':''}> Visa profilbild</label>
      <label class="ae-check"><input id="aoShowGift" type="checkbox"${c.showGiftPicture?' checked':''}> Visa gåvobild</label>
      <label class="ae-check"><input id="aoSingleLine" type="checkbox"${c.singleTextLine?' checked':''}> En enda textrad</label>
    </div>
    <h6>Placering och bakgrund</h6>
    <div class="ao-grid">
      <label>Placering<select id="aoAlertPosition">${[['bottom','Längst ner'],['center','Mitten'],['top','Längst upp']].map(([v,l])=>`<option value="${v}"${(c.alertPosition||'bottom')===v?' selected':''}>${l}</option>`).join('')}</select></label>
      <label>Accentfärg<input id="aoAlertAccent" type="color" value="${c.alertAccent||'#ff3eaa'}"></label>
      <label>Bakgrund<input id="aoAlertBg" type="color" value="${c.alertBackground||'#16091d'}"></label>
    </div>
    <div class="ao-global-foot"><button type="button" id="aoPreviewAlert">▶ Testa</button><button type="button" id="aoCloseGlobal" class="primary">OK</button></div>
  </div>`;

  // Renderingen läser VARJE fält ovan. En inställning som inte används här är en död kontroll —
  // det mönstret har redan drabbat fem widgetar i det här projektet, och en panel som ser rik ut
  // men inte gör något är värre än ingen panel alls.
  function showAlert(action, payload = {}) {
    const c = action.config || {};
    let host = document.querySelector('#vyraActionAlertHost');
    if (!host) { host = document.createElement('div'); host.id = 'vyraActionAlertHost'; document.body.append(host); }
    host.innerHTML = '';
    // `state` är media.js globala layoutobjekt och bär färgschemat (media.js:46 gör samma sak).
    // `typeof`-vakten behövs: i en overlay-flik som laddar den här filen utan media.js hade en
    // naken `state`-läsning kastat ReferenceError mitt i en alert, alltså släckt den helt.
    const brand = (typeof state === 'object' && state && state.brandKit) ? state.brandKit : null;
    const bkColor = (own, field, fallback) => (c.inheritBrandKit && brand && brand[field]) ? brand[field] : (own || fallback);
    const effekter = [c.waveEffect&&'vaag', c.moveEffect&&'rorelse', c.effect3d&&'tredim', c.wiggleEffect&&'vick'].filter(Boolean).join(' ');
    const el = document.createElement('div');
    el.className = `vyra-action-alert ${c.alertStyle || 'premium'} ${c.alertPosition || 'bottom'} ${effekter}${payload.profileImage && c.showProfilePicture !== false ? ' has-avatar' : ''}${c.singleTextLine ? ' en-rad' : ''}`;
    if (payload.profileImage && c.showProfilePicture !== false) { const img = document.createElement('img'); img.className = 'vaa-avatar'; img.src = VyraSafe.src(payload.profileImage); el.append(img); }
    if (payload.giftImage && c.showGiftPicture) { const g = document.createElement('img'); g.className = 'vaa-gift'; g.src = VyraSafe.src(payload.giftImage); el.append(g); }
    if (payload.username) {
      const namn = document.createElement('b');
      namn.className = `vaa-user${c.usernameEffect ? ` fx-${c.usernameEffect}` : ''}`;
      namn.textContent = payload.username;
      el.append(namn);
    }
    const text = document.createElement('span'); text.className = 'vaa-text';
    text.textContent = fill(c.alertText || 'Tack för {giftname}!', payload); el.append(text);
    const px = (value, fallback) => `${Number(value) || fallback}px`;
    el.style.cssText = [
      `--alert-color:${bkColor(c.alertColor, 'text', '#fff')}`,
      `--alert-bg:${bkColor(c.alertBackground, 'background', '#16091d')}`,
      `--alert-accent:${bkColor(c.alertAccent, 'highlight', '#ff3eaa')}`,
      `--alert-size:${px(c.alertSize, 45)}`,
      `--alert-line:${px(c.lineSpacing, 45)}`,
      // 0–200 i panelen, TUSENDELS em i renderingen. Uppmätt: hundradels em gav 29 px mellan
      // bokstäverna vid standardvärdet 65, och 62 px text utanför rutan.
      `--alert-letter:${(Number(c.letterSpacing) || 0) / 1000}em`,
      `--alert-font:${c.inheritBrandKit && brand?.fontFamily || c.alertFont || 'Noto Sans, Inter, Arial, sans-serif'}`,
      `--alert-shadow:${c.textShadow === false ? 'none' : '0 4px 18px rgba(0,0,0,.55)'}`,
      `--alert-stroke:${c.fontBorder === false ? '0' : '2px'}`,
      `--alert-stroke-color:${c.borderColor || '#242424'}`,
      `--alert-user-color:${c.usernameCustomColor ? (c.usernameColor || '#ff3eaa') : 'inherit'}`,
      `--alert-user-size:${px(c.usernameSize, 50)}`,
      `--alert-avatar:${px(c.pictureSize, 85)}`
    ].join(';');
    host.append(el); requestAnimationFrame(() => el.classList.add('show'));
    const ms = Math.max(1, action.duration || 6) * 1000;
    setTimeout(() => el.classList.remove('show'), ms - 350); setTimeout(() => el.remove(), ms);
  }

  // ---- rostlistan ------------------------------------------------------------------------------
  //
  // ADDEVENTLISTENER, INTE onvoiceschanged. tts-chat.js gor `speechSynthesis.onvoiceschanged =
  // refreshVoiceOptions`, och en tilldelning har hade slagit ut den — eller tvartom, beroende pa
  // vilken fil som laddades sist. Rosterna kommer asynkront i Chrome: forsta getVoices() ar ofta
  // tom, och da star listan kvar tom om ingen lyssnar.
  const roster = () => (window.speechSynthesis ? speechSynthesis.getVoices() : []);
  function fyllRoster(select) {
    if (!select) return;
    const valt = select.dataset.valt || select.value;
    const lista = roster();
    select.innerHTML = '<option value="">Standardröst</option>'
      + lista.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
    // Aldre actions bar etiketterna fran den gamla listan. De matchar ingen riktig rost, sa de
    // faller tillbaka pa standardrosten — vilket ar exakt vad de redan lat som.
    select.value = lista.some(v => v.name === valt) ? valt : '';
  }
  function valjRost(utterance, namn, slumpa) {
    const lista = roster();
    if (!lista.length) return;
    if (slumpa) { utterance.voice = lista[Math.floor(Math.random() * lista.length)]; return }
    if (namn) utterance.voice = lista.find(v => v.name === namn || v.lang === namn) || null;
  }
  if (window.speechSynthesis?.addEventListener) {
    speechSynthesis.addEventListener('voiceschanged',
      () => document.querySelectorAll('#aoVoice').forEach(fyllRoster));
  }

  const widgetar = ['Gift Fireworks','Follower Spotlight','Top Likes','Gift Campaign','Heart Me Goal','Battle MVP'];
  // `mediaFiles`, `mediaTitle` och `mediaAssetPath` är top-level-bindningar i media.js, som laddas
  // före den här filen. `typeof`-vakterna finns för overlay-fliken, som kan ladda action-filerna
  // utan media.js — då är biblioteket tomt i stället för att hela luckan kastar.
  function animationsbibliotek() {
    try {
      if (typeof mediaFiles === 'undefined' || !Array.isArray(mediaFiles)) return [];
      const titel = typeof mediaTitle === 'function' ? mediaTitle : n => String(n);
      const vag = typeof mediaAssetPath === 'function' ? mediaAssetPath : n => `assets/videos/${n}`;
      return mediaFiles.map(n => ({ path: vag(n), titel: titel(n) }))
        .sort((a, b) => a.titel.localeCompare(b.titel, 'sv'));
    } catch { return [] }
  }
  const optioner = (lista, valt) => lista.map(w => `<option${w === valt ? ' selected' : ''}>${w}</option>`).join('');
  const attr = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // En mall per lucka. Facit fäller ut kontrollerna PÅ RADEN (§2.2), inte i en panel längre ned.
  const mallar = {
    overlay: c => `<label>Välj widget<select id="aoWidget">${optioner(widgetar, c.widget)}</select></label>`,
    // "Visa animation" var förr en DUBBLETT av "Visa overlay": samma sex widgetnamn, och
    // action-runtime.js:113 skickade båda till samma `runWidget`. Två rader i listan som gjorde
    // exakt samma sak. Facit skiljer dem åt, och i VYRA är skillnaden redan byggd: `animation` är
    // ett färdigt klipp ur Mediabiblioteket, `overlay` är en LEVANDE widget på scenen.
    // Listan ägs av media.js (`mediaFiles`/`mediaTitle`), samma källa Mediabiblioteket ritar.
    animation: c => {
      const klipp = animationsbibliotek();
      if (!klipp.length) return `<small>Animationsbiblioteket kunde inte läsas. Välj "Spela videofil" och lägg till en egen fil så länge.</small>`;
      return `<label>Välj animation<select id="aoAnimation"><option value="">Välj ur biblioteket…</option>${klipp.map(k => `<option value="${attr(k.path)}"${c.animationPath === k.path ? ' selected' : ''}>${k.titel}</option>`).join('')}</select></label><small>${klipp.length} animationer ur ditt Mediabibliotek.</small>`;
    },
    alert: c => `<div class="ao-alert-rad"><input id="aoAlert" placeholder="Exempel: Tack för {giftname}!" value="${attr(c.alertText)}"><label class="ao-color"><input id="aoAlertColor" type="color" value="${c.alertColor || '#ffffff'}"></label><select id="aoAlertStyle">${[['premium','Premium'],['minimal','Minimal'],['neon','Neon']].map(([v, l]) => `<option value="${v}"${(c.alertStyle || 'premium') === v ? ' selected' : ''}>${l}</option>`).join('')}</select><button type="button" id="aoGlobalAlert">⚙ Overlay-inställningar</button></div><label class="ae-check"><input id="aoInheritBrandKit" type="checkbox"${c.inheritBrandKit ? ' checked' : ''}> Ärv globalt färgschema</label><small><b>Variabler:</b> ${vars}</small>${overlaySettingsHtml(c)}`,
    tts: c => `<input id="aoTts" placeholder="Exempel: Välkommen {username}!" value="${attr(c.ttsText)}"><small><b>Variabler:</b> ${vars}</small><div class="ao-grid"><label>Röst<select id="aoVoice" data-valt="${attr(c.voice)}"><option value="">Standardröst</option></select></label><label>Hastighet<input id="aoSpeed" type="range" min=".5" max="2" step=".1" value="${Number(c.speed) || 1}"></label><label>Tonhöjd<input id="aoPitch" type="range" min=".5" max="2" step=".1" value="${Number(c.pitch) || 1}"></label><label class="ae-check"><input id="aoRandom" type="checkbox"${c.randomVoice ? ' checked' : ''}> Slumpmässig röst</label></div><button type="button" id="aoTest">▶ Testa</button>`,
    chat: c => `<input id="aoChat" placeholder="Exempel: Välkommen till sändningen!" value="${attr(c.chatText)}"><small><b>Variabler:</b> ${vars}</small>`,
    spotify: c => `<input id="aoSpotify" placeholder="Spotify-länk eller sökfras" value="${attr(c.spotify)}">`,
    obsScene: c => `<input id="aoObsScene" placeholder="Exempel: Live - Gaming" value="${attr(c.obsScene)}">`,
    obsSource: c => `<input id="aoObsSource" placeholder="Exempel: Kamera 2" value="${attr(c.obsSource)}">`,
    // STYR ETT MÅL. Målwidgetarna är `templateHeartGoal` och `templateSocialGoal`; listan läses
    // ur den layout som faktiskt finns, inte ur en fast uppräkning — en widget som tagits bort ska
    // inte gå att välja.
    goal: c => {
      const mal = malwidgetar();
      if (!mal.length) return `<small>Inget mål på din overlay ännu. Lägg till ett Heart Me Goal eller Follower Goal i Layout först — då går det att styra härifrån.</small>`;
      return `<label>Vilket mål<select id="aoGoalWidget">${mal.map(m => `<option value="${attr(m.id)}"${c.goalWidget === m.id ? ' selected' : ''}>${attr(m.namn)}</option>`).join('')}</select></label>`
        + `<label>Vad ska hända<select id="aoGoalAction">${[['reset', 'Nollställ målet'], ['target', 'Sätt nytt mål'], ['baseline', 'Sätt nytt startvärde']].map(([v, l]) => `<option value="${v}"${(c.goalAction || 'reset') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
        + `<label class="ae-inline" id="aoGoalValueRad">Värde<input id="aoGoalValue" type="number" min="0" value="${Number(c.goalValue) || 0}"></label>`
        + `<small>Nollställning behåller startvärde och mål — den nollar bara det som räknats.</small>`;
    },
    // STYR EN TIMER. Timrarna bor i samma nyckel som actions (action-timers.js) och kör en action
    // med jämna mellanrum medan du sänder. Den här funktionen startar, pausar eller nollställer en.
    timer: c => {
      const t = timrar();
      if (!t.length) return `<small>Ingen timer skapad ännu. Skapa en i timerpanelen längre ner på sidan — då går den att styra härifrån.</small>`;
      return `<label>Vilken timer<select id="aoTimerId">${t.map(x => `<option value="${attr(x.id)}"${c.timerId === x.id ? ' selected' : ''}>${attr(x.namn)}</option>`).join('')}</select></label>`
        + `<label>Vad ska hända<select id="aoTimerAction">${[['start', 'Starta'], ['stop', 'Pausa'], ['reset', 'Nollställ nedräkningen']].map(([v, l]) => `<option value="${v}"${(c.timerAction || 'start') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
    },
    webhook: c => `<input id="aoWebhook" type="url" placeholder="Webhook-URL (https://...)" value="${attr(c.webhook)}"><small>Skickar en POST med eventets data till adressen.</small>`
  };

  // ─── FÄRGVÄLJAREN (facit §6) ─────────────────────────────────────────────────────────────────
  //
  // Webbläsarens egen `input[type=color]` ser olika ut i varje webbläsare och saknar det facit
  // visar: R/G/B-fälten och hex-fältet sida vid sida. Den är därför kvar som VÄRDEBÄRARE — dold,
  // men fortfarande det fält `collect()` läser — medan en egen ruta öppnar dialogen nedan och
  // skriver tillbaka. Byggs väljaren om igen behöver sparningen inte röras.
  const tvaSiffror = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const rgbTillHex = ({ r, g, b }) => `#${tvaSiffror(r)}${tvaSiffror(g)}${tvaSiffror(b)}`;
  function hexTillRgb(hex) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const v = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
  }
  function rgbTillHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
  }
  function hsvTillRgb({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function oppnaFargvaljare(startHex, klart) {
    const start = hexTillRgb(startHex) || { r: 255, g: 255, b: 255 };
    let hsv = rgbTillHsv(start);
    const lager = document.createElement('div');
    lager.className = 'vyra-fargvaljare';
    lager.innerHTML = `<div class="vf-ruta" role="dialog" aria-label="Välj färg">
      <div class="vf-topp">
        <div class="vf-falt"><i class="vf-prick"></i></div>
        <div class="vf-nyans"><i class="vf-nyansprick"></i></div>
        <div class="vf-prov"></div>
      </div>
      <div class="vf-falt-rad">
        <label>R<input class="vf-r" type="number" min="0" max="255"></label>
        <label>G<input class="vf-g" type="number" min="0" max="255"></label>
        <label>B<input class="vf-b" type="number" min="0" max="255"></label>
        <label>#<input class="vf-hex" type="text" maxlength="7" spellcheck="false"></label>
      </div>
      <div class="vf-knappar"><button type="button" class="vf-ok primary">OK</button><button type="button" class="vf-avbryt">Avbryt</button></div>
    </div>`;
    document.body.append(lager);
    const q = s => lager.querySelector(s);
    const falt = q('.vf-falt'), prick = q('.vf-prick'), nyans = q('.vf-nyans'), nyansprick = q('.vf-nyansprick'), prov = q('.vf-prov');
    const rIn = q('.vf-r'), gIn = q('.vf-g'), bIn = q('.vf-b'), hexIn = q('.vf-hex');

    // EN rityta för alla fyra vägar in (fältet, nyansremsan, R/G/B, hex). Hade varje kontroll haft
    // sin egen uppdatering kunde de glida isär — det är precis så en färgväljare börjar visa en
    // annan färg än den levererar.
    const rita = (rorFalten = true) => {
      const rgb = hsvTillRgb(hsv), hex = rgbTillHex(rgb);
      falt.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))`;
      prick.style.left = `${hsv.s * 100}%`;
      prick.style.top = `${(1 - hsv.v) * 100}%`;
      nyansprick.style.top = `${(hsv.h / 360) * 100}%`;
      prov.style.background = hex;
      if (rorFalten) {
        rIn.value = Math.round(rgb.r); gIn.value = Math.round(rgb.g); bIn.value = Math.round(rgb.b);
        hexIn.value = hex.slice(1);
      }
      return hex;
    };
    const dra = (el, vid) => {
      const flytta = e => {
        const r = el.getBoundingClientRect();
        vid(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
        rita();
      };
      el.addEventListener('pointerdown', e => {
        // setPointerCapture: utan den slutar draget så fort muspekaren lämnar rutan, och färgen
        // fastnar halvvägs. Med den följer pekaren med ut och tillbaka, som i varje riktig väljare.
        el.setPointerCapture(e.pointerId); flytta(e);
        const under = ev => flytta(ev);
        el.addEventListener('pointermove', under);
        el.addEventListener('pointerup', () => el.removeEventListener('pointermove', under), { once: true });
      });
    };
    dra(falt, (x, y) => { hsv.s = x; hsv.v = 1 - y });
    dra(nyans, (_, y) => { hsv.h = y * 360 });
    const franRgb = () => {
      const rgb = { r: +rIn.value || 0, g: +gIn.value || 0, b: +bIn.value || 0 };
      hsv = rgbTillHsv(rgb); rita(false); hexIn.value = rgbTillHex(rgb).slice(1);
    };
    [rIn, gIn, bIn].forEach(i => i.oninput = franRgb);
    hexIn.oninput = () => {
      const rgb = hexTillRgb(hexIn.value);
      if (!rgb) return;                       // halvskriven hex ska inte hoppa till svart
      hsv = rgbTillHsv(rgb); rita(false);
      rIn.value = rgb.r; gIn.value = rgb.g; bIn.value = rgb.b;
    };
    const stang = () => lager.remove();
    q('.vf-avbryt').onclick = stang;
    q('.vf-ok').onclick = () => { klart(rgbTillHex(hsvTillRgb(hsv))); stang() };
    lager.addEventListener('pointerdown', e => { if (e.target === lager) stang() });
    rita();
    hexIn.focus();
  }

  // Gör om varje `input[type=color]` i en lucka till facits ruta-med-pil. Fältet blir kvar i DOM:en
  // som värdebärare, så `collect()` fortsätter läsa exakt samma id.
  function uppgraderaFargfalt(rot) {
    rot.querySelectorAll('input[type=color]').forEach(falt => {
      if (falt.dataset.uppgraderad) return;
      falt.dataset.uppgraderad = '1';
      falt.hidden = true;
      const knapp = document.createElement('button');
      knapp.type = 'button';
      knapp.className = 'vyra-fargknapp';
      const mala = () => { knapp.style.setProperty('--vald', falt.value); knapp.textContent = falt.value };
      mala();
      knapp.onclick = () => oppnaFargvaljare(falt.value, hex => {
        falt.value = hex; mala();
        // `input`-eventet behövs: förhandsvisningen och allt annat som lyssnar på fältet ska
        // reagera likadant vare sig färgen kom från vår väljare eller från webbläsarens.
        falt.dispatchEvent(new Event('input', { bubbles: true }));
        falt.dispatchEvent(new Event('change', { bubbles: true }));
      });
      falt.after(knapp);
    });
  }

  // Målwidgetarna ur den layout som faktiskt finns. `state` är media.js globala layoutobjekt;
  // typeof-vakten behövs för en overlayflik som laddar filen utan media.js.
  function malwidgetar() {
    try {
      if (typeof state !== 'object' || !state || !Array.isArray(state.widgets)) return [];
      return state.widgets
        .filter(w => w && (w.type === 'templateHeartGoal' || w.type === 'templateSocialGoal'))
        .map(w => ({ id: String(w.id), namn: String(w.title || w.templateTitle || w.type || 'Mål') }));
    } catch { return [] }
  }
  function timrar() {
    try {
      const rad = window.VyraSessionState?.readExtra?.('vyra-action-event-v2') ?? localStorage.getItem('vyra-action-event-v2');
      const t = JSON.parse(rad || '{}').timers;
      return Array.isArray(t) ? t.map((x, i) => ({ id: String(x.id || i), namn: String(x.name || x.label || `Timer ${i + 1}`) })) : [];
    } catch { return [] }
  }

  const varde = (modal, id, fallback = '') => modal.querySelector(`#${id}`)?.value ?? fallback;
  const kryssad = (modal, id) => !!modal.querySelector(`#${id}`)?.checked;
  const tal = (modal, id, fallback) => Number(modal.querySelector(`#${id}`)?.value) || fallback;

  (window.VyraActionFields=window.VyraActionFields||{_providers:[],register(p){if(p)this._providers.push(p)}}).register({
    slots: Object.keys(mallar),
    render(slot, namn, befintlig) {
      const c = befintlig?.config || {};
      slot.innerHTML = mallar[namn](c);
      uppgraderaFargfalt(slot);
      if (namn === 'tts') {
        fyllRoster(slot.querySelector('#aoVoice'));
        slot.querySelector('#aoTest').onclick = () => {
          const text = fill(slot.querySelector('#aoTts').value);
          if (!text) return window.toast?.('Skriv TTS-text först');
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = +slot.querySelector('#aoSpeed').value;
          u.pitch = +slot.querySelector('#aoPitch').value;
          // Provet ska lata som skarpt lage. Samma val som action-runtime.js gor: slumpad rost gar
          // fore ett explicit val, och ingen traff betyder standardrosten.
          valjRost(u, slot.querySelector('#aoVoice').value, slot.querySelector('#aoRandom').checked);
          speechSynthesis.speak(u);
        };
      }
      if (namn === 'goal') {
        const val = slot.querySelector('#aoGoalAction'), rad = slot.querySelector('#aoGoalValueRad');
        if (val && rad) {
          // Ett värdefält bredvid "Nollställ" är brus: nollställningen läser det aldrig.
          const spegla = () => { rad.hidden = val.value === 'reset' };
          val.addEventListener('change', spegla); spegla();
        }
      }
      if (namn === 'alert') {
        const panel = slot.querySelector('#aoGlobalPanel');
        slot.querySelector('#aoGlobalAlert').onclick = () => panel.toggleAttribute('hidden');
        slot.querySelector('#aoCloseGlobal').onclick = () => panel.setAttribute('hidden', '');
        slot.querySelector('#aoPreviewAlert').onclick = () => {
          const modal = slot.closest('.ae-modal');
          showAlert({ duration: 4, config: samlaConfig(modal) }, { username: 'TestUser', giftname: 'Rose', repeatcount: 5, coins: 5, profileImage: 'assets/images/test-profile.svg' });
        };
      }
    },
    validate(modal, types) {
      if (types.includes('webhook') && !varde(modal, 'aoWebhook').trim()) return 'Ange en webhook-URL';
      if (types.includes('chat') && !varde(modal, 'aoChat').trim()) return 'Skriv chattmeddelandet';
      if (types.includes('tts') && !varde(modal, 'aoTts').trim()) return 'Skriv texten som ska läsas upp';
      if (types.includes('animation') && modal.querySelector('#aoAnimation') && !varde(modal, 'aoAnimation')) return 'Välj en animation ur biblioteket';
      if (types.includes('goal') && !varde(modal, 'aoGoalWidget')) return 'Välj vilket mål som ska styras';
      if (types.includes('timer') && !varde(modal, 'aoTimerId')) return 'Välj vilken timer som ska styras';
      return null;
    },
    collect(modal) { return { config: samlaConfig(modal) } }
  });

  function samlaConfig(modal) {
    if (!modal) return {};
    return {
      widget: varde(modal, 'aoWidget'),
      animationPath: varde(modal, 'aoAnimation'),
      animationName: modal.querySelector('#aoAnimation')?.selectedOptions?.[0]?.textContent || '',
      alertText: varde(modal, 'aoAlert'),
      alertColor: varde(modal, 'aoAlertColor', '#ffffff'),
      alertStyle: varde(modal, 'aoAlertStyle', 'premium'),
      inheritBrandKit: kryssad(modal, 'aoInheritBrandKit'),
      alertPosition: varde(modal, 'aoAlertPosition', 'bottom'),
      alertSize: tal(modal, 'aoFontSize', 45),
      alertFont: varde(modal, 'aoFont', 'Noto Sans'),
      lineSpacing: tal(modal, 'aoLineSpacing', 45),
      letterSpacing: tal(modal, 'aoLetterSpacing', 65),
      waveEffect: kryssad(modal, 'aoWave'),
      moveEffect: kryssad(modal, 'aoMove'),
      effect3d: kryssad(modal, 'aoThreeD'),
      wiggleEffect: kryssad(modal, 'aoWiggle'),
      textShadow: kryssad(modal, 'aoShadow'),
      fontBorder: kryssad(modal, 'aoBorder'),
      borderColor: varde(modal, 'aoBorderColor', '#242424'),
      usernameCustomColor: kryssad(modal, 'aoUserCustomColor'),
      usernameColor: varde(modal, 'aoUsernameColor', '#ff3eaa'),
      usernameEffect: varde(modal, 'aoUsernameEffect'),
      pictureSize: tal(modal, 'aoPictureSize', 85),
      usernameSize: tal(modal, 'aoUsernameSize', 50),
      showProfilePicture: kryssad(modal, 'aoShowProfile'),
      showGiftPicture: kryssad(modal, 'aoShowGift'),
      singleTextLine: kryssad(modal, 'aoSingleLine'),
      alertAccent: varde(modal, 'aoAlertAccent', '#ff3eaa'),
      alertBackground: varde(modal, 'aoAlertBg', '#16091d'),
      ttsText: varde(modal, 'aoTts'),
      voice: varde(modal, 'aoVoice'),
      speed: tal(modal, 'aoSpeed', 1),
      pitch: tal(modal, 'aoPitch', 1),
      randomVoice: kryssad(modal, 'aoRandom'),
      chatText: varde(modal, 'aoChat'),
      spotify: varde(modal, 'aoSpotify'),
      obsScene: varde(modal, 'aoObsScene'),
      obsSource: varde(modal, 'aoObsSource'),
      webhook: varde(modal, 'aoWebhook'),
      goalWidget: varde(modal, 'aoGoalWidget'),
      goalAction: varde(modal, 'aoGoalAction', 'reset'),
      goalValue: tal(modal, 'aoGoalValue', 0),
      timerId: varde(modal, 'aoTimerId'),
      timerAction: varde(modal, 'aoTimerAction', 'start')
    };
  }

  document.addEventListener('vyra:runtime-alert', e => { const {action,payload={}}=e.detail||{}; if(action?.types?.includes('alert'))showAlert(action,payload); });
})();
