(function(){'use strict';
  // Granskning 2026-10-17 F39: sidan visade bara "Alla system fungerar", utan delar och med en
  // tidsstämpel utan tidszon. Nu:
  //   - Sammanfattningen kommer som förut från GET /api/public/status (incidenterna).
  //   - Delarna kommer från GET /api/health, som redan är publik och mäter databasen (inloggning
  //     och molnsynk står och faller med den) och händelsebussen (realtid till overlayen). Svaret
  //     är 503 med samma JSON-form när något är nere, så kroppen läses även då.
  //   - TikTok-anslutningen och betalningen har ingen automatisk kontroll i API:t. Sidan säger det
  //     rakt ut i stället för att visa en grön prick som ingen mätning står bakom.
  //   - Tider skrivs med tidszon, och en kontroll som inte lyckats på över fem minuter märks
  //     som inaktuell i stället för att den gamla gröna texten står kvar.
  const esc=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const INAKTUELL_MS=5*60*1000;
  const tid=v=>new Date(v).toLocaleString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
  let senastLyckad=0;
  const DELAR=[
    {namn:'Inloggning och molnsynk',las:h=>h&&h.services?h.services.postgres:null},
    {namn:'Realtid till overlay och studio',las:h=>h&&h.services?h.services.redis:null},
  ];
  function ritaDelar(health){
    const host=document.querySelector('#components');if(!host)return;
    host.innerHTML=DELAR.map(d=>{const v=d.las(health),klass=v===true?'ok':v===false?'fel':'okand',text=v===true?'Fungerar':v===false?'Störning':'Kunde inte kontrolleras';
      return `<li class="component ${klass}"><span>${esc(d.namn)}</span><b>${text}</b></li>`}).join('')
      +'<li class="component okand"><span>TikTok-anslutning och betalning</span><b>Ingen automatisk kontroll</b></li>';
    const not=document.querySelector('#componentsNote');
    if(not)not.textContent='TikTok-anslutningen och betalningen kontrolleras inte automatiskt här. Störningar där publiceras som incidenter nedan.';
  }
  async function hamtaHealth(){try{const r=await fetch('/api/health',{cache:'no-store'});return await r.json()}catch{return null}}
  async function refresh(){const card=document.querySelector('.status-card'),title=document.querySelector('#statusTitle'),checked=document.querySelector('#checkedAt'),list=document.querySelector('.incidents');
    const healthLofte=hamtaHealth();
    try{const response=await fetch('/api/public/status',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error();
      senastLyckad=Date.now();
      const kontrollerad=new Date(data.checkedAt).getTime(),gammal=!(kontrollerad>0)||Date.now()-kontrollerad>INAKTUELL_MS;
      card.className='status-card '+data.overall+(gammal?' inaktuell':'');
      title.textContent={operational:'Alla system fungerar',degraded:'Nedsatt funktion',major_outage:'Större driftstörning'}[data.overall];
      checked.textContent='Senast kontrollerad '+tid(data.checkedAt)+(gammal?' · statusen är inte färsk':'');
      list.innerHTML=data.incidents.length?data.incidents.map(item=>`<article class="incident"><header><b>${esc(item.title)}</b><span>${esc(item.status)}</span></header><p>${esc(item.message)}</p><time>${esc(tid(item.started_at))}</time></article>`).join(''):'<p>Inga incidenter rapporterade de senaste 7 dagarna.</p>'}
    catch{card.className='status-card degraded inaktuell';title.textContent='Status kunde inte hämtas';
      checked.textContent=senastLyckad?'Senaste lyckade kontroll '+tid(senastLyckad)+' · statusen är inte färsk. Försök igen om en stund.':'Försök igen om en stund.';
      list.innerHTML='<p>Statusservern svarar inte just nu.</p>'}
    ritaDelar(await healthLofte)}
  refresh();setInterval(refresh,60000)})();
