(function(root){
  'use strict';
  let scheduled=false;
  function getState(){try{return state}catch(_){return root.VyraSessionState?.activeState?.()||{}}}
  function apply(){
    const balanced=getState().performanceMode==='balanced';
    document.body?.classList.toggle('vyra-performance-balanced',balanced);
    document.documentElement.classList.toggle('vyra-performance-balanced',balanced);
    document.querySelectorAll('.widget-hidden video,[style*="display:none"] video').forEach(video=>{if(!video.paused)video.pause()});
    return balanced;
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
  const observer=new MutationObserver(schedule);
  function mount(){apply();observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']})}
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  addEventListener('storage',event=>{if(event.key==='vyra-state')schedule()});
  root.VyraPerformanceRuntime={apply};
})(window);

