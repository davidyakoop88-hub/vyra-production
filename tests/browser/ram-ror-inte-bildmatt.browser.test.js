'use strict';
// Profilramen får inte ändra bildens mått — kontraktet skrivet RÖTT FÖRST (2026-09-08).
//
// KRAVET, ordagrant från David: "jag vill inte bildstorlek och gift storlek ska ändras när man lägger
// ramen runtom" — och det gäller Top Gift, Top Streak OCH Top Like-listan.
//
// LÄGET FÖRE, uppmätt i koden:
//   * profile-frames-premium.css bar en OSCOPAD regel `.pro-avatar-frame>img:first-child{transform:
//     scale(var(--frame-fit))}` skriven för Top Likes rader. Utan prefix träffade den varje
//     .pro-avatar-frame på sidan — även Top Gift/Streak — och krympte profilbilden till ramens
//     öppning: 0,33–0,79 av bilden beroende på vald ram. Gåvobilden rördes inte, så profil och gåva
//     fick olika storlek så fort en ram var vald, och de hoppade i storlek vid varje flip.
//   * gift-alert-frames.js ankrade ramen INUTI profilsidan av flippen. Sidan har backface-visibility:
//     hidden och roterar bort, så ramen försvann när gåvan visades.
//
// KONTRAKTET EFTER: bilden ligger kvar på 100 % av sin ruta med och utan ram; ramkonsten skalas i
// stället UTÅT med 1/fit så att öppningen hamnar exakt runt bilden; i flippande widgets sitter ramen
// utanför flippen och står stilla medan profil och gåva byter plats.
//
// VARFÖR RIKTIG WEBBLÄSARE: det här är ett pixelmått. jsdom svarar 0 på all layout, och de tre
// ramfilerna (profile-frames-premium/toplike-studio/gift-alert-frames) injiceras async av media.js.
// §7: proven går via VyraWidgets.create()/render() och getBoundingClientRect(), aldrig via
// ramfunktionerna direkt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

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

let server, browser, bas;
let skip = hoppaOver();

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

// Samma rigg som ramvaljare-doda-vagar: `?open=layout` går direkt till editorn, 2500 ms låter de
// injicerade ramfilerna landa, projektionen av sessionen måste landa före seedningen.
async function editorMedWidget(katalognyckel, extra) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // Geometri, inte rörelse: premium-streaken flippar oavbrutet och Top Gift glöder, och en bredd
  // mätt med getBoundingClientRect mitt i en rotateY är godtycklig (uppmätt 36 px av 64 vid ~55°).
  // Alla animationer stängs av i provsidan; flippens vilolägen (rotateY 0/180) mäter lika brett.
  await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  const id = await page.evaluate(([nyckel, extra]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(nyckel);
    w.x = 200; w.y = 200;
    Object.assign(w, extra || {});
    state.widgets.push(w);
    selected = w.id;
    render();
    return w.id;
  }, [katalognyckel, extra || null]);
  await page.waitForTimeout(600);
  return { page, id };
}

// Var bilderna sitter per familj. Ramkonsten (img.pro-frame-art) räknas aldrig som bild.
const FAMILJER = {
  topgift:   { profil: '.vyra-profile-face img:not(.pro-frame-art)', gava: '.vyra-gift-face img:not(.pro-frame-art)', flip: '.vyra-flip' },
  topstreak: { profil: '.streak-profile-face img:not(.pro-frame-art)', gava: '.streak-gift-face img:not(.pro-frame-art)', flip: '.streak-flip' },
  toplike:   { profil: '.toplike-row:first-child img:not(.pro-frame-art)' },
  // Fasta fotorutor utan flip: omslaget fyller rutan, fotot fyller omslaget, konsten skalas utåt.
  follower:  { profil: '.follow-avatar img:not(.pro-frame-art)' },
  fanlevel:  { profil: '.fan-profile img:not(.pro-frame-art)' },
  gifter:    { profil: '.gifter-orbit img:not(.pro-frame-art):not(.gifter-diamond)' },
};

// Ett brett tvärsnitt av katalogen: klassiskt tema, premium, extratema med egen konst (coronation
// positionerar flippen absolut), gåvoram (flippen absolut i procent av ramen) och alla fyra
// Top Like-layouterna.
// GÅVORAMSVARIANTERNA (catalog:topgift:frame:*, catalog:topstreak:frame:*) bär redan en ram och får
// INGEN profilram: gåvoramens konst ligger på z-index 3 ovanpå flippen (z 2), så en profilram hamnade
// bakom den och syntes aldrig. De provas här för tre saker som var trasiga fram till 2026-09-08:
//   * Top Gift-flippen var 0×0 px (studio.css `.topgift-framed .vyra-flip{width:auto!important}` slog ut
//     inline-procenten från media.js — samma commit, 578e85b, trasigt från dag ett);
//   * gåvobilden ritades i naturlig storlek (195 px i ett 100 px-fönster) eftersom
//     `.vyra-gift-face>img{width:var(--gift-size)!important}` utan --gift-size blev width:auto;
//   * en vald profilram får inte rendera någon konst alls, och fotot ska stå kvar.
//
// Sista fallet kör Top Like med widgetScale 1,5 (CSS zoom): ramens läge sätts i procent av raden och
// marginalerna räknas om från skärm-px till CSS-px — båda måste hålla när widgeten är zoomad.
const UTAN_RAM = { utanRam: true };
const FALL = [
  ['catalog:topgift',                        'topgift'],
  ['catalog:topgift:premium:royal',          'topgift'],
  ['catalog:topgift:extra:coronation',       'topgift'],
  ['catalog:topgift:frame:royal-wings',      'topgift', UTAN_RAM],
  ['catalog:topgift:frame:angel-heart',      'topgift', UTAN_RAM],
  ['catalog:topstreak',                      'topstreak'],
  ['catalog:topstreak:premium:liquid',       'topstreak'],
  ['catalog:topstreak:frame:amethyst-heart', 'topstreak', UTAN_RAM],
  ['catalog:toplike:clean',                  'toplike'],
  ['catalog:toplike:center',                 'toplike'],
  ['catalog:toplike:podium',                 'toplike'],
  ['catalog:toplike:neon',                   'toplike'],
  ['catalog:toplike:clean',                  'toplike', { widgetScale: 1.5 }],
  // De fasta fotorutorna i Gift & Alert-familjen. Last-X saknas med flit: de fyra gamla typerna
  // (templateLastGifter m.fl.) är ersatta av templateLastX, som inte ingår i ramfamiljen.
  ['catalog:followeralert',                  'follower'],
  ['catalog:fanlevel:gold',                  'fanlevel'],
  ['catalog:gifterlevel:orbitlevel',         'gifter'],
  // number-layouten visar inte orbitfotot (bara det lilla .gifter-bottom-profile, som lämnas oramat).
  ['catalog:gifterlevel:profile',            'gifter'],
];

function matt(page, id, sel) {
  return page.evaluate(([wid, s]) => {
    const rot = document.querySelector(`.canvas [data-id="${wid}"]`);
    const el = s ? rot.querySelector(s) : rot;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, [id, sel]);
}

const nara = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(1)} mot ${b.toFixed(1)}`);

for (const [nyckel, familj, extra] of FALL) {
  const namn = nyckel + (extra ? ' ' + JSON.stringify(extra) : '');
  test(`${namn}: ramen ändrar varken profilbildens eller gåvobildens mått`, { skip }, async () => {
    const { page, id } = await editorMedWidget(nyckel, extra);
    const sel = FAMILJER[familj];
    try {

    // Två ramar i motsatta ändar av öppningsspannet: den som klämmer bilden mest och en mittemellan.
    // Läses ur FRAME_GEOM i sidan så att provet följer katalogen när ramar tillkommer.
    const ramar = await page.evaluate(() => {
      const g = window.VYRA_FRAME_GEOM || {};
      const ids = Object.keys(g).sort((a, b) => g[a][0] - g[b][0]);
      return ids.length ? [ids[0], ids[Math.floor(ids.length / 2)]] : [];
    });
    assert.ok(ramar.length === 2, 'FRAME_GEOM saknas i sidan — toplike-studio.js har inte laddat');

    const fore = {
      widget: await matt(page, id, null),
      profil: await matt(page, id, sel.profil),
      gava: sel.gava ? await matt(page, id, sel.gava) : null,
      rad: familj === 'toplike' ? await matt(page, id, '.toplike-row:first-child') : null,
    };
    assert.ok(fore.profil && fore.profil.w > 10, `${nyckel}: hittar ingen profilbild utan ram`);
    if (sel.gava) assert.ok(fore.gava && fore.gava.w > 10, `${nyckel}: hittar ingen gåvobild utan ram`);

    for (const ram of ramar) {
      await page.evaluate(([wid, r]) => {
        const w = state.widgets.find(x => x.id === wid); w.profileFrame = r; render();
      }, [id, ram]);
      await page.waitForTimeout(300);

      const efter = {
        widget: await matt(page, id, null),
        profil: await matt(page, id, sel.profil),
        gava: sel.gava ? await matt(page, id, sel.gava) : null,
        konst: await matt(page, id, 'img.pro-frame-art'),
        geom: await page.evaluate(r => window.vyraFrameGeom(r), ram),
        konstIProfilsidan: await page.evaluate(wid =>
          !!document.querySelector(`.canvas [data-id="${wid}"] .vyra-profile-face img.pro-frame-art, .canvas [data-id="${wid}"] .streak-profile-face img.pro-frame-art`), id),
      };

      assert.ok(efter.profil, `${nyckel} + ${ram}: profilbilden försvann när ramen lades på`);

      if (extra && extra.utanRam) {
        // Gåvoramsvariant: ingen profilram alls, och bilderna orörda. Gåvobilden ska dessutom rymmas
        // i fönstret — den ritades förr i naturlig storlek när --gift-size saknades.
        assert.equal(efter.konst, null, `${nyckel} + ${ram}: en profilram renderades ovanpå gåvoramen`);
        nara(efter.profil.w, fore.profil.w, 0.5, `${nyckel} + ${ram}: profilbildens bredd ändrades`);
        nara(efter.gava.w, fore.gava.w, 0.5, `${nyckel} + ${ram}: gåvobildens bredd ändrades`);
        const fonster = await matt(page, id, sel.flip);
        assert.ok(efter.gava.w <= fonster.w + 0.5 && efter.gava.h <= fonster.h + 0.5,
          `${nyckel}: gåvobilden (${efter.gava.w.toFixed(0)}×${efter.gava.h.toFixed(0)}) ryms inte i fönstret (${fonster.w.toFixed(0)}×${fonster.h.toFixed(0)})`);
        // Namnplattan (Top Gift): namn och värde på var sin rad, namnet oavkortat och skalat efter
        // plattans bredd — plattorna är 94–131 px breda och rymde inte "@StreamQueen ◉ 44 999" på
        // en rad (avkortat till "@..." fram till 2026-09-08).
        if (familj === 'topgift') {
          const platta = await page.evaluate(wid => {
            const p = document.querySelector(`.canvas [data-id="${wid}"] .tgf-plate`); if (!p) return null;
            const s = p.querySelector('strong'), e = p.querySelector('em'), r = p.getBoundingClientRect(), a = s.getBoundingClientRect(), b = e.getBoundingClientRect();
            return { avkortat: s.scrollWidth > s.clientWidth + 1, tvaRader: b.top >= a.bottom - 1,
              inuti: a.top >= r.top - 1 && b.bottom <= r.bottom + 1 && a.left >= r.left - 1 && a.right <= r.right + 1 && b.left >= r.left - 1 && b.right <= r.right + 1,
              namn: s.textContent, fs: getComputedStyle(s).fontSize };
          }, id);
          assert.ok(platta, `${nyckel}: ingen namnplatta`);
          assert.equal(platta.avkortat, false, `${nyckel}: namnet "${platta.namn}" avkortas i plattan (font ${platta.fs})`);
          assert.equal(platta.tvaRader, true, `${nyckel}: namn och värde ligger inte på var sin rad`);
          assert.equal(platta.inuti, true, `${nyckel}: namn eller värde sticker ut ur plattan`);
        }
        continue;
      }

      assert.ok(efter.konst, `${nyckel} + ${ram}: ingen ramkonst renderades`);

      // 1. Bilden får inte röra sig en pixel — varken storlek eller mittpunkt.
      nara(efter.profil.w, fore.profil.w, 0.5, `${nyckel} + ${ram}: profilbildens BREDD ändrades av ramen`);
      nara(efter.profil.h, fore.profil.h, 0.5, `${nyckel} + ${ram}: profilbildens HÖJD ändrades av ramen`);
      nara(efter.profil.cx, fore.profil.cx, 0.5, `${nyckel} + ${ram}: profilbilden flyttade sig i sidled`);
      if (fore.rad) {
        // Top Like: raden får växa för att rymma ramen (steg 2), och fotot följer med sin layouts
        // justering: centrerat innehåll flyttar en halv tillväxt (clean, podium, neon), toppjusterat
        // ingenting, bottenjusterat hela (center: fotot sitter överst i ett block som ligger mot
        // nederkanten — uppmätt 27,9 px av 27,9). Fotot får alltså bara röra sig 0, ½ eller 1 gånger
        // radens tillväxt — aldrig av ramen i sig.
        const rad = await matt(page, id, '.toplike-row:first-child');
        const tillvaxt = rad.h - fore.rad.h;
        const flytt = (efter.profil.cy - (rad.cy - rad.h / 2)) - (fore.profil.cy - (fore.rad.cy - fore.rad.h / 2));
        const tillatna = [0, tillvaxt / 2, tillvaxt];
        assert.ok(tillatna.some(t => Math.abs(flytt - t) <= 0.5),
          `${nyckel} + ${ram}: profilbilden flyttade ${flytt.toFixed(1)} px i raden, men raden växte ${tillvaxt.toFixed(1)} px — tillåtet är 0, ${(tillvaxt / 2).toFixed(1)} eller ${tillvaxt.toFixed(1)}`);
      } else {
        nara(efter.profil.cy, fore.profil.cy, 0.5, `${nyckel} + ${ram}: profilbilden flyttade sig i höjdled`);
      }
      if (sel.gava) {
        nara(efter.gava.w, fore.gava.w, 0.5, `${nyckel} + ${ram}: gåvobildens bredd ändrades av ramen`);
        nara(efter.gava.h, fore.gava.h, 0.5, `${nyckel} + ${ram}: gåvobildens höjd ändrades av ramen`);
        // Profil- och gåvo-<img> jämförs inte med varandra: de delar samma flipruta, men profilbildens
        // img ligger innanför sidans 2 px-kant (106 av 110) medan gåvobilden ritas kant till kant och
        // klipps av samma cirkel. Det är oberoende av ramen och samma med som utan.
      }

      // 2. Widgetens egen ruta står stilla. Ramen får ta plats utanför bilden, aldrig trycka ihop den.
      //    I Top Like byggdes raden förr om (68→54 px) så fort ett omslag fanns. Nu står raden kvar i
      //    samma mått; ramen ryms i radens MARGINALBOX (marginalen knuffar grannarna), och ingen ram i
      //    widgeten går in i en annan — inte ens i like-center där rad 1 ligger diagonalt över 2 och 3.
      nara(efter.widget.w, fore.widget.w, 0.5, `${nyckel} + ${ram}: widgetens bredd ändrades av ramen`);
      if (fore.rad) {
        const rad = await matt(page, id, '.toplike-row:first-child');
        // Raden får växa (i like-center sträcks rad 1 i sitt grid-spår när rad 2–3 knuffas ned) men
        // aldrig krympa — krympningen var det gamla felet (68→54).
        assert.ok(rad.h >= fore.rad.h - 0.5, `${nyckel} + ${ram}: Top Like-raden krympte av ramen: ${rad.h.toFixed(1)} mot ${fore.rad.h.toFixed(1)}`);
        nara(rad.w, fore.rad.w, 0.5, `${nyckel} + ${ram}: Top Like-radens bredd ändrades av ramen`);
        const brott = await page.evaluate(wid => {
          const rot = document.querySelector(`.canvas [data-id="${wid}"]`), ut = [];
          const arter = [...rot.querySelectorAll('img.pro-frame-art')].filter(a => getComputedStyle(a).display !== 'none');
          arter.forEach((art, j) => {
            const a = art.getBoundingClientRect(), rad = art.parentElement, r = rad.getBoundingClientRect();
            const k = r.width / (rad.offsetWidth || 1), cs = getComputedStyle(rad);
            const topp = r.top - parseFloat(cs.marginTop) * k, botten = r.bottom + parseFloat(cs.marginBottom) * k;
            if (a.top < topp - 1 || a.bottom > botten + 1) ut.push(`rad ${j + 1}: konsten ${a.top.toFixed(0)}–${a.bottom.toFixed(0)} utanför marginalboxen ${topp.toFixed(0)}–${botten.toFixed(0)}`);
            for (let i = 0; i < j; i++) {
              const p = arter[i].getBoundingClientRect();
              if (a.left < p.right - 1 && a.right > p.left + 1 && a.top < p.bottom - 1 && a.bottom > p.top + 1) ut.push(`rad ${j + 1} går in i rad ${i + 1}`);
            }
          });
          return ut;
        }, id);
        assert.deepEqual(brott, [], `${nyckel} + ${ram}: ${brott.join('; ')}`);
      }

      // 2b. Ramen måste också SYNAS: getBoundingClientRect bryr sig inte om klippning, så varje
      //     förfader upp till widgeten som konsten sticker utanför måste ha overflow visible.
      const klippare = await page.evaluate(wid => {
        const art = document.querySelector(`.canvas [data-id="${wid}"] img.pro-frame-art`);
        const rot = art.closest('.widget'), a = art.getBoundingClientRect(), ut = [];
        for (let el = art.parentElement; el && el !== rot.parentElement; el = el.parentElement) {
          const r = el.getBoundingClientRect(), o = getComputedStyle(el);
          const utanfor = a.left < r.left - 0.5 || a.right > r.right + 0.5 || a.top < r.top - 0.5 || a.bottom > r.bottom + 0.5;
          if (utanfor && (/hidden|clip/.test(o.overflow) || o.clipPath !== 'none')) ut.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${o.overflow}/${o.clipPath})`);
        }
        return ut;
      }, id);
      assert.deepEqual(klippare, [], `${nyckel} + ${ram}: ramkonsten klipps av ${klippare.join(', ')}`);

      // 3. Ramen växer utåt: konsten är bilden delad med öppningen, och öppningens mitt ligger på
      //    bildens mitt. Öppningen (fit) och dess förskjutning (dx/dy) är uppmätta per ram i
      //    toplike-studio.js — samma siffror som CSS:en räknar med.
      //    Referensrutan är det användaren ser som "bilden": i flippande widgets hela fliprutan
      //    (cirkeln med sin 2 px-kant, 110 px — fotot innanför kanten är 106), i Top Like själva
      //    fotot. Konsten är alltid kvadratisk och styrd av bredden, så dy räknas mot bredden.
      const { fit, dx, dy } = efter.geom;
      const ruta = sel.flip ? await matt(page, id, sel.flip) : efter.profil;
      nara(efter.konst.w, ruta.w / fit, 1.5, `${nyckel} + ${ram}: ramkonsten är inte bilden/fit (fit=${fit})`);
      nara(efter.konst.h, efter.konst.w, 0.5, `${nyckel} + ${ram}: ramkonsten är inte kvadratisk`);
      nara(efter.konst.cx + dx * efter.konst.w, ruta.cx, 1.5, `${nyckel} + ${ram}: ramöppningen sitter inte mitt på bilden i sidled`);
      nara(efter.konst.cy + dy * efter.konst.w, ruta.cy, 1.5, `${nyckel} + ${ram}: ramöppningen sitter inte mitt på bilden i höjdled`);

      // 4. I flippande widgets sitter ramen UTANFÖR profilsidan, så den står kvar när gåvan visas.
      if (sel.flip) assert.equal(efter.konstIProfilsidan, false, `${nyckel} + ${ram}: ramen ligger inuti profilsidan och flippar bort`);
    }

    // 5. Ramen bort igen — bilden är tillbaka i exakt samma ruta, utan spår av ramen.
    await page.evaluate(wid => { const w = state.widgets.find(x => x.id === wid); w.profileFrame = 'none'; render(); }, id);
    await page.waitForTimeout(300);
    const utan = await matt(page, id, sel.profil);
    const konstKvar = await matt(page, id, 'img.pro-frame-art');
    assert.equal(konstKvar, null, `${nyckel}: ramkonsten ligger kvar efter "Ingen"`);
    nara(utan.w, fore.profil.w, 0.5, `${nyckel}: profilbilden fick inte tillbaka sitt mått efter att ramen togs bort`);
    } finally {
      // Stäng alltid — ett rött fall som lämnar sidan öppen drar med sig hela sviten i minnesbrist.
      await page.close();
    }
  });
}
