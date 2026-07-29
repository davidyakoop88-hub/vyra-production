'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProxyManager,parseProxyList,FAILED_RETRY_MS}=require('../proxy-manager');

test('parseProxyList splits on commas, trims whitespace and drops empty entries',()=>{
  assert.deepEqual(parseProxyList('http://a:1,http://b:2 , ,http://c:3'),['http://a:1','http://b:2','http://c:3']);
  assert.deepEqual(parseProxyList(''),[]);
  assert.deepEqual(parseProxyList(undefined),[]);
});

test('empty PROXY_LIST runs in dev mode: disabled, next() always null',()=>{
  const pm=createProxyManager('');
  assert.equal(pm.enabled(),false);
  assert.equal(pm.next(),null);
  assert.deepEqual(pm.stats(),{total:0,active:0,failed:0});
});

test('next() round-robins through all proxies in order and wraps around',()=>{
  const pm=createProxyManager('http://a:1,http://b:1,http://c:1');
  assert.equal(pm.enabled(),true);
  assert.deepEqual(
    [pm.next(),pm.next(),pm.next(),pm.next(),pm.next()],
    ['http://a:1','http://b:1','http://c:1','http://a:1','http://b:1']
  );
});

test('markFailed removes a proxy from rotation and stats reflect it',()=>{
  const pm=createProxyManager('http://a:1,http://b:1,http://c:1');
  pm.markFailed('http://b:1');
  assert.deepEqual(pm.stats(),{total:3,active:2,failed:1});
  const picks=[pm.next(),pm.next(),pm.next(),pm.next()];
  assert.ok(!picks.includes('http://b:1'),'failed proxy must never be picked while still failed');
});

test('a proxy auto-reactivates exactly after the 10-minute retry window',()=>{
  let t=1_000_000;
  const pm=createProxyManager('http://a:1,http://b:1',()=>t);
  pm.markFailed('http://a:1');
  assert.deepEqual(pm.stats(),{total:2,active:1,failed:1});

  t+=FAILED_RETRY_MS-1;
  assert.deepEqual(pm.stats(),{total:2,active:1,failed:1},'must still be failed just before the window elapses');

  t+=1;
  assert.deepEqual(pm.stats(),{total:2,active:2,failed:0},'must be revived exactly at the 10-minute mark');
});

test('next() returns null when every proxy is currently failed, without throwing',()=>{
  const pm=createProxyManager('http://a:1,http://b:1');
  pm.markFailed('http://a:1');
  pm.markFailed('http://b:1');
  assert.equal(pm.next(),null);
  assert.deepEqual(pm.stats(),{total:2,active:0,failed:2});
});

test('markFailed on an unknown url is a no-op, not a crash',()=>{
  const pm=createProxyManager('http://a:1');
  assert.doesNotThrow(()=>pm.markFailed('http://not-in-the-list:1'));
  assert.deepEqual(pm.stats(),{total:1,active:1,failed:0});
});

test('stats() shape matches {total, active, failed} exactly',()=>{
  const pm=createProxyManager('http://a:1,http://b:1');
  const stats=pm.stats();
  assert.deepEqual(Object.keys(stats).sort(),['active','failed','total']);
  assert.equal(typeof stats.total,'number');
  assert.equal(typeof stats.active,'number');
  assert.equal(typeof stats.failed,'number');
});
