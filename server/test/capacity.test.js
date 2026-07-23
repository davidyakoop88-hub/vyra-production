'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Metrics,capacitySnapshot}=require('../observability');

test('capacity snapshot reports usage, pool and queues',async()=>{
  const rows=[
    {users:12,workspaces:8,overlays:31,active_sessions:6},
    {notification_pending:4,notification_ready:2},
    {support_pending:3}
  ];
  const pool={totalCount:10,idleCount:7,waitingCount:1,query:async()=>({rows:[rows.shift()]})};
  const eventBus={diagnostics:()=>({ready:true,subscribers:5,breaker:'closed'})};
  const metrics=new Metrics();
  const out=await capacitySnapshot({pool,eventBus,metrics});
  assert.equal(out.usage.users,12);
  assert.deepEqual(out.database,{total:10,idle:7,waiting:1});
  assert.equal(out.queue.liveSubscribers,5);
  assert.equal(out.runtime.gauges.db_connections_waiting,1);
  assert.match(metrics.render(),/vyra_queue_notification_pending 4/);
});

test('metric gauge rejects unsafe names',()=>{
  const metrics=new Metrics();
  assert.throws(()=>metrics.gauge('bad-name',1),/Ogiltigt/);
});
