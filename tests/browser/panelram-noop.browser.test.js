'use strict';
// PANELRAMEN ÄR EN NO-OP FÖR MODELLER UTAN REGISTERPOST (PR 1 i panelspecifikationen).
//
// Spec 0.2: "En modell som inte har någon post i registret får exakt dagens panel." Provet laddar
// studion två gånger — en gång med ramen och registret blockerade i nätet, en gång som vanligt — och
// kräver att egenskapspanelens DOM är tecken för tecken densamma för en modell per familj.
//
// Sedan PR 4 har Top Gift · Design 1–3 och Signal Orbit poster (vyra-topgift-panel.js), och sedan
// PR 5 alla elva Last-X (vyra-lastx-panel.js), och sedan PR 6 alla 26 modeller i Fan Level Up, Gifter
// Level Up, Follower Spotlight och Guardian Emblem (vyra-alert-panel.js), och sedan PR 7 alla 20 Battle
// MVP (vyra-mvp-panel.js), och sedan PR 8 alla 18 rankingmodeller (vyra-ranking-panel.js), och sedan PR 9
// alla 27 mål: Social Goal, Heart Me och Gift Campaign (vyra-mal-panel.js), och sedan PR 10 Top Streak:
// Clean Flip och Design 1–3 (vyra-streak-panel.js). Familjens
// representant är därför den första katalognyckeln vars modell SAKNAR post; en typ där alla modeller
// har post (Top Gift) provas i stället av panel-krav.browser.test.js.
//
// RANKINGEN (PR 8). Top Like och Top Points ritas alltid som en av de sex designerna (pensionerade
// pekas om), så de typerna har ingen modell utan post kvar. Top Coins har en: Halo, som är avvecklad
// ur katalogen men kan finnas i en sparad layout och ska behålla dagens panel — flikarna
// Content/Design/Animation inräknade. Den är därför en RESERV: en typ som saknar representant i
// katalogen provas med reservnyckeln om dess modell saknar post. Utan den hade Top Coins tappats ur
// provet, och antalet familjer hade sjunkit under golvet nedan.
//
// MÅLEN (PR 9) har ingen modell utan post och ingen reserv: Social Goal och Gift Campaign ritas alltid som
// en av sina designer (goal-motion.js modelFor, gift-campaign-aura.js theme), så även en äldre sparad
// widget får målpanelen, och Heart Me har bara sina tolv teman. De tre typerna provas därför av
// panel-krav.browser.test.js, och GOLVET nedan är antalet typer som fortfarande har en modell utan post:
// 20 till och med PR 8, 17 sedan PR 9, 16 sedan PR 10, 13 sedan PR 11, 11 sedan PR 12, 9 sedan PR 13, 8 sedan PR 14, 7 sedan PR 16. Det sjunker med varje familj som
// flyttar in i ramen.
//
// TOP STREAK (PR 10) har inte heller någon modell utan post: approved-rankings.js ritar varje Top Streak, och
// allt som inte är Design 1–3 (även en äldre sparad med avvecklat tema eller streakram) ritas som Clean Flip
// och får Clean Flips panel.
//
// PLAYGROUND (PR 11): Top Gifter Podium, Top Streak Flip och Goal Pro har en post per typ som gäller alla
// modeller (vyra-playground-panel.js), så de tre typerna har ingen modell utan post och provas av panel-krav.
//
// FYRVERKERIERNA (PR 12): Heart Fireworks och Gift Bubbles har en post var (vyra-fyrverkeri-panel.js) och provas av
// panel-krav. Gift Fireworks har poster för de sex temana på duk, som är alla katalogens nycklar. En äldre sparad
// Gift Fireworks med ett CSS-tema (inget fwTheme, bara fwMotion) har ingen post och ska behålla dagens panel; den
// är en RESERV (catalog:giftfireworks:magnetic) på samma sätt som Top Coins Halo.
//
// FONTÄNERNA OCH GÅVOBURKEN (PR 13): Like Fountain har två poster (klassisk och Portal) som tillsammans täcker varje
// modell — allt som inte är Portal ritas som den klassiska — och Gift Jar en post för alla burkar
// (vyra-fontan-panel.js). De två typerna har ingen modell utan post och provas av panel-krav.
//
// FAN LEVEL 50 OCH GLOVE SNIPE (PR 14): Fan Level 50 har en post (vyra-fl50-panel.js) och provas av panel-krav. Glove
// Snipe har poster för de fem paketen (vyra-glove-panel.js), som är alla katalogens nycklar. En äldre sparad klassisk
// Glove Snipe (en widget per klipp, inte "hela paketet") har ingen post och ska behålla dagens panel; den är en RESERV
// (catalog:glovesnipe:koiPearl:boost:2).
//
// EGEN TEXT (PR 16) har en post (vyra-egen-panel.js) och provas av panel-krav. Egen bild och Egen video har ingen post
// än (mediaväljaren och renderaren behöver mötas, se vyra-egen-panel.js) och provas fortfarande här.
//
// FAMILJERNA RÄKNAS FRAM UR KATALOGEN, inte ur en handskriven lista: varje katalognyckel i
// docs/katalogkarta.md byggs med fabriken, och den första nyckeln per widgettyp får representera
// sin familj. En ny familj ärver därmed provet utan att någon behöver minnas det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const vm = require('vm');

// Registret med familjernas poster, utan webbläsare: samma två filer som studio.html laddar.
function registret() {
  const window = {};
  const kod = ['vyra-panelregister.js', 'vyra-topgift-panel.js', 'vyra-lastx-panel.js', 'vyra-alert-panel.js', 'vyra-mvp-panel.js', 'vyra-ranking-panel.js', 'vyra-mal-panel.js', 'vyra-streak-panel.js', 'vyra-playground-panel.js', 'vyra-fyrverkeri-panel.js', 'vyra-fontan-panel.js', 'vyra-fl50-panel.js', 'vyra-glove-panel.js', 'vyra-egen-panel.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  vm.runInNewContext(kod, { window });
  return window.VyraPanelregister;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

// Reserver för typer vars alla katalognycklar har post (se huvudkommentaren).
const RESERV = ['catalog:ranking:templateTopCoins:halo', 'catalog:giftfireworks:magnetic', 'catalog:glovesnipe:koiPearl:boost:2'];

// En nyckel per widgettyp, i katalogens ordning — den första vars modell saknar registerpost.
function familjer() {
  const R = registret();
  const per = new Map();
  for (const nyckel of [...kravNycklar(), ...RESERV]) {
    let w;
    try { w = VyraWidgets.create(nyckel); } catch (_) { continue; }
    if (!w || !w.type || per.has(w.type) || R.hitta(w)) continue;
    per.set(w.type, nyckel);
  }
  return [...per.entries()].map(([typ, nyckel]) => ({ typ, nyckel }));
}

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Laddar studion och fotograferar panelen för varje familj i samma sida. Med `utanRam` blockeras
// ramen, registret och familjernas poster i nätet, så att sidan är exakt den som fanns före PR 1.
async function panelerna(lista, { utanRam }) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  try {
    if (utanRam) await page.route(/\/vyra-(panelram|panelregister|topgift-panel|lastx-panel|alert-panel|mvp-panel|ranking-panel|mal-panel|streak-panel|playground-panel|fyrverkeri-panel|fontan-panel|fl50-panel|glove-panel|egen-panel)\.js/, r => r.abort());
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await page.waitForTimeout(400);

    const lage = await page.evaluate(() => ({
      ram: typeof window.VyraPanelram, register: typeof window.VyraPanelregister,
      poster: window.VyraPanelregister ? window.VyraPanelregister.poster().length : null,
    }));

    const ut = {};
    for (const { typ, nyckel } of lista) {
      await page.evaluate(n => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(n);
        w.id = 'panelram-noop'; w.x = 200; w.y = 200;
        state.widgets.push(w);
        selected = w.id;
        render();
      }, nyckel);
      const las = () => page.evaluate(() => {
        const p = document.querySelector('.properties');
        if (!p) return null;
        // Attributens ordning är ingen skillnad i panelen: den beror på i vilken ordning skript
        // sätter dem (data-ws-tab och data-property-section bytte plats i CI). Sortera dem.
        const k = p.cloneNode(true);
        for (const el of [k, ...k.querySelectorAll('*')]) {
          const a = [...el.attributes].map(x => [x.name, x.value]).sort((x, y) => x[0] < y[0] ? -1 : 1);
          for (const [n] of a) el.removeAttribute(n);
          for (const [n, v] of a) el.setAttribute(n, v);
        }
        return k.outerHTML;
      });
      // Vänta tills panelen slutat ändras. Flera skript märker grupperna efter render() (flikar,
      // ordning), och på en långsam CI-maskin räckte inte 500 ms: textgruppen saknade ibland sin
      // flikmärkning i den ena körningen. Två lika läsningar med 250 ms mellanrum = färdig panel.
      await page.waitForTimeout(500);
      let forra = await las();
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(250);
        const nu = await las();
        if (nu === forra) break;
        forra = nu;
      }
      ut[typ] = forra;
    }
    return { lage, ut };
  } finally {
    await page.close();
  }
}

test('panelens DOM är identisk med och utan ramen, en modell per familj', { skip, timeout: 600000 }, async () => {
  const lista = familjer();
  assert.ok(lista.length >= 7, `bara ${lista.length} familjer räknades fram ur katalogen`);

  const utan = await panelerna(lista, { utanRam: true });
  const med = await panelerna(lista, { utanRam: false });

  // Kontrollmätning: blockeringen fungerade, och ramen var verkligen laddad i den andra körningen.
  assert.equal(utan.lage.ram, 'undefined', 'ramen laddades trots blockeringen');
  assert.equal(med.lage.ram, 'object', 'vyra-panelram.js laddades inte i studion');
  assert.equal(med.lage.register, 'object', 'vyra-panelregister.js laddades inte i studion');
  assert.equal(med.lage.poster, registret().poster().length, 'studion har samma poster som registerfilerna');

  const olika = [], tomma = [];
  for (const { typ, nyckel } of lista) {
    const a = utan.ut[typ], b = med.ut[typ];
    if (!a || !b) { tomma.push(`${typ} (${nyckel})`); continue; }
    if (a !== b) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      olika.push(`${typ} (${nyckel}) skiljer vid tecken ${i}:\n      utan: …${a.slice(Math.max(0, i - 80), i + 120)}\n      med:  …${b.slice(Math.max(0, i - 80), i + 120)}`);
    }
    assert.ok(!/data-panelram/.test(b), `${typ}: ramen satte ett attribut trots att modellen saknar post`);
  }
  assert.deepEqual(tomma, [], 'panelen byggdes inte för dessa familjer');
  assert.deepEqual(olika, [], `ramen ändrade panelen:\n  - ${olika.join('\n  - ')}`);
});
