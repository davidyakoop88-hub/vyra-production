'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');

test('desktop requires the production account before opening local Studio',()=>{
  assert.match(source,/const CLOUD_ORIGIN = 'https:\/\/vyralive\.app'/);
  const login=source.indexOf('studio.html?desktop-auth=1');
  const local=source.indexOf('studio.html?desktop=1');
  assert.ok(login>=0,'remote login entry is missing');
  assert.ok(local>login,'local Studio must open only after the remote login gate');
  assert.match(source,/fetch\('\/api\/auth\/me'/);
  assert.match(source,/if\(authenticated\)/);
});
