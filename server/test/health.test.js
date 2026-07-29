'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildHealthStatus}=require('../index');

test('status is ok and maps to 200 when postgres and redis both respond',()=>{
  const payload=buildHealthStatus({postgresUp:true,redisUp:true,sseConnections:3,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.status,'ok');
  assert.equal(payload.timestamp,new Date(1700000000000).toISOString());
  assert.deepEqual(payload.services,{postgres:true,redis:true,sse:3,tiktokBridge:{lastEventSecondsAgo:null}});
});

test('status is degraded when postgres is down, even if redis is up',()=>{
  const payload=buildHealthStatus({postgresUp:false,redisUp:true,sseConnections:0,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.status,'degraded');
  assert.equal(payload.services.postgres,false);
  assert.equal(payload.services.redis,true);
});

test('status is degraded when redis is down, even if postgres is up',()=>{
  const payload=buildHealthStatus({postgresUp:true,redisUp:false,sseConnections:0,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.status,'degraded');
});

test('status is degraded when both postgres and redis are down',()=>{
  const payload=buildHealthStatus({postgresUp:false,redisUp:false,sseConnections:0,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.status,'degraded');
});

test('sse connection count passes through unchanged',()=>{
  const payload=buildHealthStatus({postgresUp:true,redisUp:true,sseConnections:17,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.services.sse,17);
});

test('tiktokBridge reports seconds since the last event when one has been received',()=>{
  const now=1700000000000,lastTikTokEventAt=now-42_000;
  const payload=buildHealthStatus({postgresUp:true,redisUp:true,sseConnections:0,lastTikTokEventAt,now});
  assert.equal(payload.services.tiktokBridge.lastEventSecondsAgo,42);
});

test('tiktokBridge reports null when no TikTok event has ever been received',()=>{
  const payload=buildHealthStatus({postgresUp:true,redisUp:true,sseConnections:0,lastTikTokEventAt:null,now:1700000000000});
  assert.equal(payload.services.tiktokBridge.lastEventSecondsAgo,null);
});
