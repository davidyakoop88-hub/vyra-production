/* AUTOMATIONER — TOMT LÄGE OCH EN RIKTIG "NY AUTOMATION" (slutgranskning 2026-10-20 C-005).
 *
 * Vyn (flows() i studio.js) visade bara rubriken och en svart yta när listan var tom, och
 * "＋ Ny automation" lade direkt till en hårdkodad rad "Chatt !hype → Visa animation" som inte gick
 * att ändra eller ta bort. Raderna var dessutom märkta TRIGGER/ACTION på engelska.
 *
 * Den här filen, utan att röra studio.js:
 *   · ersätter vyns renderare med en som har ett tomt läge och svenska etiketter (Utlösare/Handling)
 *     och escapar texterna — de kommer nu från användaren;
 *   · låter "＋ Ny automation" öppna en dialog i samma mönster som Färgschema-dialogen (× i hörnet,
 *     Esc och klick utanför stänger, inget sparas förrän Spara), i stället för att lägga till en rad;
 *   · ger varje rad Ändra och Ta bort.
 *
 * Aktiv/Pausad binds fortfarande av studio.js (data-toggle), och state.flows har samma form som
 * förut ({trigger, action, on}) — sparade automationer läses precis som innan.
 * Laddas från skript-svansen i media.js. Ritar ingenting i overlay-läget.
 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).has('overlay')) return;
  if (typeof flows !== 'function' || typeof bind !== 'function') return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const UTLOSARE = ['Gåva mottagen', 'Ny följare', 'Delning', 'Like-mål nått', 'Chattkommando !hype', 'Ny prenumerant'];
  const HANDLINGAR = ['Visa gift alert', 'Spela ljud + TTS', 'Visa animation', 'Visa tack i chatten'];
  const lista = () => (typeof state === 'object' && state && Array.isArray(state.flows)) ? state.flows : [];
  const sparaOchRita = () => { if (typeof saveThenRender === 'function') saveThenRender(); else { save(); render() } };

  // eslint-disable-next-line no-global-assign
  flows = function () {
    const rader = lista();
    const kropp = rader.length
      ? rader.map((f, i) => `<article class="card flow-row"><div class="node"><b>◇ ${esc(f.trigger)}</b><small>Utlösare</small></div><div class="arrow" aria-hidden="true">→</div><div class="node"><b>▶ ${esc(f.action)}</b><small>Handling</small></div><div class="flow-knappar"><button data-toggle="${i}" aria-pressed="${f.on ? 'true' : 'false'}">${f.on ? 'Aktiv' : 'Pausad'}</button><button type="button" data-flow-andra="${i}">Ändra</button><button type="button" class="flow-ta-bort" data-flow-ta-bort="${i}" aria-label="Ta bort automationen ${esc(f.trigger)} → ${esc(f.action)}">Ta bort</button></div></article>`).join('')
      : `<div class="card flows-tom" data-flows-tom><b>Inga automationer ännu</b><p>En automation kopplar en händelse i din live, till exempel en gåva eller ett chattkommando, till något som ska hända.</p><button type="button" class="primary" data-flow-ny>Skapa din första automation</button></div>`;
    return `<div class="flow-head"><h2>Automationer</h2><button class="primary" id="newFlow">＋ Ny automation</button></div><div class="flows">${kropp}</div>`;
  };

  function dialogen() {
    let d = document.querySelector('#flowModal');
    if (d) return d;
    d = document.createElement('dialog');
    d.id = 'flowModal';
    d.setAttribute('aria-labelledby', 'flowModalRubrik');
    d.innerHTML = `<button class="bx" id="flowModalClose" type="button" aria-label="Stäng"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <h2 id="flowModalRubrik">Ny automation</h2>
      <p>Välj vad som ska starta automationen och vad som ska hända.</p>
      <form method="dialog" novalidate>
        <label>Utlösare<input id="flowTrigger" list="flowTriggerLista" placeholder="Till exempel Gåva mottagen" maxlength="80" required autocomplete="off"></label>
        <datalist id="flowTriggerLista">${UTLOSARE.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <label>Handling<input id="flowAction" list="flowActionLista" placeholder="Till exempel Visa gift alert" maxlength="80" required autocomplete="off"></label>
        <datalist id="flowActionLista">${HANDLINGAR.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <p class="flow-fel" role="alert" hidden></p>
        <div class="flow-dialog-knappar"><button type="button" class="ghost" id="flowCancel">Avbryt</button><button type="submit" class="primary" id="flowSave">Spara automation</button></div>
      </form>`;
    document.body.append(d);
    const stang = () => d.close();
    d.querySelector('#flowModalClose').onclick = stang;
    d.querySelector('#flowCancel').onclick = stang;
    // Klick på bakgrunden: målet är själva dialogen, inte något inuti den.
    d.addEventListener('mousedown', e => { if (e.target === d) stang() });
    d.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const trigger = d.querySelector('#flowTrigger').value.trim(), action = d.querySelector('#flowAction').value.trim();
      const fel = d.querySelector('.flow-fel');
      if (!trigger || !action) { fel.hidden = false; fel.textContent = 'Fyll i både utlösare och handling.'; (trigger ? d.querySelector('#flowAction') : d.querySelector('#flowTrigger')).focus(); return }
      if (!Array.isArray(state.flows)) state.flows = [];
      const i = d.dataset.index === '' || d.dataset.index == null ? -1 : +d.dataset.index;
      if (i >= 0 && state.flows[i]) Object.assign(state.flows[i], { trigger, action });
      else state.flows.push({ trigger, action, on: true });
      d.close();
      sparaOchRita();
      if (typeof toast === 'function') toast(i >= 0 ? 'Automationen är ändrad' : 'Automationen är skapad');
    });
    return d;
  }

  function oppna(index) {
    const d = dialogen(), f = index >= 0 ? lista()[index] : null;
    d.dataset.index = f ? String(index) : '';
    d.querySelector('#flowModalRubrik').textContent = f ? 'Ändra automation' : 'Ny automation';
    d.querySelector('#flowTrigger').value = f ? f.trigger || '' : '';
    d.querySelector('#flowAction').value = f ? f.action || '' : '';
    const fel = d.querySelector('.flow-fel'); fel.hidden = true; fel.textContent = '';
    if (!d.open) d.showModal();
    d.querySelector('#flowTrigger').focus();
  }

  const forraBind = bind;
  // eslint-disable-next-line no-global-assign
  bind = function () {
    forraBind.apply(this, arguments);
    if (typeof view === 'undefined' || view !== 'flows') return;
    const ny = document.querySelector('#newFlow');
    if (ny) ny.onclick = () => oppna(-1);
    document.querySelectorAll('#view [data-flow-ny]').forEach(b => { b.onclick = () => oppna(-1) });
    document.querySelectorAll('#view [data-flow-andra]').forEach(b => { b.onclick = () => oppna(+b.dataset.flowAndra) });
    document.querySelectorAll('#view [data-flow-ta-bort]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.flowTaBort;
        if (!state.flows[i]) return;
        state.flows.splice(i, 1);
        sparaOchRita();
        if (typeof toast === 'function') toast('Automationen är borttagen');
      };
    });
  };

  if (typeof view !== 'undefined' && view === 'flows' && typeof render === 'function') render();
  window.VyraAutomationer = { oppna };
})();
