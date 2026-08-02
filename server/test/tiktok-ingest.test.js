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

test('TIKTOK_INGEST_TYPES covers every type tiktok-bridge actually emits',()=>{
  // Widened 2026-08-02: the set was person-events only, but bridge.js also emits subscribe,
  // viewer and battle. In production every one of those came back 400, so the cloud path
  // silently lost viewer counts and battle scores that the desktop path has always had —
  // a web/desktop parity break. Keep this list in sync with sendEvent() calls in bridge.js.
  assert.deepEqual([...TIKTOK_INGEST_TYPES].sort(),
    ['battle','chat','follow','gift','like','likes','member','share','subscribe','viewer']);
});

// Regression: bryggan skickar LIKE-events som 'likes' — de måste passera valideringen (som körs
// före event-bussens TYPE_ALIASES) i stället för att 400:as bort innan aliaseringen kan ske.
test('validateTikTokIngestPayload accepts the bridge\'s raw \'likes\' type',()=>{
  assert.doesNotThrow(()=>validateTikTokIngestPayload({type:'likes',username:'Alice'}));
});

test('validateTikTokIngestPayload accepts every allowed type, case-insensitively',()=>{
  for(const type of TIKTOK_INGEST_TYPES){
    assert.doesNotThrow(()=>validateTikTokIngestPayload({type:type.toUpperCase(),username:'Alice'}));
  }
});

test('validateTikTokIngestPayload rejects a type outside the allowed set',()=>{
  assert.throws(()=>validateTikTokIngestPayload({type:'nonsense',username:'Alice'}),/Ogiltig event-typ/);
  assert.throws(()=>validateTikTokIngestPayload({type:'',username:'Alice'}),/Ogiltig event-typ/);
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

test('ingestTikTokEvent normalizes the bridge\'s \'likes\' to \'like\' via the event-bus alias',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url}`);return}

  const workspaceId='66666666-6666-6666-6666-666666666666';
  try{
    const out=await ingestTikTokEvent(workspaceId,{id:`likes-${Date.now()}`,type:'likes',username:'LikeTester',count:250,value:1000});
    assert.equal(out.duplicate,false);
    assert.equal(out.event.type,'like');
    assert.equal(out.event.count,250);
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

// --- Room-level events (added 2026-08-02) ---
// The bridge emits viewer counts and battle scores with no username because they describe the
// room, not a person. Every one of them was rejected with a 400 in production until the ingest
// learned about them, which is what "Cloud-event misslyckades: Cloud HTTP 400" was.
test('accepts the room-level types the bridge actually sends', () => {
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'viewer', count: 42 }));
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'battle', scoreUs: 10, scoreThem: 3 }));
});

test('accepts subscribe, which does carry a username', () => {
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'subscribe', username: 'alice' }));
});

test('still requires a username for person-level events', () => {
  for (const type of ['gift', 'like', 'likes', 'chat', 'follow', 'share', 'member', 'subscribe']) {
    assert.throws(() => validateTikTokIngestPayload({ type }), /username/, `${type} must require a username`);
  }
});

test('still rejects an unknown type', () => {
  assert.throws(() => validateTikTokIngestPayload({ type: 'nonsense', username: 'alice' }), /Ogiltig event-typ/);
});
