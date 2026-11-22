// galleri.js — Galleriet med VYRA:s widgetdesigner (Webbdesignern 2026-11-22, idé 2).
//
// SANNINGEN. Listan nedan är skriven ur docs/katalogkarta.md (genererad ur den körande katalogen,
// commit 9245a6a1). Inga designer är påhittade och inga siffror skrivs ut som inte räknas här.
// Bilderna och klippen är filer som redan ligger i repot: inspelningar ur VYRA:s overlay
// (Gift Campaign, Fan Level Up, Battle-paket, Hjärtan & moln, Chattavatar), katalogens
// förhandsbilder (assets/previews) och designernas målade ramar. Gift Jar, Last-X, Guardian Emblem,
// Fan Level 50, MVP-firandet och målen visas som lätta webp-kopior i assets/galleri/ av samma
// bilder (originalen är 0,4–3 MB styck). Har en design ingen bild i repot visas ett namnkort —
// hellre inget än en bild på fel design.
//
// LÄNKAR. Varje design har ett eget ankare (galleri.html#gift-jar-royal-lion) och en knapp som
// kopierar länken. Kommer man in med ett ankare rullas kortet fram och markeras.
//
// RÖRELSE. Korta mp4-klipp (≈200 kB) spelar bara när de syns. De stora transparenta WebM-klippen
// (1,5–4,5 MB) spelar först när man trycker på kortet. Vid prefers-reduced-motion spelar inget av
// sig självt. Inga anrop till servern.
(function () {
  'use strict';

  const P = 'assets/previews/', G = 'assets/galleri/', GC = 'assets/giftcampaign/hemsida/', FH = 'assets/fanhjarta/hemsida/';
  const HM = 'assets/videos/hjartmoln/', BP = 'assets/videos/battle/', RAM = 'assets/mvp-celebrations/ram/', PG = 'assets/playground/';
  const V = '?v=20261110-1';

  // typ: 'klipp' = liten mp4 som spelar när den syns · 'tryck' = stor webm som spelar vid tryck · 'bild'
  const bild = (namn, src, extra) => Object.assign({ namn, typ: 'bild', src }, extra || {});
  const klipp = (namn, mp4, poster) => ({ namn, typ: 'klipp', video: mp4, src: poster });
  const tryck = (namn, webm, poster) => ({ namn, typ: 'tryck', video: webm, src: poster });
  const kort = namn => ({ namn, typ: 'kort' });

  const KATEGORIER = [
    { id: 'gavor', namn: 'Gåvor', ingress: 'Det som händer när tittarna skickar gåvor.', familjer: [
      { namn: 'Gift Campaign', om: 'Varje gåva spelar sin egen video. Finns liggande och stående.', designer: [
        klipp('Fokus', GC + 'fokus.mp4' + V, GC + 'fokus.webp' + V),
        klipp('Classic', GC + 'classic.mp4' + V, GC + 'classic.webp' + V),
        klipp('Gåvoflöde', GC + 'flode.mp4' + V, GC + 'flode.webp' + V)] },
      { namn: 'Gift Jar', om: 'En glasburk för gåvorna, med ett djur per modell.', designer: [
        bild('Royal Lion', G + 'giftjar-lion.webp'), bild('Ember Dragon', G + 'giftjar-dragon.webp'),
        bild('Phoenix Rise', G + 'giftjar-phoenix.webp'), bild('Midnight Panther', G + 'giftjar-panther.webp'),
        bild('Sapphire Peacock', G + 'giftjar-peacock.webp')] },
      { namn: 'Top Gift', om: 'Kvällens största gåva.', designer: [
        bild('Design 1', P + 'topgift-neon.jpg'), bild('Design 2', P + 'topgift-royal.jpg'),
        kort('Design 3'), bild('Design 4', P + 'topcoins-signal-orbit.jpg')] },
      { namn: 'Last-X Alerts', om: 'Den som senast gav en gåva, gillade, delade eller prenumererade.', designer: [
        kort('Card'), kort('Stack'), kort('Skew'), kort('Badge'),
        bild('Royal Coronation', G + 'lastx-royal-coronation.webp'), bild('Crown Banner', G + 'lastx-crown-banner.webp'),
        bild('Royal Amethyst', G + 'lastx-royal-amethyst.webp'), bild('Ice King', G + 'lastx-ice-king.webp'),
        bild('Neon Cyber', G + 'lastx-neon-cyber.webp'), bild('Dragon Flame', G + 'lastx-dragon-flame.webp'),
        bild('Angel Gold', G + 'lastx-angel-gold.webp')] },
      { namn: 'Gift Fireworks & Bubbles', om: 'Gåvorna som fyrverkeri eller bubblor.', designer: [
        kort('Supernova'), kort('November'), kort('Gift Bubbles')] }
    ] },
    { id: 'topplistor', namn: 'Topplistor', ingress: 'Vem som ger mest, gillar mest och håller streaken längst.', familjer: [
      { namn: 'Top Gifters-podium', om: 'Dina tre största gifters på en pall, med en målad ram per design.', designer: [
        bild('Kodad ram', P + 'pgpodium.jpg'),
        bild('Royal Phoenix', PG + 'royal-phoenix-key.webp'), bild('Obsidian Dragon', PG + 'obsidian-dragon-key.webp'),
        bild('Gilded Lion', PG + 'gilded-lion-key.webp'), bild('Frostfire Crown', PG + 'frostfire-crown-key.webp'),
        bild('Diamond Halo', PG + 'diamond-halo-key.webp'), bild('Midnight Butterfly', PG + 'midnight-butterfly-key.webp'),
        bild('Thunder Warden', PG + 'thunder-warden-key.webp'), bild('Stellar Emperor', PG + 'stellar-emperor-key.webp'),
        bild('Ocean Oracle', PG + 'ocean-oracle-key.webp'), bild('Moonlit Sakura', PG + 'moonlit-sakura-key.webp'),
        bild('Celestial Serpent', PG + 'celestial-serpent-key.webp'), bild('Neon Valkyrie', PG + 'neon-valkyrie-key.webp')] },
      { namn: 'Top Like, Top Coins och Top Points', om: 'Samma design för alla tre topplistorna.', designer: [
        kort('Voltage'), kort('Basic'), kort('Prism stående'), kort('Prism liggande'), kort('Metall'),
        bild('Ljusring', 'assets/images/toplike-ljusring/ram-1.png', { not: 'Top Like' })] },
      { namn: 'Top Streak', om: 'Tittarnas längsta streak.', designer: [
        bild('Clean Flip', P + 'topstreak-cleanflip.jpg'), bild('Design 1', P + 'topstreak-design-1.jpg'),
        bild('Design 2', P + 'topstreak-design-2.jpg'), bild('Design 3', P + 'topstreak-design-3.jpg')] }
    ] },
    { id: 'mal', namn: 'Mål och mätare', ingress: 'Kvällens mål, så att tittarna ser hur nära ni är.', familjer: [
      { namn: 'Follower-, Like- och Diamond-mål', om: 'Rörliga mål som rund ring, liggande list eller stående torn.', designer: [
        bild('Crown Orbit', G + 'goal-circle-follower.webp'), bild('Crown Rail', G + 'goal-horizontal-follower.webp'),
        bild('Crown Tower', G + 'goal-vertical-follower.webp'), bild('Heart Orbit', G + 'goal-circle-like.webp'),
        bild('Heart Rail', G + 'goal-horizontal-like.webp'), bild('Heart Tower', G + 'goal-vertical-like.webp'),
        bild('Diamond Orbit', G + 'goal-circle-diamond.webp'), bild('Diamond Rail', G + 'goal-horizontal-diamond.webp'),
        bild('Diamond Tower', G + 'goal-vertical-diamond.webp')] },
      { namn: 'Goal Pro', om: 'Stilrena mål i nio former.', designer: [
        bild('Rak bar', P + 'pggoal-1.jpg'), bild('Pill', P + 'pggoal-2.jpg'), bild('Ring', P + 'pggoal-3.jpg'),
        bild('Mätare', P + 'pggoal-4.jpg'), bild('Steg', P + 'pggoal-5.jpg'), bild('Bara siffra', P + 'pggoal-6.jpg'),
        bild('Stående', P + 'pggoal-7.jpg'), bild('Smal med pil', P + 'pggoal-8.jpg'), bild('Stående pill', P + 'pggoal-9.jpg')] },
      { namn: 'Heart Me Goal', om: 'Ett hjärtmål i tolv teman.', designer: [
        kort('Classic'), kort('Dark'), kort('Emerald'), kort('Galaxy'), kort('Golden'), kort('Ice'),
        kort('Neon'), kort('Ocean'), kort('Sakura'), kort('Frost'), kort('Midnight'), kort('Citrus')] },
      { namn: 'Hjärtan och moln', om: 'Transparenta hjärt- och molneffekter. Tryck på ett kort för att spela.', designer: [
        tryck('Profilhjärtan', HM + 'organiskt.webm', HM + 'organiskt.webp'),
        tryck('Fallande hjärtan', HM + 'fallande.webm', HM + 'fallande.webp'),
        tryck('Hjärtmoln', HM + 'hjartmoln.webm', HM + 'hjartmoln.webp'),
        tryck('Glödande hjärtmoln', HM + 'glodande.webm', HM + 'glodande.webp'),
        tryck('Kristallhjärtan', HM + 'kristall.webm', HM + 'kristall.webp'),
        tryck('Stjärnstoft', HM + 'stjarnstoft.webm', HM + 'stjarnstoft.webp'),
        tryck('Blixtmoln', HM + 'blixt.webm', HM + 'blixt.webp'),
        tryck('Organiskt moln', HM + 'organiskt.webm', HM + 'organiskt.webp'),
        tryck('Levande moln', HM + 'levande.webm', HM + 'levande.webp')] },
      { namn: 'Energimätare', om: 'En mätare som töms hela tiden, så tittarna måste hålla den uppe.', designer: [
        kort('Vital'), kort('Arcade'), kort('Minimal')] },
      { namn: 'Like Fountain', om: 'Hjärtan stiger ur en portal när tittarna tappar på skärmen.', designer: [kort('Like Fountain')] }
    ] },
    { id: 'fans', namn: 'Fans och nivåer', ingress: 'Fira tittarna som går upp i nivå eller följer dig.', familjer: [
      { namn: 'Fan Level Up', om: 'När en tittare går upp i fan club-nivå. Sex designer har guldhjärta.', designer: [
        kort('Hero Card'), kort('Original Fan Stack'), kort('Heartbeat Side'), kort('Fan Badge Reveal'),
        kort('Loyalty Ring'), kort('Rising Hearts'), kort('Welcome Ribbon'), kort('Community Duo'),
        klipp('Ascend', FH + 'ascend.mp4' + V, FH + 'ascend.webp' + V),
        klipp('Heart Reveal', FH + 'heartreveal.mp4' + V, FH + 'heartreveal.webp' + V),
        klipp('Hjärtats gåva', FH + 'heartgift.mp4' + V, FH + 'heartgift.webp' + V),
        klipp('Golden Stage', FH + 'goldenstage.mp4' + V, FH + 'goldenstage.webp' + V),
        klipp('Heart Lift', FH + 'heartlift.mp4' + V, FH + 'heartlift.webp' + V),
        klipp('Luminous', FH + 'luminous.mp4' + V, FH + 'luminous.webp' + V)] },
      { namn: 'Fan Level 50', om: 'Milstolpen när en tittare når nivå 50.', designer: [
        bild('Fan Level 50', G + 'fanlevel50-lejon.webp')] },
      { namn: 'Gifter Level Up', om: 'När en tittare går upp i gifter-nivå.', designer: [
        kort('Profil i orbit'), kort('Stort nivånummer'), kort('Diamantstapel'), kort('Sidobadge'),
        kort('Diamantreveal'), kort('Orbitnivå'), kort('Stigande nivåer'), kort('Myntvändning'), kort('Kompakt duo')] },
      { namn: 'Guardian Emblem', om: 'Ett emblem för dina guardians.', designer: [
        bild('Blå kristall', G + 'guardian-sapphire.webp'), bild('Grön aura', G + 'guardian-emerald.webp')] },
      { namn: 'Follower Alert', om: 'Välkomnar nya följare.', designer: [
        kort('Follower Spotlight Gold'), kort('Follower Spotlight Ocean'), kort('Follower Spotlight Blush')] },
      { namn: 'Social-alert', om: 'En alert som växlar mellan dina sociala konton.', designer: [kort('Glanskort'), kort('Ikon som öppnas')] }
    ] },
    { id: 'battle', namn: 'Battle', ingress: 'För dina battles: MVP, firanden och klipp.', familjer: [
      { namn: 'Battle MVP', om: 'Kvällens MVP i en målad ram.', designer: [
        bild('Inferno', RAM + 'inferno-a.webp'), bild('Royal', RAM + 'royal-a.webp'), bild('Cyber', RAM + 'cyber-a.webp'),
        bild('Storm', RAM + 'storm-a.webp'), bild('Aurora', RAM + 'aurora-a.webp'), bild('Samurai', RAM + 'samurai-a.webp')] },
      { namn: 'Battle MVP-firande', om: 'Koreografin när MVP:n koras.', designer: [
        bild('Guldkrona', G + 'firande-gold-ribbon.webp'), bild('Lion Clash', G + 'firande-lion-clash.webp'),
        bild('Royal', RAM + 'royal-b.webp'), bild('Inferno', RAM + 'inferno-b.webp'), bild('Ice', RAM + 'ice-b.webp'),
        bild('Cyber', RAM + 'cyber-b.webp'), bild('Storm', RAM + 'storm-b.webp'), bild('Aurora', RAM + 'aurora-b.webp'),
        bild('Samurai', RAM + 'samurai-b.webp')] },
      { namn: 'Battle-paket', om: 'Hela paket med klippen Tap Tap, X2, X3, Glove och Snipe. Tryck för att spela Glove.', designer: [
        tryck('Pink Princess', BP + 'pink-princess/glove.webm', BP + 'pink-princess/glove.webp'),
        tryck('Royal Ruby', BP + 'royal-ruby/glove.webm', BP + 'royal-ruby/glove.webp'),
        tryck('Cloud Fox', BP + 'cloud-fox/glove.webm', BP + 'cloud-fox/glove.webp'),
        tryck('Neon Miami', BP + 'neon-miami/glove.webm', BP + 'neon-miami/glove.webp'),
        tryck('Samurai Storm', BP + 'samurai-storm/glove.webm', BP + 'samurai-storm/glove.webp'),
        tryck('Street Art', BP + 'street-art/glove.webm', BP + 'street-art/glove.webp'),
        tryck('Ice Frost', BP + 'ice-frost/glove.webm', BP + 'ice-frost/glove.webp'),
        tryck('Jungle Spirit', BP + 'jungle-spirit/glove.webm', BP + 'jungle-spirit/glove.webp'),
        tryck('Golden Holiday', BP + 'golden-holiday/glove.webm', BP + 'golden-holiday/glove.webp')] }
    ] },
    { id: 'chatt-och-spel', namn: 'Chatt och spel', ingress: 'Låt tittarna vara med: avatarer, spel och låtönskningar.', familjer: [
      { namn: 'Chattavatar', om: 'En animerad avatar i din LIVE. Tryck för att spela.', designer: [
        tryck('Chattavatar', 'assets/chattavatar/vyra-avatar-flow-wave.webm', 'assets/chattavatar/vyra-avatar-idle.png'),
        tryck('Chattavatar 2 helkropp', 'assets/chattavatar/nr2/vyra-avatar-flow-wave.webm', 'assets/chattavatar/nr2/vyra-avatar-idle.png')] },
      { namn: 'Ordjakten', om: 'Tittarna skriver ordet i chatten, och den som först skriver rätt får poäng.', designer: [kort('Ordjakten')] },
      { namn: 'Quiz', om: 'Frågor som tittarna svarar på i chatten.', designer: [kort('Frågerad'), kort('Spelkort'), kort('Quiz Show')] },
      { namn: 'Skattkista', om: 'En nedräkning till när skattkistan i din LIVE öppnas.', designer: [kort('Skattkista'), kort('Skattkista som rad')] },
      { namn: 'Låtönskningar', om: 'Tittarna önskar låtar.', designer: [kort('YouTube'), kort('Spotify')] },
      { namn: 'Boxgame', om: 'En rondtimer med alert och ljud.', designer: [kort('Boxgame-klocka')] },
      { namn: 'Viewer Showcase', om: 'Lyfter fram en tittare i bild.', designer: [kort('Name Takeover'), kort('Halo Reveal'), kort('Spotlight Slide')] },
      { namn: 'Bertil paket', om: 'En gåvoscen där tittarnas gåvor kastar ägg, glass eller vattenmelon på Bertil.', designer: [bild('Bertil paket', 'assets/gift-scene/bertil-paket-katalog.webp')] }
    ] }
  ];

  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rot = document.querySelector('[data-galleri]');
  const nav = document.querySelector('[data-galleri-nav]');
  if (!rot) return;
  const lugn = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sedda = new Set();

  function ankare(familj, design) {
    const bas = familj.designer.length === 1 && slug(design.namn) === slug(familj.namn)
      ? slug(familj.namn) : slug(familj.namn) + '-' + slug(design.namn);
    let id = bas, n = 2;
    while (sedda.has(id)) id = bas + '-' + n++;
    sedda.add(id);
    return id;
  }

  // Namnkortets bokstav: sista ordets initial (Follower Spotlight Gold → G), annars första ordets.
  const monogram = n => {
    const ord = n.trim().split(/\s+/), sist = ord[ord.length - 1].charAt(0);
    return (/[A-Za-z0-9]/.test(sist) ? sist : ord[0].charAt(0)).toUpperCase();
  };

  function media(d) {
    if (d.typ === 'kort') {
      return '<div class="g-media g-tom" aria-hidden="true"><span>' + esc(monogram(d.namn)) + '</span></div>';
    }
    const img = '<img src="' + esc(d.src) + '" alt="" loading="lazy" decoding="async">';
    if (d.typ === 'bild') return '<div class="g-media">' + img + '</div>';
    const auto = d.typ === 'klipp' ? ' data-g-auto' : '';
    return '<div class="g-media g-film"><video data-src="' + esc(d.video) + '" poster="' + esc(d.src) + '" muted loop playsinline preload="none"' + auto + '></video>'
      + (d.typ === 'tryck' ? '<button type="button" class="g-spela" data-g-spela aria-label="Spela ' + esc(d.namn) + '"><span aria-hidden="true"></span></button>' : '')
      + '</div>';
  }

  let html = '';
  let navHtml = '';
  KATEGORIER.forEach(k => {
    navHtml += '<a href="#' + k.id + '" data-g-nav="' + k.id + '">' + esc(k.namn) + '</a>';
    html += '<section class="g-kategori" id="' + k.id + '" aria-labelledby="g-' + k.id + '"><div class="g-kategori-topp"><h2 id="g-' + k.id + '">' + esc(k.namn) + '</h2><p>' + esc(k.ingress) + '</p></div>';
    k.familjer.forEach(f => {
      html += '<div class="g-familj"><div class="g-familj-topp"><h3>' + esc(f.namn) + '</h3><p>' + esc(f.om) + '</p></div><ul class="g-rutnat">';
      f.designer.forEach(d => {
        const id = ankare(f, d);
        html += '<li class="g-kort' + (d.typ === 'kort' ? ' g-kort-namn' : '') + '" id="' + id + '">' + media(d)
          + '<div class="g-text"><b>' + esc(d.namn) + '</b><span>' + esc(d.not || f.namn) + '</span></div>'
          + '<a class="g-lank" href="#' + id + '" data-g-lank aria-label="Länk till ' + esc(d.namn) + '">Kopiera länk</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</section>';
  });
  rot.innerHTML = html;
  if (nav) nav.innerHTML = navHtml;

  // ---- klipp: små mp4 spelar när de syns, stora webm bara vid tryck ----
  const ladda = v => { if (!v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src; };
  const spela = v => { ladda(v); const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  const auto = Array.from(rot.querySelectorAll('video[data-g-auto]'));
  const allaVideor = Array.from(rot.querySelectorAll('video'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(poster => poster.forEach(p => {
      const v = p.target;
      if (p.isIntersecting) { if (!lugn && v.hasAttribute('data-g-auto')) spela(v); }
      else if (!v.paused) { v.pause(); const k = v.closest('.g-kort'); if (k) k.classList.remove('spelar'); }
    }), { threshold: 0.3 });
    allaVideor.forEach(v => io.observe(v));
  } else if (!lugn) auto.forEach(spela);

  rot.addEventListener('click', e => {
    const knapp = e.target.closest('[data-g-spela]');
    if (knapp) {
      const kortEl = knapp.closest('.g-kort'), v = kortEl.querySelector('video');
      if (v.paused) { spela(v); kortEl.classList.add('spelar'); knapp.setAttribute('aria-label', 'Pausa ' + kortEl.querySelector('.g-text b').textContent); }
      else { v.pause(); kortEl.classList.remove('spelar'); knapp.setAttribute('aria-label', 'Spela ' + kortEl.querySelector('.g-text b').textContent); }
      return;
    }
    const lank = e.target.closest('[data-g-lank]');
    if (!lank) return;
    e.preventDefault();
    const id = lank.getAttribute('href').slice(1);
    const url = location.origin + location.pathname + '#' + id;
    history.replaceState(null, '', '#' + id);
    markera(id, false);
    const klar = () => { lank.textContent = 'Länken är kopierad'; lank.classList.add('kopierad');
      setTimeout(() => { lank.textContent = 'Kopiera länk'; lank.classList.remove('kopierad'); }, 2200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(klar, klar);
    else klar();
  });

  // ---- ankare: rulla fram och markera kortet ----
  function markera(id, rulla) {
    const el = id && document.getElementById(id);
    if (!el) return;
    rot.querySelectorAll('.g-kort.markerad').forEach(k => k.classList.remove('markerad'));
    if (el.classList.contains('g-kort')) el.classList.add('markerad');
    if (rulla) el.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: el.classList.contains('g-kort') ? 'center' : 'start' });
  }
  const franHash = () => { try { markera(decodeURIComponent(location.hash.slice(1)), true); } catch (e) { /* trasigt ankare */ } };
  if (location.hash) requestAnimationFrame(franHash);
  window.addEventListener('hashchange', franHash);

  // ---- navigeringen följer med när man rullar ----
  if (nav && 'IntersectionObserver' in window) {
    const lankar = Array.from(nav.querySelectorAll('[data-g-nav]'));
    const spy = new IntersectionObserver(poster => poster.forEach(p => {
      if (!p.isIntersecting) return;
      lankar.forEach(a => a.classList.toggle('aktiv', a.dataset.gNav === p.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    rot.querySelectorAll('.g-kategori').forEach(s => spy.observe(s));
  }
})();
