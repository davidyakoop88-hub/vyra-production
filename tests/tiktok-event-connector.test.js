'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const http=require('http');
const path=require('path');
const {parseTikTokEventPage,officialUrl,loginUrl}=require('../electron-app/tiktok-event-service');
const {startLocalServer}=require('../electron-app/local-server');

test('tolkar ett komplett Pact of Hearts-event utan att gissa osynliga falt',()=>{
  const result=parseTikTokEventPage({
    url:'https://www.tiktok.com/live/events/pact-of-hearts',title:'Pact of Hearts | TikTok',
    text:'Pact of Hearts\n20 september 2026\n27 september 2026\nGå LIVE i 60 minuter\nSamla 5 000 diamanter\nRose ger 2x poäng\nBonus time 20:00-22:00 CEST'
  });
  assert.equal(result.name,'Pact of Hearts');
  assert.equal(result.publishable,true);
  assert.deepEqual(result.missing,[]);
  assert.match(result.tasks.join(' '),/Gå LIVE/);
  assert.match(result.boostedGifts.join(' '),/2x/);
  assert.match(result.bonusWindows.join(' '),/20:00/);
});

test('ofullstandig eller extern sida stoppas',()=>{
  const incomplete=parseTikTokEventPage({url:'https://www.tiktok.com/',title:'Pact of Hearts',text:'Pact of Hearts'});
  assert.equal(incomplete.publishable,false);
  assert.ok(incomplete.missing.includes('start- och slutdatum'));
  assert.equal(officialUrl('https://evil.example/tiktok.com'),null);
  assert.equal(officialUrl('http://www.tiktok.com/'),null);
  assert.ok(loginUrl('https://accounts.google.com/o/oauth2/auth'));
  assert.equal(loginUrl('https://google.example/phishing'),null);
});

test('Desktop-rutterna ar kopplade och webblage faller stangt',async t=>{
  const root=path.join(__dirname,'..');
  const server=await startLocalServer(root,0,{});t.after(()=>server.close());
  const port=server.address().port;
  const response=await fetch(`http://127.0.0.1:${port}/api/tiktok-events/status`);
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/VYRA Desktop/);
});

test('Studio visar den nya sidan och Desktop-paketet innehaller lasaren',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','studio.html'),'utf8');
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','electron-app','package.json'),'utf8'));
  assert.match(html,/data-extra="tiktokEvents"/);
  assert.match(html,/tiktok-event-connector\.js\?v=20260920-1/);
  assert.ok(pkg.build.files.includes('tiktok-event-service.js'));
  assert.equal(pkg.version,'1.2.6');
  assert.match(fs.readFileSync(path.join(__dirname,'..','electron-app','tiktok-event-service.js'),'utf8'),/15 \* 60 \* 1000/);
});
