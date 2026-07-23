'use strict';
const crypto=require('crypto');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(v){const email=String(v||'').trim().toLowerCase();if(email.length>254||!EMAIL.test(email))throw Object.assign(new Error('Ogiltig e-postadress'),{status:400});return email}
function validatePassword(v){const p=String(v||'');if(p.length<12||p.length>128)throw Object.assign(new Error('Lösenordet måste vara 12–128 tecken'),{status:400});return p}
function hashPassword(password,salt=crypto.randomBytes(16)){const key=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return`scrypt$16384$${salt.toString('base64url')}$${key.toString('base64url')}`}
function verifyPassword(password,stored){try{const[alg,n,salt,key]=stored.split('$');if(alg!=='scrypt')return false;const actual=crypto.scryptSync(password,Buffer.from(salt,'base64url'),64,{N:Number(n),r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(actual,Buffer.from(key,'base64url'))}catch{return false}}
function token(bytes=32){return crypto.randomBytes(bytes).toString('base64url')}
function digest(value){return crypto.createHash('sha256').update(String(value)).digest('hex')}
function parseCookies(header=''){return Object.fromEntries(String(header).split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}))}
function sessionCookie(value,maxAge){return`vyra_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
function clearCookie(){return'vyra_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}
function safeText(v,max=120){return String(v||'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,max)}
function validOverlayState(v){return !!(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v.widgets)&&v.widgets.length<=500&&v.widgets.every(w=>w&&typeof w==='object'&&typeof w.id==='string'&&w.id.length>0&&w.id.length<=160))}
module.exports={normalizeEmail,validatePassword,hashPassword,verifyPassword,token,digest,parseCookies,sessionCookie,clearCookie,safeText,validOverlayState};
