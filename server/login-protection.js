'use strict';
function lockSeconds(failures){const n=Number(failures)||0;if(n<5)return 0;if(n===5)return 30;if(n===6)return 120;if(n===7)return 300;return 900}
function lockUntil(failures,now=Date.now()){const seconds=lockSeconds(failures);return seconds?new Date(now+seconds*1000):null}
function hourBucket(now=new Date()){return now.toISOString().slice(0,13)}
module.exports={lockSeconds,lockUntil,hourBucket};
