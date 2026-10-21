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

  const ENHETER = ['%', 'px', 'ms', 's', '×', '°', 'mynt', 'coins'];
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

  // SAMMA REGLAGE, SAMMA FORM (slutgranskning N-AB-006, 2026-10-20). Etikettens tal skrevs av olika
  // vägar: renderaren gav "0.80 ×" (toFixed(2)), vyraLivePatch gav "0.8 ×" (String(värdet)) när
  // reglaget drogs, och "Final vid" stod "1000 mynt" utan tusentalsmellanslag. När etiketten har ett
  // reglage (input[type=range]) och talet i <b> ÄR reglagets värde skrivs det därför om ur värdet:
  //   * decimaler efter reglagets steg (step .05 -> 0,80 ×, step .1 -> 1,0 ×, step 1 -> 62 %),
  //   * tusentalsmellanslag från fyra siffror (1 000 mynt).
  // Talet räknas som reglagets värde om det hela talet eller dess första sifferföljd (vyraLivePatch
  // byter bara /^[\d.,-]+/ och lämnar "\u00a0000" kvar efter ett grupperat tal) är lika med värdet.
  // En etikett som visar något annat än värdet (t.ex. 0–1 som procent) lämnas som förut.
  function stegDecimaler(input) {
    const steg = String(input.getAttribute('step') || '1').trim();
    if (!/^\d*\.?\d+$/.test(steg)) return 0;
    const i = steg.indexOf('.');
    return i < 0 ? 0 : Math.min(3, steg.length - i - 1);
  }
  function urReglage(b) {
    const lab = b.parentElement;
    const input = lab && lab.querySelector(':scope > input[type="range"]');
    if (!input || input.value === '') return null;
    const v = Number(input.value);
    if (!Number.isFinite(v)) return null;
    const t = String(b.textContent || '').trim();
    const m = /^(-?\d[\d\u00a0]*(?:[.,]\d+)?)\s*(.*)$/.exec(t);
    if (!m || (m[2] && ENHETER.indexOf(m[2]) < 0)) return null;
    const hela = Number(m[1].replace(/\u00a0/g, '').replace(',', '.'));
    const forsta = Number((/^-?[\d.,]+/.exec(m[1]) || [''])[0].replace(',', '.'));
    const d = stegDecimaler(input), tol = Math.pow(10, -d) / 2 + 1e-9;
    if (!(Math.abs(hela - v) <= tol || Math.abs(forsta - v) <= tol)) return null;
    const fast = v.toFixed(d);
    const [heltal, dec] = fast.split('.');
    return formatera(heltal + (dec ? '.' + dec : '') + (m[2] ? ' ' + m[2] : ''), true);
  }

  function skriv(b) {
    if (!b || b.children.length) return;
    const ny = urReglage(b) ?? formatera(b.textContent, b.hasAttribute('data-pgv'));
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

  window.VyraTalformat = { formatera, urReglage, alla, installerad: false };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installera, { once: true });
  else installera();
})();
