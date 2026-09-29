const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('studio.html','utf8');
const js=fs.readFileSync('agency-test.js','utf8');
const css=fs.readFileSync('agency-test.css','utf8')+fs.readFileSync('agency-test-v2.css','utf8')+fs.readFileSync('agency-test-v3.css','utf8');

test('Agencies finns som en tydligt markerad testflik i Studio',()=>{
  assert.match(html,/data-extra="agencies"/);
  assert.match(html,/Agencies <small>TEST<\/small>/);
  // -1 2026-09-20: titel och brodsmula foljer navetiketten (nav-state-kontraktet).
  assert.match(html,/agency-test\.js\?v=20260920-1/);
  assert.match(html,/agency-test\.css\?v=20260919-2/);
});

test('testvyn använder neutrala agencies och säger att datan inte är riktig',()=>{
  assert.match(js,/Test Agency North/);
  assert.match(js,/Test Agency Europe/);
  assert.match(js,/Test Agency Global/);
  assert.match(js,/kontaktvägar ersätts med riktiga uppgifter senare/);
  assert.match(js,/TESTPROFIL/);
});

test('fliken har inget eget ansöknings- eller lagringsflöde',()=>{
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/XMLHttpRequest/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.doesNotMatch(js,/agencyTestSubmit|agencyTestApply|applications\.unshift/);
  assert.doesNotMatch(js,/Jag är intresserad/);
});

test('agencyvyn har responsiv layout och synligt testläge',()=>{
  assert.match(css,/\.agency-test-banner/);
  assert.match(css,/@media\(max-width:850px\)/);
  assert.match(css,/\.agency-test-layout/);
});

test('varje agencyprofil har bild, information och direkta kontaktvägar',()=>{
  assert.match(js,/image:'assets\/images\//);
  assert.match(js,/contactName:'Nora Testkontakt'/);
  assert.match(js,/contactRole:'Creator Manager'/);
  assert.match(js,/email:'north@example\.test'/);
  assert.match(js,/snap:'testagency_north'/);
  assert.match(js,/KONTAKTPERSON · TEST/);
  assert.match(js,/mailto:/);
  assert.match(js,/snapchat\.com\/add/);
  assert.match(css,/\.agency-test-cover/);
  assert.match(css,/\.agency-test-contact/);
});

test('antal creators visas inte någonstans i agencyvyn',()=>{
  assert.doesNotMatch(js,/creators|test-creators/i);
  assert.match(css,/no creator counts/);
});

