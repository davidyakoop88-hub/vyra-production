'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Readable}=require('stream');
const {pipeline}=require('stream/promises');

const MAX_INSTALLER_BYTES=500*1024*1024;
function parseVersion(value){
  const match=String(value||'').trim().replace(/^v/,'').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  return match?{major:+match[1],minor:+match[2],patch:+match[3],pre:match[4]||''}:null;
}
function isNewer(candidate,current){
  const a=parseVersion(candidate),b=parseVersion(current);if(!a||!b)return false;
  for(const key of ['major','minor','patch'])if(a[key]!==b[key])return a[key]>b[key];
  return !a.pre&&!!b.pre;
}
function validateOrigin(value){const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password)throw new Error('Uppdateringsservern måste använda HTTPS');return url.origin}
function validateMetadata(data){
  if(!data||!parseVersion(data.version))throw new Error('Uppdateringens version är ogiltig');
  const sha256=String(data.sha256||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Uppdateringens SHA-256 saknas');
  const sizeBytes=Number(data.sizeBytes);if(!Number.isSafeInteger(sizeBytes)||sizeBytes<1024||sizeBytes>MAX_INSTALLER_BYTES)throw new Error('Uppdateringens filstorlek är ogiltig');
  return{version:String(data.version),sha256,sizeBytes};
}
async function sha256File(file){
  const hash=crypto.createHash('sha256');await pipeline(fs.createReadStream(file),hash);return hash.digest('hex');
}
async function fetchRelease(apiOrigin,fetchImpl=fetch){
  const origin=validateOrigin(apiOrigin),response=await fetchImpl(origin+'/api/downloads/windows?meta=1',{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Kunde inte kontrollera ny version');
  return validateMetadata(await response.json());
}
async function downloadRelease(apiOrigin,metadata,destination,fetchImpl=fetch){
  const origin=validateOrigin(apiOrigin),expected=validateMetadata(metadata),response=await fetchImpl(origin+'/api/downloads/windows',{redirect:'follow',signal:AbortSignal.timeout(120000)});
  if(!response.ok||!response.body)throw new Error('Kunde inte hämta uppdateringen');
  if(new URL(response.url).protocol!=='https:')throw new Error('Osäker omdirigering blockerades');
  const length=Number(response.headers.get('content-length')||0);if(length&&length!==expected.sizeBytes)throw new Error('Uppdateringens filstorlek stämmer inte');
  fs.mkdirSync(path.dirname(destination),{recursive:true});const temporary=destination+'.download';fs.rmSync(temporary,{force:true});let bytes=0;
  const meter=new (require('stream').Transform)({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>MAX_INSTALLER_BYTES||bytes>expected.sizeBytes)return callback(new Error('Uppdateringen är större än väntat'));callback(null,chunk)}});
  try{await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(temporary,{flags:'wx'}));if(bytes!==expected.sizeBytes)throw new Error('Uppdateringen är ofullständig');const actual=await sha256File(temporary);if(actual!==expected.sha256)throw new Error('Uppdateringens kontrollsumma stämmer inte');fs.renameSync(temporary,destination);return destination}catch(error){fs.rmSync(temporary,{force:true});throw error}
}
function readConfig(file){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));return{apiOrigin:validateOrigin(data.apiOrigin),channel:data.channel==='beta'?'beta':'stable'}}catch{return null}}
module.exports={MAX_INSTALLER_BYTES,parseVersion,isNewer,validateOrigin,validateMetadata,sha256File,fetchRelease,downloadRelease,readConfig};
