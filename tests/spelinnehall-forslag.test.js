'use strict';
// FÖRSLAGSVERKTYGET (scripts/spelinnehall-forslag.js, steg 3, 2026-11-23). Verktyget läser, kontrollerar och skriver
// spelinnehall.js. Det viktigaste är att det är SNÄLLARE än människan på ett enda sätt — det släpper aldrig igenom något som
// widgetarna skulle avvisa — och att det aldrig skriver utan --skriv. Nätet ersätts i alla prov av en låtsashämtning.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'scripts', 'spelinnehall-forslag.js'));
const lasa = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const nod = S.nodstart();
const nuvarande = () => S.las(lasa('spelinnehall.js'));
const fraga = (extra = {}) => ({ fraga: 'Vilken färg har himlen en klar dag?', svar: ['Grön', 'Blå', 'Röd'], ratt: 1, kalla: 'https://sv.wikipedia.org/wiki/Himmel', ...extra });

test('filen skrivs tillbaka byte för byte, så att en ändring bara visar de nya raderna', () => {
  const t = lasa('spelinnehall.js'), { huvud, data } = S.las(t);
  assert.equal(S.skriv(huvud, data), t);
  assert.deepEqual(S.granska(data, nod.id), [], 'den riktiga filen ska vara fri från formfel');
});

test('versionen räknas upp samma dag och återställs en ny dag', () => {
  assert.equal(S.nyVersion('20261123-1', '2026-11-23'), '20261123-2');
  assert.equal(S.nyVersion('20261123-9', '2026-11-23'), '20261123-10');
  assert.equal(S.nyVersion('20261123-4', '2026-11-30'), '20261130-1');
  assert.equal(S.nyVersion('trasig', '2026-11-30'), '20261130-1');
});

test('en giltig fråga läggs sist i sitt paket med nästa id, och versionen räknas upp', () => {
  const { data } = nuvarande(), fore = data.quiz.paket.allmansvar.fragor.length;
  const r = S.laggTill(data, { quiz: { allmansvar: [fraga()] } }, { idag: '2026-12-07', nod });
  assert.equal(r.avvisade.length, 0);
  assert.equal(r.tillagda.length, 1);
  const sist = r.data.quiz.paket.allmansvar.fragor.at(-1);
  assert.equal(sist[0], 'ha' + (fore + 1), 'nästa id i paketets egen serie');
  assert.equal(r.data.quiz.paket.allmansvar.fragor.length, fore + 1);
  assert.equal(r.data.version, '20261207-1');
  assert.equal(data.quiz.paket.allmansvar.fragor.length, fore, 'indata ska inte ändras');
});

test('ogiltiga och dubbla förslag avvisas med skäl, och inget skrivs om inget är giltigt', () => {
  const { data } = nuvarande(), v = data.version;
  const forslag = { quiz: { allmansvar: [
    fraga({ fraga: 'Vilken gas utgör störst del av jordens atmosfär?' }),                       // finns redan (annan versal/skiljetecken)
    fraga({ fraga: 'vilken GAS utgör störst del av jordens atmosfär' + '?' }),
    fraga({ ratt: 3 }), fraga({ svar: ['Blå', 'Blå', 'Röd'] }), fraga({ svar: ['A', 'B'] }),
    fraga({ fraga: 'Ett påstående utan frågetecken' }), fraga({ kalla: '' }), fraga({ fraga: 'x'.repeat(141) + '?' }),
    null, 'text'], hittepa: [fraga()] } };
  const r = S.laggTill(data, forslag, { idag: '2030-01-01', nod });
  assert.equal(r.tillagda.length, 0);
  assert.equal(r.avvisade.length, 11);
  assert.equal(r.data.version, v, 'ingen ändring betyder ingen ny version');
  assert.ok(r.avvisade.some(a => /finns redan/.test(a.skal)));
  assert.ok(r.avvisade.some(a => /okänt paket/.test(a.skal)));
});

test('startpaketens frågor räknas som dubbletter, även om de inte ligger i spelinnehall.js', () => {
  const { data } = nuvarande();
  const r = S.laggTill(data, { quiz: { allmansvar: [fraga({ fraga: 'Vilken planet kallas den röda planeten?' })] } }, { nod });
  assert.equal(r.tillagda.length, 0);
  assert.match(r.avvisade[0].skal, /finns redan/);
});

test('ett nytt paket kräver namn och prefix, och kan inte heta egna eller som ett startpaket', () => {
  const { data } = nuvarande();
  const ok = S.laggTill(data, { quiz: { musiksvar: { namn: 'Musik · svår', prefix: 'hm', fragor: [fraga(), fraga({ fraga: 'Vilken färg har gräs?', svar: ['Grön', 'Blå', 'Röd'], ratt: 0 })] } } }, { nod });
  assert.deepEqual(ok.tillagda.map(t => t.post[0]), ['hm1', 'hm2']);
  assert.equal(ok.data.quiz.paket.musiksvar.namn, 'Musik · svår');
  for (const namn of ['egna', 'allman', 'Stora', 'sport']) {
    const r = S.laggTill(data, { quiz: { [namn]: { namn: 'X', prefix: 'hx', fragor: [fraga()] } } }, { nod });
    assert.equal(r.tillagda.length, 0, namn);
  }
  assert.equal(S.laggTill(data, { quiz: { nyttpaket: { namn: 'X', prefix: 'FEL1', fragor: [fraga()] } } }, { nod }).tillagda.length, 0);
});

test('ord: giltiga läggs sist, dubbletter (även mot nödlistan), ogiltiga och avslöjande ledtrådar avvisas', () => {
  const { data } = nuvarande(), antal = data.ordjakt.ord.length;
  const r = S.laggTill(data, { ordjakt: [
    { ord: 'provordxq', ledtrad: 'Tar sig upp på toppar' },
    { ord: 'BANAN', ledtrad: 'finns i nödlistan' }, { ord: 'KOMPASS', ledtrad: 'finns i filen' },
    { ord: 'AB', ledtrad: 'för kort' }, { ord: 'RÄKNING1', ledtrad: 'siffra' }, { ord: 'FJÄRRSTYRNING', ledtrad: 'Ordet FJÄRRSTYRNING avslöjas' },
    { ord: 'LÅNGTLÅNGTORDHÄR', ledtrad: 'för långt' }, {}, null] }, { nod });
  assert.deepEqual(r.tillagda.map(t => t.post[0]), ['PROVORDXQ'], 'gemener görs till versaler');
  assert.equal(r.avvisade.length, 8);
  assert.equal(r.data.ordjakt.ord.length, antal + 1);
  assert.deepEqual(r.data.ordjakt.ord.at(-1), ['PROVORDXQ', 'Tar sig upp på toppar']);
});

test('för många förslag på en gång avvisas — en körning ska gå att läsa igenom', () => {
  const { data } = nuvarande();
  const manga = Array.from({ length: 45 }, (_, i) => fraga({ fraga: `Fråga nummer ${i} om himlen?` }));
  const r = S.laggTill(data, { quiz: { allmansvar: manga } }, { nod });
  assert.equal(r.tillagda.length, 40);
  assert.equal(r.avvisade.length, 5);
});

test('det verktyget släpper igenom godkänns också av widgetarna (samma regler, ingen tyst bortsortering)', () => {
  const t = lasa('spelinnehall.js'), { huvud, data } = S.las(t);
  const r = S.laggTill(data, { quiz: { allmansvar: [fraga()], musiksvar: { namn: 'Musik · svår', prefix: 'hm', fragor: [fraga({ fraga: 'Vilken färg har gräs?', svar: ['Grön', 'Blå', 'Röd'], ratt: 0 })] } }, ordjakt: [{ ord: 'PROVORDXQ', ledtrad: 'Tar sig upp på toppar' }] }, { nod });
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously' }), w = dom.window;
  try {
    w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
    w.state = { widgets: [] }; w.setInterval = () => 0;
    w.eval(S.skriv(huvud, r.data)); w.eval(lasa('quiz.js')); w.eval(lasa('ordjakten.js'));
    for (const [k, p] of Object.entries(r.data.quiz.paket)) assert.equal(w.VyraQuiz.PAKET[k].fragor.length, p.fragor.length, k);
    assert.equal(w.VyraOrdjakten.ORD.length, 32 + r.data.ordjakt.ord.length);
  } finally { w.close(); }
});

test('källkontroll: ok, belägg på källans språk, varning, fel och definition som källa', async () => {
  const post = ['x1', 'Vilket organ tillverkar insulin?', ['Levern', 'Njurarna', 'Bukspottkörteln'], 2, 'https://en.wikipedia.org/wiki/Insulin'];
  const sida = t => async () => ({ status: 200, text: `<html><script>var x="pancreas"</script><body><p>${t}</p></body></html>` });
  assert.equal((await S.kontrolleraKalla(post, sida('Insulin is made by the pancreas'), ['pancreas'])).niva, 'ok');
  assert.equal((await S.kontrolleraKalla(post, sida('Insulin is a hormone'), ['pancreas'])).niva, 'varning');
  assert.equal((await S.kontrolleraKalla(post, sida('Insulin tillverkas i Bukspottkörteln'))).niva, 'ok', 'svaret på sidan räcker utan belägg');
  assert.equal((await S.kontrolleraKalla(post, async () => ({ status: 404, text: '' }))).niva, 'fel');
  assert.equal((await S.kontrolleraKalla(post, async () => { throw new Error('timeout'); })).niva, 'fel');
  assert.equal((await S.kontrolleraKalla(post, sida('<script>pancreas</script> inget annat'), ['pancreas'])).niva, 'varning', 'text i script räknas inte');
  assert.equal((await S.kontrolleraKalla([...post.slice(0, 4), 'Matematisk definition: ...'], async () => { throw new Error('ska inte anropas'); })).niva, 'ok');
});

test('källkontroll: tal jämförs oavsett decimaltecken', () => {
  assert.ok(S.svarsvarianter('3,05 meter').includes('3.05'));
  assert.ok(S.svarsvarianter('42,195 km').includes('42.195'));
  assert.ok(S.text_av_html('<p>Height: 3.05&nbsp;m</p>').includes('3.05 m'));
});

test('rapporten visar varje ny post, källkontrollens utfall och de avvisade förslagen', () => {
  const { data } = nuvarande();
  const r = S.laggTill(data, { quiz: { allmansvar: [fraga({ fraga: 'Vilken färg har | gräs?', svar: ['Grön', 'Blå', 'Röd'], ratt: 0 }), fraga({ ratt: 7 })] }, ordjakt: [{ ord: 'PROVORDXQ', ledtrad: 'Tar sig upp på toppar' }] }, { idag: '2026-12-07', nod });
  const md = S.rapport({ ...r, kallor: new Map([[r.tillagda[0].post[0], { niva: 'varning', skal: 'svaret saknas' }]]), version: r.data.version });
  assert.match(md, /Nytt spelinnehåll · version 20261207-1/);
  assert.match(md, /1 frågor och 1 ord/);
  assert.match(md, /⚠️ svaret saknas/);
  assert.match(md, /PROVORDXQ/);
  assert.match(md, /Avvisade förslag/);
  assert.match(md, /Vilken färg har \\\| gräs\?/, 'lodräta streck i en fråga bryter inte tabellen');
  assert.match(md, /granskad och sammanslagen/);
});

test('kommandoraden: utan --skriv skrivs ingenting, och en förslagsfil krävs', () => {
  const fore = lasa('spelinnehall.js'), tmp = path.join(require('node:os').tmpdir(), 'vyra-forslag-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify({ quiz: { allmansvar: [fraga()] }, ordjakt: [{ ord: 'PROVORDXQ', ledtrad: 'Tar sig upp på toppar' }] }));
  try {
    const kor = (...a) => cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'spelinnehall-forslag.js'), ...a], { encoding: 'utf8' });
    const prov = kor('lagg-till', tmp);
    assert.equal(prov.status, 0, prov.stderr);
    assert.match(prov.stdout, /Provkörning: 2 skulle läggas till/);
    assert.equal(lasa('spelinnehall.js'), fore, 'provkörningen får inte ändra filen');
    assert.equal(kor('lagg-till').status, 2);
    assert.equal(kor('nonsens').status, 2);
    assert.equal(kor('kontrollera').status, 0);
  } finally { fs.rmSync(tmp, { force: true }); }
});
