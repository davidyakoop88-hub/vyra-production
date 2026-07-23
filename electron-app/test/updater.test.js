'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const U=require('../updater');
const crypto=require('crypto'),{Readable}=require('stream');
test('semantic versions only move forward',()=>{assert.equal(U.isNewer('1.2.0','1.1.9'),true);assert.equal(U.isNewer('1.0.0','1.0.0'),false);assert.equal(U.isNewer('bad','1.0.0'),false);assert.equal(U.isNewer('1.0.0','1.0.0-beta.1'),true)});
test('update origin must be credential-free HTTPS',()=>{assert.equal(U.validateOrigin('https://app.example.com/path'),'https://app.example.com');assert.throws(()=>U.validateOrigin('http://app.example.com'));assert.throws(()=>U.validateOrigin('https://user:pass@app.example.com'))});
test('release metadata requires checksum and bounded size',()=>{const good=U.validateMetadata({version:'1.2.3',sha256:'a'.repeat(64),sizeBytes:1024});assert.equal(good.version,'1.2.3');assert.throws(()=>U.validateMetadata({version:'1.2.3',sha256:'bad',sizeBytes:1024}));assert.throws(()=>U.validateMetadata({version:'1.2.3',sha256:'a'.repeat(64),sizeBytes:U.MAX_INSTALLER_BYTES+1}))});
test('file checksum is deterministic',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vyra-update-')),file=path.join(dir,'x');fs.writeFileSync(file,'VYRA');assert.equal(await U.sha256File(file),'b2ac007143b880cb05eacdcd7f94c7e1f200dac53aa58c09bb4920a7647bcf05');fs.rmSync(dir,{recursive:true,force:true})});
test('installer download is saved only after size and checksum verification',async()=>{
  const bytes=Buffer.alloc(2048,7),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'vyra-installer-')),target=path.join(dir,'VYRA-Setup.exe');
  const fake=async()=>({ok:true,url:'https://downloads.example/VYRA-Setup.exe',headers:new Headers({'content-length':String(bytes.length)}),body:Readable.toWeb(Readable.from(bytes))});
  await U.downloadRelease('https://app.example.com',{version:'1.2.3',sha256,sizeBytes:bytes.length},target,fake);
  assert.deepEqual(fs.readFileSync(target),bytes);assert.equal(fs.existsSync(target+'.download'),false);fs.rmSync(dir,{recursive:true,force:true});
});
test('checksum mismatch never leaves an installable exe',async()=>{
  const bytes=Buffer.alloc(2048,9),dir=fs.mkdtempSync(path.join(os.tmpdir(),'vyra-installer-')),target=path.join(dir,'VYRA-Setup.exe');
  const fake=async()=>({ok:true,url:'https://downloads.example/VYRA-Setup.exe',headers:new Headers({'content-length':String(bytes.length)}),body:Readable.toWeb(Readable.from(bytes))});
  await assert.rejects(()=>U.downloadRelease('https://app.example.com',{version:'1.2.3',sha256:'a'.repeat(64),sizeBytes:bytes.length},target,fake),/kontrollsumma/);
  assert.equal(fs.existsSync(target),false);assert.equal(fs.existsSync(target+'.download'),false);fs.rmSync(dir,{recursive:true,force:true});
});
