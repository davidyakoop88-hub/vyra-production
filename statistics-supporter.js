(function(root){
  'use strict';
  const num=value=>(Number(value)||0).toLocaleString('sv-SE');
  const date=value=>{if(!value)return 'Okänt';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('sv-SE'):'Okänt'};
  const el=(tag,className,copy)=>{const node=document.createElement(tag);if(className)node.className=className;if(copy!==undefined)node.textContent=String(copy);return node};
  let active=null,request=0;
  function close(){request++;const dialog=active;active=null;if(dialog){dialog.close?.();dialog.remove()}}
  async function open(giver,trigger){
    close();const ticket=++request,workspace=root.VyraCloudSync?.current?.()?.workspace?.id;
    if(!workspace||!giver?.id)return;
    const dialog=el('dialog','statistics-profile');active=dialog;dialog.setAttribute('aria-labelledby','statistics-profile-title');
    const top=el('header','statistics-profile-top'),brand=el('span','statistics-profile-brand','VYRA / SUPPORTER'),exit=el('button','statistics-profile-close','×');exit.type='button';exit.setAttribute('aria-label','Stäng supporterkort');exit.addEventListener('click',close);top.append(brand,exit);
    const title=el('h2','',giver.namn||giver.id);title.id='statistics-profile-title';
    const status=el('p','statistics-profile-status','Hämtar supporterns historik…');status.setAttribute('role','status');
    dialog.append(top,title,status);document.body.append(dialog);dialog.addEventListener('close',()=>{if(active===dialog){request++;dialog.remove();active=null}if(trigger?.isConnected)trigger.focus()});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}});
    dialog.showModal();
    const path=`/api/workspaces/${encodeURIComponent(workspace)}/stats/supporters/${encodeURIComponent(giver.id)}`;
    try{
      const result=await root.VyraAuth.api(path);
      if(ticket!==request)return;
      if(root.VyraCloudSync?.current?.()?.workspace?.id!==workspace)return close();
      const data=result.supporter;if(!data)throw new Error('Supportern saknas');
      status.textContent=`@${data.id} · Senast registrerad aktivitet: ${date(data.senastSedd)}`;
      const metrics=el('div','statistics-profile-metrics');
      const knownDays=Array.isArray(data.dagar)?data.dagar:[];
      const dailyTotal=knownDays.reduce((sum,row)=>sum+(Number(row.diamonds)||0),0);
      [['TOTALA DIAMANTER',`${num(data.diamonds)} 💎`],['TOTALA GÅVOR',num(data.gifts)],['DIAMANTER / GÅVA',data.gifts?(data.diamonds/data.gifts).toLocaleString('sv-SE',{maximumFractionDigits:1}):'–'],['SNITT / REGISTRERAD DAG',knownDays.length?num(Math.round(dailyTotal/knownDays.length)):'–']].forEach(([label,value])=>{const card=el('div','statistics-profile-metric');card.append(el('small','',label),el('strong','',value));metrics.append(card)});dialog.append(metrics);
      const gifts=el('div','statistics-profile-gifts');
      [['BÄSTA GÅVA',data.bastaGava],['SENAST REGISTRERADE GÅVA',data.senasteGava]].forEach(([label,gift])=>{const card=el('div','statistics-profile-metric');card.append(el('small','',label),el('b','',gift?.namn||'Underlag saknas'),el('span','',gift?`${num(gift.diamanter)} 💎${gift.at?' · '+date(gift.at):''}`:'Visas när en gåva har registrerats.'));gifts.append(card)});dialog.append(gifts);
      const history=el('section','statistics-profile-section');history.append(el('h3','','Diamanter per registrerad livedag'));
      if(knownDays.length){
        const chart=el('div','statistics-profile-chart'),max=Math.max(1,...knownDays.map(row=>Number(row.diamonds)||0));
        chart.setAttribute('role','img');chart.setAttribute('aria-label',`Senaste ${knownDays.length} registrerade dagar. Exakta värden finns i tabellen.`);
        knownDays.forEach(row=>{const bar=el('span','');bar.style.height=`${Math.max(1,Number(row.diamonds)/max*100)}%`;bar.title=`${row.dag}: ${num(row.diamonds)} diamanter`;chart.append(bar)});history.append(chart);
        const details=el('details','statistics-table'),table=el('table',''),head=el('thead',''),body=el('tbody',''),heading=el('tr','');details.append(el('summary','','Visa som tabell'));
        ['Datum (UTC)','Diamanter','Gåvor'].forEach(label=>{const th=el('th','',label);th.scope='col';heading.append(th)});head.append(heading);
        knownDays.forEach(row=>{const tr=el('tr','');[row.dag,num(row.diamonds),num(row.gifts)].forEach((copy,i)=>{const cell=el(i?'td':'th','',copy);if(!i)cell.scope='row';tr.append(cell)});body.append(tr)});table.append(head,body);details.append(table);history.append(details);
      }else history.append(el('p','','Ingen dagshistorik ännu. Den börjar samlas efter uppdateringen.'));
      history.append(el('small','',`Upp till 90 registrerade dagar. Äldre livstidssummor ingår inte automatiskt i dagshistoriken.`));dialog.append(history);
      const boosters=el('section','statistics-profile-section');boosters.append(el('h3','','Boosters'),el('p','','Handskstatus okänd · inget verifierat inventarieunderlag.'));
      const tiles=el('div','statistics-profile-boosters');['Handske','Fog','Chrono','Hammer','×2','×3'].forEach(label=>{const tile=el('div','statistics-profile-booster');tile.append(el('strong','','?'),el('span','',label));tiles.append(tile)});boosters.append(tiles,el('small','','Saknade uppgifter visas som okända, aldrig som noll. Inga tilldelningar eller användningar är verifierade för detta inventarie.'));dialog.append(boosters);
      const notes=el('form','statistics-profile-section'),noteLabel=el('label','','Anteckningar'),note=el('textarea',''),birthdayLabel=el('label','','Födelsedag (MM-DD, valfritt)'),birthday=el('input','');
      note.maxLength=2000;note.value=data.note||'';note.rows=3;noteLabel.append(note);birthday.type='text';birthday.placeholder='MM-DD';birthday.pattern='[0-9]{2}-[0-9]{2}';birthday.maxLength=5;birthday.value=data.birthday||'';birthdayLabel.append(birthday);
      const save=el('button','','Spara anteckningar'),saveStatus=el('p','statistics-profile-save-status','');save.type='submit';saveStatus.setAttribute('role','status');notes.append(el('h3','','Din information om supportern'),noteLabel,birthdayLabel,save,saveStatus);
      notes.addEventListener('submit',async event=>{event.preventDefault();if(root.VyraCloudSync?.current?.()?.workspace?.id!==workspace)return close();save.disabled=true;saveStatus.textContent='Sparar…';try{await root.VyraAuth.api(path,{method:'PUT',body:JSON.stringify({note:note.value,birthday:birthday.value,konto:data.konto})});if(ticket===request)saveStatus.textContent='Sparat i din arbetsyta.'}catch(error){if(ticket===request)saveStatus.textContent=error.status===403?'Du har läsbehörighet. En ägare, administratör eller redigerare kan spara.':`Kunde inte spara: ${error.message}`}finally{save.disabled=false}});dialog.append(notes);
    }catch(error){if(ticket===request)status.textContent=`Kunde inte hämta supporterkortet. ${error.message}`}
  }
  root.addEventListener('vyra-auth-identity-cleared',close);
  root.VyraSupporter={open,close};
})(typeof window!=='undefined'?window:globalThis);
