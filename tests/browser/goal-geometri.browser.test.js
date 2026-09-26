'use strict';
// Goal-designerna mats i en riktig webblasare. jsdom kan inte rakna layout.
//
// NIO DESIGNER SEDAN #525. goal-motion.js ersatte de sex goal-new-ramarna (pulse-rail,
// pulse-tower, signal-ribbon, heart-column, prism-core, prism-spine) med crown/heart/diamond x
// orbit/rail/tower. Provet mätte tidigare de gamla ramarnas DOM (.goal-new-art m.fl.) och föll
// 6/6 på main från den dagen, eftersom den DOM:en inte längre ritas.
//
// VARJE DESIGN SKAPAS SOM ANVÄNDAREN SKAPAR DEN: med katalogknappen ([data-gm-create]), som sätter
// bredd och läge ur goal-motion.js:s DESIGNS. Att bygga widgeten själv i provet hade provat ett mått
// ingen användare får. Rail var 560 bred och Tower 205 x 1094 i en 432 x 768 duk — utanför bild
// redan när de skapades, och fast i en led (widget-grans.js klampar till 0). Duk-provet nedan vaktar
// just det.
//
// DE SEX GAMLA MODELLERNA finns kvar i sparade layouter. goal-motion faller tillbaka till sin
// sorts orbit-design för dem — de ska ritas kompletta, aldrig som tom ruta eller gammal markup.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),http=require('http'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..'),{startaWebblasare,hoppaOver}=require('../helpers/webblasare.js');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const FAMILJ={followers:['crown','follower'],likes:['heart','like'],diamonds:['diamond','diamond']};
const FORM={orbit:['circle','circle'],rail:['landscape','horizontal'],tower:['portrait','vertical']};
const DESIGNS=Object.entries(FAMILJ).flatMap(([kind,[familj,fil]])=>Object.entries(FORM).map(([form,[orientation,bild]])=>({kind,id:`${familj}-${form}`,orientation,art:`${bild}-${fil}.png`})));
const GAMLA=[['followers','pulse-rail','landscape'],['followers','pulse-tower','portrait'],['likes','signal-ribbon','landscape'],['likes','heart-column','portrait'],['diamonds','prism-core','landscape'],['diamonds','prism-spine','portrait']];
function servera(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,''),fil=path.join(ROOT,rel);if(!fil.startsWith(ROOT)||!fs.existsSync(fil)||fs.statSync(fil).isDirectory()){res.writeHead(404);res.end('nej');return}res.writeHead(200,{'content-type':MIME[path.extname(fil)]||'application/octet-stream'});fs.createReadStream(fil).pipe(res)});return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)))}
let server,browser,bas,skip=hoppaOver();
test.before(async()=>{if(skip)return;browser=await startaWebblasare();if(!browser)throw new Error('webblasaren kunde inte starta');server=await servera();bas=`http://127.0.0.1:${server.address().port}`});
test.after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});

// Körs i sidan. Väntar in bilderna och mäter allt mot widgetens egen box och mot duken. En del som
// designen döljer (orbit visar ingen rubrik, goal-motion.css) räknas inte som utanför — den ritas inte.
// Procenten på Rail hängde 23 px under boxen (top:115%) tills boxen fick plats för den: duken och
// widget-grans.js räknar bara boxen, så en Rail längst ner fick procenten avklippt i sändningen.
const MAT=`async id=>{const rot=document.querySelector('.canvas [data-id="'+id+'"]');if(!rot)return{fel:'widgeten renderades inte'};
 const bilder=[...rot.querySelectorAll('img')];await Promise.all(bilder.map(i=>i.complete?0:new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})})));
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const box=e=>{const r=e.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}},rb=box(rot),duk=box(document.querySelector('.editor-shell .canvas')),
  inom=(b,y)=>b.l>=y.l-1&&b.r<=y.r+1&&b.t>=y.t-1&&b.b<=y.b+1,delar=['.goal-motion-art','.goal-motion-copy h3','.goal-motion-copy strong','[data-goal-pct]','[data-goal-fill]'];
 const art=rot.querySelector('.goal-motion-art'),sym=rot.querySelector('.goal-motion-symbol'),fill=rot.querySelector('[data-goal-fill]');
 return{klass:rot.className,box:rb,art:art&&art.getAttribute('src'),artLaddad:!!art&&art.naturalWidth>0,artBox:art&&box(art),
  symbol:sym&&sym.getAttribute('src'),symbolLaddad:!!sym&&sym.naturalWidth>0,
  saknas:delar.filter(q=>!rot.querySelector(q)),utanfor:delar.filter(q=>{const e=rot.querySelector(q);return e&&e.getClientRects().length>0&&!inom(box(e),rb)}),
  paDuken:inom(rb,duk),fill:fill&&box(fill),fillVar:getComputedStyle(rot).getPropertyValue('--goal-fill').trim(),
  pct:rot.querySelector('[data-goal-pct]')?.textContent,varde:rot.querySelector('[data-goal-value]')?.textContent,
  gammal:!!rot.querySelector('.goal-new-art,.goal-new-track,.goal-icon,.goal-track')}}`;

async function sida(){const page=await browser.newPage({viewport:{width:1600,height:950}});await page.goto(`${bas}/studio.html`,{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.render==='function'&&!!window.VyraSessionState,null,{timeout:30000,polling:100});
 await page.evaluate(async()=>{await window.VyraSessionState.projectLocalSession();state.widgets.length=0});return page}

// Katalogknappen ligger i widgetvyn; goal-motion.js lägger in sektionen i bind(). Knappen skapar
// widgeten, sedan byts till editorn där duken finns att mäta mot.
async function skapaFranKatalogen(page,id){return page.evaluate(async id=>{let knapp=null;
 for(let i=0;i<60&&!knapp;i++){view='overlay';render();bind();knapp=document.querySelector(`[data-gm-create="${id}"]`);if(!knapp)await new Promise(r=>setTimeout(r,250))}
 if(!knapp)return null;knapp.click();const w=state.widgets[state.widgets.length-1];w.goalCurrent=658;w.goalTarget=1000;
 view='editor';render();bind();return w.id},id)}

async function mat(page,id){return page.evaluate(`(${MAT})(${JSON.stringify(id)})`)}
async function medVarde(page,id,varde){await page.evaluate(({id,varde})=>{state.widgets.find(w=>w.id===id).goalCurrent=varde;render();bind()},{id,varde});return mat(page,id)}

for(const d of DESIGNS)test(`${d.id} skapas ur katalogen komplett som ${d.orientation}, och ryms på duken`,{skip},async()=>{
 const page=await sida();try{
  const id=await skapaFranKatalogen(page,d.id);assert.ok(id,`katalogknappen [data-gm-create="${d.id}"] finns inte`);
  const m=await mat(page,id);assert.ok(!m.fel,m.fel);
  assert.match(m.klass,new RegExp(`goal-motion-${d.orientation}\\b`));assert.match(m.klass,new RegExp(`goal-${d.id}\\b`));assert.match(m.klass,new RegExp(`goal-kind-${d.kind}\\b`));
  assert.equal(m.art,`assets/goal-motion/${d.art}`);assert.equal(m.artLaddad,true,'ramasseten laddades inte');
  if(d.orientation==='circle'){assert.ok(m.symbol,'mittsymbolen saknas');assert.equal(m.symbolLaddad,true,'mittsymbolen laddades inte')}else assert.equal(m.symbol,null,'bara orbit har mittsymbol');
  assert.deepEqual(m.saknas,[],'delar av målet saknas');assert.deepEqual(m.utanfor,[],'delar ritas utanför widgetens box');
  assert.equal(m.pct,'66%');assert.equal(m.varde,'658');assert.equal(m.gammal,false,'gammal goal-markup kom tillbaka');
  // Orienteringen är konstens form, inte bara klassnamnet.
  const {w,h}=m.artBox;if(d.orientation==='landscape')assert.ok(w>h*3,`liggande ram är ${w}x${h}`);else if(d.orientation==='portrait')assert.ok(h>w*3,`stående ram är ${w}x${h}`);else assert.ok(Math.abs(w-h)<w*.15,`cirkeln är ${w}x${h}`);
  assert.equal(m.paDuken,true,`målet skapas utanför bild: ${JSON.stringify(m.box)}`);
  // Progress fyller i rätt led: mer värde ger större fyllning, aldrig större än ramen.
  const lag=await medVarde(page,id,250),hog=await medVarde(page,id,750);
  assert.equal(lag.fillVar,'25%');assert.equal(hog.fillVar,'75%');
  if(d.orientation==='landscape')assert.ok(hog.fill.w>lag.fill.w,'liggande progress fylls inte på bredden');
  else if(d.orientation==='portrait')assert.ok(hog.fill.h>lag.fill.h,'stående progress fylls inte på höjden');
  assert.deepEqual(hog.utanfor,[],'fyllningen går utanför ramen');
 }finally{await page.close()}});

test('de sex gamla modellerna i sparade layouter ritas kompletta av goal-motion',{skip},async()=>{
 const page=await sida();try{for(const [kind,model,orientation] of GAMLA){
  const id=await page.evaluate(({kind,model,orientation})=>{const w=window.VyraWidgets.create(`catalog:socialgoal:${kind}:${model}:${orientation}`);w.x=0;w.y=0;w.goalCurrent=658;state.widgets.length=0;state.widgets.push(w);view='editor';render();bind();return w.id},{kind,model,orientation});
  const m=await mat(page,id),[,fil]=FAMILJ[kind];
  assert.ok(!m.fel,`${model}: ${m.fel}`);assert.match(m.klass,/\bgoal-motion\b/,`${model} ritas inte av goal-motion`);
  assert.match(m.klass,new RegExp(`goal-kind-${kind}\\b`),`${model} byter sort`);
  assert.equal(m.art,`assets/goal-motion/circle-${fil}.png`,`${model} faller inte tillbaka till sin sorts orbit`);assert.equal(m.artLaddad,true,`${model}: ramen laddades inte`);
  assert.deepEqual(m.saknas,[],`${model}: delar saknas`);assert.deepEqual(m.utanfor,[],`${model}: delar ritas utanför boxen`);
  assert.equal(m.pct,'66%');assert.equal(m.gammal,false,`${model}: gammal goal-markup kom tillbaka`);
 }}finally{await page.close()}});
