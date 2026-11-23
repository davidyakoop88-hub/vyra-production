#!/usr/bin/env node
'use strict';
// SPELINNEHÅLLETS FÖRSLAGSVERKTYG (steg 3, 2026-11-23). Tar emot FÖRESLAGNA frågor och ord, kontrollerar dem och lägger
// in dem i spelinnehall.js — men publicerar aldrig något själv. Det som kommer ut är en ändring i en gren som en människa
// läser igenom och slår ihop. Ingen fråga når en sändning utan att någon har godkänt den.
//
//   node scripts/spelinnehall-forslag.js kontrollera [--kallor]
//       Kontrollerar att hela spelinnehall.js har rätt form. Med --kallor hämtas varje källa och två saker mäts:
//       FEL     källan svarar inte (annan status än 200, nätfel, timeout)       -> posten kan inte granskas
//       VARNING det rätta svaret hittas inte i källans text                     -> kolla för hand
//       "Svaret finns på sidan" är en tumregel och inget bevis: den fångar länkar som pekar fel och svar som blivit fel,
//       men missar ett svar som står på sidan fast i ett annat sammanhang. Därför är granskningen mänsklig.
//
//   node scripts/spelinnehall-forslag.js lagg-till forslag.json [--kallor] [--skriv] [--rapport fil.md] [--strikt]
//       Provkör förslagen (utan --skriv skrivs ingenting). Ogiltiga och dubbla poster avvisas med skäl; resten läggs sist
//       i sina paket med nya id, versionen räknas upp, och en rapport för granskaren skrivs som markdown.
//
// FÖRSLAGSFILEN (JSON):
//   { "quiz":    { "allmansvar": [ { "fraga": "…?", "svar": ["A","B","C"], "ratt": 1, "kalla": "https://…", "belagg": "nitrogen" } ],
//                  "nyttpaket":  { "namn": "Musik · svår", "prefix": "hm", "fragor": [ … ] } },
//     "ordjakt": [ { "ord": "KOMPASS", "ledtrad": "Pekar mot norr" } ] }
//   Ett befintligt paket får en lista; ett nytt paket får ett objekt med namn, prefix (små bokstäver) och fragor.
//   "belagg" (valfritt, text eller lista) är ord på KÄLLANS språk som ska stå på sidan, t.ex. "nitrogen" när källan är engelsk och
//   svaret "Kväve". Sätt det alltid för engelska källor — annars ger källkontrollen en onödig varning.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const FIL = path.join(__dirname, '..', 'spelinnehall.js');
const MAX_FRAGOR = 40, MAX_ORD = 40;

// ---------- samma regler som widgetarna (quiz.js och ordjakten.js) — tests/spelinnehall-forslag.test.js vaktar att de håller ihop ----------
const giltigFraga = f => Array.isArray(f) && typeof f[0] === 'string' && !!f[0] && typeof f[1] === 'string' && !!f[1] && Array.isArray(f[2]) && f[2].length === 3
  && f[2].every(x => typeof x === 'string' && !!x) && new Set(f[2]).size === 3 && Number.isInteger(f[3]) && f[3] >= 0 && f[3] <= 2;
const giltigtOrd = o => Array.isArray(o) && typeof o[0] === 'string' && /^[\p{Lu}]{4,14}$/u.test(o[0]) && typeof o[1] === 'string' && o[1].length <= 60 && !o[1].toUpperCase().includes(o[0]);

const normText = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const ärUrl = s => /^https?:\/\/\S+$/i.test(String(s || ''));

// ---------- läsa och skriva filen i EXAKT samma format, så att en ändring bara visar de nya raderna ----------
function las(text) {
  const start = text.indexOf('(function () {');
  if (start < 0) throw new Error('spelinnehall.js: hittar inte (function () {');
  const sandlada = { window: {} };
  vm.runInNewContext(text, sandlada, { timeout: 2000 });
  const data = JSON.parse(JSON.stringify(sandlada.window.VyraSpelinnehall || null));
  if (!data || !data.quiz || !data.quiz.paket || !data.ordjakt || !Array.isArray(data.ordjakt.ord)) throw new Error('spelinnehall.js: innehållet har fel form');
  return { huvud: text.slice(0, start), data };
}
function skriv(huvud, data) {
  const paket = Object.entries(data.quiz.paket).map(([k, p]) => `    ${k}: { namn: ${q(p.namn)}, fragor: [\n`
    + p.fragor.map(f => `      [${q(f[0])}, ${q(f[1])}, [${f[2].map(q).join(', ')}], ${f[3]}, ${q(f[4])}]`).join(',\n') + ']\n    }').join(',\n');
  const ord = data.ordjakt.ord.map(o => `    [${q(o[0])}, ${q(o[1])}]`).join(',\n');
  return huvud + `(function () {\n  'use strict';\n  window.VyraSpelinnehall = {\n    version: ${q(data.version)},\n    quiz: { paket: {\n${paket}\n    } },\n    ordjakt: { ord: [\n${ord}\n    ] }\n  };\n})();\n`;
}
function nyVersion(version, idag) {
  const dag = idag.replace(/-/g, '').slice(0, 8), m = /^(\d{8})-(\d+)$/.exec(version || '');
  return m && m[1] === dag ? `${dag}-${Number(m[2]) + 1}` : `${dag}-1`;
}

// ---------- granska hela innehållet ----------
function granska(data, nodPaketId = []) {
  const fel = [], id = new Set(nodPaketId), text = new Map();
  if (!/^\d{8}-\d+$/.test(data.version || '')) fel.push('versionen ska ha formen ÅÅÅÅMMDD-n');
  for (const [k, p] of Object.entries(data.quiz.paket)) {
    if (!/^[a-z0-9]+$/.test(k) || k === 'egna') fel.push(`paketnyckeln ${k} är ogiltig`);
    if (!p || typeof p.namn !== 'string' || !p.namn || !Array.isArray(p.fragor)) { fel.push(`paketet ${k} saknar namn eller frågor`); continue; }
    for (const f of p.fragor) {
      if (!giltigFraga(f)) { fel.push(`${k}: ogiltig fråga ${JSON.stringify(f && f[0])}`); continue; }
      if (typeof f[4] !== 'string' || f[4].length < 10) fel.push(`${k}: ${f[0]} saknar källa`);
      if (id.has(f[0])) fel.push(`dubbelt id ${f[0]}`); id.add(f[0]);
      const t = normText(f[1]);
      if (text.has(t)) fel.push(`samma fråga två gånger: ${f[0]} och ${text.get(t)}`); else text.set(t, f[0]);
    }
  }
  const sett = new Set();
  for (const o of data.ordjakt.ord) {
    if (!giltigtOrd(o)) { fel.push(`ogiltigt ord ${JSON.stringify(o && o[0])}`); continue; }
    if (sett.has(o[0])) fel.push(`dubblett bland orden: ${o[0]}`); sett.add(o[0]);
  }
  return fel;
}

// ---------- lägga till förslag ----------
function idPrefix(paket) {
  const antal = {};
  for (const f of paket.fragor) { const m = /^([a-z]+)\d+$/.exec(f[0]); if (m) antal[m[1]] = (antal[m[1]] || 0) + 1; }
  return Object.keys(antal).sort((a, b) => antal[b] - antal[a])[0] || null;
}
function nastaId(paket, prefix) {
  let hogsta = 0;
  for (const f of paket.fragor) { const m = new RegExp('^' + prefix + '(\\d+)$').exec(f[0]); if (m) hogsta = Math.max(hogsta, Number(m[1])); }
  return prefix + (hogsta + 1);
}
// nodStart: startpaketens id och texter (ligger kvar i quiz.js) och nödlistans ord (ligger kvar i ordjakten.js) — nya poster får inte krocka med dem.
function laggTill(data, forslag, { idag, nod = { id: [], text: [], ord: [] } } = {}) {
  const ut = JSON.parse(JSON.stringify(data)), tillagda = [], avvisade = [];
  const id = new Set(nod.id), text = new Set(nod.text.map(normText)), ord = new Set(nod.ord);
  for (const p of Object.values(ut.quiz.paket)) for (const f of p.fragor) { id.add(f[0]); text.add(normText(f[1])); }
  for (const o of ut.ordjakt.ord) ord.add(o[0]);
  const avvisa = (art, post, skal) => avvisade.push({ art, post, skal });

  const quiz = (forslag && forslag.quiz) || {};
  let antalF = 0;
  for (const [nyckel, lista0] of Object.entries(quiz)) {
    let paket = ut.quiz.paket[nyckel], lista = lista0, prefix = paket ? idPrefix(paket) : null;
    if (!paket) {
      if (!lista0 || Array.isArray(lista0) || typeof lista0.namn !== 'string' || !/^[a-z]{1,4}$/.test(lista0.prefix || '') || !Array.isArray(lista0.fragor)) { avvisa('fraga', nyckel, 'okänt paket — ett nytt paket ska vara { namn, prefix, fragor }'); continue; }
      if (!/^[a-z0-9]+$/.test(nyckel) || nyckel === 'egna' || (nod.paket || []).includes(nyckel)) { avvisa('fraga', nyckel, 'ogiltig eller upptagen paketnyckel'); continue; }
      paket = ut.quiz.paket[nyckel] = { namn: lista0.namn.slice(0, 40), fragor: [] }; prefix = lista0.prefix; lista = lista0.fragor;
    }
    if (!Array.isArray(lista)) { avvisa('fraga', nyckel, 'förslagen ska vara en lista'); continue; }
    prefix = prefix || 'q';
    for (const f of lista) {
      const namn = f && f.fraga ? String(f.fraga).slice(0, 80) : JSON.stringify(f).slice(0, 80);
      if (++antalF > MAX_FRAGOR) { avvisa('fraga', namn, `fler än ${MAX_FRAGOR} frågor i en körning`); continue; }
      const ny = [nastaId(paket, prefix), String(f && f.fraga || '').trim(), Array.isArray(f && f.svar) ? f.svar.map(x => String(x == null ? '' : x).trim()) : [], f && f.ratt, String(f && f.kalla || '').trim()];
      if (!giltigFraga(ny)) { avvisa('fraga', namn, 'ogiltig: tre olika svar och ratt 0–2 krävs'); continue; }
      if (!ny[1].endsWith('?')) { avvisa('fraga', namn, 'frågan ska sluta med frågetecken'); continue; }
      if (ny[1].length > 140 || ny[2].some(x => x.length > 60)) { avvisa('fraga', namn, 'för lång fråga eller för långt svar'); continue; }
      if (ny[4].length < 10) { avvisa('fraga', namn, 'källa saknas'); continue; }
      if (text.has(normText(ny[1]))) { avvisa('fraga', namn, 'samma fråga finns redan'); continue; }
      paket.fragor.push(ny); id.add(ny[0]); text.add(normText(ny[1]));
      tillagda.push({ art: 'fraga', paket: nyckel, post: ny, belagg: [].concat(f.belagg || []).map(String).filter(Boolean).slice(0, 5) });
    }
  }
  let antalO = 0;
  for (const o of ((forslag && forslag.ordjakt) || [])) {
    const ny = [String(o && o.ord || '').trim().toLocaleUpperCase('sv-SE'), String(o && o.ledtrad || '').trim()];
    if (++antalO > MAX_ORD) { avvisa('ord', ny[0], `fler än ${MAX_ORD} ord i en körning`); continue; }
    if (!giltigtOrd(ny)) { avvisa('ord', ny[0] || '(tomt)', 'ogiltigt: 4–14 bokstäver, ledtråd högst 60 tecken som inte innehåller ordet'); continue; }
    if (ord.has(ny[0])) { avvisa('ord', ny[0], 'ordet finns redan'); continue; }
    ut.ordjakt.ord.push(ny); ord.add(ny[0]); tillagda.push({ art: 'ord', post: ny });
  }
  if (tillagda.length) ut.version = nyVersion(ut.version, idag || new Date().toISOString().slice(0, 10));
  return { data: ut, tillagda, avvisade };
}

// ---------- källkontroll (nätet skickas in, så att proven aldrig behöver nätet) ----------
function text_av_html(html) {
  return normText(String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'));
}
function svarsvarianter(svar) {
  const a = normText(svar), v = new Set([a, a.replace(/,/g, '.'), a.replace(/\./g, ',')]);
  const tal = /\d[\d.,]*/.exec(a); if (tal) { v.add(tal[0]); v.add(tal[0].replace(/,/g, '.')); v.add(tal[0].replace(/\./g, ',')); }
  return [...v].filter(Boolean);
}
// belagg: ord eller uttryck (på källans språk) som ska stå på sidan. Behövs när källan är engelsk men svaret svenskt: "Kväve" står
// som "nitrogen". Sparas inte i innehållet — det används bara när ett förslag kontrolleras.
async function kontrolleraKalla(post, hamta, belagg = []) {
  const kalla = post[4], rattSvar = post[2][post[3]];
  if (!ärUrl(kalla)) return { niva: 'ok', skal: 'källan är en definition, ingen länk' };
  let svar;
  try { svar = await hamta(kalla); } catch (e) { return { niva: 'fel', skal: 'kunde inte hämta källan: ' + (e && e.message || e) }; }
  if (!svar || svar.status !== 200) return { niva: 'fel', skal: `källan svarade ${svar && svar.status}` };
  const sida = text_av_html(svar.text);
  const hittat = belagg.map(normText).filter(Boolean).find(b => sida.includes(b));
  if (hittat) return { niva: 'ok', skal: `belägget "${hittat}" finns på sidan` };
  if (svarsvarianter(rattSvar).some(v => sida.includes(v))) return { niva: 'ok', skal: 'det rätta svaret finns på sidan' };
  return { niva: 'varning', skal: belagg.length ? `varken belägget (${belagg.join(' / ')}) eller svaret "${rattSvar}" finns på sidan — kolla för hand` : `det rätta svaret "${rattSvar}" hittades inte på sidan — ange "belagg" på källans språk eller kolla för hand` };
}
async function hamtaRiktig(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'vyra-innehallskoll/1.0', 'accept-language': 'sv,en;q=0.8' } });
  return { status: r.status, text: (await r.text()).slice(0, 3_000_000) };
}
async function kontrolleraMånga(poster, hamta, belaggFor = () => [], parallellt = 4) {
  const res = new Array(poster.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(parallellt, poster.length) }, async () => { for (let k = i++; k < poster.length; k = i++) res[k] = await kontrolleraKalla(poster[k], hamta, belaggFor(poster[k], k)); }));
  return res;
}

// ---------- rapport till granskaren ----------
function rapport({ tillagda, avvisade, kallor, version }) {
  const rad = (s, n = 90) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, n);
  const ut = [`## Nytt spelinnehåll · version ${version}`, '', `${tillagda.filter(t => t.art === 'fraga').length} frågor och ${tillagda.filter(t => t.art === 'ord').length} ord föreslås. **Inget når en sändning förrän den här ändringen är granskad och sammanslagen.**`, ''];
  const fr = tillagda.filter(t => t.art === 'fraga');
  if (fr.length) {
    ut.push('### Frågor — kontrollera varje rad mot källan', '', '| Paket | Fråga | Rätt svar | Källa | Källkontroll |', '|---|---|---|---|---|');
    for (const t of fr) { const k = kallor && kallor.get(t.post[0]); ut.push(`| ${t.paket} | ${rad(t.post[1])} | **${rad(t.post[2][t.post[3]], 40)}** | ${rad(t.post[4], 70)} | ${k ? (k.niva === 'ok' ? '✅ ' : k.niva === 'varning' ? '⚠️ ' : '❌ ') + rad(k.skal, 70) : 'ej körd'} |`); }
    ut.push('');
  }
  const ord = tillagda.filter(t => t.art === 'ord');
  if (ord.length) { ut.push('### Ord', '', '| Ord | Ledtråd |', '|---|---|', ...ord.map(t => `| ${t.post[0]} | ${rad(t.post[1], 60)} |`), ''); }
  if (avvisade.length) { ut.push('### Avvisade förslag (kom inte med)', '', ...avvisade.map(a => `- ${a.art === 'ord' ? 'ord' : 'fråga'} \`${rad(a.post, 70)}\`: ${a.skal}`), ''); }
  ut.push('> Källkontrollen är en tumregel: ✅ betyder att svaret står på sidan, inte att frågan är rätt. ⚠️ och ❌ måste lösas innan sammanslagning.');
  return ut.join('\n');
}

// ---------- kommandorad ----------
async function main(argv) {
  const [kommando, ...rest] = argv, flagga = n => rest.includes(n), varde = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  const text = fs.readFileSync(FIL, 'utf8'), { huvud, data } = las(text);
  const nod = nodstart();
  if (kommando === 'kontrollera') {
    const fel = granska(data, nod.id);
    fel.forEach(f => console.log('FEL  ' + f));
    let slutkod = fel.length ? 1 : 0;
    if (flagga('--kallor')) {
      const poster = Object.values(data.quiz.paket).flatMap(p => p.fragor), res = await kontrolleraMånga(poster, hamtaRiktig);
      let antal = { ok: 0, varning: 0, fel: 0 };
      res.forEach((r, i) => { antal[r.niva]++; if (r.niva !== 'ok') console.log(`${r.niva === 'fel' ? 'FEL ' : 'VARN'} ${poster[i][0]}  ${poster[i][1].slice(0, 60)}  → ${r.skal}  (${poster[i][4]})`); });
      console.log(`Källkontroll: ${antal.ok} ok, ${antal.varning} varningar, ${antal.fel} fel av ${poster.length} frågor.`);
      if (antal.fel) slutkod = 1;
    }
    console.log(fel.length ? `${fel.length} fel i formen.` : 'Formen är i ordning.');
    return slutkod;
  }
  if (kommando === 'lagg-till') {
    const fil = rest.find(a => !a.startsWith('--') && a !== varde('--rapport'));
    if (!fil) { console.error('Ange förslagsfilen: lagg-till forslag.json'); return 2; }
    const forslag = JSON.parse(fs.readFileSync(fil, 'utf8'));
    const { data: ny, tillagda, avvisade } = laggTill(data, forslag, { nod });
    let kallor = null;
    if (flagga('--kallor')) {
      const fr = tillagda.filter(t => t.art === 'fraga'), res = await kontrolleraMånga(fr.map(t => t.post), hamtaRiktig, (_, k) => fr[k].belagg);
      kallor = new Map(fr.map((t, i) => [t.post[0], res[i]]));
    }
    const md = rapport({ tillagda, avvisade, kallor, version: ny.version });
    if (varde('--rapport')) fs.writeFileSync(varde('--rapport'), md + '\n'); else console.log(md);
    const fel = granska(ny, nod.id);
    if (fel.length) { console.error('Resultatet blev ogiltigt: ' + fel.join('; ')); return 1; }
    if (flagga('--skriv')) { if (tillagda.length) fs.writeFileSync(FIL, skriv(huvud, ny)); console.log(`Skrev ${tillagda.length} poster (version ${ny.version}), avvisade ${avvisade.length}.`); }
    else console.log(`Provkörning: ${tillagda.length} skulle läggas till, ${avvisade.length} avvisas. Lägg till --skriv för att skriva.`);
    const kallfel = kallor ? [...kallor.values()].filter(k => k.niva !== 'ok').length : 0;
    return (flagga('--strikt') && (avvisade.length || kallfel)) ? 1 : 0;
  }
  console.error('Använd: kontrollera [--kallor]  |  lagg-till forslag.json [--kallor] [--skriv] [--rapport fil.md] [--strikt]');
  return 2;
}
// Startpaketens id och texter och nödlistans ord ligger kvar i widgetfilerna; nya poster får inte krocka med dem.
function nodstart() {
  const hamta = (fil, re) => { const m = re.exec(fs.readFileSync(path.join(__dirname, '..', fil), 'utf8')); return m ? m[0] : ''; };
  const quizNod = hamta('quiz.js', /const NODPAKET = \{[\s\S]*?\n  \};/), ordNod = hamta('ordjakten.js', /const NODORD = \[[\s\S]*?\n  \];/);
  const pak = vm.runInNewContext('(' + quizNod.replace(/^const NODPAKET = /, '').replace(/;$/, '') + ')'), ord = vm.runInNewContext('(' + ordNod.replace(/^const NODORD = /, '').replace(/;$/, '') + ')');
  const fragor = Object.values(pak).flatMap(p => p.fragor);
  return { id: fragor.map(f => f[0]), text: fragor.map(f => f[1]), ord: ord.map(o => o[0]), paket: Object.keys(pak) };
}

module.exports = { las, skriv, nyVersion, granska, laggTill, kontrolleraKalla, kontrolleraMånga, svarsvarianter, text_av_html, rapport, giltigFraga, giltigtOrd, normText, nodstart, FIL };
if (require.main === module) main(process.argv.slice(2)).then(k => process.exit(k), e => { console.error(e && e.stack || e); process.exit(2); });
