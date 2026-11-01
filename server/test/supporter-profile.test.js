'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStatsReader}=require('../stats-read');
test('invalid birthday and oversized note fail before any query',async()=>{
 const reader=createStatsReader({query:()=>{throw new Error('must not query')}});
 for(const input of [{note:'ok',birthday:'02-30'},{note:'ok',birthday:'12-32'},{note:'x'.repeat(2001),birthday:''}])await assert.rejects(reader.saveSupporter('ws','anna',input),{status:400});
});
test('notes are scoped to workspace, current TikTok and existing viewer',async()=>{
 const calls=[];const reader=createStatsReader({query:async(sql,params)=>{calls.push({sql,params});return /tiktok_connections/.test(sql)?{rows:[{tiktok_username:'Creator'}]}:{rows:[{viewer_id:'anna'}]}}});
 assert.deepEqual(await reader.saveSupporter('ws','anna',{note:'<script>literal</script>',birthday:'02-29',konto:'creator'}),{ok:true});
 assert.deepEqual(calls[1].params,['ws','creator','anna','<script>literal</script>','02-29']);assert.match(calls[1].sql,/WHERE EXISTS/);
});
test('missing supporter cannot acquire notes',async()=>{
 const reader=createStatsReader({query:async sql=>/tiktok_connections/.test(sql)?{rows:[{tiktok_username:'creator'}]}:{rows:[]}});
 await assert.rejects(reader.saveSupporter('ws','missing',{note:'test',birthday:'',konto:'creator'}),{status:404});
});
test('profile does not fabricate boosters or fill missing daily history with lifetime sums',async()=>{
 const calls=[];const reader=createStatsReader({query:async(sql,params)=>{calls.push({sql,params});if(/tiktok_connections/.test(sql))return{rows:[{tiktok_username:'creator'}]};if(/gifter_totals/.test(sql))return{rows:[{viewer_id:'anna',diamonds:'10000',gifts:'50'}]};return{rows:[]}}});
 const out=await reader.supporter('ws','anna');assert.equal(out.diamonds,10000);assert.equal(out.boosters,null);assert.deepEqual(out.dagar,[]);assert.equal(out.senasteGava,null);
 for(const call of calls.slice(1))assert.deepEqual(call.params,['ws','creator','anna']);
});

// PLACERINGEN (2026-11-01): rutten hamnade en gång i ingestkoden, där `p` och sessionen inte finns —
// "ReferenceError: p is not defined" i varje Postgres-prov som startar servern. Den ska ligga efter
// den gemensamma session-raden (CSRF för PUT) och före statistikrutten, i samma request-hanterare.
test('supporterrutten ligger efter session/CSRF-raden och före statistikrutten', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.js'), 'utf8');
  const session = src.indexOf("const s=await session(req,{csrf:req.method!=='GET'})");
  const supporter = src.indexOf('const supporterRoute=p.match(');
  const stats = src.indexOf('const statsRoute=p.match(');
  assert.ok(session > 0 && supporter > 0 && stats > 0, 'en av raderna saknas');
  assert.ok(session < supporter && supporter < stats, `fel ordning: session ${session}, supporter ${supporter}, stats ${stats}`);
  assert.equal(src.indexOf('const supporterRoute=p.match(', supporter + 1), -1, 'rutten finns två gånger');
});
