// GIFT CAMPAIGN · VARJE GÅVA SPELAR SIN EGEN VIDEO (2026-11-06).
//
// Kampanjmodellerna (gift-campaign-modeller.js) visar en gåva i taget i sin "videoyta". Har gåvan en
// TikTok-animation spelas DEN gåvans animation där — aldrig ett gemensamt klipp, aldrig en annan
// gåvas. Har den ingen visas bilden. Spelaren är densamma som Top Gift använder (gavovideo.js,
// VyraGavovideo.spela: zip från *.tiktokcdn.com, alfa ur config.json, WebGL).
//
// STRIKT PÅ giftId. TikTok har flera gåvor med samma namn och olika animation (Hand Heart: 5660,
// 5924, 6968 — uppmätt i inspelningarna 2026-11-06). Därför slås videon aldrig upp på namn:
//   video(giftId)  — länken som en RIKTIG gåvohändelse med just det id:t bar (bryggan sätter
//                    giftVideo, normalizer.js giftVideoOf). Lärs in från vyra-live-event.
//   platsId(w, i)  — vilken gåva plats i ÄR: giftId<i> om gåvovalet sparat det, annars det id som
//                    senast räknades in under platsens namn (samma namnregel som räknaren i
//                    gift-event-images.js), annars katalogens id om namnet bara har ETT id.
// Ett namn med flera id och ingen inräknad gåva ger inget id → bilden. Hellre bild än fel klipp.
//
// Länkarna har ingen utgångstid (gavovideo.js, uppmätt 2026-10-30) och sparas i localStorage, så en
// omladdad OBS-källa spelar direkt i stället för att vänta på nästa gåva av samma sort.
//
// INGA DOLDA VIDEOR. En spelplats spelar bara när modellen säger att den syns (visa) och stoppas
// (videon pausas, objekt-URL:en släpps, canvasen tas bort) när den inte gör det. Hela sidan har ett
// tak på MAX_SAMTIDIGA spelande platser. Inget ljud: gavovideo.js spelar alltid tyst.
(function (root) {
  'use strict';
  if (root.VyraKampanjVideo) return;

  var GILTIG = /^https:\/\/([\w-]+\.)*tiktokcdn\.com\//;
  var NYCKEL = 'vyra-kampanj-gavovideo-v1';
  var MAX_POSTER = 400;
  var MAX_SAMTIDIGA = 4;

  var nyckel = function (n) { return String(n == null ? '' : n).trim().toLowerCase(); };
  var katalog = { video: {}, id: {} };   // video: giftId -> zip-länk · id: namnnyckel -> senaste giftId
  try {
    var sparad = JSON.parse(root.localStorage.getItem(NYCKEL) || 'null');
    if (sparad && typeof sparad === 'object') {
      Object.keys(sparad.video || {}).forEach(function (id) { if (GILTIG.test(sparad.video[id])) katalog.video[id] = sparad.video[id]; });
      Object.keys(sparad.id || {}).forEach(function (n) { if (sparad.id[n]) katalog.id[n] = String(sparad.id[n]); });
    }
  } catch (e) { /* privat läge eller trasig post: börja tomt */ }

  var lyssnare = [];
  function trimma(o) { var k = Object.keys(o); for (var i = 0; i < k.length - MAX_POSTER; i += 1) delete o[k[i]]; }
  function spara() {
    trimma(katalog.video); trimma(katalog.id);
    try { root.localStorage.setItem(NYCKEL, JSON.stringify(katalog)); } catch (e) { /* fullt: minnet räcker sidan ut */ }
  }

  // Bara gåvohändelser med eget id lär något. En länk utanför *.tiktokcdn.com ignoreras — overlayen
  // hämtar den rakt in i OBS (samma regel som bryggan, servern och topgift-video.js).
  function lar(e) {
    if (!e || !String(e.type || e.event || '').toLowerCase().includes('gift')) return false;
    var id = String(e.giftId || '').trim();
    if (!id) return false;
    var andrad = false, url = String(e.giftVideo || '');
    if (GILTIG.test(url) && katalog.video[id] !== url) { delete katalog.video[id]; katalog.video[id] = url; andrad = true; }
    var n = nyckel(e.giftName || e.gift);
    if (n && katalog.id[n] !== id) { delete katalog.id[n]; katalog.id[n] = id; andrad = true; }
    if (andrad) { spara(); lyssnare.slice().forEach(function (f) { try { f(id); } catch (err) { console.error('[VyraKampanjVideo]', err); } }); }
    return andrad;
  }
  if (root.addEventListener) root.addEventListener('vyra-live-event', function (ev) { lar(ev.detail || {}); });

  function video(giftId) { var id = String(giftId || ''); return id && katalog.video[id] || ''; }

  function platsId(w, i) {
    if (!w) return '';
    var egen = String(w['giftId' + i] || '').trim();
    if (egen) return egen;
    var items = typeof root.VyraCampaignItems === 'function' ? root.VyraCampaignItems(w) : [];
    var namn = nyckel(w['giftMatch' + i] || (items[i] && items[i].name) || w['giftName' + i]);
    if (!namn) return '';
    if (katalog.id[namn]) return katalog.id[namn];
    var K = root.VyraGavokatalog;
    if (K && typeof K.idn === 'function') {
      try { var idn = Array.from(K.idn(namn) || []); if (idn.length === 1) return String(idn[0]); } catch (e) { /* utan katalog: inget id */ }
    }
    return '';
  }

  // Hämtar zip:en i förväg (gavovideo.js minns den uppackade videon per länk), så att nästa gåva kan
  // börja från första rutan direkt när den blir aktiv. Objekt-URL:en släpps genast.
  function forladda(url) {
    var G = root.VyraGavovideo;
    if (!url || !G || typeof G.hamta !== 'function') return;
    G.hamta(url).then(function (r) { try { URL.revokeObjectURL(r.videoUrl); } catch (e) {} }, function () {});
  }

  var spelande = new Set();

  // EN SPELPLATS = en videoyta i en modell. `ruta` är elementet som håller gåvobilden (<img>).
  // visa(giftId) spelar den gåvans video från första rutan; bilden ligger kvar under tills första
  // rutan är ritad och tonas sedan bort — ingen svart blinkning, och ett fel lämnar bilden.
  function Spelplats(ruta, val) {
    this.ruta = ruta;
    this.val = val || {};
    this.id = '';
    this.url = '';
    this.spelare = null;
    this.canvas = null;
    this.varv = 0;           // stegas vid varje visa/stoppa: ett sent svar från en gammal visa kastas
    this.langd = 0;          // videons längd i sekunder när den är känd
    this.fel = '';
  }
  Spelplats.prototype.status = function () {
    return { id: this.id, url: this.url, spelar: !!this.spelare, synlig: !!(this.canvas && this.canvas.dataset.synlig), langd: this.langd, fel: this.fel,
      tid: this.spelare && this.spelare.video ? this.spelare.video.currentTime : 0, pausad: this.spelare && this.spelare.video ? this.spelare.video.paused : true };
  };
  Spelplats.prototype.visa = function (giftId) {
    var id = String(giftId || ''), url = video(id);
    if (this.spelare && this.id === id && this.url === url) return this;   // spelar redan rätt gåva
    this.stoppa();
    this.id = id; this.url = url; this.fel = '';
    if (!url || !root.VyraGavovideo) return this;
    if (spelande.size >= MAX_SAMTIDIGA) { this.fel = 'tak'; return this; }
    var mig = this, varv = ++this.varv, doc = this.ruta.ownerDocument;
    var c = doc.createElement('canvas');
    c.className = 'gcm-video';
    c.setAttribute('aria-hidden', 'true');
    this.canvas = c;
    this.ruta.appendChild(c);
    spelande.add(this);
    // En gång, inte i loop: en loop som platsens tid bröt mitt i visade en halv animation. När
    // videon är slut tonas den bort och bilden kommer tillbaka; franBorjan() spelar den igen.
    var slut = function () { if (varv !== mig.varv) return; delete c.dataset.synlig; mig.ruta.classList.remove('gcm-video-pa'); };
    root.VyraGavovideo.spela(c, url, { loopa: false, klar: slut }).then(function (s) {
      if (varv !== mig.varv) { s.stoppa(); return; }
      mig.spelare = s;
      var v = s.video;
      var satt = function () { if (v.duration > 0 && isFinite(v.duration)) { mig.langd = v.duration; if (mig.val.langd) mig.val.langd(mig.langd, mig); } };
      if (v.readyState >= 1) satt(); else v.addEventListener('loadedmetadata', satt, { once: true });
      // Första rutan: gavovideo.js ritar i sin egen requestVideoFrameCallback, registrerad före
      // den här, så när den här körs ligger rutan redan på canvasen.
      var fram = function () { if (varv !== mig.varv) return; c.dataset.synlig = '1'; mig.ruta.classList.add('gcm-video-pa'); };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(fram); else setTimeout(fram, 80);
    }, function (err) {
      if (varv !== mig.varv) return;
      mig.fel = String(err && err.message || err || 'fel');
      mig.taBort();
    });
    return this;
  };
  // Tillbaka till första rutan (en gåva som tas emot igen eller får en ny tur).
  Spelplats.prototype.franBorjan = function () {
    var v = this.spelare && this.spelare.video, c = this.canvas, mig = this, varv = this.varv;
    if (!v || !c) return;
    try { v.currentTime = 0; } catch (e) {}
    v.play().catch(function () {});
    var fram = function () { if (varv !== mig.varv) return; c.dataset.synlig = '1'; mig.ruta.classList.add('gcm-video-pa'); };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(fram); else setTimeout(fram, 80);
  };
  Spelplats.prototype.taBort = function () {
    spelande.delete(this);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    if (this.ruta && this.ruta.classList) this.ruta.classList.remove('gcm-video-pa');
  };
  Spelplats.prototype.stoppa = function () {
    this.varv += 1;
    if (this.spelare) { try { this.spelare.stoppa(); } catch (e) {} }
    this.spelare = null; this.langd = 0;
    this.taBort();
    return this;
  };

  var api = {
    lar: lar, video: video, platsId: platsId, forladda: forladda, Spelplats: Spelplats,
    pa: function (f) { lyssnare.push(f); return function () { var i = lyssnare.indexOf(f); if (i >= 0) lyssnare.splice(i, 1); }; },
    spelande: function () { return spelande.size; },
    katalog: function () { return JSON.parse(JSON.stringify(katalog)); },
    MAX_SAMTIDIGA: MAX_SAMTIDIGA
  };
  root.VyraKampanjVideo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
