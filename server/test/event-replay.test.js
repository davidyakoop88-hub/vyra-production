'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const net=require('node:net');
const {EventEmitter}=require('node:events');
const {eventBus,buildTestEvent,openEventStream,SSE_HEARTBEAT_MS}=require('../index');

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

// A minimal fake HTTP req/res pair — just enough of the surface openEventStream() actually uses
// (req.headers, req.once('close',...), res.writeHead/write/end) to drive it in a test without a
// real HTTP server.
function fakeStream(headers={}) {
  const req=new EventEmitter();
  req.headers=headers;
  const writes=[];
  const res={writeHead(){},write(chunk){writes.push(chunk)},end(){req.emit('close')}};
  return {req,res,writes};
}

test('replay() returns [] immediately for a missing lastId — no Redis call needed',async()=>{
  assert.deepEqual(await eventBus.replay('any-workspace',undefined),[]);
});

test('replay() returns [] immediately for a malformed lastId — no Redis call needed',async()=>{
  assert.deepEqual(await eventBus.replay('any-workspace','not-a-valid-stream-id'),[]);
  assert.deepEqual(await eventBus.replay('any-workspace',''),[]);
  assert.deepEqual(await eventBus.replay('any-workspace','garbage-123'),[]);
});

test('SSE_HEARTBEAT_MS is 30 seconds',()=>{
  assert.equal(SSE_HEARTBEAT_MS,30000);
});

// Every openEventStream() test below runs inside try/finally: req.emit('close') (which clears
// the 30s heartbeat interval and unsubscribes) and eventBus.close() always run, even if an
// assertion throws — otherwise a leaked heartbeat timer or Redis subscription keeps `node --test`
// alive indefinitely instead of passing or failing cleanly (this bit us once already on the
// original sse-integration.test.js; same fix, applied up front this time).

test('openEventStream: replays missed events from a valid Last-Event-ID, then delivers live events, in that order',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url} — this test only runs where Redis is available (e.g. CI's redis service).`);return}

  const workspaceId='22222222-2222-2222-2222-222222222222';
  // Last-Event-ID means "I already saw up to and including this one" — xRange replays
  // *exclusively* after it. So to test "a missed event gets replayed", the client's reported
  // position must be a baseline published BEFORE the missed event, not the missed event itself.
  const baselineEvent=buildTestEvent('follow',{username:'BaselineGuest'});
  const missedEvent=buildTestEvent('gift',{username:'MissedGuest',giftName:'Rose'});
  let req;
  try{
    const baseline=await eventBus.publish(workspaceId,baselineEvent);
    await eventBus.publish(workspaceId,missedEvent); // published after the client's last-known position
    const stream=fakeStream({'last-event-id':baseline.streamId});
    req=stream.req;
    const {res,writes}=stream;
    await openEventStream(req,res,new URL(`http://x/api/workspaces/${workspaceId}/events/stream`),workspaceId);

    assert.ok(writes.some(chunk=>chunk.includes(missedEvent.id)),'the missed event must be replayed on connect');
    assert.ok(!writes.some(chunk=>chunk.includes(baselineEvent.id)),'the already-seen baseline event must not be replayed again (exclusive resume point)');

    const liveEvent=buildTestEvent('like',{username:'LiveGuest'});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('live event never arrived on the stream')),4000);
      const check=setInterval(()=>{
        if(writes.some(chunk=>chunk.includes(liveEvent.id))){clearInterval(check);clearTimeout(timer);resolve()}
      },20);
      eventBus.publish(workspaceId,liveEvent).catch(reject);
    });

    const missedIndex=writes.findIndex(c=>c.includes(missedEvent.id));
    const liveIndex=writes.findIndex(c=>c.includes(liveEvent.id));
    assert.ok(missedIndex>=0&&liveIndex>=0&&missedIndex<liveIndex,'replayed events must be written before live events');
  }finally{
    req?.emit('close');
    await eventBus.close().catch(()=>{});
  }
});

test('openEventStream: a fresh connection with no Last-Event-ID gets no replay, only live events',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url} — this test only runs where Redis is available (e.g. CI's redis service).`);return}

  const workspaceId='33333333-3333-3333-3333-333333333333';
  const olderEvent=buildTestEvent('follow',{username:'OlderGuest'});
  let req;
  try{
    await eventBus.publish(workspaceId,olderEvent); // published BEFORE the stream opens, with no Last-Event-ID sent

    const stream=fakeStream({}); // no last-event-id header at all
    req=stream.req;
    const {res,writes}=stream;
    await openEventStream(req,res,new URL(`http://x/api/workspaces/${workspaceId}/events/stream`),workspaceId);

    assert.equal(writes.length,0,'a brand-new connection with no Last-Event-ID must not receive any history');

    const liveEvent=buildTestEvent('share',{username:'FreshLiveGuest'});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('live event never arrived on the stream')),4000);
      const check=setInterval(()=>{
        if(writes.some(chunk=>chunk.includes(liveEvent.id))){clearInterval(check);clearTimeout(timer);resolve()}
      },20);
      eventBus.publish(workspaceId,liveEvent).catch(reject);
    });

    assert.ok(!writes.some(c=>c.includes(olderEvent.id)),'the pre-existing older event must never appear — only the live one');
  }finally{
    req?.emit('close');
    await eventBus.close().catch(()=>{});
  }
});

test('openEventStream: disconnect cleans up — subscriber count returns to its pre-connection value',async t=>{
  const url=process.env.REDIS_URL||'redis://127.0.0.1:6379';
  if(!await redisReachable(url)){t.skip(`No Redis reachable at ${url} — this test only runs where Redis is available (e.g. CI's redis service).`);return}

  const workspaceId='44444444-4444-4444-4444-444444444444';
  let req;
  try{
    const before=eventBus.diagnostics().subscribers;

    const stream=fakeStream({});
    req=stream.req;
    await openEventStream(req,stream.res,new URL(`http://x/api/workspaces/${workspaceId}/events/stream`),workspaceId);
    assert.equal(eventBus.diagnostics().subscribers,before+1,'subscribing must increment the shared subscriber count');

    req.emit('close');
    req=null; // already closed — don't emit it again in finally
    await new Promise(resolve=>setTimeout(resolve,50)); // let the close handler's async unsubscribe() finish
    assert.equal(eventBus.diagnostics().subscribers,before,'closing the connection must decrement it back down — no leaked subscriber');
  }finally{
    req?.emit('close');
    await eventBus.close().catch(()=>{});
  }
});
