'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../bridge');

test('reconnect backoff follows 1s,2s,4s,8s,16s,32s then caps at 60s and never gives up',()=>{
  assert.equal(B.baseReconnectDelayMs(0),1000);
  assert.equal(B.baseReconnectDelayMs(1),2000);
  assert.equal(B.baseReconnectDelayMs(2),4000);
  assert.equal(B.baseReconnectDelayMs(3),8000);
  assert.equal(B.baseReconnectDelayMs(4),16000);
  assert.equal(B.baseReconnectDelayMs(5),32000);
  assert.equal(B.baseReconnectDelayMs(6),60000);
  assert.equal(B.baseReconnectDelayMs(50),60000);
  assert.equal(B.baseReconnectDelayMs(10_000),60000);
});

test('jitter stays within +-20% of the base delay',()=>{
  for(let i=0;i<100;i++){
    const base=8000,delay=B.jitteredDelayMs(base);
    assert.ok(delay>=base*0.8&&delay<=base*1.2,`delay ${delay} out of range for base ${base}`);
  }
});

test('critical alert fires exactly once per outage at the 50-attempt threshold',()=>{
  assert.equal(B.shouldSendCriticalAlert(1,false),false);
  assert.equal(B.shouldSendCriticalAlert(49,false),false);
  assert.equal(B.shouldSendCriticalAlert(50,false),true);
  assert.equal(B.shouldSendCriticalAlert(51,false),true);
  assert.equal(B.shouldSendCriticalAlert(50,true),false,'must not re-fire once already sent this outage');
  assert.equal(B.shouldSendCriticalAlert(100,false),true,'must still fire if outage continues past 50 and was never sent');
});

test('success alert only fires for a genuine reconnect, not the very first connect',()=>{
  assert.equal(B.shouldSendSuccessAlert(0),false);
  assert.equal(B.shouldSendSuccessAlert(1),true);
  assert.equal(B.shouldSendSuccessAlert(37),true);
});

test('critical alert payload is a Discord-shaped embed labeled critical',()=>{
  const payload=B.criticalReconnectAlertPayload('alice',50,'Frånkopplad från TikTok LIVE','2026-01-01T00:00:00.000Z');
  assert.match(payload.content,/KRITISKT/);
  assert.match(payload.content,/@alice/);
  assert.equal(payload.embeds.length,1);
  const embed=payload.embeds[0];
  assert.equal(embed.color,0xe33e3e);
  assert.equal(embed.timestamp,'2026-01-01T00:00:00.000Z');
  assert.deepEqual(embed.fields.find(f=>f.name==='Nivå'),{name:'Nivå',value:'critical',inline:true});
  assert.deepEqual(embed.fields.find(f=>f.name==='Försök'),{name:'Försök',value:'50',inline:true});
  assert.deepEqual(embed.fields.find(f=>f.name==='Användare'),{name:'Användare',value:'@alice',inline:true});
});

test('reconnect success payload is a Discord-shaped embed labeled info',()=>{
  const payload=B.reconnectSuccessAlertPayload('alice','room-1',12,'2026-01-01T00:00:00.000Z');
  assert.match(payload.content,/återansluten/);
  assert.match(payload.content,/@alice/);
  assert.equal(payload.embeds.length,1);
  const embed=payload.embeds[0];
  assert.equal(embed.color,0x3ba55d);
  assert.equal(embed.timestamp,'2026-01-01T00:00:00.000Z');
  assert.deepEqual(embed.fields.find(f=>f.name==='Nivå'),{name:'Nivå',value:'info',inline:true});
  assert.deepEqual(embed.fields.find(f=>f.name==='Rum'),{name:'Rum',value:'room-1',inline:true});
  assert.deepEqual(embed.fields.find(f=>f.name==='Försök innan lyckad anslutning'),{name:'Försök innan lyckad anslutning',value:'12',inline:true});
});

test('requiring the module never triggers a live TikTok connection or process.exit',()=>{
  // If bridge.js's require.main guard were broken, requiring it here (with no argv username)
  // would have already called process.exit(1) or thrown before this line ever ran.
  assert.equal(typeof B.baseReconnectDelayMs,'function');
});
