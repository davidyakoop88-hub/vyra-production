// STREAM DECK — knapparna i VYRA-pluginet (streamdeck-plugin/, 0.2.0) och sidan i menyn.
//
// Davids önskemål 2026-09-27 (med en skärmbild av en konkurrents sida): en egen Stream Deck-sida i
// menyn, och knappar för Actions, ljud, uppläsning, musik, scener och timers. Kopplingen: BÅDE via
// VYRA Desktop (den här ändringen) och via molnet med parkopplingskod (nästa ändring).
//
// KEDJAN (Desktop-vägen)
//   Stream Deck-knapp → plugin.js POST 127.0.0.1:4173/api/events {type:'streamdeck', sdKommando,
//   sdVarde, sdVal} → electron-app/local-server.js cleanEvent (släpper igenom sd-fälten på just den
//   typen) → live-client.js pollar → `vyra-live-event` → den här filen.
//
// VAR ETT KOMMANDO KÖRS. Både studion och OBS-overlayn får samma händelse. Varje kommando körs där
// det hör hemma, och bara där — annars hade ett ljud spelats två gånger:
//   overlayn   action, ljud, tts        (Actions spelas bara i OBS-utgången, action-runtime.js)
//   studion    spotify, scen, timer, widget  (Spotify-token, OBS-kopplingen och skrivrätten bor där)
//   båda       latonsk                   (YouTube spelas i overlayn, Spotify-kön styrs från studion)
// Studiokommandon körs EN gång även med flera flikar öppna (navigator.locks + localStorage).
(function (root) {
  'use strict';

  var iOverlay = function () { try { return document.body.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (e) { return false; } };
  var saker = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lika = function (a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
  var SEDDA = {};
  var senaste = null;   // { kommando, varde, at, utfall } — visas på sidan

  function aeState() { try { return JSON.parse(localStorage.getItem('vyra-action-event-v2') || '{"actions":[],"events":[]}'); } catch (e) { return { actions: [], events: [] }; } }
  function hittaAction(namn) {
    var s = root.VyraActionEvent && root.VyraActionEvent.read ? root.VyraActionEvent.read() : aeState();
    return (s.actions || []).filter(function (a) { return lika(a.name, namn) || a.id === namn; })[0] || null;
  }
  // En gång över alla studioflikar: den som först tar låset och markerar id:t kör.
  function enGang(id, fn) {
    var nyckel = 'vyra-sd-' + id;
    var gor = function () {
      try { if (localStorage.getItem(nyckel)) return; localStorage.setItem(nyckel, String(Date.now())); } catch (e) {}
      return fn();
    };
    try { if (navigator.locks && navigator.locks.request) return navigator.locks.request(nyckel, gor); } catch (e) {}
    return gor();
  }
  // Ljud och uppläsning spelas i scen 1, som ett engångsprogram för Action-motorn. Bara scen 1: en
  // streamer med tre OBS-källor ska höra ljudet en gång, inte tre.
  function spelaIScen1(action) {
    if (Number(root.VYRA_OVERLAY_SCENE || 0) !== 1 || !root.VyraActionRuntime) return 'inte scen 1';
    root.VyraActionRuntime.execute({ action: action, payload: { username: 'Stream Deck' }, runId: 'sd-' + Date.now() });
    return 'spelas';
  }

  var KOMMANDON = {
    action: { dar: 'overlay', gor: function (v) {
      var a = hittaAction(v); if (!a) return 'hittade ingen Action som heter "' + v + '"';
      if (!root.VyraActionEvent || !root.VyraActionEvent.runAction) return 'Action-motorn saknas';
      return root.VyraActionEvent.runAction(a, { username: 'Stream Deck' }) ? 'kördes' : 'stoppades (cooldown eller scen)';
    } },
    ljud: { dar: 'overlay', gor: function (v) {
      var alla = typeof saSounds === 'function' ? saSounds() : [];
      var ljud = alla.filter(function (s) { return lika(s.name, v) || s.id === v; })[0];
      if (!ljud) return 'hittade inget ljud som heter "' + v + '"';
      var media = typeof saGetMediaMeta === 'function' ? saGetMediaMeta(ljud) : (ljud.path ? { packagePath: ljud.path, name: ljud.name } : null);
      if (!media) return 'ljudet saknar fil';
      return spelaIScen1({ id: 'sd-ljud', name: 'Stream Deck: ' + ljud.name, types: ['audio'], duration: 6, cooldown: 0, volume: 80, audioMedia: media, scene: { number: 1 } });
    } },
    tts: { dar: 'overlay', gor: function (v) {
      if (!String(v || '').trim()) return 'ingen text';
      return spelaIScen1({ id: 'sd-tts', name: 'Stream Deck: uppläsning', types: ['tts'], duration: 8, cooldown: 0, volume: 90, config: { ttsText: String(v).slice(0, 300) }, scene: { number: 1 } });
    } },
    spotify: { dar: 'studio', gor: function (v, val) {
      if (!root.VyraSpotify) return 'Spotify saknas';
      var p = val === 'spela' ? root.VyraSpotify.play(v) : root.VyraSpotify.next();
      if (p && p.catch) p.catch(function (e) { markera('spotify', v, 'fel: ' + (e && e.message)); });
      return val === 'spela' ? 'spelar "' + v + '"' : 'nästa låt';
    } },
    latonsk: { dar: 'bada', gor: function (v, val) {
      if (!root.VyraLatonskningar) return 'Låtönskningar saknas';
      if (val === 'tom') root.VyraLatonskningar.tom(); else root.VyraLatonskningar.hoppaOver();
      return val === 'tom' ? 'kön tömd' : 'hoppade över';
    } },
    scen: { dar: 'studio', gor: function (v) {
      if (!String(v || '').trim()) return 'inget scennamn';
      document.dispatchEvent(new CustomEvent('vyra:obs-scene', { detail: { scene: String(v).trim() } }));
      return 'bytte till "' + v + '"';
    } },
    timer: { dar: 'studio', gor: function (v, val) {
      var s = aeState(), a = hittaAction(v);
      var t = (s.timers || []).filter(function (x) { return x.id === v || (a && x.actionId === a.id); })[0];
      if (!t) return 'hittade ingen timer för "' + v + '"';
      if (val === 'start') t.enabled = true;
      else if (val === 'stopp') t.enabled = false;
      else if (val === 'vaxla') t.enabled = !t.enabled;
      else t.lastRun = Date.now();
      // Bara via session-state.js — den äger nyckeln (tests/…skyddade nycklarna). Utan den: rör inget.
      if (!root.VyraSessionState || !root.VyraSessionState.writeActive) return 'sessionen är inte redo';
      root.VyraSessionState.writeActive('vyra-action-event-v2', JSON.stringify(s));
      return val === 'nollstall' ? 'nollställd' : (t.enabled ? 'startad' : 'stoppad');
    } },
    widget: { dar: 'studio', gor: function (v, val) {
      var w = ((typeof state !== 'undefined' && state && state.widgets) || []).filter(function (x) { return lika(x.title, v) || x.id === v || lika(x.templateTitle, v); })[0];
      if (!w) return 'hittade ingen widget som heter "' + v + '"';
      var live = typeof liveWidget === 'function' ? (liveWidget(w.id) || w) : w;
      live.hidden = val === 'gom' ? true : val === 'visa' ? false : !live.hidden;
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
      return live.hidden ? 'gömd' : 'visas';
    } }
  };

  function markera(kommando, varde, utfall) {
    senaste = { kommando: kommando, varde: varde, utfall: utfall, at: Date.now() };
    var el = document.querySelector('#sdSenast');
    if (el) el.textContent = beskriv(senaste);
  }
  function beskriv(s) {
    if (!s) return 'Inga knapptryck ännu i den här fliken.';
    var t = new Date(s.at);
    return (t.getHours() < 10 ? '0' : '') + t.getHours() + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes()
      + ' · ' + (NAMN[s.kommando] || s.kommando) + (s.varde ? ' "' + s.varde + '"' : '') + ' — ' + s.utfall;
  }

  function utfor(e) {
    var k = KOMMANDON[String(e.sdKommando || '')];
    if (!k) return null;
    var id = String(e.eventKey || e.id || '');
    if (id) { if (SEDDA[id]) return null; SEDDA[id] = 1; }
    var overlay = iOverlay();
    if (k.dar === 'overlay' && !overlay) return null;
    if (k.dar === 'studio' && overlay) return null;
    var kor = function () {
      var utfall;
      try { utfall = k.gor(String(e.sdVarde || ''), String(e.sdVal || '')); } catch (err) { utfall = 'fel: ' + (err && err.message); }
      markera(e.sdKommando, e.sdVarde, utfall);
      return utfall;
    };
    return (k.dar === 'studio' && id) ? enGang(id, kor) : kor();
  }
  root.addEventListener('vyra-live-event', function (ev) { var e = ev && ev.detail; if (e && String(e.type || '').toLowerCase() === 'streamdeck') utfor(e); });

  // ---- SIDAN I MENYN -------------------------------------------------------------------------
  var NAMN = { knapp: 'Manuell knapp', action: 'Kör Action', ljud: 'Spela ljud', tts: 'Läs upp', spotify: 'Spotify',
    latonsk: 'Låtönskningar', scen: 'Byt OBS-scen', timer: 'Timer', widget: 'Visa eller göm widget' };
  var BILD = { knapp: 'key', action: 'sdk-action', ljud: 'sdk-ljud', tts: 'sdk-tts', spotify: 'sdk-spotify',
    latonsk: 'sdk-latonsk', scen: 'sdk-scen', timer: 'sdk-timer', widget: 'sdk-widget' };
  var MAPP = 'streamdeck-plugin/se.vyra.live.sdPlugin/';
  var viaDesktop = function () { return /^(127\.0\.0\.1|localhost)$/.test(location.hostname); };

  // ---- MOLNVÄGEN: parkopplingskod och enheter ------------------------------------------------
  // Utan VYRA Desktop når Stream Deck-knapparna VYRA via molnet. Streamern genererar en kod här och
  // knappar in den i pluginet; pluginet byter koden mot en enhetstoken (server/streamdeck.js).
  function arbetsyta() { try { return root.VyraAuth && root.VyraAuth.lastDetail && root.VyraAuth.lastDetail().workspaces[0].id; } catch (e) { return ''; } }
  function api(vag, opt) {
    if (root.VyraAuth && root.VyraAuth.api) return root.VyraAuth.api(vag, opt);
    return Promise.reject(new Error('Logga in på VYRA för att parkoppla'));
  }
  function tidText(iso) {
    if (!iso) return 'aldrig';
    var d = new Date(iso), s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'nyss'; if (s < 3600) return Math.floor(s / 60) + ' min sedan';
    if (s < 86400) return Math.floor(s / 3600) + ' tim sedan'; return Math.floor(s / 86400) + ' dygn sedan';
  }
  function ritaEnheter() {
    var lista = document.querySelector('#sdEnheter'); if (!lista) return;
    var ws = arbetsyta();
    if (!ws) { lista.innerHTML = '<p>Logga in på VYRA för att parkoppla en Stream Deck mot molnet.</p>'; return; }
    api('/api/workspaces/' + encodeURIComponent(ws) + '/streamdeck/devices').then(function (d) {
      var e = (d && d.enheter) || [];
      lista.innerHTML = e.length
        ? e.map(function (x) { return '<div class="sd-enhet-rad"><span><b>' + saker(x.label || 'Stream Deck') + '</b><small>Senast: ' + tidText(x.last_seen_at) + '</small></span><button type="button" class="sd-sparra" data-id="' + saker(x.id) + '">Spärra</button></div>'; }).join('')
        : '<p>Ingen parkopplad enhet ännu.</p>';
      lista.querySelectorAll('.sd-sparra').forEach(function (b) {
        b.onclick = function () {
          api('/api/workspaces/' + encodeURIComponent(ws) + '/streamdeck/devices/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' })
            .then(function () { if (typeof toast === 'function') toast('Enheten spärrad'); ritaEnheter(); })
            .catch(function (err) { if (typeof toast === 'function') toast(err.message); });
        };
      });
    }).catch(function (err) { lista.innerHTML = '<p>' + saker(err.message) + '</p>'; });
  }
  function generera() {
    var ws = arbetsyta();
    if (!ws) { if (typeof toast === 'function') toast('Logga in på VYRA först'); return; }
    var ruta = document.querySelector('#sdKodruta'); if (ruta) ruta.textContent = 'Genererar …';
    api('/api/workspaces/' + encodeURIComponent(ws) + '/streamdeck/pairings', { method: 'POST', body: '{}' })
      .then(function (d) {
        if (ruta) ruta.innerHTML = '<b class="sd-kod">' + saker(d.kod) + '</b><small>Gäller i 15 minuter — skriv in den i pluginets ruta <b>VYRA-molnet</b>.</small>';
      })
      .catch(function (err) { if (ruta) ruta.textContent = err.message; });
  }

  function lista(rubrik, namn) {
    var unika = namn.filter(function (n, i) { return n && namn.indexOf(n) === i; }).slice(0, 40);
    return '<div class="sd-namnlista"><h4>' + rubrik + ' <small>' + unika.length + '</small></h4>'
      + (unika.length ? '<div>' + unika.map(function (n) { return '<button type="button" class="sd-kopiera" data-kopiera="' + saker(n) + '" title="Kopiera">' + saker(n) + '</button>'; }).join('') + '</div>'
        : '<p>Inga ännu.</p>') + '</div>';
  }
  function sida() {
    var knapp = document.querySelector('[data-extra="streamdeck"]');
    if (!knapp || !knapp.classList.contains('active')) return;
    var vy = document.querySelector('#view'), titel = document.querySelector('#title');
    if (!vy) return;
    if (titel) titel.textContent = 'Stream Deck';
    var s = aeState();
    var actions = (s.actions || []).map(function (a) { return a.name; });
    var ljud = (typeof saSounds === 'function' ? saSounds() : []).map(function (x) { return x.name; });
    var widgets = ((typeof state !== 'undefined' && state && state.widgets) || []).map(function (w) { return w.title || w.templateTitle; });
    var desktop = viaDesktop();
    vy.innerHTML = '<section class="card sd-sida-head"><div><h2><i class="sd-rutnat"></i>Stream Deck</h2><p>Styr VYRA från din Elgato Stream Deck — Actions, ljud, uppläsning, musik, OBS-scener, timers och widgetar.</p></div>'
      + '<span class="sd-status' + (desktop ? ' sd-ok' : '') + '">' + (desktop ? 'Ansluten via VYRA Desktop' : 'Kräver VYRA Desktop') + '</span></section>'
      + '<section class="card sd-sida"><header><h3>Kom igång</h3><p>Pluginet följer med VYRA Desktop och installeras av sig självt.</p></header><div class="sd-kolumner"><div>'
      + '<ol class="sd-stegen"><li><b>Installera VYRA Desktop</b><span>Pluginet läggs på plats i Stream Deck när appen startar. Utan appen: ladda ner pluginet nedan.</span></li>'
      + '<li><b>Öppna Stream Deck</b><span>Kategorin <b>VYRA</b> finns i listan till höger i Stream Deck-appen.</span></li>'
      + '<li><b>Dra en VYRA-knapp till en tangent</b><span>Fyll i namnet i rutan under — namnen finns att kopiera längst ner på den här sidan.</span></li></ol>'
      + '<div class="sd-knappar"><a class="sd-primar" href="/api/downloads/windows">⬇ Ladda ner VYRA Desktop</a><button type="button" class="sd-sekundar" id="sdLaddaNer">⬇ Ladda ner pluginet</button></div></div>'
      + '<div><h4 class="sd-rubrik">PLUGINETS KNAPPAR</h4><div class="sd-rutor">' + Object.keys(NAMN).map(function (k) {
        return '<span class="sd-ruta"><img src="' + MAPP + BILD[k] + '.png" width="36" height="36" alt="">' + NAMN[k] + '</span>'; }).join('') + '</div></div></div></section>'
      + '<section class="card sd-sida"><header><h3>Enheter</h3></header>'
      + '<div class="sd-enhet"><b>' + (desktop ? 'VYRA Desktop är igång' : 'Den här sidan är öppen i webbläsaren') + '</b><span>'
      + (desktop ? 'Knapparna på din Stream Deck når VYRA via appen på den här datorn.' : 'Knapparna når VYRA via VYRA Desktop på datorn där Stream Deck sitter — eller via molnet med en parkopplingskod nedan, helt utan Desktop.')
      + '</span><small id="sdSenast">' + saker(beskriv(senaste)) + '</small></div></section>'
      + '<section class="card sd-sida"><header><h3>Molnet — utan VYRA Desktop</h3><p>Kör du inte VYRA Desktop på datorn där Stream Deck sitter? Generera en kod och skriv in den i pluginets ruta <b>VYRA-molnet</b>. Då når knapparna VYRA direkt via molnet.</p></header>'
      + '<div class="sd-kolumner"><div><button type="button" class="sd-primar" id="sdGenerera">Generera parkopplingskod</button><div class="sd-kodruta" id="sdKodruta"></div></div>'
      + '<div><h4 class="sd-rubrik">PARKOPPLADE ENHETER</h4><div id="sdEnheter" class="sd-enheter"><p>Laddar …</p></div></div></div></section>'
      + '<section class="card sd-sida"><header><h3>Namn att använda</h3><p>Klicka för att kopiera, och klistra in i knappens ruta i Stream Deck.</p></header><div class="sd-namn">'
      + lista('Actions', actions) + lista('Ljud', ljud) + lista('Widgetar', widgets) + '</div></section>';
    vy.querySelectorAll('.sd-kopiera').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.kopiera;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { if (typeof toast === 'function') toast('Kopierat: ' + t); }).catch(function () { if (typeof toast === 'function') toast(t); });
      };
    });
    var ladda = vy.querySelector('#sdLaddaNer');
    if (ladda) ladda.onclick = function () { laddaNerPlugin().catch(function (e) { if (typeof toast === 'function') toast('Pluginet kunde inte laddas ner: ' + e.message); }); };
    var gen = vy.querySelector('#sdGenerera');
    if (gen) gen.onclick = generera;
    ritaEnheter();
  }
  document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-extra="streamdeck"]')) setTimeout(sida, 0); }, true);

  // ---- NEDLADDNINGEN: .streamDeckPlugin byggs i webbläsaren ------------------------------------
  // Filen är en zip av mappen se.vyra.live.sdPlugin. Den byggs här ur samma filer som Desktop
  // installerar, så nedladdningen kan aldrig bli en äldre kopia av pluginet. Ingen komprimering
  // (metod 0) — Stream Deck läser en okomprimerad zip lika bra, och koden blir liten.
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(filer) {
    var delar = [], katalog = [], offset = 0, enc = new TextEncoder();
    filer.forEach(function (f) {
      var namn = enc.encode(f.namn), data = f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, namn.length, true);
      delar.push(new Uint8Array(h.buffer), namn, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, namn.length, true); c.setUint32(42, offset, true);
      katalog.push(new Uint8Array(c.buffer), namn);
      offset += 30 + namn.length + data.length;
    });
    var storlek = katalog.reduce(function (s, x) { return s + x.length; }, 0);
    var slut = new DataView(new ArrayBuffer(22));
    slut.setUint32(0, 0x06054b50, true); slut.setUint16(8, filer.length, true); slut.setUint16(10, filer.length, true);
    slut.setUint32(12, storlek, true); slut.setUint32(16, offset, true);
    return new Blob(delar.concat(katalog, [new Uint8Array(slut.buffer)]), { type: 'application/octet-stream' });
  }
  function hamta(fil) { return fetch(MAPP + fil, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(fil + ' saknas (' + r.status + ')'); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); }); }
  function pluginFiler() {
    return hamta('manifest.json').then(function (m) {
      var man = JSON.parse(new TextDecoder().decode(m)), namn = ['manifest.json', man.CodePath || 'plugin.js', 'pi.html'];
      [man.Icon, man.CategoryIcon].concat((man.Actions || []).reduce(function (a, x) { return a.concat([x.Icon], (x.States || []).map(function (s) { return s.Image; })); }, []))
        .forEach(function (b) { if (b) { namn.push(b + '.png'); namn.push(b + '@2x.png'); } });
      namn = namn.filter(function (n, i) { return namn.indexOf(n) === i; });
      return Promise.all(namn.map(function (n) { return (n === 'manifest.json' ? Promise.resolve(m) : hamta(n)).then(function (d) { return { namn: 'se.vyra.live.sdPlugin/' + n, data: d }; }); }));
    });
  }
  function laddaNerPlugin() {
    return pluginFiler().then(function (filer) {
      var url = URL.createObjectURL(zip(filer)), a = document.createElement('a');
      a.href = url; a.download = 'VYRA.streamDeckPlugin'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return filer.length;
    });
  }

  if (!document.getElementById('sd-sida-stil')) {
    var st = document.createElement('style'); st.id = 'sd-sida-stil';
    st.textContent = [
      '.sd-sida,.sd-sida-head{padding:22px 24px;margin:0 0 16px;border-radius:18px;border:1px solid #ffffff14;background:#120a1ee6}',
      '.sd-sida-head{display:flex;justify-content:space-between;align-items:center;gap:16px;background:linear-gradient(120deg,#1d0f33,#0f1a2e)}',
      '.sd-sida-head h2{display:flex;align-items:center;gap:10px;margin:0 0 4px}',
      '.sd-sida-head p{margin:0;opacity:.75}',
      '.sd-rutnat{width:26px;height:26px;display:inline-block;background:conic-gradient(from 0deg,#b13cff,#6ad7ff,#b13cff);-webkit-mask:linear-gradient(#000 0 0) 0 0/11px 11px no-repeat,linear-gradient(#000 0 0) 15px 0/11px 11px no-repeat,linear-gradient(#000 0 0) 0 15px/11px 11px no-repeat,linear-gradient(#000 0 0) 15px 15px/11px 11px no-repeat;border-radius:3px}',
      '.sd-status{white-space:nowrap;font-size:12px;padding:7px 12px;border-radius:10px;border:1px solid #ffffff22;opacity:.85}',
      '.sd-status.sd-ok{border-color:#3ddc97;color:#3ddc97}',
      '.sd-sida header h3{margin:0}.sd-sida header p{margin:4px 0 0;opacity:.7;font-size:13px}',
      '.sd-sida header{padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid #ffffff14}',
      '.sd-kolumner{display:grid;grid-template-columns:1fr 1fr;gap:28px}',
      '@media (max-width:1100px){.sd-kolumner{grid-template-columns:1fr}}',
      '.sd-stegen{list-style:none;counter-reset:sd;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}',
      '.sd-stegen li{counter-increment:sd;display:grid;grid-template-columns:30px 1fr;column-gap:12px}',
      '.sd-stegen li::before{content:counter(sd);grid-row:span 2;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;background:#b13cff;color:#fff;box-shadow:0 0 14px #b13cff88}',
      '.sd-stegen li span{opacity:.7;font-size:13px}',
      '.sd-knappar{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}',
      '.sd-primar,.sd-sekundar{padding:11px 18px;border-radius:12px;font-weight:700;text-decoration:none;cursor:pointer;font:inherit}',
      '.sd-primar{background:linear-gradient(135deg,#b13cff,#7a2bff);color:#fff;box-shadow:0 0 18px #b13cff66}',
      '.sd-sekundar{background:transparent;border:1px solid #ffffff2a;color:inherit}',
      '.sd-rubrik{margin:0 0 10px;font-size:11px;letter-spacing:.14em;opacity:.6}',
      '.sd-rutor{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.sd-ruta{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#ffffff08;border:1px solid #ffffff12;font-size:13px;font-weight:600}',
      '.sd-ruta img{border-radius:7px;flex:none}',
      '.sd-enhet{display:flex;flex-direction:column;gap:4px;padding:18px;border-radius:12px;border:1px dashed #ffffff26;text-align:center}',
      '.sd-enhet span{opacity:.7;font-size:13px}.sd-enhet small{opacity:.55;font-size:12px;margin-top:6px}',
      '.sd-namn{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}',
      '@media (max-width:1100px){.sd-namn{grid-template-columns:1fr}}',
      '.sd-namnlista h4{margin:0 0 8px;font-size:13px}.sd-namnlista h4 small{opacity:.5;font-weight:600}',
      '.sd-namnlista div{display:flex;flex-wrap:wrap;gap:6px}',
      '.sd-namnlista p{opacity:.55;font-size:12px;margin:0}',
      '.sd-kopiera{padding:5px 10px;border-radius:8px;border:1px solid #ffffff1f;background:#ffffff0a;color:inherit;font:inherit;font-size:12px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sd-kopiera:hover{border-color:#b13cff;background:#b13cff22}',
      '.sd-kodruta{margin-top:14px;display:flex;flex-direction:column;gap:6px}',
      '.sd-kodruta .sd-kod{font-size:28px;letter-spacing:.18em;font-weight:800;color:#6ad7ff;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '.sd-kodruta small{opacity:.7;font-size:12px}',
      '.sd-enheter{display:flex;flex-direction:column;gap:8px}',
      '.sd-enheter p{opacity:.55;font-size:13px;margin:0}',
      '.sd-enhet-rad{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:#ffffff08;border:1px solid #ffffff12}',
      '.sd-enhet-rad span{display:flex;flex-direction:column}.sd-enhet-rad small{opacity:.55;font-size:12px}',
      '.sd-sparra{padding:6px 12px;border-radius:8px;border:1px solid #ff6b6b55;background:transparent;color:#ff8a8a;font:inherit;font-size:12px;cursor:pointer}',
      '.sd-sparra:hover{background:#ff6b6b22}'
    ].join('');
    document.head.appendChild(st);
  }

  root.VyraStreamDeck = { utfor: utfor, sida: sida, pluginFiler: pluginFiler, zip: zip, crc32: crc32, KOMMANDON: Object.keys(KOMMANDON), generera: generera, ritaEnheter: ritaEnheter };
})(typeof window !== 'undefined' ? window : globalThis);
