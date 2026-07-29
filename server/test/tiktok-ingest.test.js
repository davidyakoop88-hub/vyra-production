'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const net=require('node:net');
const {eventBus,buildTestEvent,ingestTikTokEvent,validateTikTokIngestPayload,TIKTOK_INGEST_TYPES}=require('../index');

function redisReachable(url){
  return new Promise(resolve=>{
    let host='127.0.0.1',port=6379;
    try{const u=new URL(url);host=u.hostname;port=Number(u.port)||6379}catch{}
    const socket=net.createConnection({host,port});
    const done=ok=>{socket.destroy();resolve(ok)};
    socket.setTimeout(1000);
    socket.once('connect',()=>done(true));
    socket.once('timeout',()=>done(false));
    socket.once('error',()=>done(false));
  });
}

test('TIKTOK_INGEST_TYPES is exactly gift/like/chat/follow/share/member',()=>{
  assert.deepEqual([...TIKTOK_INGEST_TYPES].sort(),['chat','follow','gift','like','member','share']);
});

test('validateTikTokIngestPayload accepts every allowed type, case-insensitively',()=>{
  for(const type of TIKTOK_INGEST_TYPES){
    assert.doesNotThrow(()=>validateTikTokIngestPayload({type:type.toUpperCase(),username:'Alice'}));
  }
});

test('validateTikTokIngestPayload rejects a type outside the allowed set',()=>{
  assert.throws(()=>validateTikTokIngestPayload({type:'battle',username:'Alice'}),/Ogiltig event-typ/);
  assert.throws(()=>validateTikTokIngestPayload({type:'viewer',username:'Alice'}),/Ogiltig event-typ/); // internal alias target, not accepted raw here
  assert.throws(()=>validateTikTokIngestPayload({username:'Alice'}),/Ogiltig event-typ/); // missing type
});

test('validateTikTokIngestPayload rejects a missing, non-string or blank username',()=>{
  assert.throws(()=>validateTikTokIngestPayload({type:'gift'}),/username/);
  assert.throws(()=>validateTikTokIngestPayload({type:'gift',username:42}),/username/);
  assert.throws(()=>validateTikTokIngestPayload({type:'gift',username:null}),/username/);
  assert.throws(()=>validateTikTokIngestPayload({type:'gift',username:'   '}),/username/);
});

test('rejected payloads carry a 400 status for the shared JSON error handler',()=>{
  try{validateTikTokIngestPayload({type:'nonsense',username:'Alice'});assert.fail('expected a throw')}
  catch(err){assert.equal(err.status,400)}
});

// Everything below touches real Redis (eventBus.publish/rateLimiter.exceeded), so it's gated the
// same way sse-integration.test.js/event-replay.test.js are — CI's redis service provides it,
// local dev without Redis skips cleanly. Every test closes eventBus in a finally block, per this
// repo's hard-won lesson: an unclosed real Redis connection hangs `node --test` forever instead of
// failing/passing cleanly.

test('ingestTikTokEvent publishes a valid event through the same path real TikTok events use',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url}`);return}

  const workspaceId='55555555-5555-5555-5555-555555555555';
  const event=buildTestEvent('gift',{username:'IngestTester',giftName:'Rose'});
  try{
    const out=await ingestTikTokEvent(workspaceId,event);
    assert.equal(out.duplicate,false);
    assert.equal(out.event.type,'gift');
    assert.equal(out.event.username,'IngestTester');
    assert.ok(out.streamId);
  }finally{
    await eventBus.close().catch(()=>{});
  }
});

test('ingestTikTokEvent rejects an invalid payload before publishing (no streamId, no Redis write)',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url}`);return}

  const workspaceId='66666666-6666-6666-6666-666666666666';
  try{
    await assert.rejects(
      ()=>ingestTikTokEvent(workspaceId,{type:'not-a-real-type',username:'Alice'}),
      err=>{assert.equal(err.status,400);return true}
    );
  }finally{
    await eventBus.close().catch(()=>{});
  }
});

test('ingestTikTokEvent enforces max 100 events/second per workspace, scoped independently per workspace',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url}`);return}

  const busyWorkspace='77777777-7777-7777-7777-777777777777';
  const otherWorkspace='88888888-8888-8888-8888-888888888888';
  try{
    for(let i=0;i<100;i++){
      await ingestTikTokEvent(busyWorkspace,buildTestEvent('like',{username:`Fan${i}`}));
    }
    await assert.rejects(
      ()=>ingestTikTokEvent(busyWorkspace,buildTestEvent('like',{username:'OneTooMany'})),
      err=>{assert.equal(err.status,429);assert.match(err.message,/100\/sekund/);return true}
    );

    // A different workspace's own per-second budget must be untouched by busyWorkspace's flood.
    const out=await ingestTikTokEvent(otherWorkspace,buildTestEvent('like',{username:'UnaffectedFan'}));
    assert.equal(out.duplicate,false);
  }finally{
    await eventBus.close().catch(()=>{});
  }
});
