'use strict';
const crypto=require('crypto'),S=require('./security'),Vault=require('./token-vault'),qrgen=require('qrcode-generator');
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer){let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5}}if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out}
function base32Decode(value){let bits=0,acc=0,out=[];for(const char of String(value).replace(/=|\s|-/g,'').toUpperCase()){const n=ALPHABET.indexOf(char);if(n<0)throw Error('Ogiltig MFA-hemlighet');acc=(acc<<5)|n;bits+=5;if(bits>=8){out.push((acc>>>(bits-8))&255);bits-=8}}return Buffer.from(out)}
function hotp(secret,counter){const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',key).update(buf).digest(),offset=h[19]&15,code=(h.readUInt32BE(offset)&0x7fffffff)%1000000;return String(code).padStart(6,'0')}
function verify(secret,code,now=Date.now()){const clean=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(clean))return false;const step=Math.floor(now/30000);for(let drift=-1;drift<=1;drift++)if(timingSafe(clean,hotp(secret,step+drift)))return true;return false}
function timingSafe(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function newSecret(){return base32Encode(crypto.randomBytes(20))}
function recoveryCodes(count=10){return Array.from({length:count},()=>`${crypto.randomBytes(4).toString('hex').slice(0,4)}-${crypto.randomBytes(4).toString('hex').slice(0,4)}`.toUpperCase())}
function hashRecovery(code){return S.digest(String(code||'').replace(/[^a-z0-9]/gi,'').toUpperCase())}
function uri(secret,email){return`otpauth://totp/${encodeURIComponent('VYRA:'+email)}?secret=${encodeURIComponent(secret)}&issuer=VYRA&algorithm=SHA1&digits=6&period=30`}
// QR-KODEN GENERERAS HAR, INTE I KLIENTEN, och inte for hand.
//
// Rutan visade tidigare bara nyckeln som text plus en otpauth-lank som ar DOD i en
// desktop-webblasare (ingen protokollhanterare). Varje kund pa dator fick knappa in 32 tecken.
//
// Handskriven QR-kodare var alternativet och valdes bort: en subtil bugg ger en kod som SER ratt
// ut och kodar fel hemlighet, i just det flode dar ett fel last ute anvandaren. `qrcode-generator`
// ar i stallet ETT paket med NOLL transitiva beroenden — jamfort med `qrcode`, som drar in 29
// paket inklusive en CLI-argumenttolkare.
//
// KORSKONTROLLERAD 2026-08-30 mot en oberoende implementation (`qrcode`) och en oberoende
// AVKODARE (`jsqr`): bada bibliotekens utdata avkodas tillbaka till exakt kall-URI:n. De valde
// olika maskmonster, vilket ar tillatet och darfor inte ett fel — det ar ocksa skalet till att
// provet avkodar i stallet for att jamfora bitmappar.
//
// Returnerar RADATA, inte markup: `storlek` plus en strang av '0'/'1' radvis. Klienten ritar den
// sjalv i en canvas, sa ingen serverproducerad HTML nar DOM:en.
function qrModuler(text){
  const q=qrgen(0,'M');q.addData(String(text||''));q.make();
  const n=q.getModuleCount();let s='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)s+=q.isDark(r,c)?'1':'0';
  return{storlek:n,moduler:s}
}
function encryptedSecret(secret){return Vault.seal(secret)}
function openSecret(value){return Vault.open(value)}
module.exports={base32Encode,base32Decode,hotp,verify,newSecret,recoveryCodes,hashRecovery,uri,qrModuler,encryptedSecret,openSecret,timingSafe};
