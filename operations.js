(function(root){'use strict';const esc=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));async function load(){const queue=document.querySelector('#ticketQueue');try{const out=await root.VyraAuth.api('/api/admin/support/tickets');queue.innerHTML=out.tickets.length?out.tickets.map(ticket=>`<article class="ticket" data-id="${ticket.id}"><header><b>${esc(ticket.subject)}</b><small>${esc(ticket.email||'Raderat konto')}</small></header><p>${esc(ticket.message)}</p><div class="ticket-controls"><select class="status"><option ${ticket.status==='open'?'selected':''}>open</option><option ${ticket.status==='in_progress'?'selected':''}>in_progress</option><option ${ticket.status==='waiting'?'selected':''}>waiting</option><option ${ticket.status==='resolved'?'selected':''}>resolved</option><option ${ticket.status==='closed'?'selected':''}>closed</option></select><select class="priority"><option ${ticket.priority==='low'?'selected':''}>low</option><option ${ticket.priority==='normal'?'selected':''}>normal</option><option ${ticket.priority==='high'?'selected':''}>high</option><option ${ticket.priority==='urgent'?'selected':''}>urgent</option></select><button class="save">Spara</button></div><form class="reply"><input placeholder="Svar till användaren" maxlength="5000" required><button>Svara</button></form></article>`).join(''):'<p>Supportkön är tom.</p>';queue.querySelectorAll('.ticket').forEach(card=>{card.querySelector('.save').onclick=async()=>{await root.VyraAuth.api('/api/admin/support/tickets/'+card.dataset.id,{method:'PUT',body:JSON.stringify({status:card.querySelector('.status').value,priority:card.querySelector('.priority').value})})};card.querySelector('.reply').onsubmit=async event=>{event.preventDefault();const input=event.currentTarget.querySelector('input');await root.VyraAuth.api(`/api/admin/support/tickets/${card.dataset.id}/replies`,{method:'POST',body:JSON.stringify({message:input.value})});input.value='';card.querySelector('.status').value='waiting'}})}catch(error){queue.innerHTML=`<p>${esc(error.message)}</p>`}}document.querySelector('#incidentForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,error=document.querySelector('#opsError');try{await root.VyraAuth.api('/api/admin/incidents',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();error.textContent='Incidenten är publicerad på statussidan.'}catch(err){error.textContent=err.message}};
// VERIFIERADE TIKTOK-KOPPLINGAR. Panelen finns för ETT beslut: får VYRA_TIKTOK_VERIFIERING_KRAVS
// sättas? Sandbox-nycklarna släpper in exakt ett konto, så listan svarar ja först när ett ANDRA
// handtag står i den. Därför räknas de unika handtagen ut här och skrivs ut i klartext — ett
// antal ensamt döljer just den skillnad som betyder något.
async function laddaVerifieringar(){const box=document.querySelector('#verifieringar');if(!box)return;
  try{const out=await root.VyraAuth.api('/api/admin/tiktok-verifieringar');
    const rader=out.verifieringar||[];
    if(!rader.length){box.innerHTML='<p>Ingen koppling är verifierad ännu. Fritextvägen ska stå kvar öppen.</p>';return}
    // SNITTET MÅSTE NORMALISERA. @JokerO060 och jokero060 är samma konto, och räknas de som två
    // säger panelen "produktionsnycklarna bär" när bara sandbox-kontot verifierat sig — alltså
    // precis det falska klartecken den finns för att förhindra. Både snedstrecket och versalerna
    // bort innan de jämförs.
    const nyckel=rad=>String(rad.tiktok_username||'').replace(/^@/,'').toLowerCase();
    const unika=new Set(rader.map(nyckel)).size;
    const dom=unika>1
      ? '<p>Fler än ett konto har verifierats — produktionsnycklarna bär. Nu kan fritextvägen stängas.</p>'
      : '<p>Bara ett konto har verifierats. Det kan lika gärna vara sandbox-nyckeln som fortfarande sitter — vänta med att stänga fritextvägen.</p>';
    box.innerHTML=dom+rader.map(rad=>{const nar=rad.verifierad_at?new Date(rad.verifierad_at):null;
      return `<div class="verifieringsrad"><span><b>@${esc(String(rad.tiktok_username||'').replace(/^@/,''))}</b>${rad.visningsnamn?` <small>${esc(rad.visningsnamn)}</small>`:''}</span><small>${nar&&Number.isFinite(nar.getTime())?esc(nar.toLocaleString('sv-SE')):'—'}</small><small class="${rad.active?'':'av'}">${rad.active?'aktiv':'vilande'}</small></div>`}).join('')
      +`<p><small>${rader.length} visade av ${out.antal} verifierade · ${unika} unika handtag</small></p>`}
  catch(error){box.innerHTML=`<p>${esc(error.message)}</p>`}}
root.addEventListener('vyra-auth-ready',load);root.addEventListener('vyra-auth-ready',laddaVerifieringar)
// FILEN ANROPADES UTAN ARGUMENT. `root` var undefined, sa sista raden kastade TypeError och
// supportkon laddades aldrig — den stod kvar pa "Laddar…" for alltid. Incidentformularet
// overlevde, eftersom det kopplas raden innan kraschen, vilket ar precis darfor felet kunde ligga
// kvar: halva sidan fungerade. scripts/test/tiktok-verifieringspanel.test.js vaktar att fonstret
// skickas in.
})(window);
