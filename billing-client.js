(function(root){
  'use strict';
  function modal(){let el=document.querySelector('.billing-modal');if(el)return el;el=document.createElement('div');el.className='billing-modal';el.innerHTML='<section><button class="billing-close">×</button><small>VYRA PREMIUM</small><h2 class="billing-rubrik">Allt du behöver för din LIVE</h2><dl class="billing-aktiv" hidden><dt>Plan</dt><dd class="billing-aktiv-plan"></dd><dt class="billing-aktiv-nasta-rubrik">Nästa debitering</dt><dd class="billing-aktiv-nasta"></dd></dl><div class="billing-erbjudande"><div class="billing-price"><b>$15</b><span>USD / månad</span></div><strong>3 dagar gratis</strong><p>Efter provperioden förnyas Premium automatiskt för 15 USD varje månad. Du kan säga upp när som helst direkt här.</p></div><ul><li>Alla premiumwidgets och designer</li><li>Upp till 50 overlays och 500 widgets</li><li>50 GB säker medialagring</li><li>Realtid, cloud-synk och säkra OBS-länkar</li></ul><div class="billing-actions"><button class="primary billing-start">Starta 3 dagar gratis</button><button class="billing-manage">Fakturor & betalmetod</button><button class="billing-cancel">Säg upp abonnemang</button></div><div class="billing-undo"><button class="billing-resume">Ångra uppsägningen</button></div><p class="billing-state"></p></section>';document.body.append(el);el.querySelector('.billing-close').onclick=()=>el.remove();return el}
  async function open(){const current=root.VyraCloudSync?.current?.(),workspace=current?.workspace;if(!workspace)return root.toast?.('Vänta tills cloud-synken är ansluten');const el=modal(),base=`/api/workspaces/${workspace.id}/billing`,state=el.querySelector('.billing-state'),visaFel=fel=>{state.textContent=fel&&fel.message||'Något gick fel';state.classList.add('billing-fel')},cancel=el.querySelector('.billing-cancel'),resume=el.querySelector('.billing-resume');async function refresh(){try{const info=await root.VyraAuth.api(base),active=info.plan==='premium',ending=!!info.subscription?.cancel_at_period_end,date=info.subscription?.current_period_end?new Date(info.subscription.current_period_end).toLocaleDateString('sv-SE'):'';state.classList.remove('billing-fel');state.textContent=!active?'Inget aktivt abonnemang':ending?`Uppsagt · Premium fungerar till ${date}`:info.subscription?.status==='trialing'?'Premium · gratis provperiod · förnyas automatiskt för 15 USD/månad':'Premium · förnyas automatiskt för 15 USD/månad';el.querySelector('.billing-start').hidden=active;visaAktiv(el,info,active,ending);cancel.hidden=!active||ending;resume.hidden=!active||!ending;el.querySelector('.billing-manage').hidden=!active}catch(error){visaFel(error)}}el.querySelector('.billing-start').onclick=async()=>{try{state.textContent='Öppnar säker betalning…';const result=await root.VyraAuth.api(base+'/checkout',{method:'POST',body:'{}'});location.href=result.url}catch(error){visaFel(error)}};el.querySelector('.billing-manage').onclick=async()=>{try{const result=await root.VyraAuth.api(base+'/portal',{method:'POST',body:'{}'});location.href=result.url}catch(error){visaFel(error)}};cancel.onclick=async()=>{if(!confirm('Säg upp VYRA Premium? Du behåller åtkomsten till slutet av perioden och inga fler månadsbetalningar görs.'))return;try{await root.VyraAuth.api(base+'/cancel',{method:'POST',body:'{}'});await refresh()}catch(error){visaFel(error)}};resume.onclick=async()=>{if(!confirm('Ångra uppsägningen? Premium fortsätter då som vanligt och 15 USD dras vid nästa förnyelse.'))return;try{await root.VyraAuth.api(base+'/resume',{method:'POST',body:'{}'});await refresh()}catch(error){visaFel(error)}};refresh()}
  // GRANSKNING 2026-10-17 F13: ett AKTIVT Premium-konto möttes av samma säljruta som en ny kund —
  // "$15" och "3 dagar gratis" störst, medan nästa debitering inte syntes alls. För den som redan
  // betalar är frågan "vad har jag och när dras pengarna", inte "vad kostar det". Aktiv plan,
  // nästa debitering och belopp (eller uppsägningsstatus) står därför först, och erbjudandet
  // döljs. Datumen kommer från GET …/billing (current_period_end = PayPals next_billing_time,
  // trial_end under provperioden); saknas de skrivs bara beloppet, inget gissat datum.
  function visaAktiv(el,info,active,ending){
    const datum=v=>v?new Date(v).toLocaleDateString('sv-SE'):'',sub=info.subscription||{},prov=sub.status==='trialing';
    const nasta=datum(prov&&sub.trial_end?sub.trial_end:sub.current_period_end);
    el.querySelector('.billing-erbjudande').hidden=active;
    el.querySelector('.billing-aktiv').hidden=!active;
    el.querySelector('.billing-rubrik').textContent=active?'Ditt abonnemang':'Allt du behöver för din LIVE';
    if(!active)return;
    el.querySelector('.billing-aktiv-plan').textContent=ending?'Premium · uppsagt':prov?'Premium · gratis provperiod':'Premium · aktiv';
    el.querySelector('.billing-aktiv-nasta-rubrik').textContent=ending?'Premium fungerar till':prov?'Första debitering':'Nästa debitering';
    el.querySelector('.billing-aktiv-nasta').textContent=ending?(nasta?nasta+' · inga fler debiteringar':'Periodens slut · inga fler debiteringar'):(nasta?nasta+' · 15 USD':'15 USD per månad');
  }

  // API:t har ALDRIG exporterats. vyra-trial-onboarding.js och inställningarnas rad anropar
  // `window.VyraBilling.open()` med en reserv som klickar den dolda `.billing-open` — och det var
  // reserven som bar allt, medan huvudvägen tyst var undefined. Ett anrop som alltid faller
  // igenom till en reserv är en reserv utan huvudväg.
  root.VyraBilling = Object.assign(root.VyraBilling || {}, { open });

  function mount(){if(new URLSearchParams(location.search).has('access')||document.querySelector('.billing-open'))return;const button=document.createElement('button');button.className='billing-open';button.hidden=true;button.onclick=open;document.body.append(button)}
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount);else mount();setTimeout(mount,1000);
})(typeof window!=='undefined'?window:globalThis);
