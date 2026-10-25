// topgift-designer.js — Top Gift · Design 1, 2 och 3 (godkända i widget-playgrounden 2026-10-17).
// Stilarna ligger i topgift-designer.css; där står också vad varje design har som kännetecken.
//
//   Design 1  tema neon   VYRA:s Neon Purple med en svävande krona i stället för rubriken, fri gåva och strålar
//   Design 2  tema royal  egen markup: profil och gåva sida vid sida, guldlinje, profilram (färgring/sexkant/HD)
//   Design 3  tema fokus  egen markup: gåvan stor i en glasruta, bubblor, landning, bubbelbricka
//
// LIVE UTAN NYA KROKAR. Design 2 och 3 behåller exakt de klasser som live-vägarna redan patchar:
// .vyra-topgift[data-id] som rot, .vyra-profile-face img, .vyra-gift-face img, .topgift-copy strong/em
// (gift-event-images.js SHAPES, live-leaderboard.js) och strong/em i .vyra-topgift (live-zero-state.js
// nollställer exempelnamnet i overlayn). Därför kommer riktiga givare, gåvor och tomt läge fram utan att
// någon av de filerna behöver ändras. Mynttexten är bara siffran; "● " och " mynt" ritas med CSS, så
// patchen (som behåller allt framför första siffran) aldrig tappar dem.
(function () {
  'use strict';
  if (typeof vyraTopGift !== 'function') return;
  const SAFE = window.VyraSafe;
  const txt = (v, f) => (SAFE ? SAFE.text(v, f) : String(v == null ? f : v));
  const src = (v, f) => (SAFE ? SAFE.url(v, f) : (v || f));
  const PROFIL = 'assets/images/test-profile.svg', GAVA = 'assets/gifts/events/0001_Rose.png';
  const BAS = { royal: 276, fokus: 236 };                 // designbredd i px, som i playgrounden
  const farg2 = w => (/^#[0-9a-f]{6}$/i.test(w.accent2 || '') ? w.accent2 : (w.theme === 'fokus' ? '#1f6bff' : '#7c4dff'));
  const glod = w => ((w.topGiftGlow ?? 55) / 55 * 0.8).toFixed(3);
  // Ärv färgschema (vyra-topgift-panel.js): accenten och namnets färg från state.brandKit när widgeten
  // ärver, annars widgetens egna värden som förut.
  const arv = (w, falt, eget) => (w.inheritBrandKit && typeof state !== 'undefined' && state && state.brandKit && state.brandKit[falt]) || eget;

  // HD-bildramarna är desamma som podiet och fyrverkerierna använder (playground-assets.js).
  function bildram(id) {
    const pg = window.VYRA_PG; if (!pg || !id) return null;
    const f = (pg.frames || []).find(x => x.id === id); if (!f) return null;
    const nyckel = f.imgKey || f.id + '-key';
    return { url: (pg.img && pg.img[nyckel]) || 'assets/playground/' + nyckel + '.webp', hal: Number(f.hole) || .6 };
  }

  function rot(w, klass, inner) {
    const k = ((Number(w.width) || 340) / BAS[w.theme]).toFixed(3);
    // SAMMA KOMPOSITION I ALLA STORLEKAR (granskningen 2026-10-25). Golven i CSS:en (namn och siffra
    // aldrig under 12 px) räknades förr mot widgetens totala förstoring, så texten växte relativt resten
    // när widgeten krymptes och lådan blev högre. Nu gäller golven designen i full storlek, och Storlek
    // och Bredd skalar hela kompositionen likformigt.
    const z = '1';
    const bild = ((Number(w.giftSize) || 110) / 110).toFixed(3);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    // Gift-redigeraren (media.js, "GIFT EDITOR · VISA / TA BORT") skriver showGift/showProfile/
    // showDataName/showDataValue och fontFamily/fontStyle på widgeten; originalrenderaren läser dem
    // inline. Här blir de klasser och en stil på roten, så att samma kryssrutor gäller i Design 2 och 3.
    const utan = [['showGift', 'utan-gava'], ['showProfile', 'utan-profil'], ['showDataName', 'utan-namn'], ['showDataValue', 'utan-varde']]
      .filter(([k]) => w[k] === false).map(([, c]) => ' ' + c).join('');
    const typ = `font-family:${txt(w.fontFamily, 'Inter')};font-style:${w.fontStyle === 'italic' ? 'italic' : 'normal'};`;
    return `<div class="widget vyra-topgift tgd ${klass}${utan}${valt ? ' selected' : ''}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;width:${w.width || 340}px;${typ}`
      + `--accent:${arv(w, 'highlight', w.accent || '#d9a441')};--a2:${farg2(w)};--g:${glod(w)};--t:${arv(w, 'text', w.dataColor || '#fff')};--tgd-text:${w.dataSize || 20}px;--tgd-z:${z};`
      + `zoom:${w.widgetScale || 1}"><div class="tgd-in" style="zoom:${k}"><div class="tgd-bild" style="zoom:${bild}">${inner.bild}</div>`
      + `<div class="topgift-copy">${inner.text}</div></div>${valt ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  }
  const namn = w => `<strong>${txt(w.dataName, '@StreamQueen')}</strong>`;
  const mynt = w => `<em>${txt(w.dataValue, '44 999')}</em>`;

  function design2(w) {
    const ram = ['farg', 'sexkant', 'hd'].includes(w.tgdRam) ? w.tgdRam : 'farg';
    const hd = ram === 'hd' ? (bildram(w.tgdBildram) || bildram('gilded-lion')) : null;
    const html = rot(w, 'tgd2 ram-' + ram, {
      bild: `<div class="rad"><div class="pw"><div class="vyra-profile-face"><img src="${src((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.profileImage), PROFIL)}" alt=""></div>`
        + `${hd ? `<img class="hdram" src="${src(hd.url, '')}" alt="">` : ''}<i class="glans"></i></div>`
        + `<div class="vyra-gift-face"><img src="${src((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.giftImage), GAVA)}" alt=""></div></div>`,
      text: namn(w) + '<span class="linje"></span>' + mynt(w)
    });
    return hd ? html.replace('--g:', `--hal:${hd.hal};--g:`) : html;
  }

  const BUBBLOR = [[9, 7.2, 0, 14], [5, 6.0, 1.3, 30], [7, 7.8, 2.6, 48], [4, 6.4, .7, 62], [10, 8.4, 3.4, 78], [6, 6.6, 4.2, 24], [5, 7.4, 2.0, 88], [4, 6.8, 5.1, 40], [6, 7.6, 5.8, 70]]
    .map(([b, t, d, l]) => `<i style="--b:${b}px;--t:${t}s;--d:${d}s;left:${l}%"></i>`).join('');
  function design3(w) {
    return rot(w, 'tgd3', {
      bild: `<div class="ruta"><div class="bubblor">${BUBBLOR}</div><div class="vyra-gift-face"><img src="${src((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.giftImage), GAVA)}" alt=""></div>`
        + `<div class="stank"><i></i><i></i><i></i><i></i></div><span class="landring"></span>`
        + `<div class="bw"><div class="vyra-profile-face"><img src="${src((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.profileImage), PROFIL)}" alt=""></div><i></i><i></i></div></div>`,
      text: namn(w) + mynt(w)
    });
  }

  // KRONAN i Design 1 (David 2026-10-21: "varför kan jag inte ändra kronan på top gift?"). Samma tolv
  // kronor som Top Gifter Podium (assets/playground/<id>-crown.webp, alla 512 px breda, så de fyller
  // samma plats utan att förvrängas). Neon Valkyrie är den som alltid stått där och är standard.
  // Panelens val (vyra-topgift-panel.js, fältet tgdKrona) läser den här listan.
  window.VyraTopGiftKronor = [
    ['neon-valkyrie', 'Neon Valkyrie'], ['royal-phoenix', 'Royal Phoenix'], ['gilded-lion', 'Gilded Lion'],
    ['diamond-halo', 'Diamond Halo'], ['obsidian-dragon', 'Obsidian Dragon'], ['frostfire-crown', 'Frostfire'],
    ['midnight-butterfly', 'Midnight Butterfly'], ['thunder-warden', 'Thunder Warden'], ['stellar-emperor', 'Stellar Emperor'],
    ['ocean-oracle', 'Ocean Oracle'], ['moonlit-sakura', 'Moonlit Sakura'], ['celestial-serpent', 'Celestial Serpent'],
  ];

  const forra = vyraTopGift;
  vyraTopGift = function (w) {
    if (!w || w.giftFrame) return forra(w);
    if (w.theme === 'royal') return design2(w);
    if (w.theme === 'fokus') return design3(w);
    let html = forra(w);
    if (w.theme === 'neon') {
      // Design 1: kronan i en höjdlös behållare före bilden, och klassen som slår på fri gåva och strålar.
      // Kronan står där rubriken stod, så kryssrutan Rubrik slår av och på den.
      html = html.replace('premium-topgift topgift-neon', 'premium-topgift topgift-neon tgd1');
      // Kronan väljs i panelen (tgdKrona, vyra-topgift-panel.js). Bara id:n ur listan blir en sökväg;
      // allt annat — ett gammalt eller manipulerat värde — blir standardkronan.
      const kronor = (window.VyraTopGiftKronor || []).map(k => k[0]);
      const krona = kronor.includes(w.tgdKrona) ? w.tgdKrona : 'neon-valkyrie';
      if (w.showTitle !== false) html = html.replace('<div class="vyra-flip"', '<div class="tgd-kronfaste"><img class="tgd-krona" src="assets/playground/' + krona + '-crown.webp" alt=""></div><div class="vyra-flip"');
    }
    return html;
  };

  // LANDNING i Design 3: bara när gåvan faktiskt byts — live-patchen byter img.src, och en omritning
  // med en ny gåva bygger om noden. Båda fångas genom att jämföra mot senast sedda bild per widget.
  const senast = new Map();
  let planerad = 0;
  function kollaLandning() {
    planerad = 0;
    document.querySelectorAll('.vyra-topgift.tgd3').forEach(el => {
      const img = el.querySelector('.vyra-gift-face img'); if (!img) return;
      const id = el.dataset.id, nu = img.getAttribute('src'), forut = senast.get(id);
      senast.set(id, nu);
      if (!forut || forut === nu) return;
      el.classList.remove('landar'); void el.offsetWidth; el.classList.add('landar');
      clearTimeout(el.__tgdLand); el.__tgdLand = setTimeout(() => el.classList.remove('landar'), 2300);
    });
  }
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(muts => {
      if (planerad) return;
      for (const m of muts) {
        const t = m.target.nodeType === 1 ? m.target : null;
        if ((t && t.closest && t.closest('.tgd3')) || [...(m.addedNodes || [])].some(n => n.nodeType === 1 && (n.matches('.tgd3') || n.querySelector('.tgd3')))) {
          planerad = (window.requestAnimationFrame || (f => setTimeout(f, 16)))(kollaLandning); return;
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  }

  // PANELEN. Premiumpanelen (premium-final.js) har Stil, Accent, Profil/gåva, Text, Flipphastighet och
  // Ljus. Här läggs det till som Design 2 och 3 behöver, och det som inte gör något i dem göms:
  // de vänder inte, så Flipphastighet och testknappen för vändningen hör bara till Design 1.
  if (typeof bind === 'function') {
    const forraBind = bind;
    bind = function () {
      const ut = forraBind.apply(this, arguments);
      if (typeof view !== 'undefined' && view !== 'editor') return ut;
      const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!w || w.type !== 'templateTopGift' || w.giftFrame) return ut;
      // Höjd gör ingenting: alla tre designerna får sin höjd av innehållet (det gällde Top Gift redan före).
      const hojd = document.getElementById('propHeight');
      if (hojd && hojd.closest('label') && ['neon', 'royal', 'fokus'].includes(w.theme)) hojd.closest('label').hidden = true;
      const ny = w.theme === 'royal' || w.theme === 'fokus';
      const speed = document.getElementById('pfTopGiftSpeed'), test = document.getElementById('pfTopGiftTest') || document.getElementById('pfTestTopGift');
      if (speed && speed.closest('label')) speed.closest('label').hidden = ny;
      if (test) test.hidden = ny;
      // Design 2 och 3 har ingen rubrik, så kryssrutan Rubrik skulle inte göra något där.
      const rubrik = document.getElementById('universalShowTitle');
      if (rubrik && rubrik.closest('label')) rubrik.closest('label').hidden = ny;
      const farg = document.getElementById('pfTopGiftColor');
      if (!ny || !farg || document.getElementById('tgdColor2')) return ut;
      const commit = () => { if (typeof save === 'function') save(); render(); };
      let extra = `<label>Färg 2<input id="tgdColor2" type="color" value="${farg2(w)}"></label>`;
      if (w.theme === 'royal') {
        const ram = w.tgdRam || 'farg';
        extra += `<label>Profilram<select id="tgdRam">${[['farg', 'Rörlig färgring'], ['sexkant', 'Sexkant'], ['hd', 'HD-bildram']]
          .map(([k, l]) => `<option value="${k}" ${ram === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
        const ramar = (window.VYRA_PG && window.VYRA_PG.frames) || [];
        if (ram === 'hd' && ramar.length) extra += `<label>Bildram<select id="tgdBildram">${ramar
          .map(f => `<option value="${txt(f.id, '')}" ${(w.tgdBildram || 'gilded-lion') === f.id ? 'selected' : ''}>${txt(f.name || f.id, '')}</option>`).join('')}</select></label>`;
      }
      farg.closest('label').insertAdjacentHTML('afterend', extra);
      document.getElementById('tgdColor2').onchange = e => { w.accent2 = e.target.value; commit(); };
      const r = document.getElementById('tgdRam'); if (r) r.onchange = e => { w.tgdRam = e.target.value; commit(); };
      const b = document.getElementById('tgdBildram'); if (b) b.onchange = e => { w.tgdBildram = e.target.value; commit(); };
      return ut;
    };
  }
  if (typeof render === 'function') try { render(); } catch (_) {}
})();
