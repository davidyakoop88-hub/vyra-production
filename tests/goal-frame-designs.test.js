'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),premium=fs.readFileSync(path.join(ROOT,'premium-final.js'),'utf8');
const files=['pulse-rail.png','pulse-tower.png','signal-ribbon.png','heart-column.png','prism-core.png','prism-spine.png'];
test('alla sex nya transparenta goal-assets finns i repot',()=>{for(const file of files)assert.ok(fs.existsSync(path.join(ROOT,'assets','goal-new',file)),`${file} saknas`)});
test('renderaren använder endast den nya goal-familjen',()=>{for(const file of files)assert.match(premium,new RegExp(file.replace('.','\\.')));for(const old of ['rose-crystal-frame.webp','pink-crown-frame.webp','sapphire-dragon-frame.webp','azure-wing-frame.webp'])assert.doesNotMatch(premium,new RegExp(old.replace('.','\\.')));assert.match(premium,/class="goal-new-art"/);assert.match(premium,/data-goal-fill/);assert.match(premium,/data-goal-pct/)});
