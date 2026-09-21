(function(root){
  'use strict';
  const agencies=[
    {id:'north',name:'Test Agency North',region:'Norden',status:'open',languages:'Svenska · Engelska',focus:'LIVE coaching',image:'assets/images/hero-creator.png',contactName:'Nora Testkontakt',contactRole:'Creator Manager',email:'north@example.test',snap:'testagency_north',otherLabel:'Instagram',otherUrl:'https://instagram.com/testagency_north'},
    {id:'europe',name:'Test Agency Europe',region:'Europa',status:'open',languages:'Engelska · Tyska',focus:'Creator growth',image:'assets/images/test/test-profile.png',contactName:'Leo Testkontakt',contactRole:'Agency Partner',email:'europe@example.test',snap:'testagency_europe',otherLabel:'Webbplats',otherUrl:'https://example.test/europe'},
    {id:'global',name:'Test Agency Global',region:'Globalt',status:'waitlist',languages:'Engelska',focus:'Events & campaigns',image:'assets/images/hero-creator.png',contactName:'Maya Testkontakt',contactRole:'Talent Lead',email:'global@example.test',snap:'testagency_global',otherLabel:'Instagram',otherUrl:'https://instagram.com/testagency_global'}
  ];
  let selected='north',query='',region='all';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visible=()=>agencies.filter(a=>(region==='all'||a.region===region)&&(!query||`${a.name} ${a.focus} ${a.languages}`.toLowerCase().includes(query.toLowerCase())));
  function card(a){return `<button type="button" class="agency-test-card${selected===a.id?' active':''}" data-agency-id="${a.id}"><img src="${esc(a.image)}" alt="Testbild för ${esc(a.name)}"><span><small>${esc(a.region)} · ${a.status==='open'?'KONTAKT ÖPPEN':'VÄNTELISTA'}</small><strong>${esc(a.name)}</strong><em>${esc(a.focus)}</em></span></button>`}
  function detail(){const a=agencies.find(item=>item.id===selected)||visible()[0];if(!a)return '<div class="agency-test-empty">Ingen test-agency matchar filtret.</div>';return `<article class="agency-test-detail"><div class="agency-test-cover"><img src="${esc(a.image)}" alt="Testbild för ${esc(a.name)}"><span>TESTBILD</span></div><div class="agency-test-detail-head"><span class="agency-test-logo large">${a.name.split(' ').at(-1).slice(0,1)}</span><div><small>TESTPROFIL · ${esc(a.region)}</small><h3>${esc(a.name)}</h3><p>${esc(a.focus)} · ${esc(a.languages)}</p></div><i class="${a.status}">${a.status==='open'?'Kontakt öppen':'Testväntelista'}</i></div><div class="agency-test-info"><span><small>INRIKTNING</small><b>${esc(a.focus)}</b></span><span><small>SPRÅK</small><b>${esc(a.languages)}</b></span><span><small>REGION</small><b>${esc(a.region)}</b></span></div><div class="agency-test-contact"><img src="assets/images/test-profile.svg" alt="Testkontakt"><span><small>KONTAKTPERSON · TEST</small><strong>${esc(a.contactName)}</strong><em>${esc(a.contactRole)}</em></span></div><div class="agency-test-contact-links"><a href="mailto:${esc(a.email)}">E-post · ${esc(a.email)}</a><a href="https://www.snapchat.com/add/${esc(a.snap)}" target="_blank" rel="noopener">Snapchat · ${esc(a.snap)}</a><a href="${esc(a.otherUrl)}" target="_blank" rel="noopener">${esc(a.otherLabel)}</a></div></article>`}
  function renderAgency(){
    const view=document.querySelector('#view');if(!view)return;
    const rows=visible();if(rows.length&&!rows.some(a=>a.id===selected))selected=rows[0].id;
    view.innerHTML=`<section class="agency-test"><div class="agency-test-banner"><span>TESTLÄGE</span><div><h2>Agencies</h2><p>Förhandsvisning med testdata. Bilder, agencyinformation och kontaktvägar ersätts med riktiga uppgifter senare.</p></div></div><div class="agency-test-toolbar"><input id="agencyTestSearch" value="${esc(query)}" placeholder="Sök test-agency"><select id="agencyTestRegion"><option value="all">Alla regioner</option>${['Norden','Europa','Globalt'].map(x=>`<option ${region===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="agency-test-layout"><div class="agency-test-list">${rows.map(card).join('')||'<div class="agency-test-empty">Ingen test-agency matchar filtret.</div>'}</div><div id="agencyTestDetail">${detail()}</div></div></section>`;
    bindAgency();
  }
  function bindAgency(){
    const search=document.querySelector('#agencyTestSearch'),picker=document.querySelector('#agencyTestRegion');
    if(search)search.oninput=e=>{query=e.target.value;renderAgency();document.querySelector('#agencyTestSearch')?.focus()};
    if(picker)picker.onchange=e=>{region=e.target.value;renderAgency()};
    document.querySelectorAll('[data-agency-id]').forEach(button=>button.onclick=()=>{selected=button.dataset.agencyId;renderAgency()});
  }
  function openAgency(){document.querySelectorAll('aside button').forEach(b=>b.classList.toggle('active',b.dataset.extra==='agencies'));const title=document.querySelector('#title'),crumb=document.querySelector('#crumb');/* Samma ord som navetiketten ('Agencies TEST'), och brodsmulan slutar med den i versaler - det ar kontraktet nav-state.browser.test.js vaktar for varje sida. */if(title)title.textContent='Agencies TEST';if(crumb)crumb.textContent='VYRA / AGENCIES TEST';renderAgency()}
  function mount(){document.querySelector('[data-extra="agencies"]')?.addEventListener('click',openAgency)}
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  root.VyraAgencyTest={agencies,visible,open:openAgency};
})(window);

