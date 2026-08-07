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

// ---- Livedata i Command Center ----------------------------------------------------------------
//
// Korten var 61 rader statisk markup — ett streck och "Visas under riktig LIVE" — utan att nagot
// nagonsin matat dem. Det har ar matningen, ett kort i taget.
//
// KORT-tabellen ar hela monstret. Ett nytt kort ar en rad, inte ett nytt block: vilka eventtyper
// det lyssnar pa och vilket falt som bar vardet. Allt annat — batchning, ateruppritning, teardown —
// delas.
//
// VARFOR JUST DE HAR FALTEN
//
//   viewers  viewer.count       TikTok skickar rummets aktuella antal
//   likes    likes.points       TikToks egen totalLikeCount for rummet
//
// Bada ar OGONBLICKSVARDEN som TikTok redan raknat. Kortet summerar alltsa aldrig sjalvt, och
// behover darfor inte besluta nagot tidsfonster eller skydda sig mot dubbelrakning vid
// ateranslutning. For likes finns aven faltet "count" (likes i den enskilda skuren) — det anvands
// med flit INTE, eftersom en egen summering hade krävt ett beslut om nollstallning mellan
// sandningar och skydd mot dubbelrakning.
//
// TVA STAVNINGAR for likes: bada bryggorna skickar typen "likes", molnets event-bus aliasar den
// till "like" (server/event-bus.js:6) men desktopvagen gar utan det aliaset. Kortet lyssnar pa bada
// — det ar exakt den sortens glapp som gjort fyra widgetar tysta tidigare.
//
// TRE REGLER ur arkitekturkontraktet:
//
//   1. ALDRIG render() harifran. render() satter viewRoot.innerHTML och river darmed hela vyn.
//      Bara ett textContent pa en nod byts.
//   2. Batchat via requestAnimationFrame. Uppmatt: 200 events i rad ger 4 DOM-mutationer, inte 200.
//   3. Teardown pa vyra-session-ended. Ingen lyssnare far overleva en utloggning eller ett kontobyte.
//
// Vardena lever bara i minnet. De ska inte overleva en omladdning, och tokenlaget (?access=) far
// aldrig skriva nagot — darfor ror den har vagen inte session-state.js alls.
(function () {
  // `las` = TikTok skickar redan totalen, kortet visar den rakt av.
  // `lagg` = ingen total finns, kortet summerar sjalvt.
  const KORT = [
    { stat: 'viewers', typer: ['viewer'], las: data => Number(data.count) },
    { stat: 'likes', typer: ['like', 'likes'], las: data => Number(data.points) },
    // GAVOR ar ANTAL. Coin-vardet (falt: coins) hor till INTAKT-kortet — vill man byta ar det
    // `lagg: data => Number(data.coins)` och inget annat.
    //
    // Summering ar saker har, och det ar inte sjalvklart: bada bryggorna vidarebefordrar bara
    // SISTA ramen av en streakbar gava (tiktok-bridge/bridge.js:314,
    // electron-app/tiktok-service.js:97) — annars hade en combo blivit ett triangeltal. Nar
    // eventet nar hit motsvarar det en avslutad gava eller combo, med count = repeatCount.
    { stat: 'gifts', typer: ['gift'], lagg: data => Number(data.count) }
  ];

  const senaste = Object.create(null);   // stat -> tal, saknas = inget event an
  let koad = false;
  let levande = true;

  function mala() {
    koad = false;
    if (!levande) return;
    for (const kort of KORT) {
      const varde = senaste[kort.stat];
      if (varde === undefined) continue;
      // Vyn kan vara en annan just nu (editor, overlay). Da finns inget kort, och det ar inte ett fel.
      const nod = document.querySelector('[data-stat="' + kort.stat + '"] strong');
      if (nod) nod.textContent = varde.toLocaleString('sv-SE');
    }
  }

  function schemalagg() {
    if (koad || !levande) return;
    koad = true;
    requestAnimationFrame(mala);
  }

  addEventListener('vyra-live-event', event => {
    if (!levande) return;
    const data = event.detail || {};
    const typ = String(data.type || data.event || '').toLowerCase();
    const kort = KORT.find(k => k.typer.includes(typ));
    if (!kort) return;
    const tal = (kort.las || kort.lagg)(data);
    if (!Number.isFinite(tal) || tal < 0) return;
    // Ett trasigt event far inte oka en summa. `las` skriver over och ar darmed sjalvlakande —
    // nasta korrekta event rattar den. En felaktig `lagg` sitter kvar hela sessionen.
    if (kort.lagg && tal === 0) return;
    senaste[kort.stat] = kort.lagg
      ? (senaste[kort.stat] || 0) + Math.round(tal)
      : Math.round(tal);
    schemalagg();
  });

  // render() bygger om #view fran grunden, sa korten ar nya noder varje gang. Utan den har skulle
  // vardena forsvinna sa fort anvandaren navigerar bort och tillbaka. En observer i stallet for en
  // hake i render(): den fangar varje vag som kan bygga om vyn, aven de som tillkommer senare.
  const observer = new MutationObserver(() => {
    for (const kort of KORT) if (senaste[kort.stat] !== undefined) { schemalagg(); return }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  addEventListener('vyra-session-ended', () => {
    levande = false;
    for (const kort of KORT) delete senaste[kort.stat];
    observer.disconnect();
  });
})();
