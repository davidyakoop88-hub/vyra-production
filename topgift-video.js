// TOP GIFT SPELAR GÅVANS EGEN ANIMATION (2026-10-31, PR 719 steg 4).
//
// Top Gift visar rekordgåvans BILD i `.vyra-gift-face img`, skriven av två skrivare
// (live-leaderboard.js skrivTopGift och gift-event-images.js). Den här modulen rör ingen av dem: den
// lägger en ram och en <canvas> i gåvosidan och spelar TikToks animation för samma gåva i loop med
// gavovideo.js, stort och utskuret som BetterTok (se STORLEK nedan). Bilden ligger kvar under som reserv — den syns igen om videon inte går att spela,
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
  // nedtill, så utsnittet tas NEDIFRÅN: canvasen är RAM × (1 + UPPAT) hög, fyller bredden
  // (object-fit:cover) och står med underkanten i ramens underkant. Den del som når över ramen är
  // samma video — där den är genomskinlig syns ingenting, så bara motivet sticker ut.
  var STORLEK = 1.6;    // ramens sida i förhållande till gåvobildens ruta
  var UPPAT = 0.45;     // hur mycket av ramens höjd motivet får sticka upp ovanför den
  var RUNDNING = 0.12;  // ramens hörnradie i förhållande till sidan

  var STIL = '.vyra-gift-face.tgv-aktiv{overflow:visible!important;border-color:transparent!important;background:transparent!important;box-shadow:none!important}' +
    '.vyra-topgift-ram{position:absolute;pointer-events:none;z-index:2;background:radial-gradient(circle at 50% 35%,#ffffff1f,#0000 70%),#0c0816;' +
    'box-shadow:0 0 0 2px rgb(var(--tgv-glod,217 164 65)/.85),0 0 22px 4px rgb(var(--tgv-glod,217 164 65)/.6);opacity:0;transition:opacity .25s,box-shadow .6s}' +
    '.vyra-topgift-video{position:absolute;pointer-events:none;z-index:3;object-fit:cover;object-position:50% 100%;opacity:0;transition:opacity .25s}' +
    '.tgv-aktiv>.vyra-topgift-ram,.tgv-aktiv>.vyra-topgift-video{opacity:1}';
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

  // Ramen centreras i sidled på gåvobildens ruta men växer mest NEDÅT (UPP_ANDEL av tillväxten
  // uppåt): ovanför bilden står widgetens rubrik ("TOP GIFTER"), och en centrerad ram täckte den
  // (sett i Studio 2026-10-31). Nedåt hamnar ramen under namnkortet, som ritas ovanpå — samma
  // staplade bild som hos BetterTok. Designerna sätter bildens storlek olika (62 px klassisk, 110 px
  // royal, !important på flera ställen), så rutan läses av i stället för att gissas.
  var UPP_ANDEL = 0.2;
  function placera(post) {
    var b = post.bild, sida = Math.round(Math.max(b.offsetWidth, b.offsetHeight) * STORLEK);
    if (!sida) return;
    var vanster = Math.round(b.offsetLeft + b.offsetWidth / 2 - sida / 2);
    var topp = Math.round(b.offsetTop - (sida - b.offsetHeight) * UPP_ANDEL);
    var r = Math.round(sida * RUNDNING) + 'px';
    var ram = post.ram.style, c = post.canvas.style, hojd = Math.round(sida * (1 + UPPAT));
    ram.left = vanster + 'px'; ram.top = topp + 'px'; ram.width = sida + 'px'; ram.height = sida + 'px'; ram.borderRadius = r;
    c.left = vanster + 'px'; c.top = (topp + sida - hojd) + 'px'; c.width = sida + 'px'; c.height = hojd + 'px';
    // Nederhörnen följer ramens rundning; överkanten klipps inte, där sticker motivet ut.
    c.clipPath = 'inset(0 round 0 0 ' + r + ' ' + r + ')';
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

  function starta(bild, url) {
    var motor = root.VyraGavovideo;
    if (!motor) return;
    stil();
    var doc = root.document, ansikte = bild.parentNode;
    var ram = doc.createElement('div');
    ram.className = 'vyra-topgift-ram';
    ram.setAttribute('aria-hidden', 'true');
    var canvas = doc.createElement('canvas');
    canvas.className = 'vyra-topgift-video';
    canvas.setAttribute('aria-hidden', 'true');
    if (root.getComputedStyle(ansikte).position === 'static') ansikte.style.position = 'relative';
    ansikte.insertBefore(canvas, bild.nextSibling);
    ansikte.insertBefore(ram, canvas);
    var post = { bild: bild, ansikte: ansikte, ram: ram, canvas: canvas, url: url, spelare: null, stoppad: false };
    spelare.push(post);
    placera(post);
    motor.spela(canvas, url, { loopa: true }).then(function (s) {
      if (post.stoppad) { s.stoppa(); return; }
      post.spelare = s;
      ansikte.classList.add('tgv-aktiv');
      bild.style.visibility = 'hidden';
      setTimeout(function () { if (!post.stoppad) glod(post); }, 700);
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
      var kvar = p.url === aktuell && p.bild.isConnected && p.canvas.isConnected;
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
      starta(bild, aktuell);
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
  root.VyraTopGiftVideo = { stam: stam, aktuell: function () { return aktuell; } };
})(window);
