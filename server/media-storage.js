'use strict';
const crypto=require('crypto');
const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm']);
const EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'};
function cleanName(value){return String(value||'media').replace(/[^\p{L}\p{N}._ -]/gu,'').trim().slice(0,160)||'media'}
function validateMedia(input){const contentType=String(input?.contentType||'').toLowerCase(),size=Number(input?.size),sha256=String(input?.sha256||'').toLowerCase(),max=Number(process.env.MEDIA_MAX_MB||100)*1024*1024;if(!TYPES.has(contentType))throw Object.assign(new Error('Filtypen stöds inte'),{status:415});if(!Number.isSafeInteger(size)||size<1||size>max)throw Object.assign(new Error(`Filen får vara högst ${process.env.MEDIA_MAX_MB||100} MB`),{status:413});if(!/^[a-f0-9]{64}$/.test(sha256))throw Object.assign(new Error('SHA-256 saknas eller är ogiltig'),{status:400});return{contentType,size,sha256,originalName:cleanName(input.originalName),extension:EXT[contentType]}}
class MediaStorage{
  constructor(){const endpoint=process.env.OBJECT_ENDPOINT,credentials=process.env.OBJECT_ACCESS_KEY&&process.env.OBJECT_SECRET_KEY?{accessKeyId:process.env.OBJECT_ACCESS_KEY,secretAccessKey:process.env.OBJECT_SECRET_KEY}:undefined;this.bucket=process.env.OBJECT_BUCKET||'vyra-media';this.cdn=String(process.env.CDN_ORIGIN||'').replace(/\/$/,'');this.s3=new S3Client({region:process.env.OBJECT_REGION||'eu-north-1',endpoint:endpoint||undefined,forcePathStyle:!!endpoint,credentials})}
  key(workspaceId,assetId,extension){return`workspaces/${workspaceId}/${assetId}.${extension}`}
  async uploadUrl(key,meta){return getSignedUrl(this.s3,new PutObjectCommand({Bucket:this.bucket,Key:key,ContentType:meta.contentType,ContentLength:meta.size,Metadata:{sha256:meta.sha256}}),{expiresIn:600})}
  async verify(key,expected){const head=await this.s3.send(new HeadObjectCommand({Bucket:this.bucket,Key:key}));return Number(head.ContentLength)===expected.size&&String(head.ContentType||'').toLowerCase()===expected.contentType&&String(head.Metadata?.sha256||'').toLowerCase()===expected.sha256}
  async readUrl(key){if(this.cdn)return`${this.cdn}/${key.split('/').map(encodeURIComponent).join('/')}`;return getSignedUrl(this.s3,new GetObjectCommand({Bucket:this.bucket,Key:key}),{expiresIn:300})}
  async remove(key){await this.s3.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}))}
  async close(){this.s3.destroy()}
}
function safeEqualHex(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&a.length===64&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}
module.exports={MediaStorage,validateMedia,cleanName,safeEqualHex,TYPES};
