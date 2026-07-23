'use strict';
const crypto=require('crypto');
function key(){const raw=process.env.APP_ENCRYPTION_KEY;if(!raw)throw Error('APP_ENCRYPTION_KEY saknas');const value=Buffer.from(raw,'base64url');if(value.length!==32)throw Error('APP_ENCRYPTION_KEY måste vara 32 bytes base64url');return value}
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,encrypted]).toString('base64url')}
function open(value){const data=Buffer.from(String(value),'base64url'),iv=data.subarray(0,12),tag=data.subarray(12,28),encrypted=data.subarray(28),decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8')}
module.exports={seal,open};
