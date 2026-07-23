(function () {
  // Adds real illustrated SVG chrome to each Gift & Alert widget's default/flagship look, replacing
  // plain CSS gradients/clip-paths/emoji with actual illustration — the visible "next level" upgrade
  // on top of Phase 1's frame/animation infrastructure (gift-alert-frames.js).
  //
  // Inline <svg> (not <img src>) specifically so the art can use var(--accent)/var(--streak)/etc. and
  // stay in sync with each widget's existing, user-editable accent-color picker instead of being a
  // fixed-color asset. Scoped to the default theme per widget for Top Gift/Top Streak (which have
  // theme variants) — every other theme renders exactly as before, unchanged.

  const crownBadge = `<svg class="gaf-crown-badge" viewBox="0 0 48 40" style="position:absolute;left:50%;top:-27px;transform:translateX(-50%);width:30px;height:25px;z-index:5;filter:drop-shadow(0 0 6px var(--accent))"><path d="M4 34 L2 14 L14 22 L24 6 L34 22 L46 14 L44 34 Z" fill="var(--accent)"/><circle cx="24" cy="6" r="4" fill="var(--accent)"/><rect x="4" y="34" width="40" height="4" rx="1.5" fill="var(--accent)"/></svg>`;

  const royalFrame = `<svg class="gaf-royal-frame" viewBox="0 0 200 140" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1"><rect x="4" y="4" width="192" height="132" rx="10" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.85"/><rect x="9" y="9" width="182" height="122" rx="7" fill="none" stroke="var(--accent)" stroke-width="0.75" opacity="0.5"/><path d="M4 18 Q4 4 18 4" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M196 18 Q196 4 182 4" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M4 122 Q4 136 18 136" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M196 122 Q196 136 182 136" fill="none" stroke="var(--accent)" stroke-width="2"/><circle cx="11" cy="11" r="2.5" fill="var(--accent)"/><circle cx="189" cy="11" r="2.5" fill="var(--accent)"/><circle cx="11" cy="129" r="2.5" fill="var(--accent)"/><circle cx="189" cy="129" r="2.5" fill="var(--accent)"/></svg>`;

  const flameBadge = `<svg class="gaf-flame-badge" viewBox="0 0 40 48" style="width:100%;height:100%"><path d="M20 46C10 46 4 38 4 29C4 20 10 14 12 6C13 10 17 12 17 17C17 12 22 8 21 2C28 8 32 16 32 26C32 22 35 20 36 17C37 22 36 27 36 29C36 38 30 46 20 46Z" fill="var(--streak)" opacity="0.9"/><path d="M20 40C15 40 12 35 12 30C12 26 15 23 16 19C17 22 19 23 19 26C19 23 22 21 21 17C25 21 27 26 27 30C27 35 25 40 20 40Z" fill="#fff" opacity="0.55"/></svg>`;

  const spotlightBeam = `<svg viewBox="0 0 180 280" preserveAspectRatio="none" style="width:100%;height:100%"><defs><linearGradient id="gafBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--follow)" stop-opacity="0.55"/><stop offset="100%" stop-color="var(--follow)" stop-opacity="0"/></linearGradient></defs><polygon points="63,0 117,0 180,280 0,280" fill="url(#gafBeam)"/><line x1="70" y1="0" x2="20" y2="270" stroke="var(--follow)" stroke-width="1.5" opacity="0.4"/><line x1="90" y1="0" x2="90" y2="270" stroke="var(--follow)" stroke-width="1.5" opacity="0.55"/><line x1="110" y1="0" x2="160" y2="270" stroke="var(--follow)" stroke-width="1.5" opacity="0.4"/></svg>`;

  function starburst(count, rOuter = 50, rInner = 30) {
    const pts = [];
    const cx = 50, cy = 50;
    for (let i = 0; i < count * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (Math.PI * i) / count - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }
  // The heart PNG's own visible (non-transparent) content only fills ~73-80% of its square
  // canvas (measured directly: 284x310 out of 390x390), so at rOuter=40 the star's points were
  // still landing at roughly the same size as the heart's actual silhouette — a spiky shape reads
  // as "bigger" than a rounded one at the same nominal radius, so it kept poking out. Pulled well
  // inside that (rOuter=28) so the star sits clearly behind the heart as a small glow accent.
  const fanBurst = `<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"><polygon points="${starburst(10, 28, 16)}" fill="var(--fan)" opacity="0.9"/><polygon points="${starburst(10, 28, 16)}" fill="var(--fan-light)" opacity="0.35" transform="rotate(18 50 50)"/></svg>`;

  const orbitRing = `<svg viewBox="0 0 190 190" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"><circle cx="95" cy="95" r="90" fill="none" stroke="var(--gifter)" stroke-width="2" opacity="0.55"/><circle cx="95" cy="95" r="74" fill="none" stroke="var(--gifter-light)" stroke-width="1.5" stroke-dasharray="3 6" opacity="0.7"/>${[0, 90, 180, 270].map(deg => {
    const a = (deg * Math.PI) / 180, x = 95 + 90 * Math.cos(a), y = 95 + 90 * Math.sin(a);
    return `<rect x="${(x - 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="6" height="6" fill="var(--gifter-light)" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('')}</svg>`;

  const gafWh = wh;
  wh = function (w) {
    let html = gafWh(w);

    if (w.type === 'templateTopGift' && (w.theme || 'royal') === 'royal') {
      html = html.replace('<div class="vyra-gift-title"', royalFrame + '<div class="vyra-gift-title"');
      html = html.replace('<div class="vyra-flip"', crownBadge + '<div class="vyra-flip"');
    }

    if (w.type === 'templateTopStreak' && (w.streakTheme || 'inferno') === 'inferno') {
      html = html.replace(/(<i style="[^"]*">)🔥(<\/i>)/, `$1${flameBadge}$2`);
    }

    if (['templateFollowerAlert', 'templateLastGifter', 'templateLastLiker', 'templateLastSharer', 'templateLastSubscriber'].includes(w.type)) {
      html = html.replace('<div class="follow-light"></div>', `<div class="follow-light">${spotlightBeam}</div>`);
    }

    if (w.type === 'templateFanLevel') {
      html = html.replace('<div class="fan-burst">', `<div class="fan-burst">${fanBurst}`);
    }

    if (w.type === 'templateGifterLevel') {
      html = html.replace('<i></i><i></i><i></i>', orbitRing);
    }

    return html;
  };

  // Suppresses the old CSS-generated crown character (`:before{content:"♛"}`) for Top Gift's royal
  // theme now that a real SVG crown badge replaces it — kept in its own small stylesheet rather than
  // touching studio.css directly.
  const style = document.createElement('style');
  style.textContent = '.vyra-topgift.theme-royal .vyra-flip:before{content:none!important}';
  document.head.append(style);

  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
