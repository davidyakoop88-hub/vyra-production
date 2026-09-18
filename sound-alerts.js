// Sound Alerts — bibliotek med ljudklipp som kan kopplas till events.
//
// TRE KÄLLOR, OCH DE ÄR INTE LIKVÄRDIGA:
//   kenney.nl   CC0 (public domain). Inga villkor alls. Massan ligger här.
//   mixkit.co   Mixkit License      ─┐ royaltyfria och tillåtna kommersiellt, men BÅDA förbjuder
//   pixabay.com Pixabay Content Lic. ─┘ att innehållet distribueras "standalone", dvs i oförändrad
//                                       form utan att någon kreativ insats lagts till.
//
// Den sista raden är värd att läsa en gång till innan någon lägger till hundra klipp från Mixkit
// eller Pixabay: ett bibliotek där kunden bläddrar bland oförändrade ljudklipp i en betald produkt
// ligger nära den gränsen. Nya klipp i mängd hör därför hemma under CC0. Pixabay och Mixkit står
// kvar för enstaka karaktärsljud som inte finns CC0 — airhorn, publikreaktioner och liknande.
const soundAlerts={
  followCheer:{id:'followCheer',name:'Follow Cheer',path:'assets/sounds/mixkit/follow-cheer.mp3'},
  giftCoinWin:{id:'giftCoinWin',name:'Gift Coin Win',path:'assets/sounds/mixkit/gift-coin-win.mp3'},
  positiveNotification:{id:'positiveNotification',name:'Positive Notification',path:'assets/sounds/mixkit/achievement.mp3'},
  memberBells:{id:'memberBells',name:'Member Bells',path:'assets/sounds/mixkit/member-bells.mp3'},
  alertBell:{id:'alertBell',name:'Alert Bell',path:'assets/sounds/mixkit/alert-bell.mp3'},
  arcadeWin:{id:'arcadeWin',name:'Arcade Win',path:'assets/sounds/mixkit/arcade-win.mp3'},
  pewPew:{id:'pewPew',name:'Pew Pew',path:'assets/sounds/mixkit/pew-pew.mp3'},
  thankYou:{id:'thankYou',name:'Thank You',path:'assets/sounds/mixkit/thank-you.mp3'},
  iLoveYou:{id:'iLoveYou',name:'I Love You',path:'assets/sounds/pixabay/i-love-you.mp3'},
  jackpot:{id:'jackpot',name:'Jackpot',path:'assets/sounds/mixkit/jackpot.mp3'},
  achievement:{id:'achievement',name:'Achievement',path:'assets/sounds/mixkit/achievement.mp3'},
  victoryCheer:{id:'victoryCheer',name:'Victory Cheer',path:'assets/sounds/mixkit/victory-cheer.mp3'},
  fanfare:{id:'fanfare',name:'Fanfare',path:'assets/sounds/mixkit/fanfare.mp3'},
  djAirhorn:{id:'djAirhorn',name:'DJ Airhorn',path:'assets/sounds/pixabay/dj-airhorn.mp3'}
};

// KENNEY-PAKETEN — 236 ljud, licensen ar CC0 (public domain), se assets/sounds/kenney/LICENSE.txt.
//
// VARFOR CC0 OCH INTE FLER FRAN PIXABAY/MIXKIT. Bada de licenserna tillater kommersiell
// anvandning men forbjuder att innehallet distribueras "standalone" — i oforandrad form, utan att
// nagon kreativ insats lagts till. Ett bibliotek dar kunden bladdrar bland ljudklipp och kopplar
// dem rakt av ligger nara den grensen, och saGetMediaMeta() nedan hamtar dessutom filen och lagger
// den som en File hos anvandaren. CC0 har inga sadana villkor alls: ingen attribution, inga
// begransningar. Darfor ar massan CC0, och Pixabay/Mixkit star kvar for enstaka karaktarsljud.
//
// FILERNA ar konverterade fran Kenneys .ogg till .mp3. Det ar inte kosmetik: saGetMediaMeta()
// hardkodar bade '.mp3' i filnamnet och 'audio/mpeg' som typ, sa en .ogg hade lagts in under fel
// mimetyp. Langderna ar 0,28–1,76 s for jinglarna — alla ligger med god marginal under den
// duration: 6 som kopplingen satter pa sin Action.
//
// Grupperna nedan ar TVA Kenney-paket med overlappande filnamn (bada har click och switch), darav
// skilda prefix: `interface-` respektive `ui-`. Namnen ar systematiska med flit — ingen har lyssnat
// igenom 236 klipp och dopt dem efter kansla, och ett pahittat beskrivande namn hade ljugit.
const KENNEY_GRUPPER = [
  ['jingle', 'Jingel', {'8bit':['8-bit',17],hit:['Hit',17],pizzicato:['Pizzicato',17],sax:['Sax',17],steel:['Steel',17]}],
  ['interface', 'Gränssnitt', {back:['Tillbaka',4],bong:['Bong',1],click:['Klick',5],close:['Stäng',4],confirmation:['Bekräftelse',4],drop:['Släpp',4],error:['Fel',8],glass:['Glas',6],glitch:['Glitch',4],maximize:['Maximera',9],minimize:['Minimera',9],open:['Öppna',4],pluck:['Pluck',2],question:['Fråga',4],scratch:['Skrapa',5],scroll:['Scroll',5],select:['Välj',8],switch:['Växel',7],tick:['Tick',3],toggle:['Växla',4]}],
  ['ui', 'Panel', {click:['Klick',5],mouseclick:['Musklick',1],mouserelease:['Mussläpp',1],rollover:['Hovring',6],switch:['Växel',38]}]
];
for (const [mapp, grupp, poster] of KENNEY_GRUPPER) {
  for (const [fil, [etikett, antal]] of Object.entries(poster)) {
    for (let i = 1; i <= antal; i++) {
      const nr = String(i).padStart(2, '0'), id = `${mapp}-${fil}-${nr}`;
      soundAlerts[id] = {id, name:`${grupp} ${etikett} ${i}`, path:`assets/sounds/kenney/${mapp}-${fil}-${nr}.mp3`};
    }
  }
}
const SA_TRIGGERS={gift:'Gåva mottagen',follow:'Ny följare',member:'Ny medlem',likes:'Likes uppnådda',share:'Delning',chat:'Kommentar',chatCommand:'Chattkommando',giftCoins:'Minsta coin-värde',subscriberEmote:'Subscriber-emote',fanSticker:'Fan Club-sticker',shopPurchase:'TikTok Shop-köp'};
const SA_AE_KEY='vyra-action-event-v2';
function aeRead(){return JSON.parse(localStorage.getItem(SA_AE_KEY)||'{"actions":[],"events":[]}')}
function aeWrite(state){window.VyraSessionState.writeActive(SA_AE_KEY,JSON.stringify(state))}
function saConnection(soundId){let state=aeRead(),event=state.events.find(e=>e.soundAlertId===soundId);if(!event)return null;let action=state.actions.find(a=>a.id===event.actionId);return {event,action}}
async function saGetMediaMeta(sound){if(sound.mediaMeta)return sound.mediaMeta;if(!sound.path)return null;let resp=await fetch(sound.path),blob=await resp.blob(),file=new File([blob],sound.name+'.mp3',{type:blob.type||'audio/mpeg'});sound.mediaMeta=await cwStore(file);return sound.mediaMeta}

function soundAlertCard(sound){let conn=saConnection(sound.id),triggerOptions=Object.entries(SA_TRIGGERS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');return `<article class="media-card sound-card" data-sound="${sound.id}"><div class="sound-icon"><i>♪</i><button class="media-play" type="button">▶</button></div><div class="media-info"><b>${sound.name}</b>${conn?`<small>Kopplad till: ${SA_TRIGGERS[conn.event.trigger]||conn.event.trigger}</small><button class="btn btn-secondary btn-sm use-media sa-disconnect" type="button">Koppla från</button>`:`<small>Ej kopplad</small><label class="sa-trigger-row">Trigger<select class="sa-trigger">${triggerOptions}</select></label><input class="sa-condition" placeholder="Villkor (valfritt, t.ex. giftnamn)"><button class="btn btn-secondary btn-sm use-media sa-connect" type="button">Koppla till event</button>`}</div></article>`}

function soundAlertsHtml(){let ids=Object.keys(soundAlerts);if(!ids.length)return `<div class="page-header section-head"><div><h2>Sound Alerts</h2><p>0 ljudklipp</p></div></div><p class="sa-empty">Inga ljud tillagda ännu — skicka ljudklipp så läggs de till här, precis som Overlay-paket.</p>`;return `<div class="page-header section-head"><div><h2>Sound Alerts</h2><p>${ids.length} ljudklipp · koppla till events</p></div></div><div class="media-grid">${ids.map(id=>soundAlertCard(soundAlerts[id])).join('')}</div>`}

let saPlayingAudio=null,saPlayingBtn=null;
function bindSoundAlerts(){saPlayingAudio=null;saPlayingBtn=null;document.querySelectorAll('.sound-card').forEach(card=>{let soundId=card.dataset.sound,sound=soundAlerts[soundId],playBtn=card.querySelector('.media-play'),audioEl=null;playBtn.onclick=async()=>{try{if(audioEl&&!audioEl.paused){audioEl.pause();playBtn.textContent='▶';saPlayingAudio=null;saPlayingBtn=null;return}if(saPlayingAudio){saPlayingAudio.pause();saPlayingBtn.textContent='▶'}if(!audioEl){if(sound.path)audioEl=new Audio(sound.path);else{let blob=await cwRead(sound.mediaMeta);if(!blob)throw Error('Ljudfil saknas');audioEl=new Audio(URL.createObjectURL(blob))}audioEl.onended=()=>{playBtn.textContent='▶';saPlayingAudio=null;saPlayingBtn=null};audioEl.onerror=()=>{playBtn.textContent='▶';toast('Ljudfilen kunde inte läsas')}}/* Forhandsvisningen duckas medan nagon talar (§14). Panelen ar en redigerarknapp, men i en
   studio-only-uppsattning ar studion ocksa rostmaster - da talar den, och ett preview i mun pa
   uppslasningen ar samma fel som i sandningen. duckaLjud satter volymen; fail-open ar full. */
audioEl.currentTime=0;window.VyraTal?.duckaLjud?.(audioEl,1);saPlayingAudio=audioEl;saPlayingBtn=playBtn;playBtn.textContent='❚❚';await audioEl.play()}catch{playBtn.textContent='▶';saPlayingAudio=null;saPlayingBtn=null;toast('Webbläsaren blockerade eller saknar ljudet')}};let connectBtn=card.querySelector('.sa-connect');if(connectBtn)connectBtn.onclick=async()=>{connectBtn.disabled=true;try{let trigger=card.querySelector('.sa-trigger').value,condition=card.querySelector('.sa-condition').value.trim(),audioMedia=await saGetMediaMeta(sound);if(!audioMedia)throw Error('Media saknas');let state=aeRead(),stamp=Date.now(),actionId='a'+stamp+'-'+soundId,eventId='e'+stamp+'-'+soundId;state.actions.push({id:actionId,name:sound.name,types:['audio'],duration:6,cooldown:2,volume:80,audioMedia,scene:{number:1}});state.events.push({id:eventId,trigger,condition,actionId,enabled:true,soundAlertId:soundId});aeWrite(state);window.VyraActionEvent?.refresh?.();toast(sound.name+' kopplad till '+(SA_TRIGGERS[trigger]||trigger));renderSoundAlerts()}catch{connectBtn.disabled=false;toast('Kunde inte läsa eller spara ljudfilen')}};let disconnectBtn=card.querySelector('.sa-disconnect');if(disconnectBtn)disconnectBtn.onclick=()=>{let state=aeRead(),removed=state.events.find(e=>e.soundAlertId===soundId);state.events=state.events.filter(e=>e.soundAlertId!==soundId);if(removed)state.actions=state.actions.filter(a=>a.id!==removed.actionId);aeWrite(state);window.VyraActionEvent?.refresh?.();toast(sound.name+' frånkopplad');renderSoundAlerts()}})}

function renderSoundAlerts(){if(!document.querySelector('[data-extra="soundAlerts"]')?.classList.contains('active'))return;document.querySelector('#title').textContent='Sound Alerts';document.querySelector('#view').innerHTML=soundAlertsHtml();bindSoundAlerts()}
document.addEventListener('click',e=>{if(e.target.closest('[data-extra="soundAlerts"]'))setTimeout(renderSoundAlerts,0)},true);
