'use strict';
function safeVersion(value){return String(value||'').replace(/[^0-9A-Za-z.+-]/g,'').slice(0,40)}
// Store-länken är FRIVILLIG och pekar på Microsofts egen produktsida. Är den satt byter klienten
// nedladdningsknappen från .exe-rutten till butiken; .exe-rutten (302) står orörd bredvid.
// Bara https://apps.microsoft.com/... godtas — en butikslänk som pekar någon annanstans är en
// felkonfiguration, inte en variant, och ska stoppa i stället för att skickas ut till användarna.
function storeUrl(raw){const value=String(raw||'').trim();if(!value)return undefined;let url;try{url=new URL(value)}catch{url=null}if(!url||url.protocol!=='https:'||url.hostname!=='apps.microsoft.com'||url.username||url.password||!/^\/detail\/[A-Za-z0-9]{12}(?:\/|$)/.test(url.pathname))throw Object.assign(new Error('DESKTOP_STORE_URL är ogiltig — ska vara https://apps.microsoft.com/detail/<Store-ID>'),{status:503});return url.toString()}
function release(env=process.env){const raw=String(env.DESKTOP_DOWNLOAD_URL||''),version=safeVersion(env.DESKTOP_VERSION),sha256=String(env.DESKTOP_SHA256||'').toLowerCase(),size=Number(env.DESKTOP_SIZE_BYTES||0);let url;try{url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{throw Object.assign(new Error('Desktopversionen är inte publicerad ännu'),{status:503})}if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<1024)throw Object.assign(new Error('Desktopversionens metadata är ofullständig'),{status:503});const out={url:url.toString(),version,sha256,sizeBytes:size,platform:'Windows 10/11',format:'EXE installer'};const butik=storeUrl(env.DESKTOP_STORE_URL);if(butik)out.storeUrl=butik;return out}
module.exports={release,safeVersion,storeUrl};
