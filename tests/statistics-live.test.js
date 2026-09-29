const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('studio.html','utf8');
const studio=fs.readFileSync('studio.js','utf8');
const client=fs.readFileSync('statistics-live.js','utf8');
const css=fs.readFileSync('statistics-live.css','utf8');

test('Statistik-vyn laddar sin riktiga klient och stil',()=>{
  assert.match(html,/statistics-live\.css\?v=20260919-1/);
  assert.match(html,/statistics-live\.js\?v=20260919-1/);
  assert.match(studio,/data-statistics-page/);
  assert.match(studio,/data-stats-total="gifts"/);
  assert.match(studio,/data-stats-total="diamonds"/);
  assert.match(studio,/data-stats-total="likes"/);
});

test('klienten hämtar workspace-statistik för den valda perioden',()=>{
  assert.match(client,/VyraCloudSync\?\.current\?\.\(\)\?\.workspace/);
  assert.match(client,/VyraAuth\?\.api/);
  assert.match(client,/\/api\/workspaces\/\$\{encodeURIComponent\(workspace\.id\)\}\/stats\?period=/);
  for(const period of ['7d','30d','90d','all'])assert.match(studio,new RegExp(`data-stats-period="${period}"`));
});

test('API-svaret ritas som totalsiffror, livedagar och toppsupportrar',()=>{
  assert.match(client,/data\?\.totalt\?\.\[key\]/);
  assert.match(client,/data\?\.dagar/);
  assert.match(client,/data\?\.toppGivare/);
  assert.match(client,/giver\.bastaGava\?\.namn/);
  assert.match(css,/\.statistics-chart/);
  assert.match(css,/\.statistics-supporters/);
});

test('TikTok-namn och avatar tolkas inte som HTML eller osäkra URL:er',()=>{
  assert.match(client,/name\.textContent=/);
  assert.match(client,/\^https\?:\\\/\\\//);
  assert.doesNotMatch(client,/innerHTML/);
});

test('sidan har tydliga laddnings-, tom- och fellägen',()=>{
  assert.match(client,/Väntar på ditt konto och din arbetsyta/);
  assert.match(client,/Ingen TikTok är ansluten/);
  assert.match(client,/Ingen historik ännu/);
  assert.match(client,/Statistiken kunde inte hämtas just nu/);
});
