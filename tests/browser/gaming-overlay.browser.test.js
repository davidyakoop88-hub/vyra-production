'use strict';
// GAMING OVERLAY i en riktig webbläsare (spellayout.js).
//
// Davids beställning 2026-10-15/16: en egen sida där man väljer tema och får hela paketet — ramar,
// bakgrund, topplista (likes → coins → poäng), Top Gifter, följarmål och Gift Campaign. Provet
// täcker det som bara syns i en riktig layoutmotor: att sidan lägger delarna, att OBS-utgången ritar
// dem med de noder livedatan skriver i, topplistans 1–10 platser, att ingen text hamnar utanför sitt
// fält i konsten ("texten ska inte vara utanför någon ram") och att bakgrunden har hål för kamera
// och spel.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function sida(overlay) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/studio.html${overlay ? '?overlay=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraSpellayout, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; state.widgets.length = 0; });
  return { page, fel };
}
// Hela paketet direkt ur fabriken, som "Använd tema" bygger det.
const lagg = (page, extra, tema) => page.evaluate(([extra, tema]) => {
  state.widgets = VyraSpellayout.hela.map(d => Object.assign(VyraWidgets.create('catalog:spellayout:' + (tema || 'fortnite') + ':' + d), (extra || {})[d] || {}));
  render();
}, [extra, tema]);

test('sidan Gaming overlay: Använd tema lägger hela paketet en gång och öppnar layouten', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    await page.click('[data-extra="gaming"]');
    await page.waitForSelector('#view .spel-teman [data-spel-anvand="fortnite"]', { timeout: 10000 });
    assert.match(await page.textContent('#title'), /Gaming overlay/);
    // En annan widget i layouten ska stå kvar orörd.
    await page.evaluate(() => { state.widgets.push(VyraWidgets.create('catalog:custom:text')); });
    await page.click('[data-spel-anvand="fortnite"]');
    await page.waitForFunction(() => view === 'editor', null, { timeout: 10000 });
    const delar = await page.evaluate(() => state.widgets.filter(w => w.spelTema).map(w => w.spelDel).sort());
    assert.deepEqual(delar, ['bakgrund', 'gifter', 'kameraram', 'kampanj', 'lista', 'mal', 'spelram']);
    assert.equal(await page.evaluate(() => state.widgets.filter(w => w.type === 'templateCustomText').length), 1, 'en annan widget togs bort');

    // Igen: bekräftelsen godkänns, och delarna ersätts i stället för att dubbleras.
    page.once('dialog', d => d.accept());
    await page.click('[data-extra="gaming"]');
    await page.waitForSelector('[data-spel-anvand="fortnite"]');
    await page.click('[data-spel-anvand="fortnite"]');
    await page.waitForFunction(() => view === 'editor', null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => state.widgets.filter(w => w.spelTema).length), 7, 'ett andra klick dubblerade delarna');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('OBS: alla sju delar ritas med livedatans noder, och bakgrunden har hål för kamera och spel', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    await lagg(page);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      delar: document.querySelectorAll('.widget.spel').length,
      lista: document.querySelectorAll('.spel-lista.vyra-toplike .toplike-row strong + small + em').length,
      gifter: !!document.querySelector('.spel-gifter.vyra-topgift .vyra-profile-face img') && !!document.querySelector('.spel-gifter .vyra-gift-face img')
        && !!document.querySelector('.spel-gifter .topgift-copy strong') && !!document.querySelector('.spel-gifter .topgift-copy em'),
      mal: ['[data-goal-value]', '[data-goal-target]', '[data-goal-fill]'].every(s => document.querySelector('.spel-mal[data-goal] ' + s)),
      kampanj: document.querySelectorAll('.spel-kampanj.vyra-campaign article .campaign-gift-image').length,
      // M-kommandon i bakgrundens hål-väg: hela ytan + kamerahålet + spelhålet.
      hal: (document.querySelector('.spel-bakgrund clipPath path')?.getAttribute('d').match(/M/g) || []).length,
      bilder: [...document.querySelectorAll('.widget.spel img.spel-bild')].every(i => i.complete && i.naturalWidth > 0)
    }));
    assert.equal(r.delar, 7);
    assert.equal(r.lista, 5, 'topplistans rader saknar strong/small/em som livedatan skriver i');
    assert.ok(r.gifter, 'Top Gifter saknar profil-, gåvo-, namn- eller värdenoden');
    assert.ok(r.mal, 'följarmålet saknar data-goal-noderna');
    assert.equal(r.kampanj, 6);
    assert.equal(r.hal, 3, 'bakgrunden ska ha ett hål för kameran och ett för spelet');
    assert.ok(r.bilder, 'någon av temats bilder laddades inte');

    // Livevärdet: samma väg som goal-runtime använder.
    const id = await page.evaluate(() => state.widgets.find(w => w.spelDel === 'mal').id);
    await page.evaluate(id => window.patchGoalDom(id, { value: 724, target: 1000 }), id);
    assert.equal(await page.textContent('.spel-mal [data-goal-value]'), '724');

    // En dold del syns aldrig i OBS.
    await page.evaluate(() => { state.widgets.find(w => w.spelDel === 'gifter').hidden = true; render(); });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.spel-gifter')).display), 'none');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('topplistan: 1–10 platser, 6–10 under 1–5 med egna brickor, och ingen text utanför sitt fält', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    // Mätningen görs på layoutens duk, där delarna ritas i sin riktiga storlek.
    await page.click('aside a[href="layout.html"]');
    await page.waitForFunction(() => view === 'editor' && !!document.querySelector('.canvas'), null, { timeout: 10000 });
    for (const n of [1, 3, 5, 7, 10]) {
      await lagg(page, { lista: { likeCount: n, rankingCycle: false } });
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const box = document.querySelector('.canvas .spel-lista');
        const rader = [...box.querySelectorAll('.toplike-row')];
        // Namnen sätts långa med flit: texten ska klippas INUTI fältet, aldrig rinna ut ur det.
        rader.forEach(rad => { rad.querySelector('strong').textContent = 'EttMycketLångtAnvändarnamn_1234'; });
        const utanfor = rader.filter(rad => {
          const falt = rad.querySelector('.spel-rad-text').getBoundingClientRect();
          return ['strong', 'em'].some(s => {
            const t = rad.querySelector(s).getBoundingClientRect();
            return t.top < falt.top - 0.5 || t.bottom > falt.bottom + 0.5 || t.left < falt.left - 0.5 || t.right > falt.right + 0.5;
          });
        }).length;
        const ordning = rader.map(rad => rad.getBoundingClientRect().top);
        return {
          rader: rader.length, brickor: box.querySelectorAll('.spel-rang').length, block: box.querySelectorAll('.spel-konst').length,
          utanfor, nedat: ordning.every((y, i) => i === 0 || y > ordning[i - 1]),
          rubrik: getComputedStyle(box.querySelector(':scope > h3')).display
        };
      });
      assert.equal(r.rader, n, `${n} platser`);
      assert.equal(r.brickor, Math.max(0, n - 5), `${n} platser: brickor för 6–10`);
      assert.equal(r.block, n > 5 ? 2 : 1, `${n} platser: block`);
      assert.ok(r.nedat, `${n} platser: raderna ska ligga under varandra, inte bredvid`);
      assert.equal(r.utanfor, 0, `${n} platser: text utanför sitt fält`);
      assert.equal(r.rubrik, 'none', 'rubriken har inget fält i konsten och ska inte synas');
    }
    // Top Gifter och målet: texten inuti sina fält.
    const r = await page.evaluate(() => {
      const inuti = (a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.top >= y.top - 0.5 && x.bottom <= y.bottom + 0.5 && x.left >= y.left - 0.5 && x.right <= y.right + 0.5; };
      const mal = document.querySelector('.canvas .spel-mal');
      return { maltext: inuti(mal.querySelector('.spel-mal-text'), mal.querySelector('.spel-mal-spar')),
        siffror: [...mal.querySelectorAll('.spel-mal-varde b')].every(b => getComputedStyle(b).display === 'inline') };
    });
    assert.ok(r.maltext, 'målets text ligger utanför stapeln');
    assert.ok(r.siffror, 'målets siffror blev block (studio.css .widget b) och klipptes');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

// ALLA TRETTON TEMAN. Geometrin för de tolv senare temana är uppmätt automatiskt ur deras bilder och
// rättad för hand på sex ställen — provet är det som säger att varje tema faktiskt håller samma regler
// som Fortnite: bilderna laddas, och ingen text hamnar utanför sitt fält, inte ens med långa namn.
test('alla teman: bilderna laddas och ingen text utanför sitt fält i lista, Top Gifter och mål', { skip, timeout: 240000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    await page.click('aside a[href="layout.html"]');
    await page.waitForFunction(() => view === 'editor' && !!document.querySelector('.canvas'), null, { timeout: 10000 });
    const teman = await page.evaluate(() => Object.keys(VyraSpellayout.teman));
    assert.equal(teman.length, 13, 'sidan ska erbjuda tretton teman');
    for (const tema of teman) {
      await lagg(page, { lista: { rankingCycle: false }, gifter: { dataName: 'EttMycketLångtAnvändarnamn_1234', dataValue: '1 234 567' } }, tema);
      await page.waitForFunction(() => [...document.querySelectorAll('.canvas .widget.spel img')].every(i => i.complete), null, { timeout: 15000 });
      const r = await page.evaluate(() => {
        const inuti = (a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.top >= y.top - 0.5 && x.bottom <= y.bottom + 0.5 && x.left >= y.left - 0.5 && x.right <= y.right + 0.5; };
        const lista = document.querySelector('.canvas .spel-lista');
        const rader = [...lista.querySelectorAll('.toplike-row')];
        rader.forEach(rad => { rad.querySelector('strong').textContent = 'EttMycketLångtAnvändarnamn_1234'; rad.querySelector('em').textContent = '♥ 99.4K'; });
        const listaUt = rader.filter(rad => ['strong', 'em'].some(s => !inuti(rad.querySelector(s), rad.querySelector('.spel-rad-text')))).length;
        // Top Gifter: namn och coins inuti sin platta (en rad eller två), rubriken bara där konsten har ett fält.
        const g = document.querySelector('.canvas .spel-gifter'), kopia = g.querySelector('.topgift-copy');
        const ram = kopia.classList.contains('spel-en-rad') ? kopia : null;
        // En rad: namn och coins inuti den gemensamma rutan. Två rader: varje rad ryms i sin egen ruta
        // på höjden (rutan är plattans fält), och ett för långt namn klipps med … i stället för att rinna ut.
        const gifterUt = ['strong', 'em'].filter(s => { const el = kopia.querySelector(s); return ram ? !inuti(el, ram)
          : el.scrollHeight > el.clientHeight + 1 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'hidden'); }).length;
        const mal = document.querySelector('.canvas .spel-mal');
        return {
          trasiga: [...document.querySelectorAll('.canvas .widget.spel img')].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
          listaUt, gifterUt, malUt: !inuti(mal.querySelector('.spel-mal-text'), mal.querySelector('.spel-mal-spar')),
          platser: document.querySelectorAll('.canvas .spel-kampanj .spel-gava').length,
          textstorlek: Math.min(...rader.map(rad => parseFloat(getComputedStyle(rad.querySelector('strong')).fontSize)))
        };
      });
      assert.deepEqual(r.trasiga, [], `${tema}: bilder som inte laddas`);
      assert.equal(r.listaUt, 0, `${tema}: topplistans text utanför sitt fält`);
      assert.equal(r.gifterUt, 0, `${tema}: Top Gifters namn eller coins utanför sin platta`);
      assert.equal(r.malUt, false, `${tema}: målets text utanför stapeln`);
      assert.equal(r.platser, 6, `${tema}: Gift Campaign ska ha sex platser`);
      assert.ok(r.textstorlek >= 3.5, `${tema}: topplistans text är ${r.textstorlek} px — oläslig`);
    }
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

// Davids fråga 2026-10-16: "vad händer när man lägger en vanlig widget — hamnar den under?" Det
// gjorde den: katalogens widgetar saknar oftast eget lager och ritades i lager 1, under ramarna (2)
// och temats widgetar (6), och ett klick på dem markerade ramen. Flera Top Like-skin skriver dessutom
// aldrig ut lagret som z-index, och två katalogknappar (Top Like, Top Gift Premium) raderade temats
// egen topplista och Top Gifter när de ersatte "den gamla". Provet går genom de riktiga knapparna.
test('en vanlig widget efter temat hamnar ovanpå det, går att klicka på och raderar ingen del av temat', { skip, timeout: 120000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    page.on('dialog', d => d.accept());
    await page.evaluate(() => { state.widgets.push(Object.assign(VyraWidgets.create('catalog:custom:text'), { layer: 1 })); });
    await page.click('[data-extra="gaming"]');
    await page.waitForSelector('[data-spel-anvand="fortnite"]');
    await page.click('[data-spel-anvand="fortnite"]');
    await page.waitForFunction(() => view === 'editor', null, { timeout: 10000 });
    // En widget som låg där före temat lyfts över det, i stället för att försvinna bakom bakgrunden.
    assert.ok(await page.evaluate(() => state.widgets.find(w => w.type === 'templateCustomText').layer > 6), 'den tidigare widgeten ligger kvar under temat');

    for (const nyckel of ['catalog:toplike:voltage', 'catalog:ranking:templateTopCoins:celestial', 'catalog:topgift:premium:royal']) {
      const r = await page.evaluate(async nyckel => {
        view = 'overlay'; render(); await new Promise(r => setTimeout(r, 100));
        const knapp = document.querySelector(`.widget-catalog [data-catalog-key="${nyckel}"]`);
        if (!knapp) return { saknas: true };
        const fore = new Set(state.widgets.map(w => w.id));
        knapp.click();
        const ny = state.widgets.find(w => !fore.has(w.id));
        view = 'editor'; render(); await new Promise(r => setTimeout(r, 150));
        const el = document.querySelector(`.editor-shell [data-id="${ny.id}"]`), b = el.getBoundingClientRect();
        const traff = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { layer: ny.layer, z: getComputedStyle(el).zIndex, egen: !!(traff && traff.closest(`[data-id="${ny.id}"]`)),
          delar: state.widgets.filter(w => w.spelTema).map(w => w.spelDel).sort() };
      }, nyckel);
      assert.ok(!r.saknas, `${nyckel}: katalogknappen finns inte`);
      assert.ok(r.layer > 6, `${nyckel}: hamnade i lager ${r.layer}, under temat`);
      assert.equal(r.z, String(r.layer), `${nyckel}: lagret når inte skärmen (z-index ${r.z})`);
      assert.ok(r.egen, `${nyckel}: ett klick mitt på widgeten träffar temat`);
      assert.deepEqual(r.delar, ['bakgrund', 'gifter', 'kameraram', 'kampanj', 'lista', 'mal', 'spelram'], `${nyckel}: raderade en del av temat`);
    }
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
