'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createConnectionManager}=require('../connection-manager');

// A fake child process — just enough of the fork() surface (message/exit/error events, kill())
// for the manager to exercise, with no real process ever spawned and no real TikTok touched.
function fakeChild() {
  const emitter=new EventEmitter();
  emitter.killed=false;
  emitter.kill=(signal)=>{emitter.killed=true;emitter.lastSignal=signal};
  return emitter;
}

test('startBridge adds an entry that shows up in stats()',()=>{
  const children=[];
  const spawnBridge=(workspaceId,username)=>{const c=fakeChild();children.push({workspaceId,username,c});return c};
  const manager=createConnectionManager({spawnBridge});
  manager.startBridge('ws-1','alice');
  assert.deepEqual(manager.stats(),{totalBridges:1,bridges:[{workspaceId:'ws-1',username:'alice',isConnected:false,reconnectAttempts:0,lastEventTime:null}]});
  assert.equal(children.length,1);
  assert.equal(children[0].workspaceId,'ws-1');
  assert.equal(children[0].username,'alice');
});

test('startBridge is idempotent — starting the same workspace twice does not spawn a second bridge',()=>{
  let spawnCount=0;
  const spawnBridge=()=>{spawnCount++;return fakeChild()};
  const manager=createConnectionManager({spawnBridge});
  manager.startBridge('ws-1','alice');
  manager.startBridge('ws-1','alice');
  assert.equal(spawnCount,1);
  assert.equal(manager.stats().totalBridges,1);
});

test('child "connected" message marks the bridge connected and resets reconnectAttempts',()=>{
  let child;
  const manager=createConnectionManager({spawnBridge:()=>{child=fakeChild();return child}});
  manager.startBridge('ws-1','alice');
  child.emit('message',{type:'reconnecting',attempt:3});
  assert.equal(manager.stats().bridges[0].reconnectAttempts,3);
  assert.equal(manager.stats().bridges[0].isConnected,false);
  child.emit('message',{type:'connected',roomId:'room-1'});
  const bridge=manager.stats().bridges[0];
  assert.equal(bridge.isConnected,true);
  assert.equal(bridge.reconnectAttempts,0);
});

test('child "event" message updates lastEventTime',()=>{
  let child;
  const manager=createConnectionManager({spawnBridge:()=>{child=fakeChild();return child}});
  manager.startBridge('ws-1','alice');
  assert.equal(manager.stats().bridges[0].lastEventTime,null);
  child.emit('message',{type:'event',eventType:'gift',at:1700000000000});
  assert.equal(manager.stats().bridges[0].lastEventTime,1700000000000);
});

test('child exiting removes the bridge from stats without affecting others',()=>{
  const children={};
  const spawnBridge=(workspaceId)=>{const c=fakeChild();children[workspaceId]=c;return c};
  const manager=createConnectionManager({spawnBridge});
  manager.startBridge('ws-1','alice');
  manager.startBridge('ws-2','bob');
  assert.equal(manager.stats().totalBridges,2);
  children['ws-1'].emit('exit',1);
  const stats=manager.stats();
  assert.equal(stats.totalBridges,1);
  assert.equal(stats.bridges[0].workspaceId,'ws-2');
});

test('stopBridge sends SIGTERM, removes the bridge, and reports false for an unknown workspace',()=>{
  let child;
  const manager=createConnectionManager({spawnBridge:()=>{child=fakeChild();return child}});
  manager.startBridge('ws-1','alice');
  assert.equal(manager.stopBridge('does-not-exist'),false);
  assert.equal(manager.stopBridge('ws-1'),true);
  assert.equal(child.killed,true);
  assert.equal(child.lastSignal,'SIGTERM');
  assert.equal(manager.stats().totalBridges,0);
});

test('startAll() queries tiktok_connections for active workspaces and starts a bridge per row, staggered',async()=>{
  const started=[];
  const sleeps=[];
  const pool={query:async(sql)=>{
    assert.match(sql,/tiktok_connections/);
    assert.match(sql,/active\s*=\s*true/);
    return {rows:[{workspace_id:'ws-1',tiktok_username:'alice'},{workspace_id:'ws-2',tiktok_username:'bob'}]};
  }};
  const manager=createConnectionManager({
    pool,
    spawnBridge:(workspaceId,username)=>{started.push({workspaceId,username});return fakeChild()},
    sleepFn:async ms=>{sleeps.push(ms)}
  });
  const count=await manager.startAll();
  assert.equal(count,2);
  assert.deepEqual(started,[{workspaceId:'ws-1',username:'alice'},{workspaceId:'ws-2',username:'bob'}]);
  assert.deepEqual(sleeps,[500,500],'must wait the 500ms stagger after every bridge start, including the last');
});

test('startAll() throws a clear error if no pool was provided',async()=>{
  const manager=createConnectionManager({spawnBridge:()=>fakeChild()});
  await assert.rejects(()=>manager.startAll(),/pool krävs/);
});

test('one bridge failing to spawn during startAll() does not stop the others from starting',async()=>{
  const started=[];
  const pool={query:async()=>({rows:[
    {workspace_id:'ws-broken',tiktok_username:'broken'},
    {workspace_id:'ws-1',tiktok_username:'alice'},
    {workspace_id:'ws-2',tiktok_username:'bob'}
  ]})};
  const manager=createConnectionManager({
    pool,
    spawnBridge:(workspaceId,username)=>{
      if(workspaceId==='ws-broken')throw new Error('boom — simulated spawn failure');
      started.push(workspaceId);
      return fakeChild();
    },
    sleepFn:async()=>{}
  });
  await assert.doesNotReject(()=>manager.startAll());
  assert.deepEqual(started,['ws-1','ws-2']);
  assert.equal(manager.stats().totalBridges,2);
});

test('stats() shape matches {totalBridges, bridges:[{workspaceId, username, isConnected, reconnectAttempts, lastEventTime}]} exactly',()=>{
  const manager=createConnectionManager({spawnBridge:()=>fakeChild()});
  manager.startBridge('ws-1','alice');
  const stats=manager.stats();
  assert.deepEqual(Object.keys(stats).sort(),['bridges','totalBridges']);
  assert.deepEqual(Object.keys(stats.bridges[0]).sort(),['isConnected','lastEventTime','reconnectAttempts','username','workspaceId']);
});
