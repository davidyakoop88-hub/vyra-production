'use strict';
// OBS-källans mätning: mellanlagret mellan overlay-matning.js (OBS) och vyra-problem.js (Studion).
// Det som provas är vitlistan och lagringens gränser — raden får aldrig bära mer än en nivå, en
// kort text och enkla tal, och listan får aldrig växa utan tak.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { ren, spara, las, nyckel, MAX_RADER, TTL_SEKUNDER } = require('../obs-matning');

// En Redis i miniatyr: bara de fyra anrop modulen gör.
function redis() {
  const listor = new Map(), ttl = new Map();
  return {
    ttl,
    lPush: async (k, v) => { const l = listor.get(k) || []; l.unshift(v); listor.set(k, l); },
    lTrim: async (k, a, b) => { listor.set(k, (listor.get(k) || []).slice(a, b + 1)); },
    expire: async (k, s) => { ttl.set(k, s); },
    lRange: async (k, a, b) => (listor.get(k) || []).slice(a, b + 1)
  };
}

test('en vanlig rad går igenom med nivå, text och tal', () => {
  const r = ren({ niva: 'varning', text: 'OBS-källan släpar: 3,2 s', data: { lagMaxMs: 3212.456, bildrutorPerS: 28, kvar: true } }, 1000);
  assert.deepEqual(r, { at: 1000, niva: 'varning', text: 'OBS-källan släpar: 3,2 s', data: { lagMaxMs: 3212.46, bildrutorPerS: 28, kvar: true } });
});

test('skräp kastas: ingen text, fel form, okänd nivå blir info', () => {
  assert.equal(ren(null), null);
  assert.equal(ren('text'), null);
  assert.equal(ren([{ text: 'x' }]), null);
  assert.equal(ren({ niva: 'fel', text: '   ' }), null);
  assert.equal(ren({ niva: 'katastrof', text: 'x' }).niva, 'info');
});

test('texten kapas och styrtecken tas bort; objekt och konstiga fältnamn följer inte med', () => {
  const r = ren({ text: 'a\u0000b\n' + 'x'.repeat(500), data: { bra_falt: 1, 'dålig nyckel': 2, objekt: { a: 1 }, lista: [1], fn: () => 1, langText: 'y'.repeat(200) } });
  assert.equal(r.text.length, 300);
  assert.doesNotMatch(r.text, /[\u0000-\u001f]/);
  assert.deepEqual(Object.keys(r.data).sort(), ['bra_falt', 'langText']);
  assert.equal(r.data.langText.length, 80);
});

test('högst tolv fält följer med', () => {
  const data = {};
  for (let i = 0; i < 30; i++) data['f' + i] = i;
  assert.equal(Object.keys(ren({ text: 'x', data }).data).length, 12);
});

test('listan har tak och livslängd, och läses äldst först efter en tidpunkt', async () => {
  const c = redis();
  for (let i = 1; i <= MAX_RADER + 25; i++) await spara(c, 'ws1', ren({ text: 'rad ' + i }, i));
  const alla = await las(c, 'ws1', 0);
  assert.equal(alla.length, MAX_RADER, 'listan växte förbi taket');
  assert.equal(alla[0].text, 'rad 26');
  assert.equal(alla[alla.length - 1].text, 'rad ' + (MAX_RADER + 25));
  assert.equal(c.ttl.get(nyckel('ws1')), TTL_SEKUNDER);
  const nya = await las(c, 'ws1', MAX_RADER + 23);
  assert.deepEqual(nya.map(r => r.text), ['rad ' + (MAX_RADER + 24), 'rad ' + (MAX_RADER + 25)]);
  assert.deepEqual(await las(c, 'annan-arbetsyta', 0), [], 'en arbetsyta läste en annans rader');
});

test('en trasig rad i lagringen stoppar inte läsningen', async () => {
  const c = redis();
  await c.lPush(nyckel('ws1'), '{inte json');
  await spara(c, 'ws1', ren({ text: 'hel' }, 5));
  assert.deepEqual((await las(c, 'ws1', 0)).map(r => r.text), ['hel']);
});

// ---- inkopplingen i server/index.js ----------------------------------------------------------
const INDEX = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const GREN = "if(rest==='matning'&&req.method==='POST'){";

test('OBS-länken får POST:a bara till /matning, och arbetsytan kommer ur länkens egen nyckel', () => {
  assert.ok(INDEX.includes("req.method!=='GET'&&!(req.method==='POST'&&publicAccess[2]==='matning')"));
  const gren = INDEX.slice(INDEX.indexOf(GREN));
  const slut = gren.indexOf('return send(res,202');
  assert.ok(slut > 0);
  const kod = gren.slice(0, slut);
  assert.ok(kod.includes('rateLimiter.exceeded(`obs-matning:${access.workspace_id}`'), 'rutten saknar takt-spärr');
  assert.ok(kod.includes('ObsMatning.spara(await eventBus.connect(),access.workspace_id,rad)'));
  assert.ok(!kod.includes('publish'), 'en mätrad får aldrig gå ut på händelsebussen');
});

test('abonnemangskontrollen ligger före mätrutten', () => {
  assert.ok(INDEX.indexOf("Billing.overlayPlan(pool,access.workspace_id)!=='premium'") < INDEX.indexOf(GREN));
});

test('Studion läser bara med medlemskap i arbetsytan', () => {
  const i = INDEX.indexOf('const obsMatning=p.match(');
  assert.ok(i > 0);
  assert.ok(INDEX.slice(i, i + 400).includes("membership(s.user_id,obsMatning[1],['owner','admin','editor','viewer'])"));
});
