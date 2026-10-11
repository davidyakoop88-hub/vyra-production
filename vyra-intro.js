(function () {
  'use strict';
  // INTRÄDESEFFEKT FÖR ALLA WIDGETAR (2026-10-11).
  //
  // DAVIDS ORD: "widget ska popa eller fade ... alla inställning ska vara anpassad o ingen glapp".
  //
  // UPPMÄTT I 60 PANELER INNAN DEN HÄR FILEN FANNS. Tre familjer bar ett intro-val, var och en
  // med sin egen monteringsväg: Top Like/Coins/Points (toplike-studio.js, #wsEntrance), Gift &
  // Alert-familjen (gift-alert-frames.js, #gafEntrance) och Last-X (last-x-alerts.js,
  // #lastXEntrance). Playground-widgetarna (Goal Pro, Podium, Streak Flip) har "Entré / utgång"
  // inbyggt i sin egen panel. TOLV typer saknade valet helt: Battle MVP, Bild, Egen text, Video,
  // Fan Level 50, Gift Campaign, Gift Jar, Guardian Emblem, Heart Me Goal, Låtönskningar,
  // Skattkista och Social Goal.
  //
  // Dessutom var valet TRASIGT på två ställen trots att kontrollen fanns:
  //   - Top Gift: klassen `ws-anim-pop` sattes, men `.vyra-topgift.play{animation:vyraAppear}`
  //     i studio.css är (0,2,0) mot `.ws-anim-pop` (0,1,0), så widgetens egen entré körde över
  //     det användaren just valt. Uppmätt: animation-name = vyraAppear efter valet.
  //   - Top Streak (Clean Flip): approved-rankings.js svarar med cleanStreakHtml(w) UTAN att
  //     anropa kedjan under sig, så gift-alert-frames.js:s klass nådde aldrig markupen.
  //     Uppmätt: animation-name = streakEnter, ingen ws-anim-klass alls.
  //
  // LÖSNINGEN, PÅ ETT STÄLLE: samma fält som de tre familjerna redan skriver (`entranceAnimation`,
  // `entranceDuration`), samma CSS-klasser (`ws-anim-*` i toplike-studio.css, nu med specificitet
  // (0,3,0) så användarens val vinner över varje egen entré på rotnoden), och en renderkrok som
  // läggs YTTERST — den här filen laddas av media.js EFTER studio.html:s statiska skript, så
  // approved-rankings.js:s vakt ligger redan under oss och dess svar passerar här.
  //
  // Effektwidgetarna (fyrverkerier, bubblor, Like Fountain, Video FX-paketet, Heart Fireworks)
  // får INGET val: de är osynliga i vila och tänds av händelser, så en entré på behållaren hade
  // animerat ingenting. Att gömma valet är ärligare än att visa en knapp som inte gör något.
  const UTAN_VAL = new Set([
    'templateGiftFireworks', 'templateGiftBubbles', 'templateHeartFireworks', 'templateGloveSnipe',
    'templateLikeFountain',
    // Egen panel med "Entré / utgång" (playground-widgets.js) — två val för samma sak vore ett glapp.
    'templatePgGoal', 'templatePgPodium', 'templatePgStreak',
  ]);
  // Familjerna som redan bygger ett eget intro-val. AVGÖRS PÅ TYP, INTE PÅ DOM. Uppmätt i CI
  // 2026-10-11 (panel-inga-dubbletter): gift-alert-frames.js laddas dynamiskt precis som den här
  // filen, och landar den EFTER oss ligger dess bind-krok utanför vår — då är #gafEntrance ännu
  // inte byggd när vi tittar, vi bygger vår grupp, och sedan bygger den sin. Två "Inträdeseffekt"
  // i samma panel. Typlistan är laddningsordningsoberoende; DOM-kontrollen står kvar som hängsle.
  const EGNA_FAMILJER = new Set([
    // gift-alert-frames.js (#gafEntrance)
    'templateTopGift', 'templateTopStreak', 'templateFollowerAlert', 'templateFanLevel', 'templateGifterLevel',
    'templateLastGifter', 'templateLastLiker', 'templateLastSharer', 'templateLastSubscriber',
    // last-x-alerts.js (#lastXEntrance)
    'templateLastX',
    // toplike-studio.js (#wsEntrance)
    'templateTopLike', 'templateTopCoins', 'templateTopPoints',
  ]);
  const EGNA_KONTROLLER = '#gafEntrance, #wsEntrance, #lastXEntrance';

  const EFFEKTER = [['none', 'Ingen'], ['fade', 'Tona in'], ['slideUp', 'Glid upp'], ['pop', 'Poppa in']];

  function harVal(w) {
    return w && w.entranceAnimation && w.entranceAnimation !== 'none';
  }

  // ---- Render: klassen på rotnoden, oavsett vilken renderare som ritade den ----
  if (typeof wh === 'function') {
    const introWh = wh;
    wh = function (w) {
      let html = introWh(w);
      if (!harVal(w) || typeof html !== 'string') return html;
      if (html.includes(' ws-anim-')) return html;           // gift-alert-frames/toplike-studio hann före
      const kl = ` ws-anim-${String(w.entranceAnimation).replace(/[^a-zA-Z]/g, '')}`;
      const i = html.indexOf('class="widget ');
      if (i < 0) return html;
      html = html.slice(0, i) + `class="widget${kl} ` + html.slice(i + 'class="widget '.length);
      const dur = `--ws-anim-duration:${+w.entranceDuration || 600}ms;`;
      // Rotnodens style-attribut ligger efter klassen. Saknas det får roten ett eget.
      const tagSlut = html.indexOf('>', i);
      const tagg = html.slice(i, tagSlut);
      if (tagg.includes('style="')) {
        html = html.slice(0, i) + tagg.replace('style="', `style="${dur}`) + html.slice(tagSlut);
      } else {
        html = html.slice(0, tagSlut) + ` style="${dur}"` + html.slice(tagSlut);
      }
      return html;
    };
  }

  // ---- Noden, oavsett väg in: renderare som inte anropar kedjan ----
  // Uppmätt 2026-10-11: Egen text (custom-widgets.js) svarar med egen markup utan att anropa
  // kedjan under sig, så kroken ovan nådde den aldrig — samma mönster som Clean Flip, fast från
  // andra hållet (den laddas EFTER oss och lägger sig utanpå). En renderkrok kan bara se det som
  // passerar den. Noden i DOM:en passerar alltid, så klassen sätts där när den saknas:
  // MutationObserver i stället för laddningsordning (vyra-systemfixar).
  function markeraNod(el) {
    const id = el.getAttribute('data-id');
    if (!id || typeof liveWidget !== 'function') return;
    const w = liveWidget(id);
    if (!harVal(w) || /(^|\s)ws-anim-/.test(el.className)) return;
    el.classList.add('ws-anim-' + String(w.entranceAnimation).replace(/[^a-zA-Z]/g, ''));
    el.style.setProperty('--ws-anim-duration', `${+w.entranceDuration || 600}ms`);
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('.widget[data-id]')) markeraNod(n);
        n.querySelectorAll?.('.widget[data-id]').forEach(markeraNod);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---- Panel: gruppen ANIMATION där den saknas ----
  if (typeof bind === 'function') {
    const introBind = bind;
    bind = function () {
      const ut = introBind.apply(this, arguments);
      if (typeof view !== 'undefined' && view !== 'editor') return ut;
      const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!w || UTAN_VAL.has(w.type) || EGNA_FAMILJER.has(w.type)) return ut;
      const panel = document.querySelector('.properties');
      if (!panel || panel.querySelector(EGNA_KONTROLLER) || panel.querySelector('.vyra-intro-group')) return ut;

      const grupp = document.createElement('div');
      grupp.className = 'property-group vyra-intro-group';
      grupp.innerHTML = '<h4>ANIMATION</h4>'
        + '<label>Inträdeseffekt<select id="vyraEntrance">'
        + EFFEKTER.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
        + '</select></label>'
        + `<label class="range-label">Varaktighet <b>${+w.entranceDuration || 600} ms</b>`
        + `<input id="vyraEntranceDuration" type="range" min="150" max="1500" step="50" value="${+w.entranceDuration || 600}"></label>`;
      // Sist. vyra-panelordning.js flyttar gruppen till rätt plats (ANIMATION = 70, hopfälld).
      const del = panel.querySelector('#del') || panel.querySelector('.delete');
      if (del) del.before(grupp); else panel.append(grupp);

      const val = grupp.querySelector('#vyraEntrance');
      val.value = w.entranceAnimation || 'none';
      val.onchange = e => { w.entranceAnimation = e.target.value; save(); render(); };
      const dur = grupp.querySelector('#vyraEntranceDuration');
      dur.oninput = e => { grupp.querySelector('b').textContent = `${e.target.value} ms`; };
      dur.onchange = e => { w.entranceDuration = +e.target.value; save(); render(); };

      // Samma grepp som gift-alert-frames.js: widgetens egen "Testa"-knapp spelar också intron
      // om, så det går att se valet utan att ladda om sidan.
      const testBtn = [...panel.querySelectorAll('button')].find(b => b !== del && /Testa|Test\b/.test(b.textContent));
      if (testBtn && !testBtn.__vyraIntro) {
        testBtn.__vyraIntro = true;
        const original = testBtn.onclick;
        testBtn.onclick = e => {
          if (typeof original === 'function') original(e);
          if (!harVal(w)) return;
          const el = document.querySelector(`[data-id="${w.id}"]`);
          if (!el) return;
          const cls = 'ws-anim-' + w.entranceAnimation;
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        };
      }
      return ut;
    };
  }

  // Overlaysidan ritar på en setTimeout(0) direkt efter laddning, som kan hinna före det här
  // dynamiskt laddade skriptet — samma vakt som gift-alert-frames.js/toplike-studio.js.
  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
