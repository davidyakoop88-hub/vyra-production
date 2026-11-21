'use strict';
const crypto=require('crypto');
const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm']);
const EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'};
// FILENS VERKLIGA TYP, LÄST UR INNEHÅLLET (David 2026-11-21: "Kontrollera filtypen").
// Produktionen kräver skanning (MEDIA_SCAN_REQUIRED), men ingen skanner var inkopplad: varje
// uppladdning fastnade som 'quarantined' och gick aldrig att hämta. Den här kontrollen ÄR skanningen
// tills en riktig finns. Den läser filens första byte och godkänner bara en fil vars innehåll är den
// typ som angavs — en HTML-sida eller ett program som kallar sig ljud eller bild kommer inte igenom.
// Det är ingen virusskanning; MEDIA_EXTERNAL_SCAN=true behåller karantänen för en extern skanner.
const ar=(b,i,...byte)=>byte.every((v,k)=>b[i+k]===v),txt=(b,i,s)=>b.length>=i+s.length&&b.toString('latin1',i,i+s.length)===s;
function sniffType(b){
  if(!Buffer.isBuffer(b)||b.length<12)return'';
  if(ar(b,0,0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A))return'image/png';
  if(ar(b,0,0xFF,0xD8,0xFF))return'image/jpeg';
  if(txt(b,0,'GIF87a')||txt(b,0,'GIF89a'))return'image/gif';
  if(txt(b,0,'RIFF')&&txt(b,8,'WEBP'))return'image/webp';
  if(txt(b,0,'RIFF')&&txt(b,8,'WAVE'))return'audio/wav';
  if(txt(b,0,'OggS'))return'audio/ogg';
  if(txt(b,4,'ftyp'))return'video/mp4';
  if(ar(b,0,0x1A,0x45,0xDF,0xA3))return'video/webm';
  // MP3: en ID3-tagg, eller en ljudram direkt (synkord 11 bitar, giltigt lager).
  if(txt(b,0,'ID3')||(b[0]===0xFF&&(b[1]&0xE0)===0xE0&&(b[1]&0x06)!==0))return'audio/mpeg';
  return'';
}
function cleanName(value){return String(value||'media').replace(/[^\p{L}\p{N}._ -]/gu,'').trim().slice(0,160)||'media'}
function validateMedia(input){const contentType=String(input?.contentType||'').toLowerCase(),size=Number(input?.size),sha256=String(input?.sha256||'').toLowerCase(),max=Number(process.env.MEDIA_MAX_MB||100)*1024*1024;if(!TYPES.has(contentType))throw Object.assign(new Error('Filtypen stöds inte'),{status:415});if(!Number.isSafeInteger(size)||size<1||size>max)throw Object.assign(new Error(`Filen får vara högst ${process.env.MEDIA_MAX_MB||100} MB`),{status:413});if(!/^[a-f0-9]{64}$/.test(sha256))throw Object.assign(new Error('SHA-256 saknas eller är ogiltig'),{status:400});return{contentType,size,sha256,originalName:cleanName(input.originalName),extension:EXT[contentType]}}
class MediaStorage{
  constructor(){const endpoint=process.env.OBJECT_ENDPOINT,credentials=process.env.OBJECT_ACCESS_KEY&&process.env.OBJECT_SECRET_KEY?{accessKeyId:process.env.OBJECT_ACCESS_KEY,secretAccessKey:process.env.OBJECT_SECRET_KEY}:undefined;this.bucket=process.env.OBJECT_BUCKET||'vyra-media';this.cdn=String(process.env.CDN_ORIGIN||'').replace(/\/$/,'');// requestChecksumCalculation: SDK:n lägger annars en CRC32 i varje signerad länk, räknad på en TOM
    // kropp vid signeringen (x-amz-checksum-crc32 i adressen). Webbläsaren laddar upp den riktiga
    // filen, så summan stämmer aldrig; en lagring som kontrollerar den avvisar uppladdningen.
    this.s3=new S3Client({region:process.env.OBJECT_REGION||'eu-north-1',endpoint:endpoint||undefined,forcePathStyle:!!endpoint,credentials,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'})}
  // OBJECT_KEY_PREFIX isolates a whole deployment inside a shared bucket, which is what lets a
  // staging environment exist without a second bucket and without any risk of it writing over
  // production's objects. Empty by default, so production keys are byte-for-byte what they were.
  // Normalised to exactly one trailing slash so 'staging', 'staging/' and 'staging//' behave alike.
  keyPrefix(){const raw=String(process.env.OBJECT_KEY_PREFIX||'').trim().replace(/^\/+|\/+$/g,'');return raw?raw+'/':''}
  key(workspaceId,assetId,extension){return`${this.keyPrefix()}workspaces/${workspaceId}/${assetId}.${extension}`}
  // KONTROLLSUMMAN SKA SKICKAS SOM HUVUD, INTE STÅ I ADRESSEN (2026-11-20). Signeraren flyttar annars
  // x-amz-meta-sha256 till länkens frågesträng. Cloudflare R2, som produktionen kör på, sparar inte
  // metadata därifrån: filen kom upp, men efterkontrollen hittade ingen summa och svarade 422 på varje
  // uppladdning. Med huvudet kvar utanför adressen blir det signerat, och klienten måste skicka det —
  // därför står det i requiredHeaders, som cloud-media.js redan skickar ordagrant.
  async uploadUrl(key,meta){return getSignedUrl(this.s3,new PutObjectCommand({Bucket:this.bucket,Key:key,ContentType:meta.contentType,ContentLength:meta.size,Metadata:{sha256:meta.sha256}}),{expiresIn:600,unhoistableHeaders:new Set(['x-amz-meta-sha256'])})}
  requiredHeaders(meta){return{'content-type':meta.contentType,'x-amz-meta-sha256':meta.sha256}}
  // Saknar objektet summan (en lagring som inte sparar metadata, eller en äldre klient) räknas den på
  // själva innehållet i stället. Det är dyrare men starkare: metadatan är bara vad klienten påstod.
  async contentSha256(key){const out=await this.s3.send(new GetObjectCommand({Bucket:this.bucket,Key:key})),hash=crypto.createHash('sha256');for await(const bit of out.Body)hash.update(bit);return hash.digest('hex')}
  async typeMatches(key,contentType){const out=await this.s3.send(new GetObjectCommand({Bucket:this.bucket,Key:key,Range:'bytes=0-63'})),bitar=[];let antal=0;for await(const bit of out.Body){bitar.push(Buffer.from(bit));antal+=bit.length;if(antal>=64)break}return sniffType(Buffer.concat(bitar).subarray(0,64))===String(contentType||'').toLowerCase()}
  async verify(key,expected){const head=await this.s3.send(new HeadObjectCommand({Bucket:this.bucket,Key:key}));if(Number(head.ContentLength)!==expected.size||String(head.ContentType||'').toLowerCase()!==expected.contentType)return false;const sparad=String(head.Metadata?.sha256||'').toLowerCase();return safeEqualHex(sparad||await this.contentSha256(key),expected.sha256)}
  async readUrl(key){if(this.cdn)return`${this.cdn}/${key.split('/').map(encodeURIComponent).join('/')}`;return getSignedUrl(this.s3,new GetObjectCommand({Bucket:this.bucket,Key:key}),{expiresIn:300})}
  async remove(key){await this.s3.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}))}
  async close(){this.s3.destroy()}
}
function safeEqualHex(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&a.length===64&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}
module.exports={MediaStorage,validateMedia,cleanName,safeEqualHex,sniffType,TYPES};
