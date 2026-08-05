#!/usr/bin/env node
'use strict';
// Sanningens karta over widgetkatalogen.
//
// Genereras ur den KORANDE katalogen i en riktig webblasare, inte ur kallkoden. Skalet ar hela
// anledningen till att kartan behovs: rubrikerna i katalogen pastod en gang antal som inte stamde,
// elva knappar saknade katalognyckel medan ett test sa att alla hade en, och tva hela sektioner
// byggdes aldrig trots att koden fanns. Allt det ser rakt ut i kallkoden. Det syns bara nar man
// startar sidan och raknar.
//
//   node scripts/generate-catalog-map.js     ->  docs/katalogkarta.md
//
// Hittas ingen webblasare avbryts genereringen med en tydlig rad i stallet for att skriva en
// halvsann karta.
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const UT = path.join(ROOT, 'docs', 'katalogkarta.md');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}
if (!chromium) { console.error('playwright-core saknas — kor `npm i` forst'); process.exit(1) }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2' };

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32e6 }).trim() } catch { return '' } };

// Vilken commit rorde senast den har katalognyckeln? -S soker i DIFFAR, sa traffen ar den commit
// som faktiskt lade till eller andrade nyckeln — inte varje commit som rakade rora filen.
const historikCache = new Map();
function historik(prefix) {
  if (historikCache.has(prefix)) return historikCache.get(prefix);
  const rad = git('log', '-1', '--format=%ad%x09%s', '--date=short', '-S', prefix, '--', '.');
  const [datum, amne] = rad ? rad.split('\t') : ['', ''];
  const pr = (amne || '').match(/\(#(\d+)\)\s*$/);
  const svar = { datum: datum || '—', pr: pr ? pr[1] : null, amne: (amne || '').replace(/\s*\(#\d+\)\s*$/, '') };
  historikCache.set(prefix, svar);
  return svar;
}

// Familjen ar nyckeln utan sista ledet: catalog:topstreak:frame:rose-heart -> catalog:topstreak:frame
const familj = nyckel => {
  const d = String(nyckel || '').split(':');
  return d.length > 2 ? d.slice(0, d.length - 1).join(':') : nyckel;
};

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  let browser = null;
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { browser = await chromium.launch({ channel }); break } catch (_) {}
  }
  if (!browser) { try { browser = await chromium.launch() } catch (_) {} }
  if (!browser) { console.error('ingen Chrome/Edge/Chromium hittades — kartan genereras inte'); process.exit(1) }

  const server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.owgRenderCardThumb === 'function', null, { timeout: 30000 });

  const data = await page.evaluate(async () => {
    view = 'overlay'; selected = null; render(); bind();
    await new Promise(r => setTimeout(r, 1200));
    // Miniatyrerna ar lata och en headless-flik scrollar inte. Ritas explicit, annars mater
    // kartan observatorn i stallet for katalogen.
    document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')
      .forEach(b => { try { owgRenderCardThumb(b) } catch (_) {} });
    await new Promise(r => setTimeout(r, 600));

    const sektioner = [];
    for (const h of document.querySelectorAll('.overlay-widget-gallery .widget-catalog h4')) {
      const kn = [...h.parentElement.querySelectorAll('button')];
      if (!kn.length) continue;
      sektioner.push({
        rubrik: h.textContent.trim(),
        kort: kn.map(b => {
          const thumb = b.querySelector('.owg-thumb');
          const rot = thumb && (thumb.shadowRoot || thumb);
          const inner = rot && rot.querySelector('.owg-thumb-inner');
          const alla = inner ? [inner.firstElementChild, ...inner.querySelectorAll('*')].filter(Boolean) : [];
          const syns = alla.some(el => {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.display === 'none') return false;
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
          });
          return {
            namn: (b.querySelector('b')?.textContent || b.textContent || '').trim().slice(0, 44),
            nyckel: b.dataset.catalogKey || null,
            shadow: !!(thumb && thumb.shadowRoot),
            ritar: syns
          };
        })
      });
    }
    let regelIDok = 0;
    for (const s of document.styleSheets) {
      let r; try { r = s.cssRules } catch (_) { continue }
      for (const x of r) if (x.cssText && /visibility\s*:\s*visible\s*!important/.test(x.cssText) && /\.widget/.test(x.cssText)) regelIDok++;
    }
    // Vilken session mattes? Katalogen ser olika ut inloggad och utloggad — bl.a. har
    // TOP GIFTER · DESIGNVAL olika manga val. En karta som inte sager vilken session den mott
    // ar precis en sadan rubrik som ljuger om sitt antal, och det ar den sorten kartan finns for.
    const cloud = window.VyraCloudSync && window.VyraCloudSync.current
      ? window.VyraCloudSync.current() : null;
    return { sektioner, regelIDok,
      session: { inloggad: !!(cloud && cloud.workspace), status: window.VyraCloudSync?.status?.() || 'okand' },
      layout: { minnet: state.widgets.length,
        disk: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length } };
  });

  await page.close(); await browser.close();
  await new Promise(r => server.close(r));

  const alla = data.sektioner.flatMap(s => s.kort);
  const total = alla.length;
  const medNyckel = alla.filter(k => k.nyckel).length;
  const medShadow = alla.filter(k => k.shadow).length;
  const ritar = alla.filter(k => k.ritar).length;
  const commit = git('rev-parse', '--short', 'HEAD');

  const rader = [];
  rader.push('# Sanningens karta · widgetkatalogen', '');
  rader.push('<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->', '');
  rader.push('Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.');
  rader.push('Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och');
  rader.push('tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man');
  rader.push('startar sidan och raknar.', '');
  rader.push(`Commit: \`${commit}\``, '');
  rader.push('> **Vilken session kartan mott:** ' +
    (data.session.inloggad ? 'inloggad, med cloud-synk.' :
      '**utloggad**, utan konto och utan cloud-synk.'), '>');
  rader.push('> Katalogen ser inte likadan ut inloggad och utloggad — kontobundna sektioner kan ha');
  rader.push('> ett annat antal val. Kartan genereras i CI, dar ingen inloggning finns, sa siffrorna');
  rader.push('> nedan ar den utloggade vyn. Kolumnerna Nyckel / Shadow / Ritar galler alla kort som');
  rader.push('> faktiskt byggdes, och det ar de kolumnerna som ar vaktarna.', '');
  rader.push('## Sammanfattning', '');
  rader.push('| | |', '|---|---|');
  rader.push(`| Kort totalt | **${total}** |`);
  rader.push(`| Sektioner | ${data.sektioner.length} |`);
  rader.push(`| Med katalognyckel | ${medNyckel} / ${total}${medNyckel === total ? '' : '  ⚠️'} |`);
  rader.push(`| Med shadow DOM-miniatyr | ${medShadow} / ${total}${medShadow === total ? '' : '  ⚠️'} |`);
  rader.push(`| Ritar sin design | ${ritar} / ${total}${ritar === total ? '' : '  ⚠️'} |`);
  rader.push(`| Tandningsregel i dokumentet | ${data.regelIDok}${data.regelIDok ? '  ⚠️ LACKAGE' : '  (ska vara 0)'} |`);
  rader.push(`| Layout rord av katalogen | ${data.layout.minnet} i minnet, ${data.layout.disk} pa disk${data.layout.minnet || data.layout.disk ? '  ⚠️' : '  (ska vara 0/0)'} |`);
  rader.push('');
  rader.push('Tandningsregeln for alerts bor i en shadow root och far inte finnas i');
  rader.push('`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.', '');

  rader.push('## Per sektion', '');
  rader.push('| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |');
  rader.push('|---|---|---|---|---|---|---|');
  for (const s of data.sektioner) {
    const n = s.kort.length;
    const prefix = familj(s.kort.find(k => k.nyckel)?.nyckel || '');
    const h = prefix ? historik(prefix) : { datum: '—', pr: null };
    const flagga = (v, m) => `${v}/${m}${v === m ? '' : ' ⚠️'}`;
    rader.push(`| ${s.rubrik} | ${n} | ${flagga(s.kort.filter(k => k.nyckel).length, n)} | ` +
      `${flagga(s.kort.filter(k => k.shadow).length, n)} | ${flagga(s.kort.filter(k => k.ritar).length, n)} | ` +
      `${h.datum} | ${h.pr ? `[#${h.pr}](https://github.com/davidyakoop88-hub/vyra-production/pull/${h.pr})` : '—'} |`);
  }
  rader.push('');

  rader.push('## Varje kort', '');
  for (const s of data.sektioner) {
    rader.push(`### ${s.rubrik}`, '');
    rader.push('| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |');
    rader.push('|---|---|---|---|---|---|');
    for (const k of s.kort) {
      const h = k.nyckel ? historik(familj(k.nyckel)) : { datum: '—', pr: null };
      rader.push(`| ${k.namn} | ${k.nyckel ? '`' + k.nyckel + '`' : '— ⚠️'} | ${k.shadow ? '✓' : '— ⚠️'} | ` +
        `${k.ritar ? '✓' : '— ⚠️'} | ${h.datum} | ` +
        `${h.pr ? `[#${h.pr}](https://github.com/davidyakoop88-hub/vyra-production/pull/${h.pr})` : '—'} |`);
    }
    rader.push('');
  }

  fs.mkdirSync(path.dirname(UT), { recursive: true });
  fs.writeFileSync(UT, rader.join('\n') + '\n');
  console.log(`skrev ${path.relative(ROOT, UT)} — ${total} kort i ${data.sektioner.length} sektioner`);
  if (medNyckel !== total || medShadow !== total || ritar !== total || data.regelIDok || data.layout.disk) {
    console.log('OBS: kartan innehaller varningar (⚠️)');
  }
})().catch(e => { console.error(e); process.exit(1) });
