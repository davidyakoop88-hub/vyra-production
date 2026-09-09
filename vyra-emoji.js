(function () {
  'use strict';
  // EMOJI I PANELENS TEXTFÄLT (2026-09-09).
  //
  // DAVIDS ORD: "lägga till emoji som man skriver på sms". Windows-tangenten och punkt öppnar redan
  // systemets emoji-väljare i vilket textfält som helst — men det vet nästan ingen, och en funktion
  // som kräver ett okänt kortkommando finns i praktiken inte. Därför en knapp som syns.

  // VILKA FÄLT. Uppmätt över fem widgets: panelerna bär tre sorters textfält, och bara ett av dem
  // ska ha knappen.
  //   text som tittarna ser   ctwText, heartTitle, followLabel, followName, followMessage
  //   sökvägar till bilder    pfTopGiftProfile, pfTopGiftGift, followProfile
  //   interna namn            runtimePresetName, och de dolda pt/pv
  // En emoji i en bildsökväg ger en trasig bild; i ett presetnamn ett filnamn ingen kan söka på.
  //
  // Regeln läser ETIKETTEN, inte fält-id. En vitlista över id hade blivit fel så fort någon lägger
  // till ett fält — och den nya widgeten är just den som skulle sakna knappen utan att någon märker
  // det. Etiketten säger vad fältet ÄR, och den skriver panelbyggaren ändå.
  const NEKAS = /bild|url|sökväg|sokvag|preset|fil\b|adress|länk|lank/i;

  // Ett urval för TikTok Live, inte hela Unicode. En lång lista gör väljaren till en egen uppgift;
  // det här är vad som faktiskt hamnar i en overlayrubrik.
  const EMOJI = [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
    '🔥', '✨', '⭐', '🌟', '💫', '⚡', '💥', '🎉',
    '👑', '🏆', '🥇', '💎', '🌹', '🎁', '🎀', '🍾',
    '😍', '🥰', '😎', '🤩', '😂', '🥳', '😱', '🫶',
    '👋', '👏', '🙌', '💪', '🤝', '👀', '💯', '✅',
    '🚀', '🎯', '🔔', '📢', '🎵', '🎮', '🌈', '☀️',
  ];

  let oppen = null;      // { ruta, falt } när väljaren är framme

  function stang() {
    if (!oppen) return;
    oppen.ruta.remove();
    oppen = null;
  }

  // Infogar VID MARKÖREN, inte sist. Att alltid lägga sist hade gjort knappen oanvändbar mitt i en
  // mening, vilket är precis där en emoji hör hemma.
  function infoga(falt, tecken) {
    const start = typeof falt.selectionStart === 'number' ? falt.selectionStart : falt.value.length;
    const slut = typeof falt.selectionEnd === 'number' ? falt.selectionEnd : start;
    falt.value = falt.value.slice(0, start) + tecken + falt.value.slice(slut);

    // Panelen lyssnar på `input` för live-förhandsvisning och på `change` för att spara. Båda
    // behövs: utan den första syns inget förrän man klickar bort fokus, utan den andra försvinner
    // emojin vid nästa omritning.
    falt.dispatchEvent(new Event('input', { bubbles: true }));
    falt.dispatchEvent(new Event('change', { bubbles: true }));

    // MARKÖREN SÄTTS PÅ DET FÄLT SOM FINNS EFTERÅT. `change` får flera panelbyggare att rita om,
    // och då är noden vi just skrev i utbytt — uppmätt: markören hamnade på 0 i stället för efter
    // emojin, fast texten var rätt. Fältet slås därför upp på nytt via sitt id, och en gång till i
    // en mikrotask för de byggare som ritar om asynkront.
    const ny = start + tecken.length;
    const satt = () => {
      const el = falt.id
        ? (document.querySelector('.properties #' + CSS.escape(falt.id)) || falt)
        : falt;
      if (!el.isConnected) return;
      el.focus();
      try { el.setSelectionRange(ny, ny) } catch (_) {}
    };
    satt();
    Promise.resolve().then(satt);
  }

  function oppna(knapp, falt) {
    if (oppen && oppen.falt === falt) { stang(); return; }
    stang();

    const ruta = document.createElement('div');
    ruta.className = 'vyra-emoji-val';
    ruta.innerHTML = EMOJI.map(e =>
      `<button type="button" tabindex="0">${e}</button>`).join('');

    // I panelen, inte i body: den scrollar med fältet och ärver studions mörka yta utan att någon
    // position behöver räknas ut.
    (falt.closest('label') || falt.parentElement).append(ruta);
    oppen = { ruta, falt };

    ruta.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      infoga(falt, b.textContent.trim());
      stang();
    });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') stang() });
  document.addEventListener('pointerdown', e => {
    if (!oppen) return;
    if (e.target.closest('.vyra-emoji-val, .vyra-emoji-knapp')) return;
    stang();
  }, true);

  function etikettFor(falt) {
    const lbl = falt.closest('label');
    if (!lbl) return '';
    return [...lbl.childNodes]
      .filter(n => n.nodeType === 3 || (n.tagName && /^(SPAN|B)$/.test(n.tagName)))
      .map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  }

  function ska(falt) {
    if (falt.type && !/^(text|search)$/.test(falt.type) && falt.tagName !== 'TEXTAREA') return false;
    if (falt.closest('[hidden]')) return false;       // pt/pv, panelens dolda speglar
    if (!falt.offsetParent && falt.tagName !== 'TEXTAREA') return false;
    const etikett = etikettFor(falt);
    if (!etikett) return false;                       // utan etikett vet vi inte vad fältet är
    return !NEKAS.test(etikett);
  }

  function bygg() {
    const panel = document.querySelector('.properties');
    if (!panel) return;
    for (const falt of panel.querySelectorAll('input, textarea')) {
      const rad = falt.closest('label') || falt.parentElement;
      if (!rad || rad.querySelector('.vyra-emoji-knapp')) continue;
      if (!ska(falt)) continue;

      const knapp = document.createElement('button');
      knapp.type = 'button';
      knapp.className = 'vyra-emoji-knapp';
      knapp.textContent = '☺';
      knapp.title = 'Lägg till emoji. Windows-tangenten och punkt öppnar systemets egen väljare.';
      knapp.onclick = e => { e.preventDefault(); e.stopPropagation(); oppna(knapp, falt) };
      rad.append(knapp);
    }
  }

  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      if (typeof view === 'undefined' || view === 'editor') { stang(); bygg(); }
      return ut;
    };
  }

  window.VyraEmoji = { EMOJI, infoga, bygg, ska };
})();
