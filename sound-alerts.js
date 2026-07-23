// Sound Alerts — bibliotek med ljudklipp som kan kopplas till events.
// Källor: mixkit.co (Mixkit License) och pixabay.com (Pixabay Content License) — båda royaltyfria,
// ingen attribution krävs, tillåtna i kommersiella projekt.
const soundAlerts={
  followCheer:{id:'followCheer',name:'Follow Cheer',path:'assets/sounds/mixkit/follow-cheer.mp3'},
  giftCoinWin:{id:'giftCoinWin',name:'Gift Coin Win',path:'assets/sounds/mixkit/gift-coin-win.mp3'},
  positiveNotification:{id:'positiveNotification',name:'Positive Notification',path:'assets/sounds/mixkit/positive-notification.mp3'},
  memberBells:{id:'memberBells',name:'Member Bells',path:'assets/sounds/mixkit/member-bells.mp3'},
  alertBell:{id:'alertBell',name:'Alert Bell',path:'assets/sounds/mixkit/alert-bell.mp3'},
  arcadeWin:{id:'arcadeWin',name:'Arcade Win',path:'assets/sounds/mixkit/arcade-win.mp3'},
  pewPew:{id:'pewPew',name:'Pew Pew',path:'assets/sounds/mixkit/pew-pew.mp3'},
  thankYou:{id:'thankYou',name:'Thank You',path:'assets/sounds/mixkit/thank-you.mp3'},
  iLoveYou:{id:'iLoveYou',name:'I Love You',path:'assets/sounds/pixabay/i-love-you.mp3'},
  jackpot:{id:'jackpot',name:'Jackpot',path:'assets/sounds/mixkit/jackpot.mp3'},
  achievement:{id:'achievement',name:'Achievement',path:'assets/sounds/mixkit/achievement.mp3'},
  victoryCheer:{id:'victoryCheer',name:'Victory Cheer',path:'assets/sounds/mixkit/victory-cheer.mp3'},
  fanfare:{id:'fanfare',name:'Fanfare',path:'assets/sounds/mixkit/fanfare.mp3'}
};
const SA_TRIGGERS={gift:'Gåva mottagen',follow:'Ny följare',member:'Ny medlem',likes:'Likes uppnådda',share:'Delning',chat:'Chattkommando',chatCommand:'Chattkommando',giftCoins:'Minsta coin-värde',subscriberEmote:'Subscriber-emote',fanSticker:'Fan Club-sticker',shopPurchase:'TikTok Shop-köp'};
const SA_AE_KEY='vyra-action-event-v2';
function aeRead(){return JSON.parse(localStorage.getItem(SA_AE_KEY)||'{"actions":[],"events":[]}')}
function aeWrite(state){localStorage.setItem(SA_AE_KEY,JSON.stringify(state))}
function saConnection(soundId){let state=aeRead(),event=state.events.find(e=>e.soundAlertId===soundId);if(!event)return null;let action=state.actions.find(a=>a.id===event.actionId);return {event,action}}
async function saGetMediaMeta(sound){if(sound.mediaMeta)return sound.mediaMeta;if(!sound.path)return null;let resp=await fetch(sound.path),blob=await resp.blob(),file=new File([blob],sound.name+'.mp3',{type:blob.type||'audio/mpeg'});sound.mediaMeta=await cwStore(file);return sound.mediaMeta}

function soundAlertCard(sound){let conn=saConnection(sound.id),triggerOptions=Object.entries(SA_TRIGGERS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');return `<article class="media-card sound-card" data-sound="${sound.id}"><div class="sound-icon"><i>♪</i><button class="media-play" type="button">▶</button></div><div class="media-info"><b>${sound.name}</b>${conn?`<small>Kopplad till: ${SA_TRIGGERS[conn.event.trigger]||conn.event.trigger}</small><button class="btn btn-secondary btn-sm use-media sa-disconnect" type="button">Koppla från</button>`:`<small>Ej kopplad</small><label class="sa-trigger-row">Trigger<select class="sa-trigger">${triggerOptions}</select></label><input class="sa-condition" placeholder="Villkor (valfritt, t.ex. giftnamn)"><button class="btn btn-secondary btn-sm use-media sa-connect" type="button">Koppla till event</button>`}</div></article>`}

function soundAlertsHtml(){let ids=Object.keys(soundAlerts);if(!ids.length)return `<div class="page-header section-head"><div><h2>Sound Alerts</h2><p>0 ljudklipp</p></div></div><p class="sa-empty">Inga ljud tillagda ännu — skicka ljudklipp så läggs de till här, precis som Overlay-paket.</p>`;return `<div class="page-header section-head"><div><h2>Sound Alerts</h2><p>${ids.length} ljudklipp · koppla till events</p></div></div><div class="media-grid">${ids.map(id=>soundAlertCard(soundAlerts[id])).join('')}</div>`}

let saPlayingAudio=null,saPlayingBtn=null;
function bindSoundAlerts(){saPlayingAudio=null;saPlayingBtn=null;document.querySelectorAll('.sound-card').forEach(card=>{let soundId=card.dataset.sound,sound=soundAlerts[soundId],playBtn=card.querySelector('.media-play'),audioEl=null;playBtn.onclick=async()=>{if(audioEl&&!audioEl.paused){audioEl.pause();playBtn.textContent='▶';saPlayingAudio=null;saPlayingBtn=null;return}if(saPlayingAudio){saPlayingAudio.pause();saPlayingBtn.textContent='▶'}if(!audioEl){if(sound.path)audioEl=new Audio(sound.path);else{let blob=await cwRead(sound.mediaMeta);if(!blob)return;audioEl=new Audio(URL.createObjectURL(blob))}audioEl.onended=()=>{playBtn.textContent='▶';saPlayingAudio=null;saPlayingBtn=null}}audioEl.currentTime=0;saPlayingAudio=audioEl;saPlayingBtn=playBtn;playBtn.textContent='❚❚';audioEl.play().catch(()=>toast('Webbläsaren blockerade ljudet'))};let connectBtn=card.querySelector('.sa-connect');if(connectBtn)connectBtn.onclick=async()=>{let trigger=card.querySelector('.sa-trigger').value,condition=card.querySelector('.sa-condition').value.trim(),audioMedia=await saGetMediaMeta(sound);if(!audioMedia)return toast('Kunde inte spara ljudet');let state=aeRead(),actionId='a'+Date.now(),eventId='e'+Date.now();state.actions.push({id:actionId,name:sound.name,types:['audio'],duration:6,cooldown:2,volume:80,audioMedia});state.events.push({id:eventId,trigger,condition,actionId,enabled:true,soundAlertId:soundId});aeWrite(state);window.VyraActionEvent?.refresh?.();toast(sound.name+' kopplad till '+(SA_TRIGGERS[trigger]||trigger));renderSoundAlerts()};let disconnectBtn=card.querySelector('.sa-disconnect');if(disconnectBtn)disconnectBtn.onclick=()=>{let state=aeRead(),removed=state.events.find(e=>e.soundAlertId===soundId);state.events=state.events.filter(e=>e.soundAlertId!==soundId);if(removed)state.actions=state.actions.filter(a=>a.id!==removed.actionId);aeWrite(state);window.VyraActionEvent?.refresh?.();toast(sound.name+' frånkopplad');renderSoundAlerts()}})}

function renderSoundAlerts(){if(!document.querySelector('[data-extra="soundAlerts"]')?.classList.contains('active'))return;document.querySelector('#title').textContent='Sound Alerts';document.querySelector('#view').innerHTML=soundAlertsHtml();bindSoundAlerts()}
document.addEventListener('click',e=>{if(e.target.closest('[data-extra="soundAlerts"]'))setTimeout(renderSoundAlerts,0)},true);
