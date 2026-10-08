// AUTOMATISK BATTLE-FX — spelar valt video-paket nar TikTok oppnar ett boost-fonster.
//
// KEDJAN: bryggan (tiktok-bridge/normalizer.js battleTaskFields) skickar typen `glove` med
// `multiplier` 2, 3, 5 ... nar LINK_MIC_BATTLE_TASK oppnar ett multiplikatorfonster. live-client.js
// anropar routeLiveBattleEvent(e). Den har filen lagger sig som en lank i den kedjan — samma
// monkey-patch-monster som battle-mvp-session.js — och tar inget ifran de andra lankarna: Glove
// Snipe-widgeten tands precis som forut.
//
// VAD TIKTOK FAKTISKT SKILJER PA. Protokollet bar bara multiplikatorn. Det finns ingen egen signal
// for "Tap Tap" eller "Snipe" — de spelas bara pa uttryckliga typer (`tap`, `snipe`), t.ex. fran
// Stream Deck eller ett eget event. Mappningen:
//   multiplier 2 / typ x2      -> boost-x2
//   multiplier 3 / typ x3      -> boost-x3
//   glove med 4+ eller utan tal -> glove   (Boosting Glove ar 5x)
//   typ tap / snipe            -> tap / snipe
// Det ar mappningen for testknappar och uttryckliga typer. NAR en riktig battle spelar vad styrs av
// reglerna vid hantera() nedan (Tap Tap vid matchstart, X2/X3 utom forsta boosten, Glove och
// Snipe nar 30 s aterstar).
//
// VAR DET SPELAS. Bara i OBS-utgangen och bara i scen 1, via VyraActionRuntime — samma ko, samma
// .vyra-runtime-item som en Action "Spela video". Studion spelar aldrig; tre OBS-scener ger inte
// tre effekter.
//
// INSTALLNINGEN bor i vyra-extras (extraData.battleFx), som redan synkas ut till OBS-overlayn
// genom sessionsagaren. En egen nyckel hade behovt sta i fyra listor (se session-state.js).
(function (root) {
  'use strict';

  // TAK, INTE LANGD. Klippen ar 10 s, och action-runtime.js tar bort videon redan nar den TAR SLUT
  // (media.onended). Taket galler bara om slutet aldrig kommer. UPPMATT 2026-10-06 i OBS pa en
  // i5-8210Y: overlay-sidan spelade 720p30-klippet i ~0,55x, och med tak 10 klipptes effekten
  // efter 5 s video. 20 s ger plats at en dator som spelar i halv takt.
  var KLIPP_SEK = 20;
  // GAMLA HANDELSER SPELAS INTE. live-client.js levererar serverns historik nar overlayn laddas
  // (uppmatt: tre redan visade boosts spelades om vid en omladdning av OBS-kallan). Ett boost-fonster
  // ar flyktigt — har det gatt mer an 30 s ar det inte langre nu. Serverns id och timestamp ar ms.
  var MAX_ALDER_MS = 30000;
  function forGammal(event, nu) {
    var ts = Number(event && (event.timestamp || event.createdAt || event.id));
    if (!(ts > 1e12)) return false; // ingen tidsstampel att lita pa (t.ex. Stream Deck-test) — spela
    return (nu || Date.now()) - ts > MAX_ALDER_MS;
  }
  var BOOST_TYPER = /glove|tap|snipe|x2|x3|boost/;

  // Ren funktion: vilket klipp ska ett event spela? null = inget.
  function klippFor(event) {
    if (!event || typeof event !== 'object') return null;
    var typ = String(event.type || event.event || '').toLowerCase();
    if (!BOOST_TYPER.test(typ) || typ.indexOf('battle') !== -1) return null;
    if (typ.indexOf('tap') !== -1) return 'tap';
    if (typ.indexOf('snipe') !== -1) return 'snipe';
    var m = Number(event.multiplier || event.x || event.combo || 0) || 0;
    if (typ.indexOf('x3') !== -1 || m === 3) return 'boost-x3';
    if (typ.indexOf('x2') !== -1 || m === 2) return 'boost-x2';
    if (typ.indexOf('glove') !== -1) return 'glove';
    return null;
  }

  // Ren funktion: placering i runtime-koordinater (1080 bred, 1920 hog, oavsett OBS-kallans form),
  // sa att en 16:9-video hamnar centrerad i nederkant. `storlek` ar andel av bredden (0.4-1).
  // `botten` (0.3-1) ar var klippets underkant hamnar, som andel av kallans hojd. 1 = nederkant.
  // Behovs nar OBS-kallan ar uppskalad och dess nedre del hamnar utanfor canvasen: en staende
  // 432x768-kalla i en liggande 1920x1080-canvas visar bara ungefar ovre 58 %.
  function placering(vw, vh, storlek, botten) {
    var s = Math.min(1, Math.max(0.4, Number(storlek) || 1));
    var b = Math.min(1, Math.max(0.3, Number(botten) || 1));
    var bredd = 1080 * s;
    var hojdPx = Math.min(vw * s * 9 / 16, vh * 0.9 * b);
    var toppPx = Math.max(0, vh * b - hojdPx);
    return { x: Math.round((1080 - bredd) / 2), y: Math.round(toppPx / vh * 1920), width: Math.round(bredd), layer: 40 };
  }

  // OBS-KALLANS EGEN LANK GAR FORE. `&battlefx=pinkPrincess` (och `battlefxstorlek=70`) pa
  // overlay-lanken valjer paket for just den kallan — fungerar utan inloggning, och tva scener kan
  // ha olika paket. `battlefx=av` stanger av den for kallan. Utan parameter galler valet i studion.
  function urlVal() {
    try {
      var p = new URLSearchParams((root.location && root.location.search) || '');
      var pack = p.get('battlefx'), st = Number(p.get('battlefxstorlek')), h = Number(p.get('battlefxhojd'));
      return { pack: pack == null ? null : (pack === 'av' ? '' : pack), storlek: st > 0 ? st / 100 : null, botten: h > 0 ? h / 100 : null };
    } catch (e) { return { pack: null, storlek: null, botten: null }; }
  }
  function installning() {
    var d = root.VyraExtras && root.VyraExtras.data;
    var b = d && d.battleFx, u = urlVal();
    return {
      pack: u.pack != null ? u.pack : ((b && b.pack) || ''),
      storlek: u.storlek != null ? u.storlek : ((b && b.storlek) || 1),
      // Kallans form, inte ett kontoval: den foljer bara med lanken.
      botten: u.botten != null ? u.botten : 1
    };
  }
  function sparaInstallning(patch) {
    var ex = root.VyraExtras;
    if (!ex || !ex.data) return Promise.resolve(false);
    var nu = installning();
    ex.data.battleFx = { pack: patch.pack != null ? patch.pack : nu.pack, storlek: patch.storlek != null ? patch.storlek : nu.storlek };
    // writeActive svarar {ok:false, reason:'not-writable'} nar ingen session ar aktiv (inte
    // inloggad). Da sparas valet inte — och det maste streamern fa veta, annars tror hon att OBS har det.
    try {
      return Promise.resolve(root.VyraSessionState.writeActive('vyra-extras', JSON.stringify(ex.data)))
        .then(function (r) { return !(r && r.ok === false); }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function sparaOchMeddela(patch, klart) {
    sparaInstallning(patch).then(function (ok) {
      if (!root.toast) return;
      root.toast(ok ? klart : 'Valet kunde inte sparas — logga in, eller lägg &battlefx=' + (patch.pack || 'pinkPrincess') + ' på overlay-länken i OBS');
    });
  }
  // Paket som har minst ett klipp kedjan kan spela.
  function paketMedKlipp() {
    var p = root.VYRA_OVERLAY_PACKAGES || {};
    return Object.keys(p).filter(function (id) { return (p[id].files || []).some(function (f) { return /^(boost-x2|boost-x3|glove|tap|snipe)$/.test(f.key); }); });
  }
  function klippSokvag(packId, nyckel) {
    var pkg = (root.VYRA_OVERLAY_PACKAGES || {})[packId];
    var f = pkg && (pkg.files || []).filter(function (x) { return x.key === nyckel; })[0];
    return f ? { path: f.path, name: pkg.name + ' · ' + f.label } : null;
  }

  // ---- NAR KLIPPEN SPELAS — Davids regler 2026-10-07 -------------------------------------------
  //   1. Tap Tap  nar matchen borjar (forsta battle_started per match)
  //   2. X2 / X3  nar ett boost-fonster oppnar — men INTE matchens forsta boost
  //   3. Glove    nar 30 s aterstar av varje boost-fonster
  //   4. Snipe    nar 30 s aterstar av matchen
  // TIDERNA: bryggan skickar remainingSec pa `battle` (matchens aterstod, raknad i TikToks klocka)
  // och durationSec pa `glove` (fonstrets langd). Saknas de galler reserverna nedan: en TikTok-match
  // ar uppmatt 300 s. Testknapparna (id battle-fx-test-...) spelar sitt klipp direkt som forut.
  var MATCH_SEK = 300, BOOST_SEK = 60, SLUT_SEK = 30;
  var SLUT = /(end|finish|over|settle|result|punish|complete|close)/;
  var START = /(start|active|begin|ongoing|progress)/;
  var match = null;      // { id, boostar, timers, snipe, snipeSpelad }
  var avslutade = {};    // battleId -> ms, sa ett sent battle_started inte startar om en slutspelad match
  var sedda = {};

  function nu() { return Date.now(); }
  function planera(fn, ms) { return (root.setTimeout || setTimeout)(fn, Math.max(0, ms)); }
  function avbryt(t) { try { (root.clearTimeout || clearTimeout)(t); } catch (e) {} }
  function rensa(karta, ms) { var t = nu(); Object.keys(karta).forEach(function (k) { if (t - karta[k] > ms) delete karta[k]; }); }
  function avslutaMatch(id) {
    if (id) avslutade[id] = nu();
    if (!match) return;
    if (match.id) avslutade[match.id] = nu();
    match.timers.forEach(avbryt); if (match.snipe) avbryt(match.snipe);
    match = null;
  }
  function nyMatch(id) {
    avslutaMatch();
    rensa(avslutade, 3600000);
    match = { id: id || '', boostar: 0, timers: [], snipe: null, snipeSpelad: false };
    return match;
  }
  function arTest(e, opts) {
    return !!(opts && opts.test) || e.source === 'battle-fx-test' ||
      /^battle-fx-test/.test(String(e.id || '')) || /^battle-fx-test/.test(String(e.battleId || ''));
  }
  function dubblett(e) {
    var id = e && e.id != null ? String(e.id) : '';
    if (!id) return false;
    rensa(sedda, 60000);
    if (sedda[id]) return true;
    sedda[id] = nu();
    return false;
  }

  // Spelar ett klipp ur valt paket i scen 1. Ingen tids- eller dubblettkontroll har — det ar
  // hantera() som avgor NAR.
  function spelaKlipp(nyckel, event, opts) {
    opts = opts || {};
    if (!nyckel) return 'inget klipp';
    var inst = installning(), pack = opts.pack || inst.pack;
    if (!pack) return 'av';
    var klipp = klippSokvag(pack, nyckel);
    if (!klipp) return 'paketet saknar ' + nyckel;
    if (!root.VyraActionRuntime || !root.VyraActionRuntime.execute) return 'ingen runtime';
    var plats = placering(root.innerWidth || 1080, root.innerHeight || 1920, inst.storlek, inst.botten);
    var action = {
      id: 'battle-fx-' + nyckel, name: 'Battle-FX: ' + klipp.name, types: ['video'],
      duration: KLIPP_SEK, cooldown: 0, volume: 0, fade: false,
      videoMedia: { packagePath: klipp.path, name: klipp.name },
      scene: { number: 1, x: plats.x, y: plats.y, width: plats.width, layer: plats.layer }
    };
    var id = event && event.id != null ? String(event.id) : '';
    var ok = root.VyraActionRuntime.execute({ action: action, payload: { username: 'TikTok' }, runId: 'battle-fx-' + nyckel + '-' + (id || nu()) });
    return ok ? 'spelas' : 'inte scen 1';
  }

  function planeraSnipe(kvarSek) {
    var m = match;
    if (!m || m.snipeSpelad) return;
    if (m.snipe) avbryt(m.snipe);
    m.snipe = planera(function () {
      if (match !== m || m.snipeSpelad) return;
      m.snipeSpelad = true;
      spelaKlipp('snipe', { id: 'snipe-' + (m.id || nu()) });
    }, (kvarSek - SLUT_SEK) * 1000);
  }

  function battleHandelse(e) {
    var status = String(e.battleStatus || '').toLowerCase(), id = String(e.battleId || '');
    if (!status) return 'ingen status';
    if (SLUT.test(status)) {
      if (!match || !id || !match.id || match.id === id) avslutaMatch(id); else avslutade[id] = nu();
      return 'matchen slut';
    }
    if (!START.test(status)) return 'okand status';
    if (id && avslutade[id]) return 'matchen redan slut';
    var kvar = Number(e.remainingSec) || 0;
    if (match && (!id || !match.id || match.id === id)) {
      // TikTok skickar battle_started om och om igen under en pagaende match. Varje ny aterstod
      // rattar Snipe-tiden; Tap Tap spelas inte igen.
      if (!match.id && id) match.id = id;
      if (kvar > 0) planeraSnipe(kvar);
      return 'pagaende match';
    }
    nyMatch(id);
    planeraSnipe(kvar > 0 ? kvar : MATCH_SEK);
    // Laddades overlayn mitt i en match ar starten redan forbi — ingen Tap Tap i efterhand.
    if (kvar > 0 && kvar < MATCH_SEK - SLUT_SEK) return 'mitt i matchen';
    return spelaKlipp('tap', e);
  }

  function boostHandelse(e) {
    var id = String(e.battleId || '');
    if (!match || (id && match.id && match.id !== id)) nyMatch(id);
    else if (!match.id && id) match.id = id;
    var m = match;
    m.boostar++;
    var langd = Number(e.durationSec) > 0 ? Number(e.durationSec) : BOOST_SEK;
    var gid = 'glove-' + (e.id || nu());
    m.timers.push(planera(function () { if (match === m) spelaKlipp('glove', { id: gid }); }, (langd - SLUT_SEK) * 1000));
    if (m.boostar === 1) return 'forsta boosten';
    var mult = Number(e.multiplier || e.x || e.combo || 0) || 0;
    if (mult >= 3) return spelaKlipp('boost-x3', e);
    if (mult === 2) return spelaKlipp('boost-x2', e);
    return 'ingen multiplikator';
  }

  // Ett event in, ett beslut ut. Returvardet ar for proven och konsolen.
  function hantera(event, opts) {
    if (!event || typeof event !== 'object') return 'inget klipp';
    var typ = String(event.type || event.event || '').toLowerCase();
    if (arTest(event, opts)) return spelaKlipp(klippFor(event), event, opts);
    if (!installning().pack) return 'av';
    if (typ !== 'battle' && !klippFor(event)) return 'inget klipp';
    if (forGammal(event)) return 'for gammal';
    if (dubblett(event)) return 'dubblett';
    if (typ === 'battle') return battleHandelse(event);
    // Uttryckliga typer (Stream Deck, eget event) spelar direkt.
    if (/tap|snipe|x2|x3/.test(typ)) return spelaKlipp(klippFor(event), event);
    return boostHandelse(event);
  }
  // Bakatkompatibelt namn: spela(event, {test, pack}).
  function spela(event, opts) { return hantera(event, opts); }
  function lage() { return match ? { id: match.id, boostar: match.boostar, snipeSpelad: match.snipeSpelad } : null; }

  // Lank i routeLiveBattleEvent-kedjan. Felet i var lank far aldrig stoppa de andra.
  function koppla() {
    var tidigare = root.routeLiveBattleEvent;
    if (typeof tidigare !== 'function' || tidigare.__battleFx) return;
    var lank = function (event) {
      var svar;
      try { svar = tidigare.apply(this, arguments); } finally {
        try { hantera(event || {}); } catch (err) { console.error('[VYRA battle-fx]', err); }
      }
      return svar;
    };
    lank.__battleFx = true;
    root.routeLiveBattleEvent = lank;
  }

  // ---- Studio: valet under Vip-widget -------------------------------------------------------
  function panelHtml() {
    var inst = installning(), pk = root.VYRA_OVERLAY_PACKAGES || {};
    var val = '<option value="">Av</option>' + paketMedKlipp().map(function (id) {
      return '<option value="' + id + '"' + (inst.pack === id ? ' selected' : '') + '>' + pk[id].icon + ' ' + pk[id].name + '</option>';
    }).join('');
    var pct = Math.round(inst.storlek * 100);
    return '<section class="battle-fx-auto" data-battle-fx-auto style="margin:0 0 28px;padding:16px 18px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:14px">' +
      '<span class="section-header-eyebrow">⚔ Automatisk battle-FX</span>' +
      '<p style="color:var(--text-muted);font-size:11px;margin:6px 0 12px">Spelar paketets klipp i OBS under en battle: Tap Tap när matchen börjar, X2/X3 när en dubbel- eller trippelboost startar (inte matchens första), Glove när 30 s återstår av boosten och Snipe när 30 s återstår av matchen. Testknapparna spelar direkt. Spelas i scen 1. Utan inloggning: lägg <code>&amp;scene=1&amp;battlefx=pinkPrincess</code> på overlay-länken i OBS.</p>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">' +
      '<label>Paket <select id="battleFxPack">' + val + '</select></label>' +
      '<label>Storlek <b id="battleFxStorlekVarde">' + pct + ' %</b> <input id="battleFxStorlek" type="range" min="40" max="100" step="5" value="' + pct + '"></label>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-battle-fx-test="boost-x2">Testa X2</button>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-battle-fx-test="boost-x3">Testa X3</button>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-battle-fx-test="glove">Testa Glove</button>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-battle-fx-test="tap">Testa Tap Tap</button>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-battle-fx-test="snipe">Testa Snipe</button>' +
      '</div></section>';
  }
  var TEST_EVENT = { 'boost-x2': { type: 'glove', multiplier: 2 }, 'boost-x3': { type: 'glove', multiplier: 3 }, glove: { type: 'glove', multiplier: 5 }, tap: { type: 'tap' }, snipe: { type: 'snipe' } };
  function montera() {
    if (typeof view === 'undefined' || view !== 'packages') return;
    var vy = document.querySelector('#view'); if (!vy || vy.querySelector('[data-battle-fx-auto]')) return;
    var head = vy.querySelector('.page-header');
    var wrap = document.createElement('div'); wrap.innerHTML = panelHtml();
    var sek = wrap.firstChild;
    if (head && head.nextSibling) vy.insertBefore(sek, head.nextSibling); else vy.prepend(sek);
    sek.querySelector('#battleFxPack').onchange = function (e) {
      sparaOchMeddela({ pack: e.target.value }, e.target.value ? 'Automatisk battle-FX: ' + e.target.selectedOptions[0].textContent.trim() : 'Automatisk battle-FX är avstängd');
    };
    var reg = sek.querySelector('#battleFxStorlek'), visa = sek.querySelector('#battleFxStorlekVarde');
    reg.oninput = function () { visa.textContent = reg.value + ' %'; };
    reg.onchange = function () { sparaOchMeddela({ storlek: Number(reg.value) / 100 }, 'Storleken sparades'); };
    sek.querySelectorAll('[data-battle-fx-test]').forEach(function (b) {
      b.onclick = function () {
        if (!installning().pack) { if (root.toast) root.toast('Välj ett paket först'); return; }
        // Samma vag som ett riktigt event: via bryggans lokala server till live-client i OBS.
        // battleId battle-fx-test markerar testet aven om molnet byter id: overlayn spelar da
        // klippet direkt i stallet for att rakna det som en riktig boost.
        var ev = Object.assign({ source: 'battle-fx-test', eventKey: 'battle-fx-test-' + Date.now(), id: 'battle-fx-test-' + Date.now(), battleId: 'battle-fx-test', at: Date.now() }, TEST_EVENT[b.dataset.battleFxTest]);
        // Inloggad pa vyralive.app: workspace-rutten (samma som Desktop postar till). Den finns inte
        // lokalt, och /api/events finns bara lokalt. Molnet tar bara emot glove-typen, sa Tap Tap
        // och Snipe kan inte testas den vagen.
        var ws = root.VyraAuth && root.VyraAuth.lastDetail && root.VyraAuth.lastDetail();
        var wsId = ws && ws.workspaces && ws.workspaces[0] && ws.workspaces[0].id;
        if (wsId && ev.type !== 'glove') { if (root.toast) root.toast('Tap Tap och Snipe kan bara testas lokalt — X2, X3 och Glove går att testa här'); return; }
        fetch(wsId ? '/api/workspaces/' + wsId + '/events' : '/api/events', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) })
          .then(function (r) { if (root.toast) root.toast(r.ok ? 'Test skickat till OBS' : 'Testet kunde inte skickas'); })
          .catch(function () { if (root.toast) root.toast('Den lokala servern svarar inte'); });
      };
    });
  }

  root.VyraBattleFx = { klippFor: klippFor, placering: placering, forGammal: forGammal, spela: spela, hantera: hantera, lage: lage, installning: installning, sparaInstallning: sparaInstallning, paketMedKlipp: paketMedKlipp };
  if (typeof module === 'object' && module.exports) module.exports = root.VyraBattleFx;
  if (typeof document === 'undefined') return;
  koppla();
  if (typeof bind === 'function') {
    var tidigareBind = bind;
    // eslint-disable-next-line no-global-assign
    bind = function () { tidigareBind.apply(this, arguments); try { montera(); } catch (e) { console.error('[VYRA battle-fx]', e); } };
    try { montera(); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
