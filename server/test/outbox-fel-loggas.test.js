'use strict';
// ETT MEJL SOM INTE GICK IVÄG SYNTES INGENSTANS — RÖTT FÖRST (2026-10-17).
//
// notifications.js processOutbox() fångade varje misslyckat utskick och skrev felet BARA till
// notification_outbox.last_error. Ingen loggrad. Avvisade Resend mejlet (overifierad avsändardomän,
// fel nyckel, kvot slut) fick användaren ändå "Verifieringsmejlet är skickat." (index.js
// send-verification svarar 202 när raden KÖATS), och i Railway-loggen stod ingenting. Efter åtta
// försök slutade raden försökas — fortfarande utan ett spår utanför databasen.
//
// Ett nytt konto kan inte spara något förrän e-posten är verifierad (index.js e-postspärren), så
// ett tyst mejlfel stänger ute varje ny användare utan att någon ser varför.
const test=require('node:test'),assert=require('node:assert/strict');
const {processOutbox}=require('../notifications');

function fakePool(rows){
  const updates=[];
  return{updates,query:async(sql,params)=>{
    if(/^SELECT/.test(sql))return{rows,rowCount:rows.length};
    updates.push({sql,params});return{rowCount:1};
  }};
}
function fangaLoggar(fn){
  const orig=console.error,rader=[];console.error=(...a)=>rader.push(a.join(' '));
  return Promise.resolve().then(fn).finally(()=>{console.error=orig}).then(()=>rader);
}
const RAD={id:7,recipient:'ny.kund@exempel.se',template:'verify_email',payload:{},dedupe_key:'verify_email:abc',attempts:2};

test('ett misslyckat utskick ger en strukturerad felrad i loggen',async()=>{
  const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  try{
    const pool=fakePool([{...RAD}]);
    const rader=await fangaLoggar(()=>processOutbox(pool));
    const rad=rader.map(r=>{try{return JSON.parse(r)}catch{return null}}).find(r=>r&&r.event==='notification_send_failed');
    assert.ok(rad,`ingen notification_send_failed-rad loggades: ${JSON.stringify(rader)}`);
    assert.equal(rad.template,'verify_email');
    assert.equal(rad.outboxId,7);
    assert.equal(rad.attempt,3,'försöket som just misslyckades');
    assert.match(rad.message,/RESEND_API_KEY saknas/);
    assert.equal(pool.updates.length,1,'last_error skrivs fortfarande');
  }finally{if(old!==undefined)process.env.RESEND_API_KEY=old}
});

test('loggraden bär inte mottagarens e-postadress',async()=>{
  const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  try{
    const rader=await fangaLoggar(()=>processOutbox(fakePool([{...RAD}])));
    assert.ok(rader.length,'förutsättning: något loggades');
    for(const r of rader)assert.doesNotMatch(r,/ny\.kund@exempel\.se/);
  }finally{if(old!==undefined)process.env.RESEND_API_KEY=old}
});

test('sista försöket säger att raden ges upp',async()=>{
  const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  try{
    const rader=await fangaLoggar(()=>processOutbox(fakePool([{...RAD,attempts:7}])));
    const rad=rader.map(r=>{try{return JSON.parse(r)}catch{return null}}).find(r=>r&&r.event==='notification_send_failed');
    assert.ok(rad);assert.equal(rad.attempt,8);assert.equal(rad.gaveUp,true);
  }finally{if(old!==undefined)process.env.RESEND_API_KEY=old}
});
