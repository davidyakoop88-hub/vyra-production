(function(root){
  'use strict';
  const M=root.VyraBattleModel;if(!M)return;
  const names={glove:'Handske',hammer:'Hammer',fog:'Fog',chrono:'Chrono',x2:'×2',x3:'×3'};
  let page=null,panel=null,scopeKey='',state=M.empty(),filter='all',search='',undo=null,storageFailed=false,signedOut=false;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
  const num=value=>(Number(value)||0).toLocaleString('sv-SE');
  function context(){let live={};try{live=root.VyraLive?.tillstand?.()||{}}catch{}const workspace=root.VyraCloudSync?.current?.()?.workspace?.id;const account=String(live.konto||'').replace(/^@/,'').trim().toLowerCase();return{live,key:!signedOut&&workspace&&account?`vyra-battle-analytics-v1:${workspace}:${account}`:''}}
  function sync(){const {key}=context();if(key===scopeKey)return;scopeKey=key;undo=null;storageFailed=false;try{state=key?M.restore(localStorage.getItem(key)):M.empty()}catch{state=M.empty();storageFailed=true}}
  function save(){if(!scopeKey)return;try{localStorage.setItem(scopeKey,JSON.stringify({history:state.history,boosters:state.boosters}));storageFailed=false}catch{storageFailed=true}}
  function paint(){
    if(!panel?.isConnected)return;sync();const {live,key}=context();
    panel.querySelector('[data-battle-connection]').textContent=live.text||'Väntar på TikTok-anslutning…';
    panel.querySelector('[data-battle-storage]').textContent=storageFailed?'Kunde inte spara lokalt. Uppgifterna finns bara kvar tills sidan stängs.':'Historik registreras när Studio tar emot händelser. Sparas i denna webbläsare per arbetsyta och TikTok-konto.';
    panel.querySelector('[data-battle-add]').disabled=!key;
    panel.querySelector('[data-battle-clear]').disabled=!key||!state.boosters.length;
    panel.querySelector('[data-battle-undo]').hidden=!undo;
    const current=panel.querySelector('[data-battle-current]');current.replaceChildren();
    if(state.active&&live.gron){const row=state.active;const rubrik=node('small','',`PÅGÅENDE MATCH · SEDAN ${new Date(row.at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}`);rubrik.title=`TikToks match-id ${row.id}`;current.append(rubrik,node('h2','',`${num(row.us)} — ${num(row.them)}`),node('p','','Dina poäng · motståndarens poäng'));
      if(state.boost?.until>Date.now())current.append(node('span','battle-analytics-badge',`Aktivt boostfönster ×${state.boost.multiplier}`));
    }else current.append(node('h3','',live.gron?'Ingen pågående battle':'Ingen aktiv battleanslutning'),node('p','',live.gron?'Väntar på nästa registrerade battle.':'Anslut till en TikTok LIVE med battle för att se realtidsdata.'));
    const list=panel.querySelector('[data-battle-boosters]');list.replaceChildren();const rows=M.visibleBoosters(state,filter,search);
    if(!rows.length)list.append(node('p','battle-analytics-empty','Inga sparade boosters som matchar filtret.'));
    rows.forEach(row=>{const item=node('div','battle-analytics-booster'),person=node('button','',`@${row.user}`);person.type='button';person.addEventListener('click',()=>root.VyraSupporter?.open({id:row.user,namn:row.user},person));item.append(person,node('b','',`${names[row.kind]} ×${row.count}`),node('small','',`Manuellt registrerad${row.expires?' · utgår '+row.expires+' (UTC)':''}`));list.append(item)});
    const history=panel.querySelector('[data-battle-history]');history.replaceChildren();
    const wins=state.history.filter(row=>row.result==='win').length,losses=state.history.filter(row=>row.result==='loss').length;
    panel.querySelector('[data-battle-record]').textContent=`${wins} poängvinster · ${losses} poängförluster · ${state.history.length} matcher`;
    if(!state.history.length)history.append(node('p','battle-analytics-empty','Ingen matchhistorik registrerad i denna webbläsare ännu.'));
    state.history.forEach(row=>{const item=node('li','battle-analytics-history-row');const copy=node('span','','Match');copy.title=`TikToks match-id ${row.id}`;copy.append(node('small','',new Date(row.endedAt).toLocaleString('sv-SE')));item.append(copy,node('strong','',row.hasScore?`${num(row.us)} — ${num(row.them)}`:'Poäng saknas'),node('span',`battle-analytics-result ${row.result}`,({win:'Poängvinst',loss:'Poängförlust',draw:'Lika poäng',unknown:'Okänt resultat'})[row.result]));history.append(item)});
  }
  function add(){
    sync();if(!scopeKey)return;const key=scopeKey;
    const dialog=node('dialog','statistics-profile battle-analytics-form');dialog.setAttribute('aria-label','Registrera sparad booster');
    dialog.innerHTML='<form><header class="statistics-profile-top"><h2>Registrera booster</h2><button type="button" data-cancel aria-label="Stäng">×</button></header><p>Manuellt registrerat saldo. Automatisk inventariehämtning är inte ansluten.</p><label>TikTok-användarnamn<input name="user" required maxlength="80" placeholder="anvandarnamn"></label><label>Booster<select name="kind"><option value="glove">Handske</option><option value="hammer">Hammer</option><option value="fog">Fog</option><option value="chrono">Chrono</option><option value="x2">×2</option><option value="x3">×3</option></select></label><label>Antal<input name="count" type="number" min="1" max="10000" step="1" value="1" required></label><label>Utgångsdatum (valfritt, UTC)<input name="expires" type="date"></label><p data-error role="alert"></p><button type="submit">Spara saldo</button></form>';
    document.body.append(dialog);dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();sync();if(scopeKey!==key){dialog.querySelector('[data-error]').textContent='Kontot har ändrats. Öppna formuläret igen.';return}try{const form=event.currentTarget;const entry=M.booster({user:form.elements.user.value,kind:form.elements.kind.value,count:form.elements.count.value,expires:form.elements.expires.value});if(state.boosters.length>=500&&!state.boosters.some(row=>row.user===entry.user&&row.kind===entry.kind))throw new Error('Högst 500 sparade saldon. Rensa äldre poster först.');undo=state.boosters.slice();state.boosters=[entry,...state.boosters.filter(row=>row.user!==entry.user||row.kind!==entry.kind)];save();dialog.close();paint()}catch(error){dialog.querySelector('[data-error]').textContent=error.message}});dialog.showModal();
  }
  function mount(){
    if(!root.document)return;const next=document.querySelector('[data-statistics-page]');if(!next||next===page)return;page=next;filter='all';search='';
    const general=[...page.children],tabs=node('nav','battle-analytics-tabs');tabs.setAttribute('aria-label','Statistikvyer');
    const generalButton=node('button','','Översikt'),battleButton=node('button','','Battles');generalButton.type=battleButton.type='button';generalButton.setAttribute('aria-pressed','true');battleButton.setAttribute('aria-pressed','false');tabs.append(generalButton,battleButton);page.prepend(tabs);
    panel=node('section','battle-analytics-page');panel.hidden=true;panel.setAttribute('aria-label','Battlestatistik');
    panel.innerHTML='<header class="card battle-analytics-head"><small>LIVE BATTLES</small><h2>Battle<em>statistik</em></h2><p>Följ poäng i realtid, håll reda på sparade boosters och se din registrerade matchhistorik.</p></header><p class="statistics-status" data-battle-connection role="status"></p><article class="card battle-analytics-current" data-battle-current aria-live="polite"></article><div class="battle-analytics-grid"><article class="card"><h3>Senaste belöning</h3><p class="battle-analytics-empty">Inget verifierat belöningsunderlag ännu.</p><small>Visas när en battle-belöning kan kopplas till en mottagare.</small></article><article class="card"><div class="battle-analytics-card-head"><h3>Sparade boosters</h3><div><button type="button" data-battle-add>Lägg till</button> <button type="button" data-battle-clear>Rensa</button> <button type="button" data-battle-undo hidden>Ångra</button></div></div><div class="battle-analytics-filters" data-battle-filters></div><label class="battle-analytics-search">Sök supporter<input type="search" data-battle-search placeholder="TikTok-användarnamn"></label><div data-battle-boosters></div><small>Manuella saldon · inte ett verifierat TikTok-inventarie.</small></article></div><details class="card battle-analytics-history"><summary>Battlehistorik <span data-battle-record></span></summary><p>Resultaten beräknas från senast mottagna poäng. Saknade poäng ger okänt resultat. Senaste 200 avslutade matcher.</p><ol data-battle-history></ol></details><p class="battle-analytics-storage" data-battle-storage></p>';
    page.append(panel);
    const choose=battle=>{general.forEach(child=>child.hidden=battle);panel.hidden=!battle;generalButton.setAttribute('aria-pressed',String(!battle));battleButton.setAttribute('aria-pressed',String(battle));if(!battle)root.VyraStatistics?.load();else paint()};generalButton.addEventListener('click',()=>choose(false));battleButton.addEventListener('click',()=>choose(true));
    const filters=panel.querySelector('[data-battle-filters]');[['all','Alla'],...Object.entries(names)].forEach(([value,label])=>{const button=node('button','',label);button.type='button';button.setAttribute('aria-pressed',String(value==='all'));button.addEventListener('click',()=>{filter=value;[...filters.children].forEach(n=>n.setAttribute('aria-pressed',String(n===button)));paint()});filters.append(button)});
    panel.querySelector('[data-battle-search]').addEventListener('input',event=>{search=event.target.value;paint()});
    panel.querySelector('[data-battle-add]').addEventListener('click',add);
    panel.querySelector('[data-battle-clear]').addEventListener('click',()=>{sync();undo=state.boosters.slice();state.boosters=[];save();paint()});
    panel.querySelector('[data-battle-undo]').addEventListener('click',()=>{sync();if(undo){state.boosters=undo;undo=null;save();paint()}});paint();
  }
  root.addEventListener('vyra-live-event',event=>{sync();if(scopeKey&&M.receive(state,event.detail)){save();paint()}});
  root.addEventListener('vyra-live-tillstand',()=>{sync();if(!context().live.gron){state.active=null;state.boost=null}paint()});
  root.addEventListener('vyra-auth-identity-cleared',()=>{signedOut=true;scopeKey='';state=M.empty();undo=null;root.VyraSupporter?.close();paint();});
  root.addEventListener('vyra-auth-ready',()=>{signedOut=false;sync();paint()});
  root.VyraBattleInventory={forUser(id){sync();const user=String(id||'').replace(/^@/,'').toLowerCase();return M.visibleBoosters(state,'all','').filter(row=>row.user===user).map(row=>({...row}))}};
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  root.setInterval(()=>{if(panel?.isConnected&&!panel.hidden)paint()},5000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(typeof window!=='undefined'?window:globalThis);
