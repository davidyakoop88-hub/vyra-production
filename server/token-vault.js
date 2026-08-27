'use strict';
const crypto=require('crypto'),Nyckel=require('./krypteringsnyckel');
// Nyckeln tolkas av krypteringsnyckel.js — samma strikta form som uppstarten kraver och som
// heart-me-goal.js harleder sin HMAC ur. Egen tolkning har vore ett andra, tystare krav.
function key(){return Nyckel.krav(process.env.APP_ENCRYPTION_KEY)}
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,encrypted]).toString('base64url')}
function open(value){const data=Buffer.from(String(value),'base64url'),iv=data.subarray(0,12),tag=data.subarray(12,28),encrypted=data.subarray(28),decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8')}
module.exports={seal,open};
