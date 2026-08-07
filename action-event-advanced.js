(() => {
  const KEY='vyra-action-event-v2';
  // Se action-event.js: i tokenlaget lever actionlistan bara i minnet.
  const readExtra=key=>{try{return window.VyraSessionState?.readExtra?.(key)??localStorage.getItem(key)}catch{return null}};
  const audiences=[['everyone','Alla'],['follower','Alla följare'],['subscriber','Alla prenumeranter'],['moderator','Alla moderatorer'],['topGifter','Top Gifter'],['specificUser','En specifik användare']];
  const triggers=[['join','Går med i liven'],['firstActivity','Första aktiviteten'],['share','Delar liven'],['follow','Börjar följa'],['member','Prenumererar'],['likes','Skickar likes (taps)'],['chat','Skriver en kommentar'],['chatCommand','Skriver ett kommando'],['giftCoins','Skickar gåva med minsta coin-värde'],['gift','Skickar en specifik gåva'],['subscriberEmote','Skickar subscriber-emote'],['fanSticker','Skickar Fan Club-sticker'],['shopPurchase','Köper en produkt från TikTok Shop']];
  const opts=a=>a.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  function openTriggerGiftPicker(input){
    document.querySelector('.gift-picker-modal')?.remove();
    const gifts=window.VYRA_GIFTS||[];
    const modal=document.createElement('div');modal.className='gift-picker-modal';
    modal.innerHTML=`<div><header><b>VÄLJ GÅVA</b><button>×</button></header><input placeholder="Sök bland ${gifts.length} gifts..."><section></section></div>`;
    document.body.append(modal);
    const section=modal.querySelector('section');
    const draw=list=>section.innerHTML=list.slice(0,150).map(g=>`<button data-name="${g.name}"><img loading="lazy" src="${g.file}"><span>${g.name}</span></button>`).join('');
    const wire=()=>section.querySelectorAll('button').forEach(b=>b.onclick=()=>{input.value=b.dataset.name;modal.remove()});
    draw(gifts);wire();
    modal.querySelector('header button').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelector('input').oninput=e=>{const q=e.target.value.trim().toLowerCase();draw(q?gifts.filter(g=>g.name.toLowerCase().includes(q)):gifts);wire()};
  }
  function seenUsers(){try{return JSON.parse(localStorage.getItem('vyra-seen-users-v1')||'[]')}catch{return[]}}
  function renderUserPickerHtml(){
    const seen=seenUsers();
    return seen.length?`<div class="ae-user-grid">${seen.map(u=>`<button type="button" class="ae-user-choice" data-username="${VyraSafe.text(u.username)}" title="${VyraSafe.text(u.username)}">${u.profileImage?`<img loading="lazy" src="${VyraSafe.url(u.profileImage)}">`:'<i>👤</i>'}<span>${VyraSafe.text(u.name||u.username)}</span></button>`).join('')}</div>`:'<small>Inga användare har setts live än — skriv ett användarnamn manuellt.</small>';
  }
  function wireUserPicker(root){
    root.querySelectorAll('.ae-user-choice').forEach(btn=>btn.onclick=()=>{
      root.querySelector('#aeSpecificUser').value=btn.dataset.username;
      root.querySelectorAll('.ae-user-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }
  function seenEmotes(){try{return JSON.parse(localStorage.getItem('vyra-seen-emotes-v1')||'[]')}catch{return[]}}
  function renderEmotePickerHtml(){
    const seen=seenEmotes();
    const grid=seen.length?`<div class="ae-emote-grid">${seen.map(e=>`<button type="button" class="ae-emote-choice" data-id="${VyraSafe.text(e.id)}" title="${VyraSafe.text(e.id)}">${e.image?`<img loading="lazy" src="${VyraSafe.url(e.image)}">`:'❓'}</button>`).join('')}</div>`:'<small>Inga emotes har setts live än — lämna tomt för alla subscriber-emotes, eller skriv ett emote-ID manuellt.</small>';
    return `<label>Emote (valfritt)<input id="aeAdvancedValue" placeholder="Lämna tomt för alla emotes"></label>${grid}`;
  }
  function wireEmotePicker(d){
    d.querySelectorAll('.ae-emote-choice').forEach(btn=>btn.onclick=()=>{
      d.querySelector('#aeAdvancedValue').value=btn.dataset.id;
      d.querySelectorAll('.ae-emote-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }
  function enhance(){
    const m=document.querySelector('.ae-modal'); if(!m||m.querySelector('h3')?.textContent.trim()!=='Nytt Event'||m.querySelector('.ae-event-advanced'))return;
    const s=JSON.parse(readExtra(KEY)||'{"actions":[],"events":[]}'),footer=m.querySelector('footer');
    m.querySelector('#aeTrigger')?.closest('label')?.classList.add('ae-legacy-event-field');m.querySelector('#aeActionId')?.closest('label')?.classList.add('ae-legacy-event-field');
    const p=document.createElement('div');p.className='ae-event-advanced';p.innerHTML=`<section><h4>Vem får trigga eventet?</h4><div class="ae-radio-list">${audiences.map((a,i)=>`<label><input type="radio" name="aeAudience" value="${a[0]}" ${i?'':'checked'}> ${a[1]}</label>`).join('')}</div><div id="aeSpecificUserWrap" hidden><label>Användarnamn<input id="aeSpecificUser" placeholder="@användarnamn"></label>${renderUserPickerHtml()}</div><label class="ae-exclude-anon"><input id="aeExcludeAnonymous" type="checkbox"> Exkludera anonyma tittare (Enigma-läge)</label></section><section><h4>Vad ska trigga eventet?</h4><div class="ae-radio-list">${triggers.map((t,i)=>`<label><input type="radio" name="aeAdvancedTrigger" value="${t[0]}" ${i?'':'checked'}> ${t[1]}</label>`).join('')}</div><div id="aeTriggerDetails" class="ae-trigger-details"></div></section><section><h4>Team och Actions</h4><label>Nödvändig TikTok-teamnivå<input id="aeTeamLevel" type="number" min="0" max="50" value="0"><small>Ange 0 för personer som inte är med i teamet.</small></label><label>Poängkostnad<input id="aePointsCost" type="number" min="0" value="0"><small>Dras från användarens poäng när eventet triggas. 0 = gratis. Räcker inte poängen triggas eventet inte.</small></label><label>Minsta poängnivå<input id="aeMinPointsLevel" type="number" min="0" value="0"><small>Poängnivå (ej TikTok-teamnivå), se Poängsystem-inställningarna. 0 = ingen gräns.</small></label><label>Kör alla dessa Actions<select id="aeAllActions" multiple size="${Math.min(5,Math.max(2,s.actions.length))}">${opts(s.actions)}</select><small>Håll Ctrl för att välja flera.</small></label><label>Kör en av dessa Actions slumpmässigt<select id="aeRandomActions" multiple size="${Math.min(5,Math.max(2,s.actions.length))}">${opts(s.actions)}</select></label></section>`;footer.before(p);
    const sync=()=>{const v=p.querySelector('[name=aeAdvancedTrigger]:checked').value,map={join:'member',firstActivity:'member',share:'share',follow:'follow',member:'member',likes:'likes',chat:'chat',chatCommand:'chat',giftCoins:'gift',gift:'gift',subscriberEmote:'chat',fanSticker:'chat',shopPurchase:'gift'},sel=m.querySelector('#aeTrigger');if(sel&&[...sel.options].some(o=>o.value===map[v]))sel.value=map[v];const d=p.querySelector('#aeTriggerDetails');d.innerHTML=v==='chatCommand'?'<label>Kommando<input id="aeAdvancedValue" placeholder="Exempel: !hype"></label>':v==='giftCoins'?'<label>Minsta coin-värde<input id="aeAdvancedValue" type="number" min="1" value="1"></label>':v==='gift'?'<label>Gåvans namn<div class="ae-picker-row"><input id="aeAdvancedValue" placeholder="Exempel: Rose"><button type="button" id="aeChooseGift">🎁 Välj gåva</button></div></label>':(v==='subscriberEmote'||v==='fanSticker')?renderEmotePickerHtml():'';if(v==='gift'){const btn=d.querySelector('#aeChooseGift');if(btn)btn.onclick=()=>openTriggerGiftPicker(d.querySelector('#aeAdvancedValue'))}if(v==='subscriberEmote'||v==='fanSticker')wireEmotePicker(d)};
    p.querySelectorAll('[name=aeAdvancedTrigger]').forEach(x=>x.onchange=sync);p.querySelectorAll('[name=aeAudience]').forEach(x=>x.onchange=()=>p.querySelector('#aeSpecificUserWrap').hidden=x.value!=='specificUser'||!x.checked);wireUserPicker(p);sync();
    const before=s.events.length;m.querySelector('#saveAeEvent').addEventListener('click',()=>{const selected=q=>[...p.querySelector(q).selectedOptions].map(o=>o.value),extra={audience:p.querySelector('[name=aeAudience]:checked').value,specificUser:p.querySelector('#aeSpecificUser').value.trim().replace(/^@/,''),excludeAnonymous:p.querySelector('#aeExcludeAnonymous').checked,advancedTrigger:p.querySelector('[name=aeAdvancedTrigger]:checked').value,triggerValue:p.querySelector('#aeAdvancedValue')?.value?.trim()||'',teamLevel:+p.querySelector('#aeTeamLevel').value,pointsCost:+p.querySelector('#aePointsCost').value,minPointsLevel:+p.querySelector('#aeMinPointsLevel').value,allActionIds:selected('#aeAllActions'),randomActionIds:selected('#aeRandomActions')};if(extra.allActionIds.length)m.querySelector('#aeActionId').value=extra.allActionIds[0];else if(extra.randomActionIds.length)m.querySelector('#aeActionId').value=extra.randomActionIds[0];let i=0,t=setInterval(()=>{const state=JSON.parse(readExtra(KEY)||'{"events":[]}');if(state.events.length>before){Object.assign(state.events.at(-1),extra);window.VyraSessionState.writeActive(KEY,JSON.stringify(state));clearInterval(t)}else if(++i>40)clearInterval(t)},100)},true);
  }
  function allowed(e,p={}){if((p.teamLevel||0)<(e.teamLevel||0))return false;if(e.excludeAnonymous&&p.isAnonymous)return false;if(e.minPointsLevel&&window.VyraPoints&&(window.VyraPoints.getLevel(p.username||p.user)?.level||0)<e.minPointsLevel)return false;if(!e.audience||e.audience==='everyone')return true;if(e.audience==='specificUser')return String(p.username||p.user||'').replace(/^@/,'').toLowerCase()===String(e.specificUser||'').toLowerCase();return e.audience===p.role||(e.audience==='follower'&&p.isFollower)||(e.audience==='subscriber'&&p.isSubscriber)||(e.audience==='moderator'&&p.isModerator)||(e.audience==='topGifter'&&p.isTopGifter)}
  // Points cost is charged here, not in allowed() — allowed() only checks whether this event
  // COULD ever fire for this person; the trigger still has to match (right command text, right
  // gift, etc.) below before we know it's genuinely happening, so charging any earlier would
  // dock points for a near-miss (e.g. typing a similar but wrong command).
  function handleEvent(trigger,payload={}){const s=JSON.parse(readExtra(KEY)||'{"actions":[],"events":[]}');s.events.filter(e=>e.enabled&&(e.advancedTrigger||e.trigger)===trigger&&allowed(e,payload)).forEach(e=>{const expected=String(e.triggerValue||e.condition||'').trim(),actual=String(payload.value??payload.gift??payload.command??'').trim();if(expected){if((e.advancedTrigger||e.trigger)==='giftCoins'&&Number(payload.coins??payload.value??0)<Number(expected))return;if((e.advancedTrigger||e.trigger)==='likes'&&Number(payload.likecount??payload.value??0)<Number(expected))return;if(['gift','chatCommand'].includes(e.advancedTrigger||e.trigger)&&actual.toLowerCase()!==expected.toLowerCase())return;if(!['giftCoins','likes','gift','chatCommand'].includes(e.advancedTrigger||e.trigger)&&!actual.toLowerCase().includes(expected.toLowerCase()))return}if(e.pointsCost&&window.VyraPoints&&!window.VyraPoints.spend(payload.username||payload.user,e.pointsCost))return;const ids=e.allActionIds?.length?e.allActionIds:e.randomActionIds?.length?[e.randomActionIds[Math.floor(Math.random()*e.randomActionIds.length)]]:[e.actionId];ids.forEach(id=>window.VyraActionEvent?.runAction(s.actions.find(a=>a.id===id),payload))})}
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});window.VyraAdvancedEvents={handleEvent};
})();
