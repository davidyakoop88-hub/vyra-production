(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DEFAULT_URL='https://www.tiktok.com/';
  let model=null,pollTimer=null;

  async function api(path,body){
    const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json().catch(()=>({ok:false,error:'Ogiltigt svar'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'Kunde inte kontakta VYRA Desktop');
    return data;
  }
  function list(title,items,empty){return `<article><small>${esc(title)}</small>${items?.length?`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<p>${esc(empty)}</p>`}</article>`}
  function renderStatus(data){
    model=data;const box=document.querySelector('#tecResult');if(!box)return;
    const s=data?.snapshot;
    if(!s){box.innerHTML='<div class="tec-empty"><b>Ingen eventinformation avläst ännu</b><span>Öppna TikTok, gå till LIVE Center och öppna eventets detaljsida. Tryck sedan Läs av sidan.</span></div>';return}
    box.innerHTML=`<div class="tec-verdict ${s.publishable?'ok':'wait'}"><i>${s.publishable?'✓':'!'}</i><span><small>${s.publishable?'KOMPLETT KANDIDAT':'PUBLICERAS INTE ÄN'}</small><strong>${esc(s.name||'Eventnamn saknas')}</strong><em>${s.publishable?'Alla obligatoriska fält hittades.':'Saknas: '+s.missing.join(', ')}</em></span></div><div class="tec-grid">${list('DATUM',s.dates,'Inga säkra datum hittades')}${list('UPPGIFTER',s.tasks,'Inga uppgifter hittades')}${list('DUBBLA POÄNG / GÅVOR',s.boostedGifts,'Inga boosted gifts hittades')}${list('BONUSTIDER',s.bonusWindows,'Inga bonustider hittades')}</div><footer><span>Källa: ${esc(s.sourceUrl||'saknas')}</span><span>Kontrollerad: ${esc(data.updatedAt?new Date(data.updatedAt).toLocaleString('sv-SE'):'—')}</span><span>Kontrollkod: ${esc(s.fingerprint)}</span></footer>`;
  }
  function shell(){return `<section class="tec"><div class="tec-hero"><span class="tec-mark">T</span><div><small>VYRA EVENT CONNECTOR</small><h2>TikTok-event</h2><p>Läser den eventsida du själv öppnar i TikTok och stoppar ofullständig information innan den når framsidan.</p></div></div><div class="tec-controls"><label><span>OFFICIELL TIKTOK-ADRESS</span><input id="tecUrl" type="url" value="${DEFAULT_URL}" spellcheck="false"></label><button id="tecOpen">Öppna TikTok</button><button id="tecScan" class="primary">Läs av sidan</button></div><div class="tec-note"><b>Så gör du</b><span>1. Öppna TikTok. 2. Logga in själv. 3. Gå till LIVE Center och välj eventet. 4. Läs av sidan.</span></div><div id="tecMessage" role="status"></div><div id="tecResult"></div></section>`}
  function message(text,error=false){const el=document.querySelector('#tecMessage');if(el){el.textContent=text;el.className=error?'error':'ok'}}
  async function openTikTok(){try{message('Öppnar ett säkert TikTok-fönster…');const url=document.querySelector('#tecUrl')?.value||DEFAULT_URL;renderStatus(await api('/api/tiktok-events/open',{url}));message('TikTok är öppet. Gå till LIVE Center och eventets detaljsida.')}catch(e){message(e.message,true)}}
  async function scan(){try{message('Läser synlig eventinformation…');const data=await api('/api/tiktok-events/scan',{});renderStatus(data);message(data.snapshot?.publishable?'Eventet är komplett och klart för nästa synksteg.':'Informationen är ofullständig och har stoppats.',!data.snapshot?.publishable)}catch(e){message(e.message,true)}}
  function open(){
    document.querySelectorAll('aside button').forEach(b=>b.classList.toggle('active',b.dataset.extra==='tiktokEvents'));
    const title=document.querySelector('#title'),crumb=document.querySelector('#crumb'),view=document.querySelector('#view');
    if(title)title.textContent='TikTok-event';if(crumb)crumb.textContent='VYRA / TIKTOK-EVENT';if(view)view.innerHTML=shell();
    document.querySelector('#tecOpen')?.addEventListener('click',openTikTok);document.querySelector('#tecScan')?.addEventListener('click',scan);
    api('/api/tiktok-events/status').then(renderStatus).catch(e=>{renderStatus(null);message(e.message,true)});
    clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.querySelector('.tec')){clearInterval(pollTimer);return}api('/api/tiktok-events/status').then(data=>{if(data.updatedAt!==model?.updatedAt)renderStatus(data)}).catch(()=>{})},3000);
  }
  function mount(){document.querySelector('[data-extra="tiktokEvents"]')?.addEventListener('click',open)}
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  root.VyraTikTokEvents={open,renderStatus,get model(){return model}};
})(window);
