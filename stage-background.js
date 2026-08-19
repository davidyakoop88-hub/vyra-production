(function () {
  'use strict';
  // SCENBAKGRUND — en bakgrund för hela sändningsytan, vald per layout.
  //
  // Opt-in genom FRÅNVARO: utan state.stageBackground monteras ingenting alls. OBS-ytan är
  // genomskinlig by design (studio.css nollar html/body/#view/.canvas med !important) och
  // streamern lägger sin kamera bakom — därför är frånvaro, inte display:none, kontraktet
  // (§8: DOM-existens är inte användarsynlighet).
  //
  // Fältet flyter genom save-tratten och molnet precis som layoutFormat: servern validerar bara
  // widgets-id, så värdet kan komma KORRUPT från molnet och måste tålas defensivt — typkontroll
  // plus VyraSafe.url, aldrig krasch, aldrig nod.
  //
  // Målaren bor UTANFÖR #view i sändningen: render() är en full innerHTML-riv som live-triggrar
  // kör även i overlayn (triggerBattleMvp gör save();render() på riktiga events) — en video i
  // #view hade startat om mitt i sändningen. I editorn bor förhandsvisningen i .canvas och byggs
  // om per render (kosmetiskt; sändningsytan är den skyddade).
  //
  // Mediakällor i etapp 1: färg, relativa paketassets (assets/...) och https-URL:er via
  // VyraSafe.url. IndexedDB-media erbjuds MEDVETET inte — OBS browser-source har en egen tom
  // profil och den vägen ser färdig ut i Studion men är död i sändningen (samma felklass som
  // drabbat fyra widgetar tidigare).

  var NOD_KLASS = 'vyra-scenbakgrund';
  var LAGEN = { color: 'Färg', image: 'Bild', video: 'Video' };

  function lasState() {
    try {
      return (typeof state !== 'undefined' && state) ? state
        : JSON.parse(localStorage.getItem('vyra-state') || '{}');
    } catch (_) { return {}; }
  }

  // Defensiv grind: allt utanför exakt {mode: color|image|video, value: säker sträng} är
  // ogiltigt och behandlas som "ingen bakgrund". Ett trasigt molnvärde får aldrig släcka overlayn.
  function giltig(sb) {
    if (!sb || typeof sb !== 'object' || Array.isArray(sb)) return null;
    if (typeof sb.value !== 'string' || !sb.value) return null;
    if (sb.mode === 'color') {
      return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(sb.value)
        ? { mode: 'color', value: sb.value } : null;
    }
    if (sb.mode === 'image' || sb.mode === 'video') {
      var url = (window.VyraSafe && window.VyraSafe.url) ? window.VyraSafe.url(sb.value, '') : '';
      return url ? { mode: sb.mode, value: url } : null;
    }
    return null;
  }

  function riv() {
    var el = document.querySelector('.' + NOD_KLASS);
    if (el) el.remove();
  }

  function mala(sb, host) {
    var el = document.querySelector('.' + NOD_KLASS);
    var villTag = sb.mode === 'video' ? 'VIDEO' : 'DIV';
    // Fel elementtyp eller fel värd (lägesbyte, vy-byte) → börja om. Samma läge och värd →
    // rör INTE noden: det är vad som låter videoloopen överleva render() och SSE-återanslutning.
    if (el && (el.tagName !== villTag || el.parentElement !== host)) { el.remove(); el = null; }
    if (!el) {
      el = document.createElement(villTag === 'VIDEO' ? 'video' : 'div');
      el.className = NOD_KLASS;
      if (villTag === 'VIDEO') {
        // Alltid utan ljudväg: CEF:s autoplay-policy kräver muted, och en bakgrund som låter
        // är fel produkt. playsinline av samma skäl som husets övriga videomönster (media.js:65).
        el.muted = true;
        el.setAttribute('muted', '');
        el.setAttribute('loop', '');
        el.setAttribute('autoplay', '');
        el.setAttribute('playsinline', '');
      }
      // Först i värden = bakom allt annat som målas där.
      host.prepend(el);
    }
    if (sb.mode === 'video') {
      // src skrivs BARA vid faktisk ändring — en omskrivning av samma värde startar om loopen.
      if (el.getAttribute('src') !== sb.value) el.setAttribute('src', sb.value);
    } else if (sb.mode === 'image') {
      var bild = 'url("' + sb.value + '")';
      if (el.style.backgroundImage !== bild) el.style.backgroundImage = bild;
    } else if (el.style.background !== sb.value) {
      el.style.background = sb.value;
    }
  }

  function applicera() {
    // Fristående widgetlänkar renderar exakt en widget — ingen scen, ingen bakgrund.
    if (new URLSearchParams(location.search).has('widget')) { riv(); return; }
    var sb = giltig(lasState().stageBackground);
    if (!sb) { riv(); return; }
    var overlay = document.documentElement.classList.contains('overlay-output');
    // Sändning: nod på body, utanför #view:s render-riv. Editor: förhandsvisning i .canvas —
    // den byggs om per render (observern målar om), vilket är acceptabelt kosmetiskt där.
    var host = overlay ? document.body : document.querySelector('.editor-shell .canvas');
    if (!host) { riv(); return; }
    mala(sb, host);
  }

  // ---- Editorkontroll: layout-format-mönstret (verktygsraden ägs inte av render-wrappar) ------

  function persist(sb) {
    var live = (typeof state !== 'undefined' && state) ? state : null;
    if (live) {
      if (sb) live.stageBackground = sb; else delete live.stageBackground;
      // save() är husets enda tratt: historiksnapshot, writeActive och molnkön i ett.
      if (typeof save === 'function') { save(); applicera(); return; }
    }
    var data = lasState();
    if (sb) data.stageBackground = sb; else delete data.stageBackground;
    if (window.VyraSessionState && window.VyraSessionState.writeActive) {
      window.VyraSessionState.writeActive('vyra-state', JSON.stringify(data));
    }
    applicera();
  }

  function uppdateraKnapp(knapp) {
    var sb = giltig(lasState().stageBackground);
    var text = sb ? 'Bakgrund · ' + LAGEN[sb.mode] : 'Bakgrund';
    if (knapp.textContent !== text) knapp.textContent = text;
    knapp.classList.toggle('active', !!sb);
  }

  function byggKontroll() {
    var toolbar = document.querySelector('.editor-shell .editor-toolbar');
    if (!toolbar || toolbar.querySelector('.scenbakgrund-kontroll')) { applicera(); return; }

    var host = document.createElement('div');
    host.className = 'scenbakgrund-kontroll';
    host.innerHTML =
      '<button type="button" class="sb-oppna" aria-haspopup="true" aria-expanded="false">Bakgrund</button>' +
      '<div class="sb-popover" hidden>' +
        '<span>SCENBAKGRUND · HELA SÄNDNINGSYTAN</span>' +
        '<label>Läge<select class="sb-lage">' +
          '<option value="">Ingen (transparent för OBS)</option>' +
          '<option value="color">Färg</option>' +
          '<option value="image">Bild (URL)</option>' +
          '<option value="video">Video (URL eller paket)</option>' +
        '</select></label>' +
        '<label class="sb-rad-farg" hidden>Färg<input type="color" class="sb-farg" value="#0a0612"></label>' +
        '<label class="sb-rad-url" hidden>Källa<input type="text" class="sb-url" placeholder="https://… eller assets/videos/…"></label>' +
        '<small class="sb-obs-not">Videon spelas alltid utan ljud. Lokalt uppladdade filer når inte OBS — använd https-länkar eller paketens assets.</small>' +
        '<button type="button" class="sb-anvand">Använd</button>' +
      '</div>';

    var formatPicker = toolbar.querySelector('.layout-format-status');
    if (formatPicker) formatPicker.after(host); else toolbar.append(host);

    var knapp = host.querySelector('.sb-oppna');
    var popover = host.querySelector('.sb-popover');
    var lage = host.querySelector('.sb-lage');
    var radFarg = host.querySelector('.sb-rad-farg');
    var radUrl = host.querySelector('.sb-rad-url');

    function visaRader() {
      radFarg.hidden = lage.value !== 'color';
      radUrl.hidden = lage.value !== 'image' && lage.value !== 'video';
    }

    knapp.onclick = function () {
      var oppen = popover.hidden;
      popover.hidden = !oppen;
      knapp.setAttribute('aria-expanded', String(oppen));
      if (oppen) {
        var sb = giltig(lasState().stageBackground);
        lage.value = sb ? sb.mode : '';
        if (sb && sb.mode === 'color') host.querySelector('.sb-farg').value = sb.value;
        if (sb && sb.mode !== 'color') host.querySelector('.sb-url').value = sb.value;
        visaRader();
      }
    };
    lage.onchange = visaRader;
    host.querySelector('.sb-anvand').onclick = function () {
      var sb = null;
      if (lage.value === 'color') sb = { mode: 'color', value: host.querySelector('.sb-farg').value };
      else if (lage.value) sb = { mode: lage.value, value: host.querySelector('.sb-url').value.trim() };
      if (sb && !giltig(sb)) { if (typeof toast === 'function') toast('Ogiltig källa — bara https eller assets/'); return; }
      persist(sb);
      popover.hidden = true;
      knapp.setAttribute('aria-expanded', 'false');
      uppdateraKnapp(knapp);
      if (typeof toast === 'function') toast(sb ? 'Scenbakgrund satt' : 'Scenbakgrund borttagen');
    };
    uppdateraKnapp(knapp);
    applicera();
  }

  // En projektion byter ut STATE-OBJEKTETS innehåll utan att röra DOM — MutationObserver ser
  // den aldrig. session-state.js säger själv till (reason 'projection' på vyra-session-state,
  // och -saved när en annan skrivare, t.ex. molnets konfliktval, skrivit) — måla om då.
  addEventListener('vyra-session-state', applicera);
  addEventListener('vyra-session-state-saved', applicera);

  // Obligatorisk teardown: nästa projektion får inte ärva förra kontots bakgrund.
  addEventListener('vyra-session-ended', riv);
  if (window.VyraSessionState && window.VyraSessionState.registerTeardown) {
    window.VyraSessionState.registerTeardown('scenbakgrund', riv);
  }

  // Samma säkerhetsnät som widget-background: overlaysidan kan rendera innan det här skriptet
  // laddats, och render() river allt — observern målar om när DOM:en faktiskt ändras.
  // "skriv bara vid ändring" i mala() bryter loopen (layout-format-prejudikatet).
  new MutationObserver(function () {
    var knapp = document.querySelector('.scenbakgrund-kontroll .sb-oppna');
    if (knapp) uppdateraKnapp(knapp);
    byggKontroll();
  }).observe(document.documentElement, { childList: true, subtree: true });
  byggKontroll();
})();
