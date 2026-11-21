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

// FILTYPSKONTROLLEN (David 2026-11-21: "Kontrollera filtypen"). Produktionen kräver skanning, men
// ingen skanner fanns: varje uppladdning fastnade som 'quarantined' och gick aldrig att hämta.
// Kontrollen nedan är skanningen tills en riktig finns — innehållet ska vara den typ som angavs.
const {sniffType}=require('../media-storage');
const fyll=(...delar)=>Buffer.concat([...delar.map(d=>Buffer.isBuffer(d)?d:Buffer.from(d,'latin1')),Buffer.alloc(64)]).subarray(0,64);
const PROV={
  'image/png':fyll(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])),
  'image/jpeg':fyll(Buffer.from([0xFF,0xD8,0xFF,0xE0])),
  'image/gif':fyll('GIF89a'),
  'image/webp':fyll('RIFF',Buffer.alloc(4),'WEBPVP8 '),
  'audio/wav':fyll('RIFF',Buffer.alloc(4),'WAVEfmt '),
  'audio/ogg':fyll('OggS'),
  'audio/mpeg':fyll('ID3',Buffer.from([4,0,0])),
  'video/mp4':fyll(Buffer.from([0,0,0,0x20]),'ftypisom'),
  'video/webm':fyll(Buffer.from([0x1A,0x45,0xDF,0xA3])),
};
test('varje tillåten typ känns igen på sitt innehåll',()=>{
  const {TYPES}=require('../media-storage');
  assert.deepEqual(Object.keys(PROV).sort(),[...TYPES].sort(),'en tillåten typ saknar igenkänning — den kan aldrig godkännas');
  for(const[typ,data]of Object.entries(PROV))assert.equal(sniffType(data),typ);
  assert.equal(sniffType(fyll(Buffer.from([0xFF,0xFB,0x90,0x00]))),'audio/mpeg','en MP3 utan ID3-tagg börjar med en ljudram');
});
test('det som inte är media känns inte igen, vad det än kallas',()=>{
  for(const data of[fyll('<!doctype html><script>alert(1)</script>'),fyll('<svg xmlns="http://www.w3.org/2000/svg">'),fyll('MZ',Buffer.from([0x90,0x00])),fyll('#!/bin/sh\n'),fyll('PK',Buffer.from([3,4])),Buffer.alloc(64),Buffer.from('kort')])assert.equal(sniffType(data),'');
  assert.equal(sniffType('RIFF....WAVE'),'','bara byte räknas');
});
const medInnehall=data=>{const m=lagring(),anrop=[];m.s3={send:async k=>{anrop.push([k.constructor.name,k.input.Range]);return{Body:(async function*(){yield data.subarray(0,10);yield data.subarray(10)})()}},destroy(){}};return{m,anrop}};
test('typkontrollen läser bara filens början och jämför med den angivna typen',async()=>{
  const wav=medInnehall(PROV['audio/wav']);
  assert.equal(await wav.m.typeMatches('k','audio/wav'),true);
  assert.deepEqual(wav.anrop,[['GetObjectCommand','bytes=0-63']]);
  assert.equal(await medInnehall(PROV['audio/wav']).m.typeMatches('k','audio/mpeg'),false,'en WAV som kallas MP3 godkändes');
  assert.equal(await medInnehall(fyll('<!doctype html>')).m.typeMatches('k','image/png'),false,'en HTML-sida som kallas bild godkändes');
});
test('servern kontrollerar typen före godkännande, och släpper en gammal karantän vid hämtning',()=>{
  const kod=require('fs').readFileSync(require('path').join(__dirname,'..','index.js'),'utf8');
  assert.match(kod,/typeMatches\(asset\.object_key,asset\.content_type\)\)\)\{await mediaStorage\.remove\(asset\.object_key\)/,'en fil med fel innehåll tas inte bort');
  assert.match(kod,/process\.env\.MEDIA_EXTERNAL_SCAN==='true'\?'quarantined':'ready'/);
  assert.doesNotMatch(kod,/MEDIA_SCAN_REQUIRED==='true'\?'quarantined'/,'karantän utan skanner: inget släpper filerna');
  assert.match(kod,/status IN \('ready','quarantined'\)/);
  assert.match(kod,/UPDATE media_assets SET status='ready',ready_at=now\(\) WHERE id=\$1 AND status='quarantined'/);
});
