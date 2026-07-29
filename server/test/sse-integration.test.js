'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const net=require('node:net');
const {eventBus,buildTestEvent}=require('../index');

// Genuine integration test (real Redis), not a mock — but this repo's local dev sandbox has no
// Redis, only CI's `test` job (which provisions a real `redis:8-alpine` service) does. Skip
// cleanly rather than fail when nothing is listening, so `npm test` still passes for anyone
// developing without a local Redis, while CI actually exercises the real path.
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

test('SSE flow: a published test event reaches a live subscriber and is replayable by Last-Event-ID',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){
    t.skip(`No Redis reachable at ${url} — this test only runs where Redis is available (e.g. CI's redis service).`);
    return;
  }

  // Same workspace-scoped Redis Stream + Pub/Sub channel real TikTok events use, same
  // buildTestEvent() the POST /api/test/event/:workspaceId route uses — this exercises the exact
  // "Redis → SSE" segment of the TikTok → bridge → ingest → Redis → SSE → overlay chain, using
  // eventBus.subscribe()/publish()/replay() directly instead of going through the HTTP/EventSource
  // wire format (which is just a thin, already-covered-by-manual-testing wrapper around these).
  const workspaceId='11111111-1111-1111-1111-111111111111';
  const testEvent=buildTestEvent('gift',{username:'IntegrationTester',giftName:'Rose'});

  // eventBus is the shared singleton exported by server/index.js — connecting it here (via
  // subscribe/publish below) opens a real socket that keeps the process alive until closed.
  // Everything from here down runs inside try/finally so that socket — and the subscribe's own
  // duplicated connection — always gets closed, even if an assertion throws, otherwise `node
  // --test` never exits and the CI step hangs instead of failing/passing cleanly.
  let unsubscribe;
  try{
    const received=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Timed out waiting for the published event on the live subscription')),4000);
      eventBus.subscribe(workspaceId,message=>{
        if(message.event.id!==testEvent.id)return; // ignore unrelated events from other test runs sharing this workspace id
        clearTimeout(timer);
        resolve(message);
      }).then(unsub=>{unsubscribe=unsub;return eventBus.publish(workspaceId,testEvent)})
        .catch(err=>{clearTimeout(timer);reject(err)});
    });

    assert.equal(received.event.type,'gift');
    assert.equal(received.event.username,'IntegrationTester');
    assert.equal(received.event.giftName,'Rose');
    assert.ok(received.streamId,'a published event must carry a Redis Stream id — this is exactly what backs the SSE "id:" field and Last-Event-ID replay');

    // Simulates an overlay reconnecting after a drop: the browser's EventSource automatically
    // sends the last "id:" it saw as the Last-Event-ID header, and openEventStream() replays
    // from there.
    const replayed=await eventBus.replay(workspaceId,'0-0',50);
    const found=replayed.find(row=>row.event.id===testEvent.id);
    assert.ok(found,'replay(workspaceId, "0-0") must find the just-published event, proving reconnect-replay works');
    assert.equal(found.streamId,received.streamId);
  }finally{
    if(unsubscribe)await unsubscribe().catch(()=>{});
    await eventBus.close().catch(()=>{});
  }
});
