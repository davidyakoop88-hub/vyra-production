'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateMedia,cleanName,safeEqualHex}=require('../media-storage');
test('media metadata is allowlisted and normalized',()=>{const m=validateMedia({contentType:'image/png',size:1024,sha256:'a'.repeat(64),originalName:'<hero>.png'});assert.equal(m.extension,'png');assert.equal(m.originalName,'hero.png')});
test('dangerous types, sizes and hashes are rejected',()=>{assert.throws(()=>validateMedia({contentType:'text/html',size:10,sha256:'a'.repeat(64)}));assert.throws(()=>validateMedia({contentType:'image/png',size:0,sha256:'a'.repeat(64)}));assert.throws(()=>validateMedia({contentType:'image/png',size:10,sha256:'wrong'}))});
test('hash comparison is constant-time compatible',()=>{assert.equal(safeEqualHex('a'.repeat(64),'a'.repeat(64)),true);assert.equal(safeEqualHex('a'.repeat(64),'b'.repeat(64)),false);assert.equal(safeEqualHex('short','short'),false)});

// R2 SPARADE INTE KONTROLLSUMMAN (2026-11-20). Signeraren flyttade x-amz-meta-sha256 till länkens
// frågesträng. Cloudflare R2 sparar inte metadata därifrån, så varje uppladdning i produktion kom upp
// men föll i efterkontrollen med 422. Dessutom låg en CRC32 av en tom kropp i länken. Proven nedan
// vaktar länkens form och att efterkontrollen klarar en lagring utan sparad summa.
const crypto=require('crypto');
const {MediaStorage}=require('../media-storage');
const lagring=()=>{process.env.OBJECT_ENDPOINT=process.env.OBJECT_ENDPOINT||'http://127.0.0.1:9';process.env.OBJECT_ACCESS_KEY=process.env.OBJECT_ACCESS_KEY||'prov';process.env.OBJECT_SECRET_KEY=process.env.OBJECT_SECRET_KEY||'prov';return new MediaStorage()};
const META={contentType:'audio/wav',size:5,sha256:crypto.createHash('sha256').update('hallå').digest('hex')};
test('kontrollsumman signeras som huvud och står inte i länkens adress',async()=>{
  const m=lagring(),q=new URL(await m.uploadUrl('workspaces/a/b.wav',META)).searchParams;
  assert.equal(q.has('x-amz-meta-sha256'),false,'summan ligger i adressen — R2 sparar den inte därifrån');
  assert.ok(q.get('X-Amz-SignedHeaders').split(';').includes('x-amz-meta-sha256'),'huvudet är inte signerat');
  assert.deepEqual(m.requiredHeaders(META),{'content-type':'audio/wav','x-amz-meta-sha256':META.sha256});
  m.close();
});
test('länken bär ingen kontrollsumma räknad på en tom kropp',async()=>{
  const m=lagring(),q=new URL(await m.uploadUrl('workspaces/a/b.wav',META)).searchParams;
  for(const namn of q.keys())assert.doesNotMatch(namn,/checksum/i,namn+' i länken avvisar den riktiga filen hos en lagring som kontrollerar den');
  m.close();
});
test('servern lämnar ut lagringens kravda huvuden, inte en egen lista',()=>{
  const kod=require('fs').readFileSync(require('path').join(__dirname,'..','index.js'),'utf8');
  assert.match(kod,/requiredHeaders:mediaStorage\.requiredHeaders\(meta\)/);
});
// En lagring i miniatyr: HEAD ger det som ställts in, GET ger innehållet bit för bit.
const falsk=(head,innehall)=>{const m=lagring();const anrop=[];m.s3={send:async kommando=>{const namn=kommando.constructor.name;anrop.push(namn);if(namn==='HeadObjectCommand')return head;if(namn==='GetObjectCommand')return{Body:(async function*(){yield Buffer.from(innehall.slice(0,2));yield Buffer.from(innehall.slice(2))})()};throw new Error('oväntat '+namn)},destroy(){}};return{m,anrop}};
test('efterkontrollen godkänner en sparad summa utan att hämta filen',async()=>{
  const {m,anrop}=falsk({ContentLength:5,ContentType:'audio/wav',Metadata:{sha256:META.sha256}},'hallå');
  assert.equal(await m.verify('k',META),true);assert.deepEqual(anrop,['HeadObjectCommand']);
});
test('saknas summan räknas den på innehållet — rätt fil godkänns, fel fil avvisas',async()=>{
  const ratt=falsk({ContentLength:5,ContentType:'audio/wav',Metadata:{}},'hallå');
  assert.equal(await ratt.m.verify('k',META),true);assert.deepEqual(ratt.anrop,['HeadObjectCommand','GetObjectCommand']);
  const fel=falsk({ContentLength:5,ContentType:'audio/wav'},'halla');
  assert.equal(await fel.m.verify('k',{...META,size:5}),false);
});
test('fel storlek, typ eller summa avvisas, och fel storlek hämtar aldrig filen',async()=>{
  const stor=falsk({ContentLength:6,ContentType:'audio/wav',Metadata:{}},'hallå!');
  assert.equal(await stor.m.verify('k',META),false);assert.deepEqual(stor.anrop,['HeadObjectCommand']);
  assert.equal(await falsk({ContentLength:5,ContentType:'text/html',Metadata:{sha256:META.sha256}},'hallå').m.verify('k',META),false);
  assert.equal(await falsk({ContentLength:5,ContentType:'audio/wav',Metadata:{sha256:'b'.repeat(64)}},'hallå').m.verify('k',META),false);
});
