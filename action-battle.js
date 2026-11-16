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
  // DÄMPNINGEN (2026-11-16, David: "en sak är inte värd att förstöra hela layouten för").
  // I en jämn match kan ledningen byta sida många gånger i minuten. Utan dämpning hade varje byte
  // blivit en alert, och kön hade fyllts med "Vi tar ledningen!" medan gåvorna fick vänta.
  //  - HALL_MS: en ny ledare räknas först när den hållit ledningen så länge. Ett snabbt fram och
  //    tillbaka fyrar ingenting.
  //  - MELLAN_MS: samma ledningshändelse fyrar högst en gång per period och match.
  //  - TAK_PER_MIN: högst så många battle-händelser per minut når Action & Event, vad som än
  //    kommer från TikTok. Det som går över taket släpps tyst (en varning i konsolen).
  // Ingen annan konkurrent har ledningstriggers alls (BetterTok: bara start/vinst/förlust) — just
  // för att de är svåra att göra lugna. Talen är inställbara för proven via `stall`.
  const GRANSER={HALL_MS:3000,MELLAN_MS:15000,TAK_PER_MIN:20};
  let match=null;            // {id, ledare, kandidat, timer, senast:{leder,efter}, scoreUs, scoreThem}
  const avslutade=new Map(); // battleId -> ms
  const sedda=new Map();     // event-id -> ms
  let skickade=[];           // tidpunkter för taket per minut

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
      if(m?.timer)clearTimeout(m.timer);
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
      if(match?.timer)clearTimeout(match.timer);
      match={id:bid,ledare:null,kandidat:null,timer:null,senast:{},scoreUs:null,scoreThem:null};
      const kvar=tal(e.remainingSec)||0;
      // Laddades sidan mitt i en match är starten redan förbi.
      if(!(kvar>0&&kvar<MATCH_SEK-SLUT_SEK))ut.push({handelse:'start'});
    }else if(!match.id&&bid)match.id=bid;
    if(us!=null)match.scoreUs=us;
    if(them!=null)match.scoreThem=them;
    folj(match);
    return ut;
  }

  // Ledningen följs här och fyrar senare, via bekrafta() — aldrig direkt ur tolka(). En ny ledare
  // blir kandidat; håller den HALL_MS fyrar den (om samma händelse inte fyrat inom MELLAN_MS).
  // Tippar ledningen tillbaka innan dess glöms kandidaten.
  function folj(m){
    const l=ledare(m.scoreUs,m.scoreThem);
    if(!l||l===m.ledare){if(m.kandidat&&l!==m.kandidat){m.kandidat=null;clearTimeout(m.timer);m.timer=null}return}
    if(l===m.kandidat)return;
    clearTimeout(m.timer);m.timer=null;m.kandidat=null;
    if(l==='lika'){m.ledare='lika';return}
    m.kandidat=l;
    m.timer=setTimeout(()=>bekrafta(m,l),GRANSER.HALL_MS);
  }
  function bekrafta(m,l){
    m.timer=null;
    if(match!==m||m.kandidat!==l||ledare(m.scoreUs,m.scoreThem)!==l)return;
    m.kandidat=null;m.ledare=l;
    const h=l==='vi'?'leder':'efter';
    if(nu()-(m.senast[h]||0)<GRANSER.MELLAN_MS)return;
    m.senast[h]=nu();
    skicka({handelse:h,scoreUs:m.scoreUs,scoreThem:m.scoreThem},{battleId:m.id});
  }

  // Utskicket går UTANFÖR widgetkedjan (setTimeout 0): routeLiveBattleEvent körs för varje
  // battle-händelse, och battle-widgetarna (MVP, Glove, Fan Level …) ska inte vänta på att Action &
  // Event läser sitt tillstånd. Ett fel i handleEvent når därmed aldrig kedjan heller.
  function skicka(h,e){
    const t=nu();
    skickade=skickade.filter(x=>t-x<60000);
    if(skickade.length>=GRANSER.TAK_PER_MIN){console.warn('[VYRA action-battle] taket nått, släpper',h.handelse);return false}
    skickade.push(t);
    const payload={username:'TikTok',name:'TikTok',value:h.handelse,battle:h.handelse,
      battleId:String(e.battleId||''),scoreUs:h.scoreUs??null,scoreThem:h.scoreThem??null,multiplier:h.multiplier||0};
    setTimeout(()=>{
      try{const ae=root.VyraActionEvent;if(ae&&typeof ae.handleEvent==='function')ae.handleEvent('battle',payload)}
      catch(err){console.error('[VYRA action-battle]',err)}
    },0);
    return true;
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

  root.VyraActionBattle={HANDELSER,GRANSER,tolka,hantera,koppla,
    lage:()=>match?{id:match.id,ledare:match.ledare,kandidat:match.kandidat,scoreUs:match.scoreUs,scoreThem:match.scoreThem}:null,
    stall(o){Object.assign(GRANSER,o||{})},
    nollstall(){if(match?.timer)clearTimeout(match.timer);match=null;avslutade.clear();sedda.clear();skickade=[]}};
  if(typeof document!=='undefined')koppla();
})(typeof window!=='undefined'?window:globalThis);
