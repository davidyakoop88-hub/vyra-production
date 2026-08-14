(() => {
  const KEY = 'vyra-action-event-v2';
  const vars = '{username} {giftname} {repeatcount} {coins} {likecount} {totallikecount} {comment} {submonth} {points}';
  const fill = (text = '', p = {}) => text.replace(/\{(\w+)\}/g, (_, k) => ({username:p.username||'TestUser',giftname:p.giftname||p.gift||'Rose',repeatcount:p.repeatcount||p.combo||1,coins:p.coins||1,likecount:p.likecount||0,totallikecount:p.totallikecount||0,comment:p.comment||'',submonth:p.submonth||1,points:window.VyraPoints?.get(p.username)||0}[k] ?? ''));

  function showAlert(action, payload = {}) {
    const c = action.config || {};
    let host = document.querySelector('#vyraActionAlertHost');
    if (!host) { host = document.createElement('div'); host.id = 'vyraActionAlertHost'; document.body.append(host); }
    host.innerHTML = '';
    const el = document.createElement('div');
    el.className = `vyra-action-alert ${c.alertStyle || 'premium'} ${c.alertPosition || 'bottom'}${payload.profileImage ? ' has-avatar' : ''}`;
    if (payload.profileImage) { const img = document.createElement('img'); img.className = 'vaa-avatar'; img.src = VyraSafe.src(payload.profileImage); el.append(img); }
    const text = document.createElement('span'); text.className = 'vaa-text'; text.textContent = fill(c.alertText || 'Tack {username} för {giftname}!', payload); el.append(text);
    const bkColor=(own,field,fallback)=>(c.inheritBrandKit&&state.brandKit&&state.brandKit[field])?state.brandKit[field]:(own||fallback);
    el.style.cssText = `--alert-color:${bkColor(c.alertColor,'text','#fff')};--alert-bg:${bkColor(c.alertBackground,'background','#16091d')};--alert-accent:${bkColor(c.alertAccent,'highlight','#ff3eaa')};--alert-size:${c.alertSize||28}px;--alert-font:${c.inheritBrandKit&&state.brandKit?.fontFamily||c.alertFont||'Inter,Arial,sans-serif'}`;
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
    const valt = select.value;
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

  function enhance() {
    const modal = document.querySelector('.ae-modal'), grid = modal?.querySelector('.ae-grid');
    if (!grid || modal.querySelector('.ae-action-options')) return;
    const box = document.createElement('div'); box.className = 'ae-action-options';
    box.innerHTML = `<section data-o="overlay"><h4>OVERLAY / WIDGET</h4><label>Välj widget<select id="aoWidget"><option>Gift Fireworks</option><option>Follower Spotlight</option><option>Top Likes</option><option>Gift Campaign</option><option>Heart Me Goal</option><option>Battle MVP</option></select></label></section>
    <section data-o="audio"><h4>SPELA LJUD</h4><label>Välj ljudfil<input id="aoAudio" type="file" accept="audio/*,.mp3,.wav,.ogg"></label></section>
    <section data-o="alert" class="ao-alert-settings"><h4>VISA ALERT · ANVÄNDARE + TEXT</h4><label>Alertmeddelande<input id="aoAlert" placeholder="Tack {username} för {giftname}!"></label><div class="ao-alert-toolbar"><label class="ao-color"><input id="aoAlertColor" type="color" value="#ffffff"><span>Textfärg</span></label><select id="aoAlertStyle"><option value="premium">Premium</option><option value="minimal">Minimal</option><option value="neon">Neon</option></select><label class="switch-row one"><input id="aoInheritBrandKit" type="checkbox"> Ärv globalt färgschema (🎨 Färgschema)</label><button type="button" id="aoGlobalAlert">⚙ Globala overlay-inställningar</button></div><small><b>Tillgängliga variabler:</b> ${vars}</small><div id="aoGlobalPanel" class="ao-global-panel" hidden><h5>Globala inställningar för alert</h5><div class="ao-grid"><label>Placering<select id="aoAlertPosition"><option value="bottom">Längst ner</option><option value="center">Mitten</option><option value="top">Längst upp</option></select></label><label>Textstorlek <output id="aoAlertSizeOut">28 px</output><input id="aoAlertSize" type="range" min="14" max="72" value="28"></label><label>Typsnitt<select id="aoAlertFont"><option value="Inter,Arial,sans-serif">Modern</option><option value="Georgia,serif">Elegant</option><option value="Impact,sans-serif">Impact</option></select></label><label>Accentfärg<input id="aoAlertAccent" type="color" value="#ff3eaa"></label><label>Bakgrund<input id="aoAlertBg" type="color" value="#16091d"></label></div><button type="button" id="aoPreviewAlert">▶ Förhandsvisa alert</button></div></section>
    <section data-o="tts"><h4>TEXT-TILL-TAL</h4><label>Text<input id="aoTts" placeholder="Välkommen {username}!"></label><div class="ao-grid"><label>Röst<select id="aoVoice"><option value="">Standardröst</option></select></label><label>Hastighet<input id="aoSpeed" type="range" min=".5" max="2" step=".1" value="1"></label><label>Tonhöjd<input id="aoPitch" type="range" min=".5" max="2" step=".1" value="1"></label><label><input id="aoRandom" type="checkbox"> Slumpmässig röst</label></div><button type="button" id="aoTest">▶ Testa TTS</button></section>
    <section data-o="chat"><h4>CHATBOTMEDDELANDE</h4><label>Meddelande<input id="aoChat" placeholder="Välkommen {username}!"></label></section><section data-o="spotify"><h4>SPOTIFY</h4><label>Låt/spellista<input id="aoSpotify" placeholder="Spotify-länk eller sökfras"></label></section><section data-o="obsScene"><h4>BYT OBS-SCEN</h4><label>Scennamn<input id="aoObsScene" placeholder="Live - Gaming"></label></section><section data-o="obsSource"><h4>AKTIVERA OBS-KÄLLA</h4><label>Källnamn<input id="aoObsSource" placeholder="Kamera 2"></label></section><section data-o="webhook"><h4>WEBHOOK</h4><label>URL<input id="aoWebhook" type="url" placeholder="https://..."></label></section>
    <section data-o="addPoints"><h4>LÄGG TILL POÄNG</h4><label>Antal poäng<input id="aoAddPointsAmount" type="number" min="1" value="10"></label><small>Poängen läggs på användaren som triggade eventet. Visa poängen live med en Top Points-widget (Rangordna efter → Poäng).</small></section>
    <section data-o="removePoints"><h4>TA BORT POÄNG</h4><label>Antal poäng<input id="aoRemovePointsAmount" type="number" min="1" value="10"></label></section>`;
    grid.before(box);
    const read = () => ({widget:box.querySelector('#aoWidget').value,alertText:box.querySelector('#aoAlert').value,alertColor:box.querySelector('#aoAlertColor').value,alertStyle:box.querySelector('#aoAlertStyle').value,inheritBrandKit:box.querySelector('#aoInheritBrandKit').checked,alertPosition:box.querySelector('#aoAlertPosition').value,alertSize:+box.querySelector('#aoAlertSize').value,alertFont:box.querySelector('#aoAlertFont').value,alertAccent:box.querySelector('#aoAlertAccent').value,alertBackground:box.querySelector('#aoAlertBg').value,ttsText:box.querySelector('#aoTts').value,voice:box.querySelector('#aoVoice').value,speed:+box.querySelector('#aoSpeed').value,pitch:+box.querySelector('#aoPitch').value,randomVoice:box.querySelector('#aoRandom').checked,chatText:box.querySelector('#aoChat').value,spotify:box.querySelector('#aoSpotify').value,obsScene:box.querySelector('#aoObsScene').value,obsSource:box.querySelector('#aoObsSource').value,webhook:box.querySelector('#aoWebhook').value,addPointsAmount:+box.querySelector('#aoAddPointsAmount').value,removePointsAmount:+box.querySelector('#aoRemovePointsAmount').value});
    const update = () => { const selected = [...modal.querySelectorAll('fieldset input:checked')].map(x => x.value); box.querySelectorAll('[data-o]').forEach(s => s.hidden = !selected.includes(s.dataset.o)); };
    modal.querySelectorAll('fieldset input').forEach(x => x.addEventListener('change', update));
    box.querySelector('#aoGlobalAlert').onclick = () => box.querySelector('#aoGlobalPanel').toggleAttribute('hidden');
    box.querySelector('#aoAlertSize').oninput = e => box.querySelector('#aoAlertSizeOut').textContent = `${e.target.value} px`;
    box.querySelector('#aoPreviewAlert').onclick = () => showAlert({duration:3,config:read()},{username:'TestUser',giftname:'Rose',repeatcount:5,coins:5});
    // Rostlistan var tre hardkodade etiketter — "Kvinnlig rost", "Manlig rost", "Neutral rost" —
    // utan value-attribut, sa select.value blev sjalva etiketttexten. action-runtime.js matchar med
    // `voices.find(v => v.name === c.voice || v.lang === c.voice)`, och ingen riktig rost heter sa:
    // matchningen foll alltid till null, alltsa systemets standardrost. Alla tre valen lat likadant.
    // Nu fylls listan med maskinens faktiska roster, samma kalla som TTS Chat-panelen anvander.
    fyllRoster(box.querySelector('#aoVoice'));
    box.querySelector('#aoTest').onclick = () => {
      const text = fill(box.querySelector('#aoTts').value);
      if (!text) return window.toast?.('Skriv TTS-text först');
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = +box.querySelector('#aoSpeed').value;
      u.pitch = +box.querySelector('#aoPitch').value;
      // Provet ska lata som skarpt lage. Samma val som action-runtime.js gor: slumpad rost gar
      // fore ett explicit val, och ingen traff betyder standardrosten.
      valjRost(u, box.querySelector('#aoVoice').value, box.querySelector('#aoRandom').checked);
      speechSynthesis.speak(u);
    };
    const before = JSON.parse(localStorage.getItem(KEY)||'{"actions":[]}').actions.length;
    modal.querySelector('#saveAeAction').addEventListener('click',()=>{const config=read();let i=0,t=setInterval(()=>{const s=JSON.parse(localStorage.getItem(KEY)||'{"actions":[]}');if(s.actions.length>before){s.actions.at(-1).config=config;window.VyraSessionState.writeActive(KEY,JSON.stringify(s));clearInterval(t)}else if(++i>40)clearInterval(t)},100)},true);
    update();
  }
  document.addEventListener('vyra:runtime-alert', e => { const {action,payload={}}=e.detail||{}; if(action?.types?.includes('alert'))showAlert(action,payload); });
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
})();
