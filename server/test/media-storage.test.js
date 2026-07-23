'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateMedia,cleanName,safeEqualHex}=require('../media-storage');
test('media metadata is allowlisted and normalized',()=>{const m=validateMedia({contentType:'image/png',size:1024,sha256:'a'.repeat(64),originalName:'<hero>.png'});assert.equal(m.extension,'png');assert.equal(m.originalName,'hero.png')});
test('dangerous types, sizes and hashes are rejected',()=>{assert.throws(()=>validateMedia({contentType:'text/html',size:10,sha256:'a'.repeat(64)}));assert.throws(()=>validateMedia({contentType:'image/png',size:0,sha256:'a'.repeat(64)}));assert.throws(()=>validateMedia({contentType:'image/png',size:10,sha256:'wrong'}))});
test('hash comparison is constant-time compatible',()=>{assert.equal(safeEqualHex('a'.repeat(64),'a'.repeat(64)),true);assert.equal(safeEqualHex('a'.repeat(64),'b'.repeat(64)),false);assert.equal(safeEqualHex('short','short'),false)});
