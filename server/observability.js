'use strict';
const {monitorEventLoopDelay}=require('perf_hooks');
function esc(v){return String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')}
class Metrics{
  constructor(){this.requests=new Map();this.errors=new Map();this.latency=new Map();this.liveEvents=new Map();this.gauges=new Map();this.sse=0;this.started=Date.now()}
  key(method,route,status){return`${method}|${route}|${status}`}
  observe(method,route,status,seconds){const key=this.key(method,route,status);this.requests.set(key,(this.requests.get(key)||0)+1);const bucket=`${method}|${route}`;const row=this.latency.get(bucket)||{count:0,sum:0};row.count++;row.sum+=seconds;this.latency.set(bucket,row);if(status>=500)this.errors.set(route,(this.errors.get(route)||0)+1)}
  event(type){this.liveEvents.set(type,(this.liveEvents.get(type)||0)+1)}
  gauge(name,value){if(!/^[a-z][a-z0-9_]*$/.test(name))throw new Error('Ogiltigt mätvärdesnamn');const n=Number(value);if(Number.isFinite(n))this.gauges.set(name,n)}
  snapshot(){return{uptimeSeconds:Math.floor((Date.now()-this.started)/1000),sseConnections:this.sse,httpRequests:[...this.requests.values()].reduce((a,b)=>a+b,0),liveEvents:[...this.liveEvents.values()].reduce((a,b)=>a+b,0),gauges:Object.fromEntries(this.gauges)}}
  render(){const lines=['# HELP vyra_http_requests_total HTTP requests','# TYPE vyra_http_requests_total counter'];for(const[key,value]of this.requests){const[method,route,status]=key.split('|');lines.push(`vyra_http_requests_total{method="${esc(method)}",route="${esc(route)}",status="${status}"} ${value}`)}lines.push('# TYPE vyra_http_request_duration_seconds summary');for(const[key,row]of this.latency){const[method,route]=key.split('|'),labels=`method="${esc(method)}",route="${esc(route)}"`;lines.push(`vyra_http_request_duration_seconds_count{${labels}} ${row.count}`,`vyra_http_request_duration_seconds_sum{${labels}} ${row.sum.toFixed(6)}`)}lines.push('# TYPE vyra_live_events_total counter');for(const[type,value]of this.liveEvents)lines.push(`vyra_live_events_total{type="${esc(type)}"} ${value}`);for(const[name,value]of this.gauges)lines.push(`# TYPE vyra_${name} gauge`,`vyra_${name} ${value}`);lines.push('# TYPE vyra_sse_connections gauge',`vyra_sse_connections ${this.sse}`,'# TYPE vyra_process_uptime_seconds gauge',`vyra_process_uptime_seconds ${Math.floor((Date.now()-this.started)/1000)}`,'# TYPE vyra_process_resident_memory_bytes gauge',`vyra_process_resident_memory_bytes ${process.memoryUsage().rss}`);return lines.join('\n')+'\n'}
}
class CircuitBreaker{
  constructor({threshold=5,cooldownMs=30000}={}){this.threshold=threshold;this.cooldownMs=cooldownMs;this.failures=0;this.openedAt=0}
  async run(fn){if(this.openedAt&&Date.now()-this.openedAt<this.cooldownMs)throw Object.assign(new Error('Tjänsten återhämtar sig'),{code:'CIRCUIT_OPEN'});if(this.openedAt)this.reset();try{const out=await fn();this.reset();return out}catch(error){this.failures++;if(this.failures>=this.threshold)this.openedAt=Date.now();throw error}}
  reset(){this.failures=0;this.openedAt=0}
  state(){return this.openedAt?'open':this.failures?'degraded':'closed'}
}
function routeName(path){return path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig,':id').replace(/(\/api\/overlay-access\/)[^/]+/,'$1:token')}
function startRuntimeMonitor({alert}={}){const delay=monitorEventLoopDelay({resolution:20});delay.enable();let lastAlert=0;const timer=setInterval(()=>{const memoryMb=process.memoryUsage().rss/1048576,loopMs=delay.mean/1e6,reasons=[];if(memoryMb>Number(process.env.MEMORY_WARN_MB||400))reasons.push(`memory ${memoryMb.toFixed(0)} MB`);if(loopMs>Number(process.env.EVENT_LOOP_WARN_MS||250))reasons.push(`event loop ${loopMs.toFixed(0)} ms`);if(reasons.length&&Date.now()-lastAlert>60000){lastAlert=Date.now();alert?.('runtime_pressure',{reasons,memoryMb,loopMs})}delay.reset()},10000);timer.unref();return()=>{clearInterval(timer);delay.disable()}}
async function webhookAlert(event,details){const url=process.env.ALERT_WEBHOOK_URL;if(!url)return;try{await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'vyra-api',event,details,at:new Date().toISOString()}),signal:AbortSignal.timeout(5000)})}catch(error){console.error(JSON.stringify({level:'error',event:'alert_delivery_failed',message:error.message,at:new Date().toISOString()}))}}
async function capacitySnapshot({pool,eventBus,metrics}){
  const [usage,notifications,support]=await Promise.all([
    pool.query("SELECT (SELECT count(*) FROM users WHERE disabled_at IS NULL)::int users,(SELECT count(*) FROM workspaces)::int workspaces,(SELECT count(*) FROM overlays)::int overlays,(SELECT count(*) FROM sessions WHERE expires_at>now())::int active_sessions"),
    pool.query("SELECT count(*) FILTER(WHERE sent_at IS NULL)::int notification_pending,count(*) FILTER(WHERE sent_at IS NULL AND next_attempt_at<=now())::int notification_ready FROM notification_outbox"),
    pool.query("SELECT count(*) FILTER(WHERE status IN ('open','in_progress','waiting'))::int support_pending FROM support_tickets")
  ]);
  const db={total:pool.totalCount||0,idle:pool.idleCount||0,waiting:pool.waitingCount||0};
  const queue={...notifications.rows[0],...support.rows[0],liveSubscribers:eventBus.diagnostics().subscribers,redisReady:eventBus.diagnostics().ready};
  metrics.gauge('db_connections_total',db.total);metrics.gauge('db_connections_idle',db.idle);metrics.gauge('db_connections_waiting',db.waiting);
  metrics.gauge('queue_notification_pending',queue.notification_pending);metrics.gauge('queue_notification_ready',queue.notification_ready);metrics.gauge('queue_support_pending',queue.support_pending);
  return{at:new Date().toISOString(),usage:usage.rows[0],database:db,queue,runtime:metrics.snapshot()};
}
function startCapacityMonitor({pool,eventBus,metrics,alert=webhookAlert,intervalMs=30000}){
  let running=false,lastAlert=0;
  const sample=async()=>{if(running)return;running=true;try{const snap=await capacitySnapshot({pool,eventBus,metrics}),reasons=[];if(snap.database.waiting>=Number(process.env.CAPACITY_WARN_DB_WAITING||5))reasons.push(`db waiting ${snap.database.waiting}`);if(snap.queue.notification_pending>=Number(process.env.CAPACITY_WARN_NOTIFICATION_QUEUE||1000))reasons.push(`notification queue ${snap.queue.notification_pending}`);if(reasons.length&&Date.now()-lastAlert>60000){lastAlert=Date.now();await alert('capacity_pressure',{reasons,database:snap.database,queue:snap.queue})}}catch(error){console.error(JSON.stringify({level:'error',event:'capacity_sample_failed',message:error.message,at:new Date().toISOString()}))}finally{running=false}};
  const timer=setInterval(sample,intervalMs);timer.unref();sample();
  return()=>clearInterval(timer);
}
module.exports={Metrics,CircuitBreaker,routeName,startRuntimeMonitor,webhookAlert,capacitySnapshot,startCapacityMonitor};
