(function(){
  const PERF_KEY='vyra-performance-mode',PRESET_KEY='vyra-widget-presets-v1';
  let mode=localStorage.getItem(PERF_KEY)||'standard';
  function applyPerformance(){document.documentElement.dataset.performance=mode;localStorage.setItem(PERF_KEY,mode)}
  applyPerformance();

  const queue=[],wrapped=new Set();let busy=false;
  function next(){if(busy||!queue.length)return;busy=true;let job=queue.shift();try{job.run()}catch(e){console.error('[VYRA queue]',e)}setTimeout(()=>{busy=false;next()},Math.max(800,job.duration||5000))}
  window.VyraAlertQueue={push(run,duration=5000,priority=0){queue.push({run,duration,priority});queue.sort((a,b)=>b.priority-a.priority);next()},clear(){queue.length=0},size(){return queue.length+(busy?1:0)}};
  const configs={triggerBattleMvp:[8000,10],triggerGifterLevelUp:[6000,8],triggerFanLevelUp:[6000,7],triggerNewFollower:[5000,3],triggerGiftFireworks:[6000,6]};
  function installQueueWrappers(){Object.entries(configs).forEach(([name,[duration,priority]])=>{let fn=window[name];if(typeof fn!=='function'||wrapped.has(fn))return;let queued=function(event){let d=duration;if(name==='triggerBattleMvp')d=(state.widgets.find(w=>w.type==='templateBattleMvp')?.mvpDuration||8)*1000;if(name==='triggerGifterLevelUp')d=(state.widgets.find(w=>w.type==='templateGifterLevel')?.gifterDuration||6)*1000;if(name==='triggerFanLevelUp')d=(state.widgets.find(w=>w.type==='templateFanLevel')?.fanDuration||6)*1000;VyraAlertQueue.push(()=>fn(event),d,priority)};wrapped.add(queued);window[name]=queued})}
  setTimeout(installQueueWrappers,500);setTimeout(installQueueWrappers,2200);addEventListener('load',installQueueWrappers);

  document.addEventListener('error',e=>{let img=e.target;if(!(img instanceof HTMLImageElement)||img.dataset.fallbackApplied)return;img.dataset.fallbackApplied='1';img.src=img.closest('.vyra-gift-face,.streak-gift-face,.campaign-gift-image')?'assets/gifts/part1/gifts/0001_Rose.png':'assets/images/test/test-profile.png'},true);

  function presets(){try{return JSON.parse(localStorage.getItem(PRESET_KEY)||'{}')}catch{return{}}}
  function savePresets(x){localStorage.setItem(PRESET_KEY,JSON.stringify(x))}
  const oldBind=bind;
  bind=function(){oldBind();if(view!=='editor')return;let w=state.widgets.find(x=>x.id===selected),panel=document.querySelector('.properties');if(!w||!panel||panel.querySelector('.runtime-controls'))return;let box=document.createElement('div');box.className='property-group runtime-controls';box.innerHTML=`<h4>PRESET & PRESTANDA</h4><label>Presetnamn<input id="runtimePresetName" value="${w.title||w.type||'Min preset'}"></label><div class="property-actions"><button id="runtimeSavePreset">Spara preset</button><button id="runtimeLoadPreset">Ladda senaste</button></div><label>Prestanda<select id="runtimePerformance"><option value="low">Låg</option><option value="standard">Standard</option><option value="ultra">Ultra</option></select></label><button id="runtimeResetWidget">Återställ widget</button>`;let del=panel.querySelector('#del');panel.insertBefore(box,del||null);box.querySelector('#runtimePerformance').value=mode;box.querySelector('#runtimePerformance').onchange=e=>{mode=e.target.value;applyPerformance();toast('Prestanda: '+mode)};box.querySelector('#runtimeSavePreset').onclick=()=>{let all=presets(),key=w.type,copy=JSON.parse(JSON.stringify(w));delete copy.id;delete copy.x;delete copy.y;all[key]={name:box.querySelector('#runtimePresetName').value,data:copy};savePresets(all);toast('Preset sparad')};box.querySelector('#runtimeLoadPreset').onclick=()=>{let p=presets()[w.type];if(!p)return toast('Ingen sparad preset');let keep={id:w.id,x:w.x,y:w.y};Object.keys(w).forEach(k=>delete w[k]);Object.assign(w,p.data,keep);save();render();toast(p.name+' laddad')};box.querySelector('#runtimeResetWidget').onclick=()=>{['widgetScale','opacity','hidden','layer'].forEach(k=>delete w[k]);w.widgetScale=1;save();render();toast('Widget återställd')}
  };
})();
