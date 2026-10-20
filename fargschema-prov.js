/* FÄRGSCHEMATS PROVBILD (granskning 2026-10-17 F37).
 *
 * Dialogen #brandKitModal (studio.html, öppnas av openBrandKitDialog i studio.js) visade fyra
 * färgränder och en typsnittslista men ingen widget. Den här filen lägger till, utan att röra
 * studio.js eller dess spara-flöde:
 *
 *   · en levande provbild — en liten alert i Bakgrund, Highlight, Text, Sekundär text och Typsnitt;
 *   · läsbara färgkoder bredvid varje färgväljare;
 *   · en varning när texten blir svår att läsa mot bakgrunden (WCAG-kontrast < 4,5:1 för Text,
 *     < 3:1 för Sekundär text), med kontrasttalet utskrivet;
 *   · "Återställ standard", som bara fyller i fälten — inget sparas förrän Spara färgschema.
 *
 * Standardvärdena är samma som BRAND_KIT i session-state.js (tests/browser/fargschema-provbild
 * provar dem). Laddas från skript-svansen i media.js och ritar ingenting i overlay-läget.
 */
(function (root) {
  'use strict';
  if (new URLSearchParams(location.search).has('overlay')) return;

  const STANDARD = { background: '#1c1028', highlight: '#ff58d6', text: '#f7f2ff', secondaryText: '#b9a6dd', fontFamily: '' };
  const FALT = [['#bkBackground', 'background'], ['#bkHighlight', 'highlight'], ['#bkText', 'text'], ['#bkSecondaryText', 'secondaryText']];

  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : null;
  function luminans(farg) {
    const h = hex(farg); if (!h) return null;
    const k = i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
    return 0.2126 * k(1) + 0.7152 * k(3) + 0.0722 * k(5);
  }
  function kontrast(a, b) {
    const la = luminans(a), lb = luminans(b);
    if (la == null || lb == null) return null;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const talSv = n => n.toFixed(1).replace('.', ',');

  function bygg(dialog) {
    if (dialog.querySelector('[data-bk-prov]')) return;
    const intro = dialog.querySelector('p');
    const prov = document.createElement('div');
    prov.className = 'bk-prov';
    prov.setAttribute('data-bk-prov', '');
    prov.setAttribute('role', 'img');
    prov.setAttribute('aria-label', 'Provbild: så ser en widget ut med färgschemat');
    const markering = document.createElement('i');
    markering.className = 'bk-prov-highlight';
    markering.setAttribute('data-bk-prov-highlight', '');
    const kropp = document.createElement('span');
    const namn = document.createElement('b');
    namn.setAttribute('data-bk-prov-text', '');
    namn.textContent = 'Lisa skickade en Rose';
    const rad = document.createElement('small');
    rad.setAttribute('data-bk-prov-sekundar', '');
    rad.textContent = '× 5 · 25 diamanter';
    kropp.append(namn, rad);
    const etikett = document.createElement('em');
    etikett.className = 'bk-prov-etikett';
    etikett.setAttribute('data-bk-prov-etikett', '');
    etikett.textContent = 'GÅVA';
    prov.append(markering, kropp, etikett);
    const rubrik = document.createElement('small');
    rubrik.className = 'bk-prov-rubrik';
    rubrik.textContent = 'Provbild';
    const varning = document.createElement('p');
    varning.className = 'bk-varning';
    varning.setAttribute('data-bk-varning', '');
    varning.setAttribute('role', 'status');
    varning.hidden = true;
    if (intro) intro.after(rubrik, prov, varning); else dialog.prepend(rubrik, prov, varning);

    for (const [sel] of FALT) {
      const input = dialog.querySelector(sel);
      if (!input || input.parentNode.querySelector('[data-bk-hex]')) continue;
      const kod = document.createElement('output');
      kod.className = 'bk-hex';
      kod.setAttribute('data-bk-hex', '');
      kod.setAttribute('for', input.id);
      input.after(kod);
    }

    const spara = dialog.querySelector('#brandKitSave');
    const aterstall = document.createElement('button');
    aterstall.type = 'button';
    aterstall.className = 'bk-aterstall';
    aterstall.setAttribute('data-bk-aterstall', '');
    aterstall.textContent = 'Återställ standard';
    aterstall.addEventListener('click', () => {
      for (const [sel, nyckel] of FALT) { const el = dialog.querySelector(sel); if (el) el.value = STANDARD[nyckel] }
      const typsnitt = dialog.querySelector('#bkFontFamily'); if (typsnitt) typsnitt.value = STANDARD.fontFamily;
      uppdatera(dialog);
    });
    const knappar = document.createElement('div');
    knappar.className = 'bk-knappar';
    if (spara) { spara.before(knappar); knappar.append(aterstall, spara); } else dialog.append(aterstall);

    dialog.addEventListener('input', () => uppdatera(dialog));
    dialog.addEventListener('change', () => uppdatera(dialog));
    // openBrandKitDialog sätter värdena i kod och öppnar sedan dialogen — inga input-händelser.
    new MutationObserver(() => { if (dialog.open) uppdatera(dialog) }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    uppdatera(dialog);
  }

  function uppdatera(dialog) {
    const prov = dialog.querySelector('[data-bk-prov]'); if (!prov) return;
    const v = {};
    for (const [sel, nyckel] of FALT) v[nyckel] = hex(dialog.querySelector(sel)?.value) || STANDARD[nyckel];
    const typsnitt = dialog.querySelector('#bkFontFamily')?.value || '';
    prov.style.backgroundColor = v.background;
    prov.style.fontFamily = typsnitt || '';
    prov.querySelector('[data-bk-prov-text]').style.color = v.text;
    prov.querySelector('[data-bk-prov-sekundar]').style.color = v.secondaryText;
    prov.querySelector('[data-bk-prov-highlight]').style.backgroundColor = v.highlight;
    const etikett = prov.querySelector('[data-bk-prov-etikett]');
    etikett.style.color = v.highlight;
    etikett.style.borderColor = v.highlight;
    for (const [sel, nyckel] of FALT) {
      const kod = dialog.querySelector(sel)?.parentNode.querySelector('[data-bk-hex]');
      if (kod) kod.textContent = v[nyckel];
    }
    const text = kontrast(v.text, v.background), sekundar = kontrast(v.secondaryText, v.background);
    const varning = dialog.querySelector('[data-bk-varning]');
    const problem = [];
    if (text != null && text < 4.5) problem.push(`Texten är svår att läsa mot bakgrunden (kontrast ${talSv(text)}:1, minst 4,5:1 behövs).`);
    if (sekundar != null && sekundar < 3) problem.push(`Den sekundära texten är svår att läsa (kontrast ${talSv(sekundar)}:1, minst 3:1 behövs).`);
    varning.hidden = !problem.length;
    varning.textContent = problem.length ? problem.join(' ') + ' Välj ljusare text eller mörkare bakgrund.' : '';
  }

  function start() { const d = document.querySelector('#brandKitModal'); if (d) bygg(d) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  root.VyraFargschemaProv = { uppdatera: () => { const d = document.querySelector('#brandKitModal'); if (d) uppdatera(d) }, kontrast };
})(typeof window !== 'undefined' ? window : globalThis);
