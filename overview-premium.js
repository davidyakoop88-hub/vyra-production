home = function () {
  const connected = Boolean(state.tiktok);
  const user = state.user || 'VYRA-konto';
  const connectionText = connected ? `TikTok sparad · ${state.tiktok}` : 'TikTok väntar';
  // Tredje faltet ar en STABIL hook for livedata. Index-klasserna (.s0…) beskriver plats i raden,
  // inte innebord — flyttas ett kort byter de betydelse under fotterna pa den som lyssnar.
  const emptyStats = [
    ['👁', 'TITTARE', 'viewers'],
    ['♥', 'LIKES', 'likes'],
    ['◆', 'GÅVOR', 'gifts'],
    ['↗', 'INTÄKT', 'revenue']
  ];

  return `<section class="home-welcome">
    <div>
      <span class="eyebrow">VYRA LIVE COMMAND CENTER</span>
      <h2>Din live är redo att <em>glänsa.</em></h2>
      <p>Bygg din overlay och anslut en riktig TikTok LIVE i VYRA Desktop.</p>
    </div>
    <div class="live-status">
      <span><i class="${connected ? '' : 'offline'}"></i>${connectionText}</span>
      <span><i></i>OBS redo</span>
      <span><i></i>Overlay redo</span>
    </div>
  </section>
  <div class="stats premium-stats">
    ${emptyStats.map((item, index) => `<article class="card stat premium-stat s${index}" data-stat="${item[2]}">
      <div class="stat-icon">${item[0]}</div>
      <div><small>${item[1]}</small><strong>—</strong><em><span>Visas under riktig LIVE</span></em></div>
    </article>`).join('')}
  </div>
  <div class="command-grid">
    <article class="card live-preview-card">
      <div class="preview-top">
        <div><span class="eyebrow">OVERLAY</span><h3>Din scen</h3></div>
        <button data-go="editor">Öppna Studio <b>↗</b></button>
      </div>
      <div class="preview-stage">
        <div class="ambient a1"></div><div class="ambient a2"></div>
        <div class="phone">
          <div class="phone-live"><span>REDO</span></div>
          <div class="creator"><i>AV</i><span><b>${user}</b><small>VYRA LIVE</small></span></div>
          <div class="preview-widget"><small>DINA WIDGETAR</small><b>${state.widgets.length}</b><strong>redo</strong></div>
        </div>
        <div class="preview-note"><i></i><span><b>Transparent overlay</b><small>För OBS och TikTok LIVE Studio</small></span></div>
      </div>
    </article>
    <div class="command-side">
      <article class="card activity premium-activity">
        <div class="card-head"><div><span class="eyebrow">LIVE PULSE</span><h2>Senaste händelser</h2></div></div>
        <p>Riktiga TikTok-händelser visas här när VYRA Desktop är anslutet.</p>
      </article>
      <article class="card launch-card">
        <span class="eyebrow">SNABBSTART</span>
        <h3>Skapa något som syns.</h3>
        <p>Redigera din overlay och kopiera länken till OBS eller TikTok LIVE Studio.</p>
        <div><button class="primary" data-go="editor">Skapa overlay</button><button id="testGift">Testa widget</button></div>
      </article>
    </div>
  </div>`;
};

if (typeof view !== 'undefined' && view === 'home') render();

// ---- Livedata: tittarantalet ------------------------------------------------------------------
//
// Forsta riktiga kopplingen pa framsidan. Korten har hittills varit statisk markup — `—` och
// "Visas under riktig LIVE" — utan att nagot nagonsin matat dem.
//
// Tittare ar den enklaste av de fyra: bada bryggorna skickar `viewer` med ett fardigt `count`
// (electron-app/tiktok-service.js, tiktok-bridge/bridge.js), sa ingen summering behovs, inget
// tidsfonster maste beslutas och ingen dedupe kravs. Vardet ar ett ogonblicksvarde.
//
// Tre regler ur arkitekturkontraktet, och de ar hela poangen med att gora den har forst:
//
//   1. ALDRIG render() harifran. render() ar `viewRoot.innerHTML = m[view]()` — den river hela vyn.
//      Bara ett textContent pa en nod byts.
//   2. Batchat via requestAnimationFrame. En publik som svanger ger manga events i rad; DOM:en ska
//      roras en gang per bildruta, inte en gang per event.
//   3. Teardown pa vyra-session-ended. Ingen lyssnare far overleva en utloggning eller ett kontobyte.
//
// Vardet lever bara i minnet. Det ska inte overleva en omladdning, och tokenlaget (?access=) far
// aldrig skriva nagot — darfor ror den har vagen inte session-state.js alls.
(function () {
  let senaste = null;          // senast kanda antal, null = inget event an
  let koad = false;
  let levande = true;

  const kortet = () => document.querySelector('[data-stat="viewers"] strong');

  function mala() {
    koad = false;
    if (!levande || senaste === null) return;
    const nod = kortet();
    // Vyn kan vara en annan just nu (editor, overlay). Da finns inget kort, och det ar inte ett fel.
    if (nod) nod.textContent = senaste.toLocaleString('sv-SE');
  }

  function schemalagg() {
    if (koad || !levande) return;
    koad = true;
    requestAnimationFrame(mala);
  }

  addEventListener('vyra-live-event', event => {
    if (!levande) return;
    const data = event.detail || {};
    if (String(data.type || data.event || '').toLowerCase() !== 'viewer') return;
    const antal = Number(data.count);
    if (!Number.isFinite(antal) || antal < 0) return;
    senaste = Math.round(antal);
    schemalagg();
  });

  // render() bygger om #view fran grunden, sa kortet ar en ny nod varje gang. Utan den har skulle
  // vardet forsvinna sa fort anvandaren navigerar bort och tillbaka. En observer i stallet for en
  // hake i render(): den fangar varje vag som kan bygga om vyn, aven de som tillkommer senare.
  const observer = new MutationObserver(() => { if (senaste !== null) schemalagg() });
  observer.observe(document.body, { childList: true, subtree: true });

  addEventListener('vyra-session-ended', () => {
    levande = false;
    senaste = null;
    observer.disconnect();
  });
})();
