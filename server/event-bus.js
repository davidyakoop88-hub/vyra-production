'use strict';
const {createClient}=require('redis');
const {CircuitBreaker}=require('./observability');

const ALLOWED=new Set(['gift','like','follow','share','subscribe','chat','battle','viewer']);
const TYPE_ALIASES={likes:'like',member:'viewer',chatcommand:'chat'};
const MAX_EVENT_BYTES=64*1024;

function cleanEvent(input){
const event={
    id:String(input?.id||'').slice(0,160),
    type:TYPE_ALIASES[String(input?.type||'').toLowerCase()]||String(input?.type||'').toLowerCase(),
    userId:String(input?.userId||'').slice(0,160),
    username:String(input?.username||'').slice(0,120),
    profileUrl:String(input?.profileUrl||input?.profileImage||'').slice(0,1200),
    giftId:String(input?.giftId||'').slice(0,160),
    giftName:String(input?.giftName||'').slice(0,160),
    giftImage:String(input?.giftImage||'').slice(0,1200),
    count:Math.max(0,Math.min(1e9,Number(input?.count)||0)),
    value:Math.max(0,Math.min(1e12,Number(input?.value??input?.coins??input?.points)||0)),
    scoreUs:Math.max(0,Math.min(1e12,Number(input?.scoreUs)||0)),
    scoreThem:Math.max(0,Math.min(1e12,Number(input?.scoreThem)||0)),
    multiplier:Math.max(0,Math.min(100,Number(input?.multiplier)||0)),
    battleStatus:String(input?.battleStatus||'').slice(0,64),
    at:Number(input?.at)||Date.now()
  };
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
  async replay(workspaceId,lastId='0-0',count=250){
    if(!/^\d+-\d+$/.test(lastId))lastId='0-0';
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
module.exports={EventBus,cleanEvent,ALLOWED};
