'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Metrics,CircuitBreaker,routeName,discordAlertPayload}=require('../observability');
test('metrics aggregate without leaking ids or tokens',()=>{const m=new Metrics();m.observe('GET',routeName('/api/workspaces/123e4567-e89b-12d3-a456-426614174000/overlays'),200,.02);const text=m.render();assert.match(text,/route="\/api\/workspaces\/:id\/overlays"/);assert.doesNotMatch(text,/123e4567/)});
test('circuit breaker opens and recovers',async()=>{const b=new CircuitBreaker({threshold:2,cooldownMs:5});await assert.rejects(()=>b.run(async()=>{throw Error('x')}));await assert.rejects(()=>b.run(async()=>{throw Error('x')}));assert.equal(b.state(),'open');await assert.rejects(()=>b.run(async()=>1),e=>e.code==='CIRCUIT_OPEN');await new Promise(r=>setTimeout(r,8));assert.equal(await b.run(async()=>7),7);assert.equal(b.state(),'closed')});
test('discordAlertPayload builds a Discord-shaped embed with humanized title and mapped fields',()=>{
  const payload=discordAlertPayload('http_5xx',{method:'GET',path:'/api/workspaces/:id/overlays',status:503,durationSeconds:.42},'2026-01-01T00:00:00.000Z');
  assert.match(payload.content,/Http 5xx/);
  assert.equal(payload.embeds.length,1);
  const embed=payload.embeds[0];
  assert.equal(embed.title,'Http 5xx');
  assert.equal(embed.color,0xe33e3e);
  assert.equal(embed.timestamp,'2026-01-01T00:00:00.000Z');
  assert.equal(embed.footer.text,'vyra-api');
  assert.deepEqual(embed.fields.find(f=>f.name==='status'),{name:'status',value:'503',inline:true});
  assert.deepEqual(embed.fields.find(f=>f.name==='method'),{name:'method',value:'GET',inline:true});
});
test('discordAlertPayload flattens arrays/objects and stays within Discord field/count limits',()=>{
  const bigDetails={reasons:['memory 500 MB','event loop 300 ms'],database:{total:20,idle:2,waiting:5}};
  for(let i=0;i<30;i++)bigDetails[`extra${i}`]='x'.repeat(2000);
  const payload=discordAlertPayload('capacity_pressure',bigDetails,new Date().toISOString());
  const embed=payload.embeds[0];
  assert.ok(embed.fields.length<=25,'must not exceed Discord\'s 25-field cap');
  for(const f of embed.fields){
    assert.ok(f.value.length<=1024,'field value must respect Discord\'s 1024-char cap');
    assert.ok(f.name.length>=1&&f.value.length>=1,'Discord rejects empty field name/value');
  }
  const reasonsField=embed.fields.find(f=>f.name==='reasons');
  assert.equal(reasonsField.value,'memory 500 MB, event loop 300 ms');
  const dbField=embed.fields.find(f=>f.name==='database');
  assert.equal(dbField.value,JSON.stringify(bigDetails.database));
});
test('discordAlertPayload never produces an empty field name/value even for empty details',()=>{
  const payload=discordAlertPayload('uncaught_exception',{note:'',list:[]},new Date().toISOString());
  const embed=payload.embeds[0];
  for(const f of embed.fields){
    assert.ok(f.name.length>=1);
    assert.ok(f.value.length>=1);
  }
});
