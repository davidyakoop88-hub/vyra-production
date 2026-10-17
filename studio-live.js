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
function paint(d){malaInstallningsrad(d&&d.connection);let e=document.querySelector('.connection');if(!e)return;let c=d?.connection,state=c?.state;e.classList.toggle('connected',!!c?.connected&&state!=='paused'&&state!=='suspended');e.classList.toggle('pausad',state==='paused'||state==='suspended');e.querySelector('span').textContent=(c?.connected&&state!=='paused'&&state!=='suspended')?`TikTok ansluten · @${String(c.username||'LIVE').replace(/^@/,'')}`:state==='paused'?'Sändningen pausad':state==='suspended'?'Sändningen stoppad av TikTok':state==='connecting'?'Ansluter till TikTok…':state==='reconnecting'?`TikTok återansluter · försök ${c.reconnectAttempt||1}`:state==='stale'?'TikTok-signal saknas':'Anslut TikTok'}addEventListener('vyra-server-status',e=>paint(e.detail));document.addEventListener('click',()=>setTimeout(()=>VyraLive.status().then(paint).catch(()=>{}),60),true);addEventListener('vyra-server-offline',()=>{let e=document.querySelector('.connection span');if(e)e.textContent='Anslut TikTok'});addEventListener('vyra-live-event',e=>{let x=e.detail||{};note('LIVE: '+(x.username||x.name||'Event')+' · '+(x.giftName||x.type||''))});document.addEventListener('click',async e=>{if(e.target?.id!=='connectNow')return;e.preventDefault();e.stopImmediatePropagation();let u=(document.querySelector('#tikUser')?.value||'').trim();if(!u)return note('Skriv TikTok-användarnamn');let button=e.target;button.disabled=true;button.textContent='Ansluter…';paint({connection:{connected:false,state:'connecting'}});try{let d=await VyraLive.connect(u);document.querySelector('#connectModal [data-epostkrav]')?.remove();state.tiktok=u;save();paint(d);document.querySelector('#connectModal')?.close();note('TikTok LIVE är anslutet · '+u)}catch(error){paint({connection:{connected:false,state:'failed'}});if(!visaEpostkrav(error))note(error.message||'Kunde inte ansluta till TikTok LIVE')}finally{button.disabled=false;button.textContent='Anslut konto'}},true);// VERIFIERA MED TIKTOK. Knappen lamnar sidan — VyraLive.verifiera() satter location.href till
// TikToks egen URL. Darfor aterstalls knappen bara i FELfallet: i lyckofallet ar sidan redan pa
// vag bort, och en knapp som hoppar tillbaka till "Verifiera med TikTok" strax innan det ser ut
// som att ingenting hande.
document.addEventListener('click',async e=>{if(e.target?.id!=='verifieraTikTok')return;
  e.preventDefault();e.stopImmediatePropagation();
  const b=e.target,text=b.textContent;b.disabled=true;b.textContent='Öppnar TikTok…';
  try{const ut=await VyraLive.verifiera();
    // SKRIVBORDSAPPEN LAMNAR INTE SIDAN. Dar oppnas TikTok i anvandarens riktiga webblasare
    // (live-client.js oppnaVerifiering), sa den har fliken star kvar och far INGEN callback att
    // reagera pa — utan det som foljer hade knappen sagt "Oppnar TikTok…" for alltid medan
    // verifieringen redan var klar pa andra sidan.
    if(ut&&ut.externt){b.textContent='Väntar på TikTok…';
      note('Slutför inloggningen i webbläsaren som öppnades — det här fönstret uppdaterar sig självt');
      vantaPaVerifiering(b,text)}}
  catch(error){b.disabled=false;b.textContent=text;if(!visaEpostkrav(error))note(error.message||'Kunde inte starta verifieringen')}},true);
// E-POSTEN FÖRST. server/index.js stoppar varje skrivning från ett konto med overifierad e-post —
// också PUT /tiktok-connection, POST /tiktok-verifiering och anslut-nu. Det är hela skillnaden
// mellan ett nytt och ett gammalt konto (rapporterat 2026-10-17), och den syntes förut bara som en
// toast om att "spara eller publicera" som försvann. Beskedet ligger nu kvar i modalen, säger vart
// mejlet gick och har en knapp som skickar det igen. Spärren själv står kvar: varje anslutning är
// en bryggplats, och overifierade engångskonton ska inte kunna ta dem. Vaktat av
// tests/epostkrav-tiktok.test.js.
function visaEpostkrav(error){if(!error||!error.emailVerificationRequired)return false;
  const modal=document.querySelector('#connectModal');if(!modal)return false;
  modal.querySelector('[data-epostkrav]')?.remove();
  const ruta=document.createElement('div');ruta.className='tik-epostkrav';
  ruta.setAttribute('data-epostkrav','');ruta.setAttribute('role','alert');
  ruta.innerHTML='<p><b>Steg 1: verifiera din e-post först.</b> Öppna länken vi skickade till <em></em>.</p>'
    +'<p><b>Steg 2: anslut TikTok LIVE</b> här nedanför. Knapparna låses upp när e-posten är verifierad.</p>'
    +'<p class="tik-epostkrav-knappar"><button type="button" class="primary" data-har-verifierat>Jag har verifierat</button>'
    +'<button type="button" data-skicka-igen>Skicka mejlet igen</button></p><small data-epoststatus role="status"></small>';
  ruta.querySelector('em').textContent=window.VyraAuth?.lastDetail?.()?.user?.email||'din e-postadress';
  const status=ruta.querySelector('[data-epoststatus]');
  const knapp=ruta.querySelector('[data-skicka-igen]');
  knapp.onclick=async()=>{knapp.disabled=true;
    try{await window.VyraAuth.api('/api/auth/email/send-verification',{method:'POST',body:'{}'});knapp.textContent='Mejlet är skickat'}
    catch(err){knapp.disabled=false;note(err.message||'Kunde inte skicka mejlet')}};
  // SERVERN SVARAR, INTE WEBBLÄSARENS MINNE. Länken i mejlet öppnas ofta i en annan flik, och då vet
  // den här fliken ingenting. /api/auth/me läser kontot som det är nu.
  const klar=ruta.querySelector('[data-har-verifierat]');
  klar.onclick=async()=>{klar.disabled=true;status.textContent='Kontrollerar…';
    try{const me=await window.VyraAuth.api('/api/auth/me');
      if(me&&me.user&&me.user.emailVerified){
        const detalj=window.VyraAuth?.lastDetail?.();if(detalj&&detalj.user)detalj.user.emailVerified=true;
        ruta.remove();lasTikTok(false);malaEpostknapp();
        note('E-posten är verifierad. Nu kan du ansluta TikTok LIVE.');return}
      status.textContent='E-posten är inte verifierad än. Öppna länken i mejlet och tryck sedan här igen.'}
    catch(err){status.textContent=err.message||'Kunde inte kontrollera just nu'}
    klar.disabled=false};
  const fore=modal.querySelector('#verifieraTikTok');if(fore)fore.before(ruta);else modal.append(ruta);
  lasTikTok(true);
  return true}
// STEG 2 ÄR LÅST TILLS STEG 1 ÄR KLART. Knappar som ser klickbara ut men som servern ändå avvisar
// var det som gjorde kravet otydligt. Låsningen är bara en spegel — spärren sitter i servern.
function lasTikTok(last){const m=document.querySelector('#connectModal');if(!m)return;
  for(const id of ['#verifieraTikTok','#connectNow','#tikUser','#anslutNu']){const e=m.querySelector(id);if(e)e.disabled=last}
  m.toggleAttribute('data-epostlast',last)}
// SIDHUVUDET SÄGER DET OCKSÅ. "Anslut TikTok" till ett konto som inte kan ansluta än var ett löfte
// knappen inte höll. Bara viloläget skrivs om — "Ansluter…", "Ansluten" och felen står kvar.
function malaEpostknapp(){const e=document.querySelector('.connection span');if(!e)return;
  const overifierad=window.VyraAuth?.lastDetail?.()?.user?.emailVerified===false;
  if(overifierad&&e.textContent==='Anslut TikTok')e.textContent='Verifiera e-post för TikTok';
  else if(!overifierad&&e.textContent==='Verifiera e-post för TikTok')e.textContent='Anslut TikTok';
  document.querySelector('.connection')?.classList.toggle('epostkrav',overifierad)}
// I FÖRVÄG. Att beskedet kom först efter ett misslyckat tryck var inte tydligt nog: användaren
// skrev sitt namn, tryckte och fick då veta att ett annat steg saknades. Därför visas kravet så
// fort modalen öppnas för ett konto som inte har verifierat sin e-post. Knapparna förblir
// klickbara med flit: lastDetail kan vara inaktuell (verifierat i en annan flik), och servern är
// den som bestämmer — svarar den 403 visas samma besked igen.
function forhandsEpostkrav(){const m=document.querySelector('#connectModal');if(!m||!m.open)return;
  const anv=window.VyraAuth?.lastDetail?.()?.user;
  if(anv&&anv.emailVerified===false)visaEpostkrav({emailVerificationRequired:true});
  else if(m.querySelector('[data-epostkrav]')){m.querySelector('[data-epostkrav]').remove();lasTikTok(false)}}
(function(){const m=document.querySelector('#connectModal');if(!m)return;
  new MutationObserver(forhandsEpostkrav).observe(m,{attributes:true,attributeFilter:['open']});
  addEventListener('vyra-auth-ready',forhandsEpostkrav);
  addEventListener('vyra-auth-ready',malaEpostknapp);
  forhandsEpostkrav()})();
// Bevakar servern tills kopplingen blir verifierad. Bunden i tid med flit: en obegransad slinga
// hade fortsatt fraga i evighet efter ett avbrutet varv. Tva minuter racker for en inloggning och
// ger upp med ett SKAL i stallet for att tiga.
let verifieringsvakt=null;
function vantaPaVerifiering(b,text){
  clearTimeout(verifieringsvakt);
  let forsok=0;
  const aterstall=()=>{if(b&&b.isConnected){b.disabled=false;b.textContent=text}};
  const tick=async()=>{
    forsok+=1;
    let d=null;try{d=await VyraLive.status()}catch(_){}
    if(d&&d.connection&&d.connection.verifierad){
      paint(d);aterstall();
      document.querySelector('#connectModal')?.close();
      note('TikTok-kontot @'+String(d.connection.username||'').replace(/^@/,'')+' är verifierat och kopplat');
      return}
    if(forsok>=40){aterstall();note('Ingen verifiering kom in. Avbröt du i webbläsaren? Försök igen.');return}
    verifieringsvakt=setTimeout(tick,3000);
  };
  verifieringsvakt=setTimeout(tick,3000);
}
// Slingan overlever inte en sessionsavslutning — den skulle annars fraga vidare mot ett konto
// som loggat ut. `vyra-session-ended` ar UTLOGGNING, vilket ar precis ratt handelse har.
window.VyraSessionState?.registerTeardown?.('tiktok-verifieringsvakt',()=>clearTimeout(verifieringsvakt));
addEventListener('vyra-session-ended',()=>clearTimeout(verifieringsvakt));
// ANSLUT NU. Knappen lamnar inte sidan, sa den maste sjalv saga vad som hander — och den far inte
// pasta att anslutningen ar klar. Servern svarar 202 "begaran mottagen"; bryggan ansluter nar den
// hinner. Darfor sager knappen "Försöker…" och inte "Ansluten".
document.addEventListener('click',async e=>{if(e.target?.id!=='anslutNu')return;
  e.preventDefault();e.stopImmediatePropagation();
  const b=e.target,text=b.textContent;b.disabled=true;b.textContent='Försöker…';
  try{await VyraLive.anslutNu();
    note('Ansluter till TikTok — det tar upp till en halv minut');
    // Statusen hamtas nagra ganger sa gransnittet foljer med av sig sjalvt nar bryggan kopplat.
    let n=0;const tick=async()=>{n+=1;
      try{const d=await VyraLive.status();paint(d);
        if(d?.connection?.connected){b.disabled=false;b.textContent=text;return}}catch(_){}
      if(n<12)setTimeout(tick,5000);else{b.disabled=false;b.textContent=text}};
    setTimeout(tick,5000);}
  catch(error){b.disabled=false;b.textContent=text;if(!visaEpostkrav(error))note(error.message||'Kunde inte be om anslutning')}},true);
// Fritextfaltet goms nar servern kraver verifiering. Servern ar den som bestammer — det har ar
// bara att slippa visa ett falt som rutten anda skulle avvisa med 403.
function malaVerifieringslage(d){const block=document.querySelector('#tikFritext');
  if(block)block.hidden=!!(d&&d.verifieringKravs);
  // ANSLUT NU visas bara nar det FINNS ett konto att ansluta. Utan konto vore knappen ett lofte
  // om nagot den inte kan gora — servern svarar 409 och anvandaren far felsoka i blindo.
  const nu=document.querySelector('#tikAnslutNu');
  if(nu)nu.hidden=!(d&&d.connection&&d.connection.username)}
const grundPaint=paint;paint=function(d){grundPaint(d);malaVerifieringslage(d);malaEpostknapp()};
// ATERVAGEN FRAN TIKTOK. server/index.js omdirigerar hit med ?tiktok=<lage>. Varje lage far en
// egen mening: "det gick inte" sager inte vad man ska gora, och tre av lagena nedan kraver helt
// olika handling av anvandaren.
(function(){const q=new URLSearchParams(location.search),lage=q.get('tiktok');if(!lage)return;
  const konto=String(q.get('konto')||'').replace(/^@/,'');
  const TEXT={
    klar:konto?'TikTok-kontot @'+konto+' är verifierat och kopplat':'TikTok-kontot är verifierat och kopplat',
    avbruten:'Verifieringen avbröts — ingenting ändrades',
    utgangen:'Verifieringslänken hade gått ut. Tryck Verifiera med TikTok igen.',
    upptaget:'Handtaget är redan kopplat till ett annat TikTok-konto. Logga in med det konto som äger handtaget.',
    dubblett:'Kontot är redan anslutet i ett annat workspace. Koppla från det först.',
    fullt:'Alla live-platser är upptagna just nu — försök igen om en stund.',
    fel:'Verifieringen misslyckades. Kontrollera att du godkände raden om profilinformation och försök igen.'};
  note(TEXT[lage]||TEXT.fel);
  if(lage==='klar')document.querySelector('#connectModal')?.close();
  // Stada bort BARA vara egna parametrar. location.pathname ensamt hade slangt ?overlay=1 och
  // allt annat sidan kordes med — studio.html och overlay.html ar samma sida i tva lagen.
  q.delete('tiktok');q.delete('konto');
  const rest=q.toString();
  history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);
  VyraLive.status().then(paint).catch(()=>{});})();
VyraLive.status().then(paint).catch(()=>{})})();
