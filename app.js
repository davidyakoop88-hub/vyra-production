const toast=document.querySelector('.toast');
let toastTimer;
function notify(t){
  toast.textContent=t;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
}

document.querySelector('.demo').onclick=()=>{
  document.querySelector('.product').scrollIntoView({behavior:'smooth'});
  setTimeout(()=>document.querySelector('.test').click(),500);
};

function popGiftAlert(){
  const el=document.querySelector('.gift-alert');
  if(!el)return;
  el.animate([
    {opacity:0,transform:'scale(.75) translateY(15px)',filter:'blur(8px)'},
    {opacity:1,transform:'scale(1)',filter:'blur(0)'}
  ],{duration:550,easing:'cubic-bezier(.2,.8,.2,1)'});
}
document.querySelector('.test').onclick=()=>{popGiftAlert();notify('Testevent skickat till canvas')};

document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>notify(`${b.querySelector('b').textContent} har lagts till på canvas`));
document.querySelector('.publish').onclick=()=>notify('Overlay publicerad — OBS-länken är redo');
document.querySelector('.subtle').onclick=()=>notify('Förhandsvisning öppnad');
document.querySelectorAll('.colors i').forEach(c=>c.onclick=()=>{
  document.querySelectorAll('.colors i').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');
  notify('Accentfärgen uppdaterades');
});
document.querySelector('.menu')?.addEventListener('click',()=>{
  const menuBtn=document.querySelector('.menu');
  const mobileNav=document.querySelector('.mobile-nav');
  if(!mobileNav)return;
  const open=mobileNav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded',open?'true':'false');
  menuBtn.textContent=open?'✕':'☰';
});
document.querySelectorAll('.mobile-nav a').forEach(a=>a.addEventListener('click',()=>{
  document.querySelector('.mobile-nav')?.classList.remove('open');
  const menuBtn=document.querySelector('.menu');
  if(menuBtn){menuBtn.setAttribute('aria-expanded','false');menuBtn.textContent='☰'}
}));

/* ---- Ambient hero demo: the product mockup stays visibly "live" on page load,
   instead of sitting static until someone clicks the demo/test buttons. ---- */
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const giftFeed=[
    {user:'@alex',gift:'Galaxy',mult:'×5'},
    {user:'@mia',gift:'Universe',mult:'×2'},
    {user:'@noah',gift:'Rose',mult:'×12'},
    {user:'@jonte',gift:'Lion',mult:'×3'}
  ];
  let giftIndex=0;
  function cycleGift(){
    const el=document.querySelector('.gift-alert');
    if(!el)return;
    const data=giftFeed[giftIndex%giftFeed.length];
    giftIndex++;
    el.querySelector('b').textContent=data.user;
    el.querySelector('span').textContent=`skickade ${data.gift}`;
    el.querySelector('strong').textContent=data.mult;
    popGiftAlert();
  }

  const chatFeed=[
    {user:'@sara',text:'Vilken grym stream! 🔥'},
    {user:'@leo',text:'Nu kör vi!'},
    {user:'@noah',text:'Den där galaxy-gåvan 👀'},
    {user:'@mia',text:'Följer nu!'},
    {user:'@jonte',text:'Bästa liven idag'}
  ];
  let chatIndex=0;
  function cycleChat(){
    const chat=document.querySelector('.chat');
    if(!chat)return;
    const msg=chatFeed[chatIndex%chatFeed.length];
    chatIndex++;
    const p=document.createElement('p');
    p.innerHTML=`<b>${msg.user}</b> ${msg.text}`;
    chat.append(p);
    p.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:400,easing:'ease-out',fill:'forwards'});
    while(chat.children.length>3)chat.firstElementChild.remove();
  }

  function bumpLikeGoal(){
    const bEl=document.querySelector('.like-goal>b');
    const iEl=document.querySelector('.like-goal>div>i');
    if(!bEl||!iEl)return;
    const current=parseInt(bEl.textContent.replace(/[^\d]/g,''),10)||84730;
    const next=Math.min(99850,current+400+Math.floor(Math.random()*900));
    bEl.innerHTML=`${next.toLocaleString('sv')} <i>/ 100K</i>`;
    iEl.style.width=Math.min(97,(next/100000)*100)+'%';
  }

  setTimeout(()=>{cycleGift();setInterval(cycleGift,4200)},900);
  setTimeout(()=>{cycleChat();setInterval(cycleChat,3300)},1500);
  setInterval(bumpLikeGoal,2600);
}
