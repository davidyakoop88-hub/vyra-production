(function(){function note(t){if(typeof toast==='function')toast(t)}// SKÄLET FANNS HELA TIDEN — DET VISADES BARA ALDRIG.
//
// Servern skickar `connection.reason` i varje statussvar. Uppmätt 2026-09-16 stod det
// "The requested user isn't online :(" medan gränssnittet bara sa "Anslut TikTok" — alltså exakt
// samma sak som om man aldrig hade försökt. Användaren fick felsöka i blindo.
//
// TikToks text är engelsk och riktad till en utvecklare. De fall vi känner igen översätts till
// något som säger vad man ska GÖRA; resten släpps fram ordagrant, för ett okänt skäl är bättre än
// inget skäl.
const SKAL=[
  [/isn'?t online|not online|user is not live/i,'kontot sänder inte på TikTok just nu'],
  [/user.*not.*(found|exist)|no user/i,'användarnamnet hittades inte på TikTok'],
  [/rate ?limit|too many/i,'TikTok stryper anslutningarna — vänta en stund'],
  [/sign|signature/i,'signeringstjänsten svarade inte — försök igen om en stund'],
  [/age|restricted|blocked/i,'sändningen är åldersbegränsad eller blockerad för anslutningar']
];
function oversattSkal(text){
  const t=String(text||'').trim();
  if(!t)return '';
  for(const [m,svensk] of SKAL)if(m.test(t))return svensk;
  return t;
}
function malaInstallningsrad(c){
  // EN KALLA FOR ANSLUTNINGSLAGET. Inställningsraden visade förr grönt så fort ett användarnamn
  // var sparat — alltså ett påstående om minnet, inte om anslutningen.
  const rad=document.querySelector('[data-tiktok-status]');if(!rad)return;
  const namn=String(c&&c.username||(typeof state==='object'&&state&&state.tiktok)||'').replace(/^@/,'');
  const st=c&&c.state,ansluten=!!(c&&c.connected)&&st!=='paused'&&st!=='suspended';
  const pagar=st==='connecting'||st==='reconnecting';
  rad.classList.toggle('online',ansluten);
  rad.classList.toggle('vantar',!ansluten&&pagar);
  const skal=!ansluten&&!pagar?oversattSkal(c&&c.reason):'';
  const lage=ansluten?'ansluten':pagar?'ansluter…':st==='stale'?'signal saknas':'inte ansluten';
  rad.innerHTML='<i></i>'+(namn?namn+' · '+lage:'Inte anslutet')
    +(skal?'<small class="settings-status-skal">'+skal.replace(/[<>&]/g,'')+'</small>':'');
}
function paint(d){malaInstallningsrad(d&&d.connection);let e=document.querySelector('.connection');if(!e)return;let c=d?.connection,state=c?.state;e.classList.toggle('connected',!!c?.connected&&state!=='paused'&&state!=='suspended');e.classList.toggle('pausad',state==='paused'||state==='suspended');e.querySelector('span').textContent=(c?.connected&&state!=='paused'&&state!=='suspended')?`TikTok ansluten · @${String(c.username||'LIVE').replace(/^@/,'')}`:state==='paused'?'Sändningen pausad':state==='suspended'?'Sändningen stoppad av TikTok':state==='connecting'?'Ansluter till TikTok…':state==='reconnecting'?`TikTok återansluter · försök ${c.reconnectAttempt||1}`:state==='stale'?'TikTok-signal saknas':'Anslut TikTok'}addEventListener('vyra-server-status',e=>paint(e.detail));document.addEventListener('click',()=>setTimeout(()=>VyraLive.status().then(paint).catch(()=>{}),60),true);addEventListener('vyra-server-offline',()=>{let e=document.querySelector('.connection span');if(e)e.textContent='Anslut TikTok'});addEventListener('vyra-live-event',e=>{let x=e.detail||{};note('LIVE: '+(x.username||x.name||'Event')+' · '+(x.giftName||x.type||''))});document.addEventListener('click',async e=>{if(e.target?.id!=='connectNow')return;e.preventDefault();e.stopImmediatePropagation();let u=(document.querySelector('#tikUser')?.value||'').trim();if(!u)return note('Skriv TikTok-användarnamn');let button=e.target;button.disabled=true;button.textContent='Ansluter…';paint({connection:{connected:false,state:'connecting'}});try{let d=await VyraLive.connect(u);state.tiktok=u;save();paint(d);document.querySelector('#connectModal')?.close();note('TikTok LIVE är anslutet · '+u)}catch(error){paint({connection:{connected:false,state:'failed'}});note(error.message||'Kunde inte ansluta till TikTok LIVE')}finally{button.disabled=false;button.textContent='Anslut konto'}},true);VyraLive.status().then(paint).catch(()=>{})})();
