'use strict';
// MEDIAVÄLJAREN (vyra-mediaval.js) i Chrome, genom panelramen (PR 3 i panelspecifikationen).
//
// Ingen familj använder kontrolltypen media än, så provet lägger en TESTPOST i registret för Follower
// Spotlight och tar bort den efteråt. Posten har tre mediakontroller: en bild med reserv, en video
// utan reserv och en video som sparas lokalt i IndexedDB (lagring 'meta', samma form som w.mediaMeta).
//
// Provet kräver att
//   * miniatyren visas och laddas, för både bild och video,
//   * ingen sökväg eller adress syns i gränssnittet (/assets\/|\.png|\.svg|\.webp|URL/ i text och
//     textbärande attribut — bara miniatyrens src får bära länken),
//   * "Använd automatisk" sparar '' i fältet,
//   * ett valt objekt sparas i SAMMA fält, med den länk uppladdningen ger (mockad molnuppladdning),
//     och att en tillfällig länk aldrig skrivs till fältet,
//   * fokus och scrollposition bevaras när fältet ändras,
//   * en lokalt vald stor bild skalas till högst 512 px och ~200 KB, med kvot och alfa kvar,
//   * budgeten för data-länkar i layouten avvisar ett val som skulle passera ~1,5 MB,
//   * grannwidgeten inte rörs.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const VIDEO = 'assets/videos/battle/cloud-fox/tap.webm';
const LACKA = /assets\/|\.png|\.svg|\.webp|URL/;

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas, page;
const fel = [];
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;

  // Låg panel, så att den går att scrolla och scrollpositionen betyder något.
  page = await browser.newPage({ viewport: { width: 1500, height: 640 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    localStorage.removeItem('vyra-panelram');
    const prov = window.VyraWidgets.create('catalog:followeralert:gold'), typ = prov.type;
    // Follower Spotlight har en egen post sedan PR 6 (vyra-alert-panel.js). Provet lånar typen för sin
    // provpost, så familjens post läggs undan under provet och tillbaka efteråt.
    window.__mediavalUndan = window.VyraPanelregister.hitta(prov);
    if (window.__mediavalUndan) window.VyraPanelregister.tabort(window.__mediavalUndan);
    window.__mediavalPost = window.VyraPanelregister.definiera({
      typ,
      kontroller: [
        { sektion: 2, typ: 'text', falt: 'followLabel', etikett: 'Etikett' },
        { sektion: 3, typ: 'std-position' },
        { sektion: 4, typ: 'tal', falt: 'provA', etikett: 'Prov A', min: 0, max: 100, enhet: '%' },
        { sektion: 4, typ: 'tal', falt: 'provB', etikett: 'Prov B', min: 0, max: 100, enhet: '%' },
        { sektion: 4, typ: 'tal', falt: 'provC', etikett: 'Prov C', min: 0, max: 100, enhet: '%' },
        { sektion: 5, typ: 'media', medietyp: 'bild', falt: 'profileImage', etikett: 'Egen profilbild',
          reserv: 'assets/images/test-profile.svg', reservText: 'Automatisk – tittarens profilbild från TikTok' },
        { sektion: 5, typ: 'media', medietyp: 'video', falt: 'provVideo', etikett: 'Egen video' },
        { sektion: 5, typ: 'media', medietyp: 'video', falt: 'provLokal', etikett: 'Video på datorn', lagring: 'meta' },
        { sektion: 6, typ: 'tal', falt: 'provD', etikett: 'Prov D', min: 0, max: 100, enhet: '%' },
      ],
    });
    state.widgets.length = 0;
    const a = window.VyraWidgets.create('catalog:followeralert:gold');
    a.id = 'mv-a'; a.x = 200; a.y = 200; a.profileImage = 'assets/images/test-profile.svg';
    const b = window.VyraWidgets.create('catalog:followeralert:gold');
    b.id = 'mv-b'; b.x = 700; b.y = 200; b.profileImage = 'assets/images/test-profile.svg';
    state.widgets.push(a, b);
    selected = 'mv-a';
    render();
  });
  await page.waitForTimeout(400);
});

test.after(async () => {
  if (page) {
    try {
      await page.evaluate(() => {
        window.VyraPanelregister.tabort(window.__mediavalPost);
        if (window.__mediavalUndan) window.VyraPanelregister.definiera(window.__mediavalUndan);
      });
    } catch (_) {}
  }
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const falt = id => page.evaluate(i => { const w = state.widgets.find(x => x.id === i); return JSON.parse(JSON.stringify(w)); }, id);
const nod = f => `.properties [data-mediaval="${f}"]`;

// Text och textbärande attribut i mediaväljarna och i ramens synliga sektioner. Miniatyrens src
// är det enda som får bära länken.
async function lackor() {
  return page.evaluate((kalla) => {
    const re = new RegExp(kalla);
    const ut = [];
    const rotter = [...document.querySelectorAll('.properties .vyra-mediaval'), ...document.querySelectorAll('.properties [data-panelram-sektion]')];
    for (const rot of rotter) {
      if (re.test(rot.textContent)) ut.push('text: ' + rot.textContent.match(re)[0]);
      for (const el of [rot, ...rot.querySelectorAll('*')]) {
        for (const a of ['title', 'alt', 'aria-label', 'placeholder', 'value', 'data-mediaval-lage']) {
          const v = el.getAttribute(a);
          if (v && re.test(v)) ut.push(`${el.tagName}[${a}]=${v}`);
        }
        if ('value' in el && typeof el.value === 'string' && re.test(el.value)) ut.push(`${el.tagName}.value=${el.value}`);
      }
    }
    return ut;
  }, LACKA.source);
}

async function lage() {
  return page.evaluate(() => ({
    fokus: document.activeElement && document.activeElement.id,
    scroll: document.querySelector('.properties').scrollTop,
  }));
}

// Ställer panelen på en scrollposition där kontrollen syns, och fokuserar den.
async function fokusera(sel) {
  return page.evaluate(s => {
    const panel = document.querySelector('.properties');
    const el = document.querySelector(s);
    el.focus();
    const mal = Math.max(0, el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 200);
    panel.scrollTop = mal;
    return { fokus: document.activeElement.id, scroll: panel.scrollTop, max: panel.scrollHeight - panel.clientHeight };
  }, sel);
}

const miniatyrLaddad = (f, slag) => page.waitForFunction(([f, slag]) => {
  const r = document.querySelector(`.properties [data-mediaval="${f}"] .vm-miniatyr`);
  if (!r) return false;
  if (slag === 'video') { const v = r.querySelector('video'); return !!(v && v.readyState >= 1 && v.videoWidth > 0); }
  const i = r.querySelector('img'); return !!(i && i.complete && i.naturalWidth > 0);
}, [f, slag], { timeout: 10000, polling: 100 });

function mockaMoln(svar) {
  return page.evaluate(([svar, bas]) => {
    window.__moln = { uppladdat: [], anrop: [], gang: 0 };
    window.__orig = window.__orig || { current: window.VyraCloudSync && window.VyraCloudSync.current, upload: window.VyraCloudMedia && window.VyraCloudMedia.upload, api: window.VyraAuth && window.VyraAuth.api };
    window.VyraCloudSync.current = () => ({ workspace: { id: 'ws-prov' } });
    window.VyraCloudMedia.upload = async file => { __moln.uppladdat.push(file.type); return { id: 'a1', status: svar.status }; };
    window.VyraAuth.api = async (p, opt) => {
      __moln.anrop.push((opt && opt.method || 'GET') + ' ' + p);
      __moln.gang++;
      if (svar.klarEfter && __moln.gang < svar.klarEfter) throw new Error('Media saknas eller är inte godkänd');
      return { ok: true, url: bas + '/' + svar.fil, expiresIn: svar.expiresIn };
    };
  }, [svar, bas]);
}
const aterstallMoln = () => page.evaluate(() => {
  if (!window.__orig) return;
  window.VyraCloudSync.current = window.__orig.current;
  window.VyraCloudMedia.upload = window.__orig.upload;
  window.VyraAuth.api = window.__orig.api;
});

test('väljarna byggs i sektion 5 med miniatyr, knappar och reservtext', { skip, timeout: 60000 }, async () => {
  const bild = await page.evaluate(s => {
    const n = document.querySelector(s);
    return n && {
      sektion: n.closest('[data-panelram-sektion]')?.dataset.panelramSektion,
      knappar: [...n.querySelectorAll('button')].map(b => b.textContent),
      status: n.querySelector('.vm-status').textContent,
      etikett: n.querySelector('.vm-etikett').textContent,
    };
  }, nod('profileImage'));
  assert.ok(bild, 'bildväljaren byggdes inte');
  assert.equal(bild.sektion, '5');
  assert.deepEqual(bild.knappar, ['Välj bild', 'Använd automatisk']);
  assert.equal(bild.etikett, 'Egen profilbild');
  assert.equal(bild.status, 'Automatisk – tittarens profilbild från TikTok', 'ett assets/-värde ska visas som reservtext');
  await miniatyrLaddad('profileImage', 'bild');

  const video = await page.evaluate(s => [...document.querySelector(s).querySelectorAll('button')].map(b => b.textContent), nod('provVideo'));
  assert.deepEqual(video, ['Välj video', 'Ta bort'], 'utan reserv heter knappen Ta bort');
  assert.deepEqual(await lackor(), []);
});

test('lokalt vald bild: miniatyr, samma fält, varning, och fokus och scroll bevaras', { skip, timeout: 60000 }, async () => {
  await aterstallMoln();
  const fore = await fokusera('#pr-profileImage-valj');
  assert.ok(fore.max > 100, 'panelen måste gå att scrolla för att provet ska betyda något');
  assert.equal(fore.fokus, 'pr-profileImage-valj');
  await page.setInputFiles(`${nod('profileImage')} input[type=file]`, { name: 'min-bild.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForFunction(() => /^data:image\/(webp|png)/.test(state.widgets.find(x => x.id === 'mv-a').profileImage), null, { timeout: 10000 });
  await miniatyrLaddad('profileImage', 'bild');
  const efter = await lage();
  assert.equal(efter.fokus, 'pr-profileImage-valj', 'fokus försvann vid valet');
  assert.ok(Math.abs(efter.scroll - fore.scroll) <= 2, `scroll ${fore.scroll} → ${efter.scroll}`);
  const text = await page.evaluate(s => document.querySelector(s).innerText, nod('profileImage'));
  assert.match(text, /Egen bild · sparad i projektet/);
  assert.match(text, /Sparas bara på den här datorn och syns inte i OBS på en annan dator\./);
  assert.doesNotMatch(text, /min-bild/, 'filnamnet visas aldrig');
  assert.deepEqual(await lackor(), []);
  assert.equal((await falt('mv-b')).profileImage, 'assets/images/test-profile.svg', 'grannen ändrades');
});

test('Använd automatisk sparar tomt och visar reservtexten, med fokus och scroll kvar', { skip, timeout: 60000 }, async () => {
  const fore = await fokusera('#pr-profileImage-auto');
  await page.click('#pr-profileImage-auto');
  await page.waitForFunction(() => state.widgets.find(x => x.id === 'mv-a').profileImage === '', null, { timeout: 5000 });
  const efter = await lage();
  assert.equal(efter.fokus, 'pr-profileImage-auto');
  assert.ok(Math.abs(efter.scroll - fore.scroll) <= 2, `scroll ${fore.scroll} → ${efter.scroll}`);
  const status = await page.evaluate(s => document.querySelector(s + ' .vm-status').textContent, nod('profileImage'));
  assert.equal(status, 'Automatisk – tittarens profilbild från TikTok');
  // Renderaren väljer själv sin reserv för det tomma fältet.
  const reserv = await page.evaluate(() => document.querySelector('.canvas [data-id="mv-a"] img')?.getAttribute('src'));
  assert.equal(reserv, 'assets/images/test-profile.svg');
  await miniatyrLaddad('profileImage', 'bild');
  assert.deepEqual(await lackor(), []);
  assert.equal((await falt('mv-a')).profileImage, '');
});

test('molnuppladdad bild: fältet får den varaktiga länken från uppladdningen', { skip, timeout: 60000 }, async () => {
  await mockaMoln({ status: 'ready', fil: 'assets/images/heart-character.png', expiresIn: null });
  await page.setInputFiles(`${nod('profileImage')} input[type=file]`, { name: 'hjarta.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForFunction(b => state.widgets.find(x => x.id === 'mv-a').profileImage === b + '/assets/images/heart-character.png', bas, { timeout: 10000 });
  const moln = await page.evaluate(() => window.__moln);
  assert.deepEqual(moln.uppladdat, ['image/png']);
  assert.deepEqual(moln.anrop, ['GET /api/workspaces/ws-prov/media/a1']);
  await miniatyrLaddad('profileImage', 'bild');
  const status = await page.evaluate(s => document.querySelector(s + ' .vm-status').textContent, nod('profileImage'));
  assert.equal(status, 'Egen bild · sparad i molnet');
  assert.deepEqual(await lackor(), []);
});

test('en tillfällig molnlänk skrivs aldrig till fältet; bilden sparas lokalt i stället', { skip, timeout: 60000 }, async () => {
  await mockaMoln({ status: 'ready', fil: 'assets/images/heart-character.png', expiresIn: 300 });
  await page.setInputFiles(`${nod('profileImage')} input[type=file]`, { name: 'x.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForFunction(() => /^data:image\/(webp|png)/.test(state.widgets.find(x => x.id === 'mv-a').profileImage), null, { timeout: 10000 });
  assert.deepEqual(await lackor(), []);
});

test('molnuppladdad video: miniatyr med första bildrutan, under skanning visas väntan', { skip, timeout: 60000 }, async () => {
  await mockaMoln({ status: 'quarantined', fil: VIDEO, expiresIn: null, klarEfter: 2 });
  const fore = await fokusera('#pr-provVideo-valj');
  await page.setInputFiles(`${nod('provVideo')} input[type=file]`, { name: 'klipp.webm', mimeType: 'video/webm', buffer: fs.readFileSync(path.join(ROOT, VIDEO)) });
  await page.waitForFunction(s => /Väntar på säkerhetskontroll/.test(document.querySelector(s).innerText), nod('provVideo'), { timeout: 5000 });
  assert.equal((await falt('mv-a')).provVideo, undefined, 'fältet ska inte skrivas under skanningen');
  await page.waitForFunction(b => state.widgets.find(x => x.id === 'mv-a').provVideo === b + '/assets/videos/battle/cloud-fox/tap.webm', bas, { timeout: 15000 });
  await miniatyrLaddad('provVideo', 'video');
  const v = await page.evaluate(s => { const el = document.querySelector(s + ' video'); return { muted: el.muted, preload: el.getAttribute('preload') }; }, nod('provVideo'));
  assert.deepEqual(v, { muted: true, preload: 'metadata' });
  const efter = await lage();
  assert.equal(efter.fokus, 'pr-provVideo-valj');
  assert.ok(Math.abs(efter.scroll - fore.scroll) <= 2, `scroll ${fore.scroll} → ${efter.scroll}`);
  const text = await page.evaluate(s => document.querySelector(s).innerText, nod('provVideo'));
  assert.match(text, /Egen video · sparad i molnet/);
  assert.doesNotMatch(text, /Väntar/);
  assert.deepEqual(await lackor(), []);
  assert.equal((await falt('mv-b')).provVideo, undefined, 'grannen ändrades');

  await page.click('#pr-provVideo-auto');
  await page.waitForFunction(() => state.widgets.find(x => x.id === 'mv-a').provVideo === '', null, { timeout: 5000 });
  assert.equal(await page.evaluate(s => document.querySelector(s + ' .vm-status').textContent, nod('provVideo')), 'Ingen video vald');
});

test('utan molnet sparas en video med lagring meta i IndexedDB (cwStore), med miniatyr', { skip, timeout: 60000 }, async () => {
  await aterstallMoln();
  await page.setInputFiles(`${nod('provLokal')} input[type=file]`, { name: 'lokal.webm', mimeType: 'video/webm', buffer: fs.readFileSync(path.join(ROOT, VIDEO)) });
  await page.waitForFunction(() => { const v = state.widgets.find(x => x.id === 'mv-a').provLokal; return v && typeof v === 'object' && v.id; }, null, { timeout: 10000 });
  const meta = (await falt('mv-a')).provLokal;
  assert.equal(meta.type, 'video/webm');
  assert.match(meta.id, /^media-/);
  await miniatyrLaddad('provLokal', 'video');
  const text = await page.evaluate(s => document.querySelector(s).innerText, nod('provLokal'));
  assert.match(text, /Egen video · sparad på den här datorn/);
  assert.match(text, /syns inte i OBS på en annan dator/);
  assert.deepEqual(await lackor(), []);

  // En video utan molnet och utan lagring meta skrivs inte, och användaren får veta varför.
  await page.setInputFiles(`${nod('provVideo')} input[type=file]`, { name: 'b.webm', mimeType: 'video/webm', buffer: fs.readFileSync(path.join(ROOT, VIDEO)) });
  await page.waitForFunction(s => /Anslut molnet för att välja en video här\./.test(document.querySelector(s).innerText), nod('provVideo'), { timeout: 5000 });
  assert.equal((await falt('mv-a')).provVideo, '');
});

// En stor bild med transparent vänsterhalva och brus i högerhalvan (svår att komprimera), byggd i
// sidan och skickad tillbaka som png-bytes.
async function storBild(b, h) {
  const b64 = await page.evaluate(async ([b, h]) => {
    const c = new OffscreenCanvas(b, h), x = c.getContext('2d');
    x.clearRect(0, 0, b, h);
    const halv = b / 2, brus = x.createImageData(halv, h);
    for (let i = 0; i < brus.data.length; i += 4) {
      brus.data[i] = (Math.random() * 256) | 0; brus.data[i + 1] = (Math.random() * 256) | 0;
      brus.data[i + 2] = (Math.random() * 256) | 0; brus.data[i + 3] = 255;
    }
    x.putImageData(brus, halv, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, [b, h]);
  return Buffer.from(b64, 'base64');
}

test('en stor lokal bild skalas till högst 512 px och ~200 KB, med kvot och alfa kvar', { skip, timeout: 120000 }, async () => {
  await aterstallMoln();
  const grannen = JSON.stringify(await falt('mv-b'));
  const buf = await storBild(3000, 2000);
  assert.ok(buf.length > 400 * 1024, 'provbilden måste vara stor för att provet ska betyda något');
  await page.evaluate(() => { state.widgets.find(x => x.id === 'mv-a').profileImage = ''; });
  await page.setInputFiles(`${nod('profileImage')} input[type=file]`, { name: 'stor.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(() => /^data:image\/(webp|png)/.test(state.widgets.find(x => x.id === 'mv-a').profileImage), null, { timeout: 20000 });
  const r = await page.evaluate(async () => {
    const v = state.widgets.find(x => x.id === 'mv-a').profileImage;
    const img = new Image(); img.src = v; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const bytes = atob(v.slice(v.indexOf(',') + 1)).length;
    return { b: img.naturalWidth, h: img.naturalHeight, bytes, typ: v.slice(5, v.indexOf(';')),
      alfaVanster: x.getImageData(10, 10, 1, 1).data[3], alfaHoger: x.getImageData(c.width - 10, 10, 1, 1).data[3] };
  });
  assert.equal(Math.max(r.b, r.h), 512, `storlek ${r.b}×${r.h}`);
  assert.ok(Math.abs(r.b / r.h - 1.5) < 0.01, `kvoten ändrades: ${r.b}×${r.h}`);
  assert.ok(r.bytes <= 200 * 1024, `${r.bytes} byte efter kodning`);
  assert.equal(r.typ, 'image/webp');
  assert.equal(r.alfaVanster, 0, 'alfakanalen försvann');
  assert.equal(r.alfaHoger, 255);
  assert.equal(JSON.stringify(await falt('mv-b')), grannen, 'grannen ändrades');
  assert.deepEqual(await lackor(), []);
});

test('budgeten avvisar ett lokalt val som skulle passera taket, och rör ingen widget', { skip, timeout: 60000 }, async () => {
  await aterstallMoln();
  // Grannen bär redan nästan hela budgeten i ett eget fält.
  // Fältet töms först, så att ingen gammal data-länk räknas bort: den nya bilden är större än det som är kvar.
  await page.evaluate(() => { state.widgets.find(x => x.id === 'mv-a').profileImage = ''; });
  await page.evaluate(() => {
    const { tak } = window.VyraMediaval.lokalBudget();
    const b = state.widgets.find(x => x.id === 'mv-b');
    b.provFyll = 'data:image/png;base64,' + 'A'.repeat(tak - 1000 - window.VyraMediaval.lokalBudget().anvant);
  });
  const fore = { b: JSON.stringify(await falt('mv-b')) };
  const budget = await page.evaluate(() => window.VyraMediaval.lokalBudget());
  assert.ok(budget.kvar <= 1000 && budget.kvar >= 0, JSON.stringify(budget));
  const fore2 = JSON.stringify(await falt('mv-a'));
  const buf = await storBild(800, 600);
  await page.setInputFiles(`${nod('profileImage')} input[type=file]`, { name: 'y.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(s => /För många egna bilder sparade lokalt – anslut molnet eller ta bort någon bild\./.test(document.querySelector(s).innerText), nod('profileImage'), { timeout: 10000 });
  assert.equal(JSON.stringify(await falt('mv-a')), fore2, 'fältet skrevs trots budgeten');
  assert.equal(JSON.stringify(await falt('mv-b')), fore.b, 'grannen ändrades');
  assert.equal(await page.evaluate(() => window.VyraMediaval.rymsLokalt(2000)), false);
  assert.equal(await page.evaluate(() => window.VyraMediaval.rymsLokalt(500)), true);
  await page.evaluate(() => { delete state.widgets.find(x => x.id === 'mv-b').provFyll; });
  assert.deepEqual(await lackor(), []);
});

test('inga sidfel under provet', { skip }, () => {
  assert.deepEqual(fel, []);
});
