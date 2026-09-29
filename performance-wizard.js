(function(root){
  'use strict';
  const heavyTypes=/video|media|fireworks|supernova|giftjar|battle|wheel/i;
  const animatedTypes=/alert|ticker|goal|top|rank|streak|gift|fountain|guardian/i;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function getWidgets(){
    try{return Array.isArray(state?.widgets)?state.widgets.filter(w=>w&&!w.hidden):[]}catch(_){return []}
  }
  function overlaySnapshot(){
    const widgets=getWidgets();
    return {
      widgets:widgets.length,
      heavy:widgets.filter(w=>heavyTypes.test(String(w.type||''))||w.videoUrl||w.giftVideo).length,
      animated:widgets.filter(w=>animatedTypes.test(String(w.type||''))).length
    };
  }
  function systemSnapshot(){
    const memory=performance.memory;
    return {
      cores:Number(navigator.hardwareConcurrency)||null,
      deviceMemory:Number(navigator.deviceMemory)||null,
      memoryUsed:memory?Math.round(memory.usedJSHeapSize/1048576):null,
      memoryLimit:memory?Math.round(memory.jsHeapSizeLimit/1048576):null,
      reducedMotion:!!matchMedia?.('(prefers-reduced-motion: reduce)').matches
    };
  }
  function sampleFrames(duration=1800){
    return new Promise(resolve=>{
      const deltas=[];let first=null,last=null;
      function frame(now){
        if(first===null){first=now;last=now}
        else{deltas.push(now-last);last=now}
        if(now-first<duration)return requestAnimationFrame(frame);
        const usable=deltas.filter(n=>n>0&&n<250);
        const average=usable.length?usable.reduce((a,b)=>a+b,0)/usable.length:0;
        resolve({fps:average?Math.round(1000/average):0,jank:usable.filter(n=>n>34).length,frames:usable.length});
      }
      requestAnimationFrame(frame);
    });
  }
  function evaluate(input){
    let score=100;const recommendations=[];
    const fps=Number(input.fps)||0,jankRate=input.frames?input.jank/input.frames:0;
    if(fps&&fps<45){score-=35;recommendations.push('Bildflödet är tungt. Minska videor och stora rörelseeffekter i samma layout.')}
    else if(fps&&fps<55){score-=18;recommendations.push('Bildflödet kan bli jämnare. Prova färre samtidiga animationer.')}
    if(jankRate>.18){score-=22;recommendations.push('Många bildrutor hackade under testet. Stäng andra tunga flikar och testa igen.')}
    else if(jankRate>.08){score-=10;recommendations.push('Några bildrutor hackade. Kontrollera resultatet igen medan overlayen spelar sina effekter.')}
    if(input.widgets>30){score-=18;recommendations.push('Layouten har många synliga delar. Dela gärna upp dem i flera scener.')}
    else if(input.widgets>18){score-=8;recommendations.push('Layouten börjar bli stor. Dölj delar som inte används i den aktuella scenen.')}
    if(input.heavy>3){score-=18;recommendations.push('Flera tunga video- eller partikeleffekter är aktiva samtidigt. Kör helst högst tre.')}
    else if(input.heavy>1){score-=7;recommendations.push('Testa overlayen i OBS när flera tunga effekter körs samtidigt.')}
    if(input.memoryUsed&&input.memoryLimit&&input.memoryUsed/input.memoryLimit>.75){score-=18;recommendations.push('Webbläsarens minne ligger högt. Ladda om Studio före nästa LIVE.')}
    if(input.cores&&input.cores<=4&&input.animated>6){score-=8;recommendations.push('Datorn har få processorkärnor för många rörelser. Använd färre samtidiga animationer.')}
    score=clamp(score,0,100);
    if(!recommendations.length)recommendations.push('Inga tydliga problem hittades. Gör ett sista test i OBS med riktiga alerts före LIVE.');
    return {score,level:score>=80?'good':score>=55?'warn':'heavy',label:score>=80?'Redo':score>=55?'Kan förbättras':'Tungt',recommendations};
  }
  function metric(label,value,note,status='neutral'){
    return `<article class="pw-metric ${status}"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
  }
  function shell(){return `<section class="performance-wizard"><div class="pw-hero"><span class="pw-spark">✦</span><div><small>VYRA DIAGNOSTIK</small><h2>Performance Wizard</h2><p>Kontrollerar hur jämnt Studio ritar bilden och hur tung din öppna overlay är. Ingen information lämnar din dator.</p></div><button class="primary" id="pwStart">Starta kontroll</button></div><div class="pw-steps"><span class="active"><b>1</b>Dator</span><i></i><span><b>2</b>Overlay</span><i></i><span><b>3</b>Resultat</span></div><div id="pwBody" class="pw-empty"><div class="pw-gauge"><span>✓</span></div><h3>Redo att kontrollera</h3><p>Låt Studio vara synligt medan kontrollen körs. Det tar ungefär två sekunder.</p></div></section>`}
  function renderRunning(){
    const body=document.querySelector('#pwBody');if(!body)return;
    document.querySelectorAll('.pw-steps span').forEach(x=>x.classList.add('active'));
    body.className='pw-running';body.innerHTML='<div class="pw-loader"><i></i><i></i><i></i></div><h3>Mäter bildflödet…</h3><p>Rör inte fliken medan testet pågår.</p>';
  }
  function renderResult(data){
    const body=document.querySelector('#pwBody');if(!body)return;
    const result=evaluate(data),memory=data.memoryUsed===null?'Ej tillgängligt':`${data.memoryUsed} MB`;
    body.className=`pw-result ${result.level}`;
    const optimized=getPerformanceMode()==='balanced';
    body.innerHTML=`<div class="pw-score"><div style="--score:${result.score}"><strong>${result.score}</strong><small>AV 100</small></div><span><small>STATUS</small><b>${result.label}</b><em>Testet visar Studio-flikens prestanda just nu.</em></span></div><div class="pw-metrics">${metric('BILDFREKVENS',data.fps?`${data.fps} FPS`:'Ej mätt',data.fps>=55?'Jämnt bildflöde':'Behöver kontrolleras',data.fps>=55?'good':'warn')}${metric('HACKADE RUTOR',`${data.jank} av ${data.frames}`,data.jank?'Under mätningen':'Inga upptäckta',data.jank?'warn':'good')}${metric('SYNLIGA DELAR',data.widgets,'I aktuell overlay',data.widgets>18?'warn':'good')}${metric('TUNGA EFFEKTER',data.heavy,'Video och partiklar',data.heavy>3?'warn':'good')}${metric('MINNE',memory,data.memoryLimit?`Gräns ${data.memoryLimit} MB`:'Webbläsaren döljer gränsen')}${metric('DATOR',data.cores?`${data.cores} kärnor`:'Ej tillgängligt',data.deviceMemory?`${data.deviceMemory} GB enhetsminne`:'Begränsad webbläsarinformation')}</div><div class="pw-optimize ${optimized?'is-on':''}"><span><small>${optimized?'BALANSERAT LÄGE ÄR AKTIVT':'AUTOMATISK HJÄLP'}</small><strong>${optimized?'Din LIVE är optimerad':'Optimera min LIVE'}</strong><p>${optimized?'Viktiga alerts är kvar. Extra partiklar, dolda videor och tunga dekorationer begränsas.':'Aktiverar lättare effekter utan att ändra design, text, placering eller vilka widgets som visas.'}</p></span><button id="pwOptimize" class="${optimized?'undo':'primary'}">${optimized?'Återställ original':'Optimera min LIVE'}</button></div><div class="pw-advice"><small>REKOMMENDATIONER</small>${result.recommendations.map((text,i)=>`<p><b>${i+1}</b>${esc(text)}</p>`).join('')}</div><div class="pw-foot"><span>Resultatet kan ändras när OBS, TikTok och andra program är öppna.</span><button id="pwAgain">Kontrollera igen</button></div>`;
    document.querySelector('#pwAgain')?.addEventListener('click',run);
    document.querySelector('#pwOptimize')?.addEventListener('click',toggleOptimization);
  }
  function getPerformanceMode(){try{return state?.performanceMode||'full'}catch(_){return 'full'}}
  async function toggleOptimization(){
    let current;try{current=state}catch(_){return}
    const enable=current.performanceMode!=='balanced';
    current.performanceMode=enable?'balanced':'full';
    root.VyraPerformanceRuntime?.apply?.();
    const outcome=await root.VyraSessionState?.writeActive?.('vyra-state',JSON.stringify(current));
    if(outcome&&outcome.ok===false){current.performanceMode=enable?'full':'balanced';root.VyraPerformanceRuntime?.apply?.();return}
    const button=document.querySelector('#pwOptimize');if(button)button.textContent=enable?'Optimerad ✓':'Återställd ✓';
    setTimeout(run,450);
  }
  async function run(){
    const button=document.querySelector('#pwStart');if(button)button.disabled=true;
    renderRunning();
    const [frames]=await Promise.all([sampleFrames()]);
    if(!document.querySelector('.performance-wizard'))return;
    renderResult({...systemSnapshot(),...overlaySnapshot(),...frames});
    if(button)button.disabled=false;
  }
  function open(){
    document.querySelectorAll('aside button').forEach(b=>b.classList.toggle('active',b.dataset.extra==='performanceWizard'));
    const title=document.querySelector('#title'),crumb=document.querySelector('#crumb'),view=document.querySelector('#view');
    if(title)title.textContent='Performance Wizard';if(crumb)crumb.textContent='VYRA / PRESTANDA';if(view)view.innerHTML=shell();
    document.querySelector('#pwStart')?.addEventListener('click',run);
  }
  function mount(){document.querySelector('[data-extra="performanceWizard"]')?.addEventListener('click',open)}
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  root.VyraPerformanceWizard={evaluate,overlaySnapshot,systemSnapshot,getPerformanceMode,toggleOptimization,open};
})(window);

