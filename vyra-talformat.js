// VYRA · TALFORMAT I PANELEN (slutgranskning B-024, 2026-10-20)
//
// Värdet bredvid ett reglage står i ett <b> i etiketten ("Glöd <b>0.8 ×</b>"). Det <b>:et skrivs av
// ett dussintal filer — panelramen, vyraLivePatch i media.js, Goal Pros fältbyggare, fontänens och
// fyrverkeriets paneler, widget-background.js, vyra-proportioner.js — och var och en har sitt format.
// Granskningen hittade i samma panel "Glöd 0.8 ×", "Effektstorlek 1.00 ×", "Storlek 100%" bredvid
// "Ljus 62 %", "Hörn 0px" bredvid "32 px" och "Mål 2000 mynt" bredvid widgetens "2 000".
//
// Den här filen äger det visade formatet, på ett ställe och i efterhand: när ett sådant <b> ändras i
// .properties skrivs det om till svensk standard, samma form som panelramen redan använder för sina
// egna enheter:
//   * decimalkomma:                    0.8 ×   ->  0,8 ×
//   * mellanslag före enheten:         100%    ->  100 %      0px  ->  0 px   (men 90° för vinklar)
//   * tusentalsmellanslag (hårt):      2000 mynt -> 2 000 mynt   (bara i Goal Pros egna etiketter,
//     se nedan)
//
// Bara text som är ETT tal med en känd enhet rörs; "Rak bar", "8 sek" och tomma <b> lämnas. Värdet i
// själva reglaget (input.value) är orört, så inget som läser state eller fältet påverkas.
//
// TUSENTAL. vyraLivePatch byter "siffrorna först" med /^[\d.,-]+/ och lämnar resten. Ett "2 000" hade
// då blivit "2100 000". Tusentalsmellanslaget sätts därför bara på Goal Pros <b data-pgv>, vars egen
// oninput (playground-widgets.js) skriver om hela texten, och den här filen formaterar efter den.
//
// Overlayn har ingen panel; filen gör ingenting där.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (new URLSearchParams(location.search).has('overlay')) return;

  const ENHETER = ['%', 'px', 'ms', 's', '×', '°', 'mynt'];
  // Ett tal (med punkt eller komma, ev. redan grupperat med hårt mellanslag) och en valfri enhet.
  const MONSTER = new RegExp('^(-?\\d[\\d\\u00a0]*)(?:[.,](\\d+))?\\s*(' + ENHETER.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')?$');

  function formatera(text, gruppera) {
    const t = String(text == null ? '' : text).trim();
    const m = MONSTER.exec(t);
    if (!m) return null;
    let heltal = m[1].replace(/\u00a0/g, '');
    if (gruppera && heltal.replace('-', '').length >= 4) heltal = heltal.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    // Gradtecknet för vinklar skrivs utan mellanslag (90°), alla andra enheter med.
    return heltal + (m[2] != null ? ',' + m[2] : '') + (m[3] ? (m[3] === '°' ? '' : ' ') + m[3] : '');
  }

  function skriv(b) {
    if (!b || b.children.length) return;
    const ny = formatera(b.textContent, b.hasAttribute('data-pgv'));
    if (ny != null && ny !== b.textContent) b.textContent = ny;
  }

  const VALJARE = '.properties label > b';
  function alla(rot) { (rot || document).querySelectorAll(VALJARE).forEach(skriv); }

  // En observatör på dokumentet, men bara poster inne i .properties gör något. Skrivningarna här
  // ändrar bara text som redan är i rätt form nästa varv, så den kan inte snurra.
  function installera() {
    if (window.VyraTalformat && window.VyraTalformat.installerad) return;
    const obs = new MutationObserver(poster => {
      for (const p of poster) {
        const nod = p.target.nodeType === 3 ? p.target.parentElement : p.target;
        if (!nod || !nod.closest || !nod.closest('.properties')) continue;
        if (nod.matches && nod.matches(VALJARE)) skriv(nod);
        else if (p.type === 'childList') {
          const b = nod.closest('label > b');
          if (b) skriv(b); else if (p.addedNodes.length) alla(nod);
        }
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    alla(document);
    window.VyraTalformat.installerad = true;
  }

  window.VyraTalformat = { formatera, alla, installerad: false };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installera, { once: true });
  else installera();
})();
