'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Metrics,CircuitBreaker,routeName}=require('../observability');
test('metrics aggregate without leaking ids or tokens',()=>{const m=new Metrics();m.observe('GET',routeName('/api/workspaces/123e4567-e89b-12d3-a456-426614174000/overlays'),200,.02);const text=m.render();assert.match(text,/route="\/api\/workspaces\/:id\/overlays"/);assert.doesNotMatch(text,/123e4567/)});
test('circuit breaker opens and recovers',async()=>{const b=new CircuitBreaker({threshold:2,cooldownMs:5});await assert.rejects(()=>b.run(async()=>{throw Error('x')}));await assert.rejects(()=>b.run(async()=>{throw Error('x')}));assert.equal(b.state(),'open');await assert.rejects(()=>b.run(async()=>1),e=>e.code==='CIRCUIT_OPEN');await new Promise(r=>setTimeout(r,8));assert.equal(await b.run(async()=>7),7);assert.equal(b.state(),'closed')});
