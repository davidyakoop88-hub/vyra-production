'use strict';
// Nyckelrymden för räknarna.
//
// Tom i drift, och det MÅSTE den vara: två API-instanser bakom samma lastdelare ska dela räknare,
// annars blir gränsen per instans i stället för per klient.
//
// I testerna är samma delning i stället felet. API-gränsen nycklas på klientens IP (index.js:227)
// och varje testfil kommer från 127.0.0.1 mot samma Redis. node --test kör filerna i var sin
// process, men de räknar ihop varandras trafik i samma 60-sekundershink: måltesterna gjorde slut
// på budgeten och studio-goal-stream fick 429 där den väntade 202 — grön ensam, röd i grupp, och
// olika fel beroende på om körningen var parallell eller seriell.
//
// UPPMÄTT 2026-08-14: två sådana fel i `node --test test/goal-*.test.js test/studio-goal-stream.test.js`,
// noll när samma filer kördes var för sig. Det är den värsta sortens rött — det ser ut som en
// riktig regression, och nästa gång det händer i CI är gissningen "flaky, kör om" i stället för
// att någon letar.
//
// NODE_TEST_CONTEXT sätts av node:test i varje testprocess och finns aldrig i drift, så det är
// signalen vi går på: egen rymd per process när testlöparen kör oss, delad rymd annars.
// RATE_LIMIT_NAMESPACE finns för att kunna säga det uttryckligen — 'auto' ger samma
// per-process-rymd, vilket annat värde som helst ger en egen namngiven rymd.
function nyckelrymd(env=process.env,pid=process.pid){
  const angiven=env.RATE_LIMIT_NAMESPACE;
  if(angiven)return angiven==='auto'?`p${pid}:`:`${angiven}:`;
  return env.NODE_TEST_CONTEXT?`p${pid}:`:'';
}
class RateLimiter{
  constructor(eventBus){this.eventBus=eventBus;this.local=new Map()}
  localExceeded(key,limit,windowSeconds){const rymd=nyckelrymd(),now=Date.now(),lokalNyckel=`${rymd}${key}`,b=this.local.get(lokalNyckel)||{at:now,count:0};if(now-b.at>windowSeconds*1000){b.at=now;b.count=0}b.count++;this.local.set(lokalNyckel,b);return b.count>limit}
  async exceeded(key,limit,windowSeconds=60){
    try{const c=await this.eventBus.connect(),bucket=Math.floor(Date.now()/(windowSeconds*1000)),redisKey=`vyra:rate:${nyckelrymd()}${key}:${bucket}`,count=await c.incr(redisKey);if(count===1)await c.expire(redisKey,windowSeconds+2);return count>limit}
    catch{return this.localExceeded(key,limit,windowSeconds)}
  }
}
module.exports={RateLimiter,nyckelrymd};
