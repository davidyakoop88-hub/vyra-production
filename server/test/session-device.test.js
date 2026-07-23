'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{describe}=require('../session-device');
test('session devices are reduced to safe browser and OS labels',()=>{assert.deepEqual(describe('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/124.0 Safari/537.36'),{browser:'Chrome',os:'Windows',label:'Chrome på Windows'});assert.equal(describe('<script>').label,'Okänd webbläsare på Okänd enhet')});
test('Edge is not mislabeled as Chrome',()=>{assert.equal(describe('Windows NT Edg/125.0 Chrome/125.0').browser,'Microsoft Edge')});
