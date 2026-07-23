'use strict';
class RateLimiter{
  constructor(eventBus){this.eventBus=eventBus;this.local=new Map()}
  localExceeded(key,limit,windowSeconds){const now=Date.now(),b=this.local.get(key)||{at:now,count:0};if(now-b.at>windowSeconds*1000){b.at=now;b.count=0}b.count++;this.local.set(key,b);return b.count>limit}
  async exceeded(key,limit,windowSeconds=60){
    try{const c=await this.eventBus.connect(),bucket=Math.floor(Date.now()/(windowSeconds*1000)),redisKey=`vyra:rate:${key}:${bucket}`,count=await c.incr(redisKey);if(count===1)await c.expire(redisKey,windowSeconds+2);return count>limit}
    catch{return this.localExceeded(key,limit,windowSeconds)}
  }
}
module.exports={RateLimiter};
