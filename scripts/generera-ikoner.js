// Engångsrigg: rastrerar repots EGEN grafik till favikon + og-bild.
// Ritar inget nytt — vl-ikon.svg och vyra-live-lockup.svg är oförändrade källor.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROT = process.argv[2] || require('path').resolve(__dirname, '..');


const b64 = f => fs.readFileSync(path.join(ROT, f)).toString('base64');
const svgUri = f => 'data:image/svg+xml;base64,' + b64(f);

(async () => {
  let browser = null;
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { browser = await chromium.launch({ channel }); break } catch (_) {}
  }
  if (!browser) { try { browser = await chromium.launch() } catch (_) {} }
  if (!browser) { console.error('ingen webblasare'); process.exit(1) }

  const ikon = svgUri('assets/logo/vl-ikon.svg');
  const lockup = svgUri('assets/logo/vyra-live-lockup.svg');

  // --- favikoner: ren rastrering av vl-ikon.svg, ingen bakgrund tillagd ---
  for (const [fil, px] of [['favicon-32.png', 32], ['favicon-180.png', 180]]) {
    const p = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;padding:0;background:transparent}
      img{display:block;width:${px}px;height:${px}px}</style><img src="${ikon}">`);
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: path.join(ROT, fil), omitBackground: true });
    await p.close();
    console.log('skrev', fil, px + 'px');
  }

  // --- og-bild 1200x630: lockup pa samma markbakgrund som framsidan ---
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.setContent(`<style>
    html,body{margin:0;padding:0}
    body{width:1200px;height:630px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:34px;
      background:radial-gradient(120% 100% at 50% 0%,#2a1140 0%,#150a22 45%,#0b0612 100%);
      font-family:'Segoe UI',system-ui,sans-serif;position:relative;overflow:hidden}
    .rutnat{position:absolute;inset:0;opacity:.16;
      background-image:linear-gradient(#a855f722 1px,transparent 1px),linear-gradient(90deg,#a855f722 1px,transparent 1px);
      background-size:56px 56px}
    .glod{position:absolute;left:50%;top:-14%;width:820px;height:520px;transform:translateX(-50%);
      background:radial-gradient(closest-side,#a855f755,transparent 70%);filter:blur(22px)}
    img{width:660px;height:auto;position:relative}
    h1{margin:0;position:relative;color:#fff;font-size:40px;font-weight:700;letter-spacing:-.5px;text-align:center}
    p{margin:0;position:relative;color:#c9b5e4;font-size:25px;text-align:center}
  </style>
  <div class="rutnat"></div><div class="glod"></div>
  <img src="${lockup}">
  <h1>Overlays som får din TikTok Live att sticka ut</h1>
  <p>Top Gifters · Gift Alerts · Leaderboards — direkt i OBS</p>`);
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: path.join(ROT, 'og-vyralive.png') });
  await p.close();
  console.log('skrev og-vyralive.png 1200x630');

  await browser.close();

  // --- favicon.ico: ICONDIR + ICONDIRENTRY runt 32px-PNG:en (ICO bar PNG sedan Vista) ---
  const png = fs.readFileSync(path.join(ROT, 'favicon-32.png'));
  const dir = Buffer.alloc(6); dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = 32; ent[1] = 32; ent[2] = 0; ent[3] = 0;
  ent.writeUInt16LE(1, 4); ent.writeUInt16LE(32, 6);
  ent.writeUInt32LE(png.length, 8); ent.writeUInt32LE(22, 12);
  fs.writeFileSync(path.join(ROT, 'favicon.ico'), Buffer.concat([dir, ent, png]));
  console.log('skrev favicon.ico', (22 + png.length) + ' byte');
  fs.unlinkSync(path.join(ROT, 'favicon-32.png')); // bara ravara till .ico, skeppas inte
})();
