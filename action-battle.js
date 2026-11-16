// BATTLE-TRIGGERS I ACTION & EVENT (2026-11-16).
//
// Ett Event kan starta en Action när något händer i en TikTok-battle: matchen börjar, ett
// boost-fönster öppnar, någon tar ledningen, matchen slutar — och med vilket resultat.
//
// BARA DET SOM ÄR UPPMÄTT. Bryggan skickar `battle` med `battleStatus` battle_started /
// battle_finished (uppmätt i elva matcher 2026-09-06, docs/live-verifiering.md punkt 2) och
// `glove` när ett boost-fönster öppnar (punkt 1). Poängen `scoreUs`/`scoreThem` är rätt BARA när
// bryggan vet vilket konto som är streamerns (normalizer.js battleFields, mittAnkarId) — annars
// skickas 0–0. Därför fyrar ledning och resultat ENDAST när någon sida har poäng; 0–0 vid slutet
// är "vet inte", inte "oavgjort". Hellre tyst än fel: en vinst-animation efter en förlust är
// värre än ingen alls.
//
// EN GÅNG PER HÄNDELSE. TikTok skickar battle_started om och om igen under en pågående match.
// Starten fyrar på den första per battleId, och inte alls om overlayn laddas mitt i en match
// (samma regel som battle-fx-auto.js). Ett event-id som redan setts (samma händelse via flera
// kanaler) fyrar inte igen.
//
// KEDJAN. routeLiveBattleEvent lindas av ett tiotal sessioner; den här filen lägger sig som en
// länk till, och ett fel här får aldrig stoppa de andra. handleEvent är själv mastergrindad, så
// det spelar ingen roll i hur många flikar det här körs — bara mastern spelar.
(function(root){
  'use strict';
  const MATCH_SEK=300,SLUT_SEK=30;
  const SLUT=/(end|finish|over|settle|result|complete|close)/;
  const START=/(start|active|begin|ongoing|progress)/;
  const HANDELSER=[
    ['start','Matchen börjar'],
    ['boost','Ett boost-fönster öppnar'],
    ['leder','Vi tar ledningen'],
    ['efter','Motståndaren tar ledningen'],
    ['slut','Matchen slutar'],
    ['vinst','Vi vinner'],
    ['forlust','Vi förlorar'],
    ['oavgjort','Oavgjort']
  ];
  let match=null;            // {id, ledare:'vi'|'de'|'lika'|null, scoreUs, scoreThem}
  const avslutade=new Map(); // battleId -> ms
  const sedda=new Map();     // event-id -> ms

  const nu=()=>Date.now();
  const rensa=(karta,ms)=>{const t=nu();for(const[k,v]of karta)if(t-v>ms)karta.delete(k)};
  const tal=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  function ledare(us,them){if(us==null||them==null||(us===0&&them===0))return null;return us>them?'vi':them>us?'de':'lika'}

  // Ren funktion över ett event: vilka battle-händelser det ger. Uppdaterar matchläget.
  function tolka(e){
    if(!e||typeof e!=='object')return[];
    const typ=String(e.type||e.event||'').toLowerCase();
    const id=e.id!=null?String(e.id):'';
    if(id){rensa(sedda,60000);if(sedda.has(id))return[];sedda.set(id,nu())}
    const ut=[];
    if(typ==='glove'||typ.includes('boost')){
      ut.push({handelse:'boost',multiplier:tal(e.multiplier)||0});
      return ut;
    }
    if(typ!=='battle')return ut;
    const status=String(e.battleStatus||'').toLowerCase(),bid=String(e.battleId||'');
    const us=tal(e.scoreUs),them=tal(e.scoreThem);
    if(SLUT.test(status)){
      if(bid&&avslutade.has(bid))return ut;
      const m=match&&(!bid||!match.id||match.id===bid)?match:null;
      const slutUs=us??m?.scoreUs??null,slutThem=them??m?.scoreThem??null;
      if(bid)avslutade.set(bid,nu());
      if(m?.id)avslutade.set(m.id,nu());
      match=null;
      ut.push({handelse:'slut',scoreUs:slutUs,scoreThem:slutThem});
      const l=ledare(slutUs,slutThem);
      if(l)ut.push({handelse:l==='vi'?'vinst':l==='de'?'forlust':'oavgjort',scoreUs:slutUs,scoreThem:slutThem});
      return ut;
    }
    if(!START.test(status))return ut;
    rensa(avslutade,3600000);
    if(bid&&avslutade.has(bid))return ut;
    if(!match||(bid&&match.id&&match.id!==bid)){
      match={id:bid,ledare:null,scoreUs:null,scoreThem:null};
      const kvar=tal(e.remainingSec)||0;
      // Laddades sidan mitt i en match är starten redan förbi.
      if(!(kvar>0&&kvar<MATCH_SEK-SLUT_SEK))ut.push({handelse:'start'});
    }else if(!match.id&&bid)match.id=bid;
    if(us!=null)match.scoreUs=us;
    if(them!=null)match.scoreThem=them;
    const l=ledare(match.scoreUs,match.scoreThem);
    if(l&&l!==match.ledare){
      if(l==='vi'||l==='de')ut.push({handelse:l==='vi'?'leder':'efter',scoreUs:match.scoreUs,scoreThem:match.scoreThem});
      match.ledare=l;
    }
    return ut;
  }

  function skicka(h,e){
    const ae=root.VyraActionEvent;
    if(!ae||typeof ae.handleEvent!=='function')return;
    ae.handleEvent('battle',{username:'TikTok',name:'TikTok',value:h.handelse,battle:h.handelse,
      battleId:String(e.battleId||''),scoreUs:h.scoreUs??null,scoreThem:h.scoreThem??null,multiplier:h.multiplier||0});
  }
  function hantera(e){const ut=tolka(e);ut.forEach(h=>skicka(h,e||{}));return ut.map(h=>h.handelse)}

  function koppla(){
    const tidigare=root.routeLiveBattleEvent;
    if(typeof tidigare!=='function'||tidigare.__actionBattle)return false;
    const lank=function(event){
      let svar;
      try{svar=tidigare.apply(this,arguments)}finally{
        try{hantera(event||{})}catch(err){console.error('[VYRA action-battle]',err)}
      }
      return svar;
    };
    lank.__actionBattle=true;
    root.routeLiveBattleEvent=lank;
    return true;
  }

  root.VyraActionBattle={HANDELSER,tolka,hantera,koppla,lage:()=>match?{...match}:null,
    nollstall(){match=null;avslutade.clear();sedda.clear()}};
  if(typeof document!=='undefined')koppla();
})(typeof window!=='undefined'?window:globalThis);
