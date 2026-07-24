home = function () {
  const connected = Boolean(state.tiktok);
  const user = state.user || 'VYRA-konto';
  const connectionText = connected ? `TikTok sparad · ${state.tiktok}` : 'TikTok väntar';
  const emptyStats = [
    ['👁', 'TITTARE'],
    ['♥', 'LIKES'],
    ['◆', 'GÅVOR'],
    ['↗', 'INTÄKT']
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
    ${emptyStats.map((item, index) => `<article class="card stat premium-stat s${index}">
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
