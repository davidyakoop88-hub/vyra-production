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
  const stats=manager.stats();
  assert.equal(stats.totalBridges,1);
  assert.deepEqual(stats.bridges,[{workspaceId:'ws-1',username:'alice',isConnected:false,reconnectAttempts:0,lastEventTime:null}]);
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

test('stats() exposes the capacity picture the /status endpoint and Railway rely on',()=>{
  const manager=createConnectionManager({spawnBridge:()=>fakeChild()});
  manager.startBridge('ws-1','alice');
  const stats=manager.stats();
  assert.deepEqual(Object.keys(stats).sort(),
    ['atCapacity','bridges','lastEventTime','maxBridges','restarts','totalBridges','waiting','waitingCount']);
  assert.deepEqual(Object.keys(stats.bridges[0]).sort(),['isConnected','lastEventTime','reconnectAttempts','username','workspaceId']);
});

// ---- Kapacitet, dubbletter och backoff ------------------------------------------------------
// Varje bridge är en egen Node-process (~40–60 MB). Utan tak OOM-dödas containern och tar med sig
// API, inloggning och alla widgets. Testerna nedan bevakar att taket nås kontrollerat i stället.

test('MAX_BRIDGES stops the fleet at the limit and leaves running bridges untouched',()=>{
  const spawned=[];
  const manager=createConnectionManager({spawnBridge:(w)=>{spawned.push(w);return fakeChild()},maxBridges:2});
  assert.ok(manager.startBridge('ws-1','alice'));
  assert.ok(manager.startBridge('ws-2','bob'));
  assert.equal(manager.startBridge('ws-3','carol'),null,'den tredje ska nekas, inte kasta');
  assert.deepEqual(spawned,['ws-1','ws-2'],'ingen process får startas för den nekade');
  const stats=manager.stats();
  assert.equal(stats.totalBridges,2);
  assert.equal(stats.maxBridges,2);
  assert.equal(stats.atCapacity,true);
  assert.equal(stats.waitingCount,1);
  assert.equal(stats.waiting[0].workspaceId,'ws-3');
  assert.equal(stats.waiting[0].reason,'at-capacity');
  assert.deepEqual(stats.bridges.map(b=>b.workspaceId),['ws-1','ws-2'],'befintliga är orörda');
});

test('a disconnect frees its slot so a waiting workspace can start',()=>{
  const manager=createConnectionManager({spawnBridge:()=>fakeChild(),maxBridges:1});
  manager.startBridge('ws-1','alice');
  assert.equal(manager.startBridge('ws-2','bob'),null);
  assert.equal(manager.stats().atCapacity,true);
  manager.stopBridge('ws-1');
  assert.equal(manager.stats().totalBridges,0);
  assert.ok(manager.startBridge('ws-2','bob'),'platsen ska vara ledig igen');
  assert.equal(manager.stats().totalBridges,1);
});

test('a crashed bridge frees its slot too',()=>{
  const children=new Map();
  const manager=createConnectionManager({spawnBridge:(w)=>{const c=fakeChild();children.set(w,c);return c},maxBridges:1});
  manager.startBridge('ws-1','alice');
  children.get('ws-1').emit('exit',1,null);
  assert.equal(manager.stats().totalBridges,0,'platsen ska frigöras även vid krasch');
  assert.equal(manager.stats().restarts,1,'krascher ska räknas');
});

test('the same TikTok account never gets two processes, even across workspaces',()=>{
  let spawnCount=0;
  const manager=createConnectionManager({spawnBridge:()=>{spawnCount++;return fakeChild()}});
  assert.ok(manager.startBridge('ws-1','@Alice'));
  assert.equal(manager.startBridge('ws-2','alice'),null,'annat workspace, samma konto');
  assert.equal(spawnCount,1,'bara en process för kontot');
  const waiting=manager.stats().waiting.find(w=>w.workspaceId==='ws-2');
  assert.equal(waiting.reason,'duplicate-account');
});

test('several different accounts run side by side',()=>{
  const manager=createConnectionManager({spawnBridge:()=>fakeChild(),maxBridges:5});
  ['alice','bob','carol'].forEach((u,i)=>assert.ok(manager.startBridge('ws-'+i,u)));
  assert.equal(manager.stats().totalBridges,3);
  assert.equal(manager.stats().waitingCount,0);
});

test('a bridge that keeps dying backs off instead of restarting forever',()=>{
  let now=1000000;
  const children=new Map();
  const manager=createConnectionManager({
    spawnBridge:(w)=>{const c=fakeChild();children.set(w,c);return c},
    nowFn:()=>now
  });
  manager.startBridge('ws-1','alice');
  children.get('ws-1').emit('exit',1,null);
  assert.equal(manager.startBridge('ws-1','alice'),null,'ska inte startas om direkt');
  assert.equal(manager.stats().waiting[0].reason,'backoff');
  now+=5001;
  assert.ok(manager.startBridge('ws-1','alice'),'efter backoff får den försöka igen');
  children.get('ws-1').emit('exit',1,null);
  now+=5001;
  assert.equal(manager.startBridge('ws-1','alice'),null,'andra kraschen ska vänta längre');
  now+=5000;
  assert.ok(manager.startBridge('ws-1','alice'));
});

test('a deliberate stop carries no backoff penalty and is not counted as a restart',()=>{
  const children=new Map();
  const manager=createConnectionManager({spawnBridge:(w)=>{const c=fakeChild();children.set(w,c);return c}});
  manager.startBridge('ws-1','alice');
  const child=children.get('ws-1');
  manager.stopBridge('ws-1');
  child.emit('exit',0,'SIGTERM');
  assert.equal(manager.stats().restarts,0,'ett stopp vi bad om är ingen krasch');
  assert.ok(manager.startBridge('ws-1','alice'),'ska kunna startas igen direkt');
});

test('syncOnce reports refusals and keeps going past them',async()=>{
  const rows=[{workspace_id:'ws-1',tiktok_username:'alice'},
              {workspace_id:'ws-2',tiktok_username:'bob'},
              {workspace_id:'ws-3',tiktok_username:'carol'}];
  const pool={query:async()=>({rows})};
  const manager=createConnectionManager({pool,spawnBridge:()=>fakeChild(),maxBridges:2,sleepFn:async()=>{}});
  const out=await manager.syncOnce();
  assert.equal(out.started,2);
  assert.equal(out.refused,1);
  assert.equal(out.running,2);
  assert.equal(out.waiting,1);
});

test('a workspace that goes inactive stops advertising demand in waiting',async()=>{
  let rows=[{workspace_id:'ws-1',tiktok_username:'alice'},{workspace_id:'ws-2',tiktok_username:'bob'}];
  const pool={query:async()=>({rows})};
  const manager=createConnectionManager({pool,spawnBridge:()=>fakeChild(),maxBridges:1,sleepFn:async()=>{}});
  await manager.syncOnce();
  assert.equal(manager.stats().waitingCount,1);
  rows=[{workspace_id:'ws-1',tiktok_username:'alice'}];
  await manager.syncOnce();
  assert.equal(manager.stats().waitingCount,0,'kön ska inte visa efterfrågan som inte finns');
});

test('restarting the manager rebuilds the fleet without duplicating anything',async()=>{
  const rows=[{workspace_id:'ws-1',tiktok_username:'alice'},{workspace_id:'ws-2',tiktok_username:'bob'}];
  const pool={query:async()=>({rows})};
  const first=createConnectionManager({pool,spawnBridge:()=>fakeChild(),sleepFn:async()=>{}});
  await first.syncOnce();
  assert.equal(first.stats().totalBridges,2);
  first.stopAll();
  assert.equal(first.stats().totalBridges,0);
  const spawnedSecond=[];
  const second=createConnectionManager({pool,spawnBridge:(w)=>{spawnedSecond.push(w);return fakeChild()},sleepFn:async()=>{}});
  await second.syncOnce();
  assert.deepEqual(spawnedSecond.slice().sort(),['ws-1','ws-2']);
  assert.equal(second.stats().totalBridges,2,'exakt en bridge per workspace efter omstart');
  await second.syncOnce();
  assert.equal(spawnedSecond.length,2,'upprepad synk ska inte spawna dubbletter');
});

// ---- Kontroller inför merge (kö-ordning, namnbyte, omstart) ----------------------------------

test('a freed slot goes to the workspace that has waited longest, not to chance',async()=>{
  // updated_at stigande = aldsta anslutningen forst. Utan ORDER BY kan Postgres ge en ny ordning
  // varje tick, och vem som far den lediga platsen blir slump.
  let rows=[
    {workspace_id:'ws-old',tiktok_username:'alice'},
    {workspace_id:'ws-mid',tiktok_username:'bob'},
    {workspace_id:'ws-new',tiktok_username:'carol'}
  ];
  const seen=[];
  const pool={async query(sql){seen.push(sql);return {rows}}};
  const spawned=[];
  const manager=createConnectionManager({pool,spawnBridge:(w)=>{spawned.push(w);return fakeChild()},maxBridges:1,sleepFn:async()=>{}});

  await manager.syncOnce();
  assert.deepEqual(spawned,['ws-old'],'aldsta raden ska fa den enda platsen');
  assert.ok(seen[0].includes('ORDER BY updated_at ASC'),'fragan maste vara deterministiskt ordnad');
  assert.deepEqual(manager.stats().waiting.map(w=>w.workspaceId),['ws-mid','ws-new']);

  // ws-old kopplar fran (raden avaktiveras) — DET ar nar en plats verkligen frigors. Att bara
  // stoppa processen medan raden ar kvar aktiv ska tvartom starta om samma workspace, eftersom
  // den fortfarande ar den aldsta onskade anslutningen.
  rows=[{workspace_id:'ws-mid',tiktok_username:'bob'},{workspace_id:'ws-new',tiktok_username:'carol'}];
  await manager.syncOnce();
  assert.deepEqual(spawned,['ws-old','ws-mid'],'nasta i kon, inte den nyaste');
  assert.deepEqual(manager.stats().waiting.map(w=>w.workspaceId),['ws-new'],'bara den nyaste star kvar');
});

test('renaming an account replaces its bridge instead of running two in parallel',async()=>{
  let rows=[{workspace_id:'ws-1',tiktok_username:'alice'}];
  const pool={async query(){return {rows}}};
  const spawned=[],killed=[];
  const manager=createConnectionManager({pool,sleepFn:async()=>{},
    spawnBridge:(w,u)=>{spawned.push(u);const c=fakeChild();c.kill=()=>killed.push(u);return c}});

  await manager.syncOnce();
  assert.deepEqual(spawned,['alice']);

  rows=[{workspace_id:'ws-1',tiktok_username:'alice2'}];   // samma workspace, nytt anvandarnamn
  const out=await manager.syncOnce();

  assert.deepEqual(killed,['alice'],'den gamla ska stoppas');
  assert.deepEqual(spawned,['alice','alice2']);
  assert.equal(out.running,1,'exakt en bridge for workspacet, aldrig tva parallellt');
  assert.equal(manager.stats().totalBridges,1);
  assert.deepEqual(manager.stats().bridges.map(b=>b.username),['alice2']);
});

test('a rename does not count as a crash and earns no backoff',async()=>{
  let rows=[{workspace_id:'ws-1',tiktok_username:'alice'}];
  const pool={async query(){return {rows}}};
  const children=new Map();
  const manager=createConnectionManager({pool,sleepFn:async()=>{},
    spawnBridge:(w,u)=>{const c=fakeChild();children.set(u,c);return c}});
  await manager.syncOnce();
  rows=[{workspace_id:'ws-1',tiktok_username:'alice2'}];
  await manager.syncOnce();
  children.get('alice').emit('exit',0,'SIGTERM');   // SIGTERM landar efter stoppet
  assert.equal(manager.stats().restarts,0,'ett namnbyte ar inget haveri');
  assert.equal(manager.stats().totalBridges,1,'den nya bridgen ska vara kvar');
});

test('a redeploy with connections already active rebuilds exactly one bridge each',async()=>{
  const rows=[{workspace_id:'ws-1',tiktok_username:'alice'},
              {workspace_id:'ws-2',tiktok_username:'bob'},
              {workspace_id:'ws-3',tiktok_username:'carol'}];
  const pool={async query(){return {rows}}};
  const before=createConnectionManager({pool,spawnBridge:()=>fakeChild(),sleepFn:async()=>{},maxBridges:5});
  await before.syncOnce();
  assert.equal(before.stats().totalBridges,3);
  before.stopAll();                                 // SIGTERM vid deploy

  const spawned=[];
  const after=createConnectionManager({pool,spawnBridge:(w)=>{spawned.push(w);return fakeChild()},sleepFn:async()=>{},maxBridges:5});
  await after.syncOnce();
  await after.syncOnce();
  await after.syncOnce();                           // flera tick efter omstart
  assert.equal(spawned.length,3,'tre bridgar totalt, inga dubbletter over flera synkar');
  assert.deepEqual(spawned.slice().sort(),['ws-1','ws-2','ws-3']);
  assert.equal(after.stats().totalBridges,3);
});
