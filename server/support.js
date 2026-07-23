'use strict';
const crypto=require('crypto');
const CATEGORIES=new Set(['technical','billing','account','tiktok','feedback','other']);
function text(value,max){return String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g,'').trim().slice(0,max)}
function ticket(input={}){const category=CATEGORIES.has(input.category)?input.category:'other',subject=text(input.subject,160),message=text(input.message,5000);if(subject.length<4||message.length<10)throw Object.assign(new Error('Ämne eller beskrivning är för kort'),{status:400});return{category,subject,message}}
function errorReport(input={}){const message=text(input.message,500),source=text(input.source,200),stack=text(input.stack,3000).replace(/https?:\/\/[^\s)]+/g,'[url]'),context=text(input.context,80),fingerprint=crypto.createHash('sha256').update(`${message}|${source}|${stack.split('\n')[0]||''}`).digest('hex');if(!message)return null;return{message,source,stack,context,fingerprint}}
module.exports={CATEGORIES,text,ticket,errorReport};
