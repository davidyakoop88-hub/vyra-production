// TOP GIFT SPELAR GÅVANS EGEN ANIMATION (2026-10-31, PR 719 steg 4).
//
// Top Gift visar rekordgåvans BILD i `.vyra-gift-face img`, skriven av två skrivare
// (live-leaderboard.js skrivTopGift och gift-event-images.js). Den här modulen rör ingen av dem: den
// lägger en ram och en <canvas> i gåvosidan och spelar TikToks animation för samma gåva i loop med
// gavovideo.js, stort och utskuret som BetterTok (se FORMER nedan). Bilden ligger kvar under som reserv — den syns igen om videon inte går att spela,
// och direkt när ett nytt rekord saknar video.
//
// SAMMA BESLUT SOM BILDEN. Rekordet avgörs en gång per händelseobjekt i records.bedom
// (gift-event-images.js), och svaret minns per objekt. Den här lyssnaren frågar samma funktion med
// samma objekt, så bild och video kan aldrig visa olika gåvor.
//
// Länken (`giftVideo`) kommer från bryggan och är kontrollerad där och i servern; kollen här är den
// sista. Den sparas i sessionStorage så att en omladdad OBS-källa fortsätter spela samma rekord, och
// nollas på live:start precis som live-leaderboard.js nollar rekordet.
(function (root) {
  'use strict';
  var NYCKEL = 'vyra-topgift-video';
  var GILTIG = /^https:\/\/([\w-]+\.)*tiktokcdn\.com\//;
  var aktuell = '';
  try { aktuell = root.sessionStorage.getItem(NYCKEL) || ''; } catch (e) { aktuell = ''; }
  if (!GILTIG.test(aktuell)) aktuell = '';
  var spelare = [];   // { bild, canvas, url, spelare }

  function spara(url) {
    aktuell = url;
    try { if (url) root.sessionStorage.setItem(NYCKEL, url); else root.sessionStorage.removeItem(NYCKEL); } catch (e) {}
  }

  // SOM BETTERTOK (2026-10-31, uppmätt ur deras inspelning bildruta för bildruta): animationen visas
  // stort i en fyrkantig RAM som den fyller, med glöd i gåvans färg, och motivet får sticka upp över
  // ramens överkant (örnens vinge). TikToks animationer är ritade för hela mobilskärmen med motivet
  // nedtill, så utsnittet tas NEDIFRÅN: canvasen är ramen × (1 + uppat) hög, fyller bredden
  // (object-fit:cover) och står med underkanten i ramens underkant. Den del som når över ramen är
  // samma video — där den är genomskinlig syns ingenting, så bara motivet sticker ut.
  //
  // FORMEN VÄLJS PER WIDGET (fältet tgVideoForm, panelens "Videons form", David 2026-10-31). Varje
  // form är samma spelare med andra mått:
  //   storlek  ramens sida i förhållande till gåvobildens ruta
  //   uppat    hur mycket av ramens höjd motivet får sticka upp ovanför den
  //   rund     hörnradie i förhållande till sidan (0.5 = cirkel); radie ersätter den med en färdig
  //            border-radius (bågen)
  //   polygon  en clip-path-polygon i stället för rundade hörn (sexhörning, diamant)
  //   ring     ramen ritas utan mörk yta — bara den glödande kanten
  //   ram      om den mörka rutan med glöd ritas bakom videon
  //   klipp    'nedre' rundar bara nederhörnen (motivet sticker ut upptill), 'allt' klipper hela
  //            formen, '' klipper ingenting
  //   upp      hur stor del av tillväxten som går uppåt (resten nedåt)
  // 'bild' spelar ingen video alls — Top Gift visar gåvobilden som förut.
  //
  // 'profil' är förvald (David 2026-10-31): videon tar profilsidans form, storlek, kant och glöd, så
  // att en rund profilbild ger en rund video. I Design 1 vänder kortet mellan sidorna — en större
  // fyrkant på gåvosidan täckte namnkortet och tappade guldringen när kortet vände.
  var FORMER = {
    profil: { namn: 'Som profilbilden', profil: true },
    ram:    { namn: 'Ram med glöd', storlek: 1.6, uppat: 0.45, rund: 0.12, ram: true, klipp: 'nedre', upp: 0.2 },
    cirkel: { namn: 'Cirkel', storlek: 1.4, uppat: 0, rund: 0.5, ram: true, klipp: 'allt', upp: 0.5 },
    ring:   { namn: 'Glödande ring', storlek: 1.5, uppat: 0.45, rund: 0.5, ram: true, ring: true, klipp: 'nedre', upp: 0.3 },
    sexhorning: { namn: 'Sexhörning', storlek: 1.5, uppat: 0, ram: true, klipp: 'allt', upp: 0.4,
      polygon: '50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%' },
    diamant: { namn: 'Diamant', storlek: 1.7, uppat: 0, ram: true, klipp: 'allt', upp: 0.4,
      polygon: '50% 0,100% 50%,50% 100%,0 50%' },
    bage:   { namn: 'Båge', storlek: 1.5, uppat: 0, ram: true, klipp: 'allt', upp: 0.3,
      radie: '50% 50% 12% 12% / 40% 40% 12% 12%' },
    fri:    { namn: 'Fri, utan ram', storlek: 2, uppat: 0.5, rund: 0, ram: false, klipp: '', upp: 0.5 },
    ruta:   { namn: 'I bildrutan', storlek: 1, uppat: 0, rund: -1, ram: false, klipp: 'allt', upp: 0.5 },
    bild:   { namn: 'Bara bild (ingen video)' },
  };
  var STANDARD = 'profil';
  function widgetFor(bild) {
    var rot = bild.closest ? bild.closest('.vyra-topgift') : null, id = rot && rot.dataset ? rot.dataset.id : '';
    try {
      // state är studio.js toppnivå-let — nåbar som namn, inte som window.state.
      var lista = (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : [];
      for (var i = 0; i < lista.length; i += 1) if (lista[i] && lista[i].id === id) return lista[i];
    } catch (e) { /* ingen widget: förvalen gäller */ }
    return {};
  }
  function formFor(bild) {
    var val = widgetFor(bild).tgVideoForm;
    return FORMER[val] ? val : STANDARD;
  }

  // EGNA FÄRGER (panelens "Videons kantfärg" och "Videons glödfärg", David 2026-10-31). Orörda följer
  // videon profilbilden (formen 'profil') eller gåvans egen färg (de andra formerna).
  var HEX = /^#[0-9a-f]{6}$/i;
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].join(' '); }
  function egnaFarger(post, profil) {
    var w = widgetFor(post.bild), ram = post.ram.style;
    var kant = HEX.test(w.tgVideoKant || '') ? w.tgVideoKant : '', glodFarg = HEX.test(w.tgVideoGlod || '') ? w.tgVideoGlod : '';
    post.egenGlod = !!glodFarg;
    if (glodFarg) ram.setProperty('--tgv-glod', hexRgb(glodFarg));
    if (profil && glodFarg) ram.boxShadow = '0 0 0 2px ' + glodFarg + ', 0 0 16px ' + glodFarg;
    // Kanten: i 'profil' är det profilsidans egen kant — finns ingen blir den 3 px, och videon krymper
    // innanför den (canvasen ligger ovanpå ramen). I de andra formerna en kontur strax utanför ramen,
    // så att ramens mått inte ändras; polygonerna har ingen rak kant att följa och får bara glöden.
    ram.outline = ''; ram.outlineOffset = '';
    if (kant && profil) {
      ram.borderStyle = 'solid'; ram.borderColor = kant;
      if (!parseFloat(ram.borderWidth)) {
        ram.borderWidth = '3px';
        var c = post.canvas.style;
        c.left = (parseFloat(c.left) + 3) + 'px'; c.top = (parseFloat(c.top) + 3) + 'px';
        c.width = (parseFloat(c.width) - 6) + 'px'; c.height = (parseFloat(c.height) - 6) + 'px';
      }
    } else if (kant && !FORMER[post.form].polygon) { ram.outline = '3px solid ' + kant; ram.outlineOffset = '0'; }
  }

  var STIL = '.vyra-gift-face.tgv-aktiv{overflow:visible!important;border-color:transparent!important;background:transparent!important;box-shadow:none!important}' +
    '.vyra-topgift-ram{position:absolute;pointer-events:none;z-index:2;background:radial-gradient(circle at 50% 35%,#ffffff1f,#0000 70%),#0c0816;' +
    'box-shadow:0 0 0 2px rgb(var(--tgv-glod,217 164 65)/.85),0 0 22px 4px rgb(var(--tgv-glod,217 164 65)/.6);opacity:0;transition:opacity .25s,box-shadow .6s}' +
    '.vyra-topgift-video{position:absolute;pointer-events:none;z-index:3;object-fit:cover;object-position:50% 100%;opacity:0;transition:opacity .25s}' +
    '.tgv-aktiv>.vyra-topgift-ram,.tgv-aktiv>.vyra-topgift-video{opacity:1}' +
    // Glödande ring: bara kanten, motivet syns rakt mot sändningen.
    '.vyra-topgift-ram.tgv-ring{background:none;box-shadow:inset 0 0 0 3px rgb(var(--tgv-glod,217 164 65)),0 0 0 1px rgb(var(--tgv-glod,217 164 65)/.5),0 0 24px 6px rgb(var(--tgv-glod,217 164 65)/.6),inset 0 0 18px 2px rgb(var(--tgv-glod,217 164 65)/.45)}' +
    // Polygonerna: en clip-path klipper bort box-shadow, så ytan klipps i ett barn och glöden läggs
    // som drop-shadow på ramen, där den följer polygonens kant.
    '.vyra-topgift-ram>i{display:none;position:absolute;inset:0;background:radial-gradient(circle at 50% 35%,#ffffff1f,#0000 70%),#0c0816}' +
    '.vyra-topgift-ram.tgv-polygon{background:none;box-shadow:none;filter:drop-shadow(0 0 1.5px rgb(var(--tgv-glod,217 164 65))) drop-shadow(0 0 1.5px rgb(var(--tgv-glod,217 164 65))) drop-shadow(0 0 12px rgb(var(--tgv-glod,217 164 65)/.7))}' +
    '.vyra-topgift-ram.tgv-polygon>i{display:block}';
  function stil() {
    var doc = root.document;
    if (doc.getElementById('vyra-topgift-video-stil')) return;
    var s = doc.createElement('style');
    s.id = 'vyra-topgift-video-stil';
    s.textContent = STIL;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function stoppa(post) {
    if (post.spelare) post.spelare.stoppa();
    post.stoppad = true;
    [post.ram, post.canvas].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    if (post.ansikte && post.ansikte.classList) post.ansikte.classList.remove('tgv-aktiv');
    post.bild.style.visibility = '';
  }

  // I formen 'ram' centreras ramen i sidled på gåvobildens ruta men växer mest NEDÅT (andelen upp av tillväxten
  // uppåt): ovanför bilden står widgetens rubrik ("TOP GIFTER"), och en centrerad ram täckte den
  // (sett i Studio 2026-10-31). Nedåt hamnar ramen under namnkortet, som ritas ovanpå — samma
  // staplade bild som hos BetterTok. Designerna sätter bildens storlek olika (62 px klassisk, 110 px
  // royal, !important på flera ställen), så rutan läses av i stället för att gissas.
  function placera(post) {
    var f = FORMER[post.form], b = post.bild;
    var ram = post.ram.style, c = post.canvas.style;
    ram.border = ''; ram.boxShadow = ''; ram.boxSizing = '';
    if (f.profil) { placeraSomProfil(post); egnaFarger(post, true); return; }
    var sida = Math.round(Math.max(b.offsetWidth, b.offsetHeight) * f.storlek);
    if (!sida) return;
    var vanster = Math.round(b.offsetLeft + b.offsetWidth / 2 - sida / 2);
    var topp = Math.round(b.offsetTop - (sida - b.offsetHeight) * f.upp);
    // 'I bildrutan' tar bildens egen rundning, så videon får samma form som bilden den ersätter.
    var r = f.radie ? f.radie : f.rund < 0 ? ((root.getComputedStyle && root.getComputedStyle(b).borderRadius) || '0px')
      : f.rund >= 0.5 ? '50%' : Math.round(sida * (f.rund || 0)) + 'px';
    var hojd = Math.round(sida * (1 + f.uppat));
    ram.display = f.ram ? '' : 'none';
    post.ram.className = 'vyra-topgift-ram' + (f.ring ? ' tgv-ring' : '') + (f.polygon ? ' tgv-polygon' : '');
    post.ram.firstChild.style.clipPath = f.polygon ? 'polygon(' + f.polygon + ')' : '';
    ram.left = vanster + 'px'; ram.top = topp + 'px'; ram.width = sida + 'px'; ram.height = sida + 'px'; ram.borderRadius = r;
    c.left = vanster + 'px'; c.top = (topp + sida - hojd) + 'px'; c.width = sida + 'px'; c.height = hojd + 'px';
    // 'nedre': nederhörnen följer ramens rundning och överkanten klipps inte — där sticker motivet ut.
    // Procent i inset() räknas mot den högre canvasen, så nederhörnen får ramens radie i px.
    var rNedre = Math.round(sida * Math.min(f.rund || 0, 0.5)) + 'px';
    egnaFarger(post, false);
    c.clipPath = f.polygon ? 'polygon(' + f.polygon + ')'
      : f.klipp === 'nedre' ? 'inset(0 round 0 0 ' + rNedre + ' ' + rNedre + ')'
      : f.klipp === 'allt' ? 'inset(0 round ' + r + ')' : '';
  }

  // SOM PROFILBILDEN: samma ruta som profilsidan (.vyra-profile-face), centrerad på gåvobilden, med
  // profilsidans egen rundning, kant och skugga avlästa — designerna sätter dem olika, så de gissas
  // inte. Videon klipps innanför kanten.
  function placeraSomProfil(post) {
    var b = post.bild, rot = b.closest ? b.closest('.vyra-topgift') : null;
    var pf = rot && rot.querySelector('.vyra-profile-face');
    var ps = pf && root.getComputedStyle ? root.getComputedStyle(pf) : null;
    var bredd = (pf && pf.offsetWidth) || b.offsetWidth, hojd = (pf && pf.offsetHeight) || b.offsetHeight;
    if (!bredd || !hojd) return;
    var vanster = Math.round(b.offsetLeft + b.offsetWidth / 2 - bredd / 2);
    var topp = Math.round(b.offsetTop + b.offsetHeight / 2 - hojd / 2);
    var radie = (ps && ps.borderRadius) || '50%', kant = ps ? parseFloat(ps.borderTopWidth) || 0 : 0;
    var ram = post.ram.style, c = post.canvas.style;
    post.ram.className = 'vyra-topgift-ram';
    post.ram.firstChild.style.clipPath = '';
    ram.display = '';
    ram.left = vanster + 'px'; ram.top = topp + 'px'; ram.width = bredd + 'px'; ram.height = hojd + 'px';
    ram.borderRadius = radie; ram.boxSizing = 'border-box';
    if (ps) { ram.border = ps.border; ram.boxShadow = ps.boxShadow; }
    c.left = (vanster + kant) + 'px'; c.top = (topp + kant) + 'px';
    c.width = (bredd - 2 * kant) + 'px'; c.height = (hojd - 2 * kant) + 'px';
    c.clipPath = 'inset(0 round ' + radie + ')';
  }

  // GLÖDEN I GÅVANS FÄRG: medelfärgen av motivet, vägd med genomskinligheten, läst ur videons
  // färg- och alfahalva i en liten 2D-ruta. Videon kommer från en blob-URL (samma ursprung), så
  // pixlarna går att läsa. Misslyckas det står ramens guld kvar.
  function glod(post) {
    try {
      var s = post.spelare, k = s && s.konfig, v = s && s.video;
      if (!k || !v || v.readyState < 2) return;
      var N = 24, doc = root.document, c = doc.createElement('canvas');
      c.width = N * 2; c.height = N;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(v, k.farg[0], k.farg[1], k.farg[2], k.farg[3], 0, 0, N, N);
      x.drawImage(v, k.alfa[0], k.alfa[1], k.alfa[2], k.alfa[3], N, 0, N, N);
      var d = x.getImageData(0, 0, N * 2, N).data, sum = [0, 0, 0], vikt = 0;
      for (var y = 0; y < N; y += 1) for (var i = 0; i < N; i += 1) {
        var f = (y * N * 2 + i) * 4, a = d[(y * N * 2 + N + i) * 4] / 255;
        if (a < 0.3) continue;
        sum[0] += d[f] * a; sum[1] += d[f + 1] * a; sum[2] += d[f + 2] * a; vikt += a;
      }
      if (vikt < 4) return;
      var rgb = sum.map(function (t) { return t / vikt; });
      // Mättnad upp: en medelfärg blir grå-brun, glöden ska lysa i gåvans ton.
      var medel = (rgb[0] + rgb[1] + rgb[2]) / 3;
      rgb = rgb.map(function (t) { return Math.max(0, Math.min(255, Math.round(medel + (t - medel) * 1.8 + 30))); });
      post.ram.style.setProperty('--tgv-glod', rgb.join(' '));
    } catch (e) { /* guldet står kvar */ }
  }

  function starta(bild, url, form) {
    var motor = root.VyraGavovideo;
    if (!motor) return;
    stil();
    var doc = root.document, ansikte = bild.parentNode;
    var ram = doc.createElement('div');
    ram.className = 'vyra-topgift-ram';
    ram.setAttribute('aria-hidden', 'true');
    ram.appendChild(doc.createElement('i'));
    var canvas = doc.createElement('canvas');
    canvas.className = 'vyra-topgift-video';
    canvas.setAttribute('aria-hidden', 'true');
    if (root.getComputedStyle(ansikte).position === 'static') ansikte.style.position = 'relative';
    ansikte.insertBefore(canvas, bild.nextSibling);
    ansikte.insertBefore(ram, canvas);
    var post = { bild: bild, ansikte: ansikte, ram: ram, canvas: canvas, url: url, form: form, spelare: null, stoppad: false };
    spelare.push(post);
    placera(post);
    motor.spela(canvas, url, { loopa: true }).then(function (s) {
      if (post.stoppad) { s.stoppa(); return; }
      post.spelare = s;
      ansikte.classList.add('tgv-aktiv');
      bild.style.visibility = 'hidden';
      setTimeout(function () { if (!post.stoppad && !post.egenGlod) glod(post); }, 700);
    }).catch(function () {
      // Spelas den inte står bilden kvar — samma läge som innan modulen fanns.
      stoppa(post);
      spelare = spelare.filter(function (p) { return p !== post; });
    });
  }

  // Varje Top Gift-bild ska ha exakt en spelare för den aktuella länken. Körs efter varje rekord
  // och en gång i sekunden: en render() byter ut widgetens DOM, och då ska videon komma tillbaka.
  function stam() {
    var doc = root.document;
    spelare = spelare.filter(function (p) {
      var kvar = p.url === aktuell && p.bild.isConnected && p.canvas.isConnected && p.form === formFor(p.bild);
      if (!kvar) stoppa(p);
      return kvar;
    });
    spelare.forEach(placera);
    if (!aktuell) return;
    var bilder = doc.querySelectorAll('.vyra-topgift .vyra-gift-face img');
    for (var i = 0; i < bilder.length; i += 1) {
      var bild = bilder[i];
      if (!bild.parentNode) continue;
      if (spelare.some(function (p) { return p.bild === bild; })) continue;
      var form = formFor(bild);
      if (form === 'bild') continue;
      starta(bild, aktuell, form);
    }
  }

  function paGava(event) {
    var e = event && event.detail;
    if (!e || String(e.type || '').toLowerCase() !== 'gift') return;
    var records = root.VyraGiftRecords;
    if (!records || typeof records.bedom !== 'function') return;
    var beslut = records.bedom(e);
    if (!beslut || !beslut.gift) return;          // inget nytt rekord: allt står kvar
    var url = String(e.giftVideo || '');
    spara(GILTIG.test(url) ? url : '');            // nytt rekord utan video: bilden tar över
    stam();
  }

  root.addEventListener('vyra-live-event', paGava);
  root.addEventListener('vyra-live-session', function (event) {
    if (event && event.detail && event.detail.event === 'live:start') { spara(''); stam(); }
  });
  setInterval(stam, 1000);
  root.VyraTopGiftVideo = {
    stam: stam,
    aktuell: function () { return aktuell; },
    // Panelens alternativ (vyra-topgift-panel.js läser dem när panelen byggs).
    former: Object.keys(FORMER).map(function (k) { return [k, FORMER[k].namn]; }),
  };
})(window);
