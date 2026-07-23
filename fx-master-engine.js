(function(){
  const REQUIRED=['x2-main','x3-main','tap-main','glove-main','platform','smoke','diamonds','hearts','lightning','particles'];
  const cache=new Map();
  function image(url){return new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Saknat lager: '+url.split('/').pop()));img.src=url})}
  async function loadTheme(theme){
    const base='assets/themes/'+theme;
    if(cache.has(base))return cache.get(base);
    const manifest=await fetch(base+'/manifest.json').then(r=>{if(!r.ok)throw new Error('Saknat manifest: '+theme);return r.json()});
    const missing=REQUIRED.filter(k=>!manifest.layers?.[k]);
    if(missing.length)throw new Error('Manifest saknar: '+missing.join(', '));
    if(manifest.placeholder===true)throw new Error('Riktiga PNG-lager saknas: '+REQUIRED.map(k=>manifest.layers[k]).join(', '));
    const pairs=await Promise.all(REQUIRED.map(async key=>[key,await image(base+'/'+manifest.layers[key])]));
    const result={manifest,layers:Object.fromEntries(pairs)};cache.set(base,result);return result;
  }
  function createStage(host){
    host.replaceChildren();host.classList.add('vyra-theme-stage');
    const order=['smoke','glow','lightning','platform','particles','diamonds','hearts','main'];
    const nodes=Object.fromEntries(order.map(name=>{const img=document.createElement('img');img.className='vyra-layer vyra-'+name;img.alt='';host.append(img);return [name,img]}));
    return nodes;
  }
  function restart(host){host.classList.remove('vyra-theme-playing');void host.offsetWidth;host.classList.add('vyra-theme-playing');clearTimeout(host._vyraTimer);host._vyraTimer=setTimeout(()=>{host.classList.remove('vyra-theme-playing');host.replaceChildren();host._vyraNodes=null},6000)}
  async function play(host,theme,effect='x2'){
    const data=await loadTheme(theme),nodes=host._vyraNodes||createStage(host);host._vyraNodes=nodes;
    nodes.main.src=data.layers[effect+'-main'].src;for(const key of ['platform','smoke','diamonds','hearts','lightning','particles'])nodes[key].src=data.layers[key].src;
    host.dataset.theme=theme;host.dataset.effect=effect;restart(host);return data;
  }
  window.VyraThemeSDK={requiredLayers:REQUIRED,loadTheme,createStage,play,restart,clearCache(){cache.clear()}};
})();
