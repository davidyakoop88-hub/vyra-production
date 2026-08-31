'use strict';
const {createClient}=require('redis');
const {CircuitBreaker}=require('./observability');

// 'glove' tillkom 2026-08-14: multiplikatorfonstret i en battle (LINK_MIC_BATTLE_TASK ->
// rewardConfig.rewardMultiple). Fyra listor maste namna en typ for att den ska na en widget —
// bryggans TILL_MOLNET, index.js TIKTOK_INGEST_TYPES, TIKTOK_ROOM_TYPES och den har. Missas en
// enda tystnar typen nagonstans pa vagen; tests/event-contract.test.js vaktar att de moter varandra.
const ALLOWED=new Set(['gift','like','follow','share','subscribe','chat','battle','viewer','glove']);
const TYPE_ALIASES={likes:'like',member:'viewer',chatcommand:'chat'};
const MAX_EVENT_BYTES=64*1024;

function cleanEvent(input){
const event={
    id:String(input?.id||'').slice(0,160),
    type:TYPE_ALIASES[String(input?.type||'').toLowerCase()]||String(input?.type||'').toLowerCase(),
    userId:String(input?.userId||'').slice(0,160),
    username:String(input?.username||'').slice(0,120),
    // The chat message itself. Without this field the bridge's comment never reached a browser:
    // it arrives on `name`, which cleanEvent does not carry, so every chat consumer got ''.
    comment:String(input?.comment||input?.name||'').slice(0,500),
    profileUrl:String(input?.profileUrl||input?.profileImage||'').slice(0,1200),
    giftId:String(input?.giftId||'').slice(0,160),
    giftName:String(input?.giftName||'').slice(0,160),
    giftImage:String(input?.giftImage||'').slice(0,1200),
    count:Math.max(0,Math.min(1e9,Number(input?.count)||0)),
    value:Math.max(0,Math.min(1e12,Number(input?.value??input?.coins??input?.points)||0)),
    // `value` ovan ar ENHETSLOST med flit — samma falt bar gavans varde, poang och score. Enheten
    // maste darfor baras separat, annars gar den forlorad pa molnvagen och mottagaren kan bara
    // gissa. For gavor ar enheten DIAMANTER (kallfaltet heter diamondCount i bada bryggorna).
    // Utan den har raden strok vitlistan faltet daremellan — precis som den en gang strok
    // chattexten och fanClubLevel. 0 = ingen diamantuppgift i eventet. #133
    diamonds:Math.max(0,Math.min(1e12,Number(input?.diamonds??input?.coins)||0)),
    scoreUs:Math.max(0,Math.min(1e12,Number(input?.scoreUs)||0)),
    scoreThem:Math.max(0,Math.min(1e12,Number(input?.scoreThem)||0)),
    multiplier:Math.max(0,Math.min(100,Number(input?.multiplier)||0)),
    battleStatus:String(input?.battleStatus||'').slice(0,64),
    at:Number(input?.at)||Date.now(),
    // Avsandarens fan-klubbsniva. Utan den var Fan Level Up dod pa molnvagen: bryggan raknar
    // fram den och klienten laser den, men cleanEvent strok faltet daremellan. Bada namnen tas
    // emot (bryggan: fanClubLevel, klienten: teamLevel). Klamps 0-50; 0 = ingen niva rapporterad.
    fanClubLevel:Math.max(0,Math.min(50,Math.round(Number(input?.fanClubLevel??input?.teamLevel)||0))),
    // Gifter-badgens niva, fran user.payGrade.level i bryggan. Ett ANNAT tal an fanClubLevel ovan:
    // fan club-nivan galler mot en enskild streamer, gifter-nivan ar tittarens globala grad. Samma
    // klampning 0-50, dar 0 betyder "ingen niva rapporterad".
    gifterLevel:Math.max(0,Math.min(50,Math.round(Number(input?.gifterLevel)||0)))
  };
  // Nivahojningen, konstaterad av viewer-levels.js FORE publish. Utan de har tva raderna droppar
  // vitlistan stampeln igen i publish(), som kor cleanEvent en gang till - och widgeten far tillbaka
  // exakt det glapp den satt i: ett falt som fardas hela vagen fram till kontraktet och stryks dar.
  // Bara en akta hojning bars vidare; allt annat utelamnas hellre an skickas som noll.
  const hojning=v=>{
    const fran=Math.round(Number(v?.from)),till=Math.round(Number(v?.to));
    return Number.isInteger(fran)&&Number.isInteger(till)&&fran>=1&&till<=50&&till>fran?{from:fran,to:till}:null;
  };
  const fanUpp=hojning(input?.fanLevelUp),gifterUpp=hojning(input?.gifterLevelUp);
  if(fanUpp)event.fanLevelUp=fanUpp;
  if(gifterUpp)event.gifterLevelUp=gifterUpp;
  if(!event.id||!ALLOWED.has(event.type))throw Object.assign(new Error('Ogiltigt live-event'),{status:400});
  if(Buffer.byteLength(JSON.stringify(event))>MAX_EVENT_BYTES)throw Object.assign(new Error('Event för stort'),{status:413});
  return event;
}

class EventBus{
  constructor(url){this.url=url;this.client=null;this.connecting=null;this.subscribers=0;this.breaker=new CircuitBreaker({threshold:3,cooldownMs:15000})}
  async connect(){
    if(this.client?.isReady)return this.client;
    if(this.connecting)return this.connecting;
    const client=createClient({url:this.url,socket:{connectTimeout:3000,reconnectStrategy:r=>r>2?false:Math.min(100+r*100,1000)}});
    client.on('error',error=>console.error(JSON.stringify({level:'error',event:'redis_error',message:error.message,at:new Date().toISOString()})));
    this.connecting=this.breaker.run(()=>client.connect()).then(()=>{this.client=client;return client}).finally(()=>{this.connecting=null});
    return this.connecting;
  }
  stream(workspaceId){return `vyra:events:${workspaceId}`}
  channel(workspaceId){return `vyra:live:${workspaceId}`}
  async publish(workspaceId,input){
    const event=cleanEvent(input),c=await this.connect(),dedupe=`vyra:dedupe:${workspaceId}:${event.id}`;
    if(!(await c.set(dedupe,'1',{NX:true,EX:86400})))return{duplicate:true,event};
    let streamId;try{streamId=await c.xAdd(this.stream(workspaceId),'*',{event:JSON.stringify(event)},{TRIM:{strategy:'MAXLEN',strategyModifier:'~',threshold:Number(process.env.EVENT_RETENTION||10000)}})}catch(error){await c.del(dedupe).catch(()=>{});throw error}
    await c.publish(this.channel(workspaceId),JSON.stringify({streamId,event}));
    return{duplicate:false,streamId,event};
  }
  // Betrodd publicering av en SERVERAGD handelse. Samma strom, samma kanal och samma ramform som
  // publish() ovan, sa sseChunk kan bara den genom sin befintliga live-gren och `id:` blir samma
  // ordnade streamId som allt annat.
  //
  // INGEN dedupe-nyckel, till skillnad fran publish(). En ompublicering efter en krasch mellan
  // leverans och kvittens SKA na bussen igen — systemet ar at-least-once, och dedupen hor hemma
  // hos mottagaren pa det stabila eventId:t. En Redis-dedupe har hade tyst atit upp den andra
  // ramen och gjort kontraktet till nagot annat an det ar.
  async publishInternal(workspaceId,input){
    if(!workspaceId)throw Object.assign(new Error('workspaceId saknas'),{status:500});
    const event=cleanInternalEvent(input),c=await this.connect();
    const streamId=await c.xAdd(this.stream(workspaceId),'*',{event:JSON.stringify(event)},
      {TRIM:{strategy:'MAXLEN',strategyModifier:'~',threshold:Number(process.env.EVENT_RETENTION||10000)}});
    await c.publish(this.channel(workspaceId),JSON.stringify({streamId,event}));
    return{streamId,event};
  }
  // No lastId (a client's very first connection has nothing to resume from) or a malformed one
  // (garbage/corrupted Last-Event-ID) both mean "nothing to replay" — return [] without even
  // touching Redis, rather than silently guessing '0-0' (which would dump the whole stream
  // history on every fresh connection). '0-0' is still honored as a legitimate explicit request
  // to replay everything from the start of the stream.
  async replay(workspaceId,lastId,count=250){
    if(!lastId||!/^\d+-\d+$/.test(lastId))return[];
    const c=await this.connect(),rows=await c.xRange(this.stream(workspaceId),lastId==='0-0'?'-':`(${lastId}`,'+',{COUNT:count});
    return rows.map(row=>({streamId:row.id,event:JSON.parse(row.message.event)}));
  }
  async subscribe(workspaceId,onEvent){
    const base=await this.connect(),sub=base.duplicate();await sub.connect();
    this.subscribers++;
    await sub.subscribe(this.channel(workspaceId),raw=>{try{onEvent(JSON.parse(raw))}catch{}});
    let closed=false;
    return async()=>{if(closed)return;closed=true;this.subscribers=Math.max(0,this.subscribers-1);await sub.unsubscribe().catch(()=>{});await sub.quit().catch(()=>{})};
  }
  diagnostics(){return{ready:!!this.client?.isReady,subscribers:this.subscribers,breaker:this.breaker.state()}}
  async ping(){return(await this.connect()).ping()}
  async close(){if(this.client?.isOpen)await this.client.quit();this.client=null}
}

// ---- BETRODD INTERN VAG -------------------------------------------------------------------------
// `sessionId` ar SERVERAGT. cleanEvent ovan bygger en explicit vitlista och kopierar aldrig faltet,
// sa ett externt event med pahittat sessionId tappar det redan dar — och ALLOWED innehaller inte
// 'livesession', sa ingestvagen kan inte publicera en sandningshandelse alls.
//
// Den har vagen ar den ENDA som far bara sessionId, och den anvands aldrig pa ingestvagen.
//
// FAIL-CLOSED MED NAMNGIVET FEL, inte null. Ett korrumperat eller handredigerat outboxpayload ska
// stoppa publiceringen hogljutt — en halvgiltig ram som tyst tappas ar samma sak som en sandning
// som aldrig byter session, och det gar inte att felsoka i efterhand.
const INTERNA_TYPER=new Set(['livesession']);
const INTERNA_HANDELSER=new Set(['live:start','live:end']);
// Varje intern handelse har SITT tidsfalt: live:start bar startedAt, live:end bar endedAt.
// Ett gemensamt 'at' hade gjort det omojligt att se om en ram beskriver en borjan eller ett
// slut utan att lasa event-faltet, och en mottagare som missar det byter fel session.
const INTERNA_TIDSFALT={'live:start':'startedAt','live:end':'endedAt'};
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function internfel(kod,meddelande){
  return Object.assign(new Error(meddelande),{status:400,kod});
}

function cleanInternalEvent(input){
  const type=String(input?.type||'').toLowerCase();
  if(!INTERNA_TYPER.has(type))
    throw internfel('otillaten-intern-typ','Otillaten intern eventtyp: '+(type||'(saknas)'));
  const handelse=String(input?.event||'');
  if(!INTERNA_HANDELSER.has(handelse))
    throw internfel('ogiltig-intern-handelse','Ogiltig intern handelse: '+(handelse||'(saknas)'));
  const sessionId=String(input?.sessionId||'');
  if(!UUID_RE.test(sessionId))
    throw internfel('ogiltigt-sessionid','Internt sessionId ar inte ett giltigt uuid');
  const eventId=String(input?.eventId||'');
  if(eventId!==handelse+':'+sessionId)
    throw internfel('eventid-matchar-inte','eventId maste vara '+handelse+':<sessionId>');
  const falt=INTERNA_TIDSFALT[handelse];
  const tid=String(input?.[falt]||'');
  if(!tid||Number.isNaN(Date.parse(tid)))
    throw internfel('ogiltigt-'+falt.toLowerCase(),falt+' ar inte en giltig tidpunkt');
  // Explicit vitlista. workspaceId skickas ALDRIG: strommen vyra:live:<workspaceId> ar redan
  // avgransad, och routingen kommer fran databaskolumnen — inte fran nagot i payloaden.
  // reason ingar inte: den skiljer 'sandningen slutade' fran 'sandningen ersattes', men ingen
  // mottagare behover den an. Faltet finns kvar i outboxraden som serverns egen anteckning.
  const ut={type,event:handelse,eventId,sessionId};
  ut[falt]=tid;
  return ut;
}

module.exports={EventBus,cleanEvent,cleanInternalEvent,ALLOWED,INTERNA_TYPER};
