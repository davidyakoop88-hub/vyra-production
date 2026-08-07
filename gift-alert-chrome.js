(function () {
  // Adds real illustrated SVG chrome to each Gift & Alert widget's default/flagship look, replacing
  // plain CSS gradients/clip-paths/emoji with actual illustration — the visible "next level" upgrade
  // on top of Phase 1's frame/animation infrastructure (gift-alert-frames.js).
  //
  // Inline <svg> (not <img src>) specifically so the art can use var(--accent)/var(--streak)/etc. and
  // stay in sync with each widget's existing, user-editable accent-color picker instead of being a
  // fixed-color asset. Scoped to the default theme per widget for Top Gift/Top Streak (which have
  // theme variants) — every other theme renders exactly as before, unchanged.

  // Har lag tidigare royalFrame och crownBadge — en SVG-rektangel med hornprickar som ritades over
  // hela widgetytan (position:absolute, inset:0) och en krona pa top:-27px, alltsa utanfor ladan.
  //
  // Bada togs bort 2026-08-07: widgetar ska rendera fritt over videon i OBS, utan foder runt
  // innehallet. html.overlay-output .widget i studio.css tar redan bort CSS-ramen, bakgrunden och
  // skuggan pa wrappern — men de har tva var markup, inte stil, sa den regeln nadde dem aldrig.
  // Uppmatt i webblasaren fore borttagningen: ramen 280x260px over hela widgeten, kronan pa
  // top:-27px med z-index 5.
  //
  // Ovrig chrome i den har filen sitter INUTI innehallet (flamman i streak-siffran, ljuskaglan
  // bakom follower-avataren, stjarnan bakom fan-hjartat, ringen runt gifter-avataren) och ar darfor
  // kvar — det ar dekor pa innehallet, inte en ram runt widgeten.

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

    if (w.type === 'templateTopStreak' && (w.streakTheme || 'inferno') === 'inferno') {
      html = html.replace(/(<i style="[^"]*">)🔥(<\/i>)/, `$1${flameBadge}$2`);
    }

    if (['templateFollowerAlert', 'templateLastGifter', 'templateLastLiker', 'templateLastSharer', 'templateLastSubscriber'].includes(w.type)) {
      html = html.replace('<div class="follow-light"></div>', `<div class="follow-light">${spotlightBeam}</div>`);
    }

    if (w.type === 'templateFanLevel') {
      html = html.replace('<div class="fan-burst">', `<div class="fan-burst">${fanBurst}`);
    }

    // Only 'profile' (default) and 'number' actually want this decorative ring behind the avatar —
    // every other layout (stack/sidebadge/reveal/orbitlevel/risingtier/flip/duo) hides the original
    // <i> ring dots via studio.css's .gifter-layout-<name> rules, or (orbitlevel specifically)
    // depends on animating .gifter-orbit>i:nth-child(1) directly for its rotating-ring motion.
    // Replacing those <i> elements with this fixed SVG unconditionally silently broke both: the
    // hide-rules stopped matching anything (SVG isn't an <i>), so the ring showed on every layout,
    // and orbitlevel's own ring animation had no element left to target.
    if (w.type === 'templateGifterLevel' && ['profile', 'number', undefined].includes(w.gifterLayout)) {
      html = html.replace('<i></i><i></i><i></i>', orbitRing);
    }

    return html;
  };

  // Har lag en style-tagg som skulle slacka den CSS-genererade kronan (`:before{content:"♛"}`) nar
  // SVG-kronan ersatte den. Den var scopad till `.vyra-topgift.theme-royal` — en klass som ingen
  // widget far: renderaren satter `topgift-royal`. Regeln matchade alltsa aldrig nagonting, och
  // teckenkronan ritades hela tiden dold bakom SVG-kronan pa nastan samma position (-25px mot
  // -27px). Bada ar nu borttagna vid kallan (regeln i studio.css), sa dampningen behovs inte.

  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
