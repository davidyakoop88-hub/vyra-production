(function () {
  'use strict';
  // FAN LEVEL 50 I PANELRAMEN — PR 14 i panelspecifikationen (avsnitt 5.9, 2.4 `fan50`, 4.2).
  //
  // En modell (templateFanLevel50, fyra kortmallar eller "alla" som växlar). Filen har tre delar, som
  // vyra-fontan-panel.js:
  //   1. registerposten (vyra-panelregister.js),
  //   2. exempeldatan för ▶ Testa widget (vyra-exempeldata.js),
  //   3. testadaptern 'fan50' (vyra-testspel.js),
  // och ett bind-omslag som gör varje deltagarrads bild till en mediaväljare (sist i filen).
  //
  // INGEN TRIGGER FINNS. Fan Level 50 är en tavla: entrén (vyra-intro, Inträdeseffekt) och sedan slideshowen
  // eller det rullande bandet. Testet spelar det på KLONEN med fyra exempeldeltagare — klonen finns aldrig i
  // state, och slideshowens motor i fan-level-50.js (swap) går bara över widgetarna i state, så testet byter
  // klonens kort själv med VyraFanLevel50.bytKort och testmotorns vaktade timer. Rättningen av slideshowen i
  // overlayn (#642: swap läser studions `state`) är orörd.
  //
  // HÄMTA FRÅN TIKTOK är en riktig åtgärd (fetch('/api/tiktok-profile'), fan-level-50.js) och stannar i
  // Innehåll. Testet anropar den aldrig: testmotorn vaktar fetch under varje adapteranrop, och
  // testspel-isolering provar att inget nätanrop görs under ▶ och ■.
  //
  // BORTTAGET UR PANELEN (fälten ligger kvar i state):
  //   * Lagnamn (#) — renderas aldrig: .fl50-team är display:none i alla fyra mallarna (fan-level-50.css),
  //   * textrutan "namn|profilbild-url" — ersatt av deltagarlistan: en rad per deltagare med namn, Ta bort och
  //     en mediaväljare för bilden (sökvägen syns aldrig), och Lägg till namn för namn utan att hämta.
  //
  // FÄRGARV erbjuds inte (spec 4.2): widgeten har inget färgfält, kortmallarna är fasta bilder.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const TEXTFALT = ['textFont', 'textScale', 'textShadowBlur', 'textShadowColor', 'textShadowX', 'textShadowY',
    'textOutlineWidth', 'textOutlineColor'];
  const DESIGNNAMN = { alla: 'alla designer', royal: 'Fly Love', zeus: 'Zeus', ornen: 'Örnen', lejon: 'Lejonkungen' };
  const arBand = w => !!w && w.fanl50Mode === 'band';
  const FALLBACK = 'assets/images/test-profile.svg';

  // ---- 1. Registerposten (spec 5.9) ---------------------------------------------------------------
  R.definiera({
    typ: 'templateFanLevel50',
    rubrik: () => 'Fan Level 50',
    marke: w => 'Milstolpe · ' + (DESIGNNAMN[w.fanl50Design] || DESIGNNAMN.royal),
    katalognyckel: () => 'catalog:fanlevel50:royal',
    test: 'fan50',
    kontroller: [
      // 2 · Innehåll: vilka som visas.
      { sektion: 2, typ: 'val', falt: 'fanl50Source', etikett: 'Källa', legacyId: '#fl50Source' },
      // Inmatningen (Hämta från TikTok, Lägg till namn), statusraden och en rad per deltagare. Bilden på varje
      // rad blir en mediaväljare i omslaget sist i filen.
      { sektion: 2, typ: 'knapp', id: 'fl50Deltagare', etikett: 'Deltagare', legacyId: '#fl50Deltagare' },
      { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Fans som når Fan Level 50 i sändningen läggs till av sig själva, med namn och profilbild från TikTok.' },
      // 3 · Storlek och placering. Renderaren sätter z-index, så Lager verkar. Höjden följer bredden (kortets format).
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      // 4 · Text: namnet på kortet.
      { sektion: 4, typ: 'std-text' },
      // 5 · Utseende.
      { sektion: 5, typ: 'val', falt: 'fanl50Design', etikett: 'Design', legacyId: '#fl50Design' },
      // 6 · Animation: läget, tiden och entrén. Bytestiden styr också bandets fart (fan-level-50.css:
      // ett varv tar fyra gånger värdet), så den står kvar i bandet med en egen etikett.
      { sektion: 6, typ: 'val', falt: 'fanl50Mode', etikett: 'Läge', legacyId: '#fl50Mode' },
      { sektion: 6, typ: 'tal', falt: 'fanl50Interval', etikett: 'Bytestid', enhet: 's', legacyId: '#fl50Interval', om: w => !arBand(w) },
      { sektion: 6, typ: 'tal', falt: 'fanl50Interval', etikett: 'Tempo', enhet: 's', legacyId: '#fl50Interval', om: arBand,
        beror: { falt: 'fanl50Mode', villkor: () => true, text: 'Lägre värde ger ett snabbare band. Ett varv tar fyra gånger värdet.' } },
      { sektion: 6, typ: 'std-entre' },
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['fanl50Design', 'fanl50Mode', 'fanl50Interval', 'entranceAnimation', 'entranceDuration', ...TEXTFALT],
  });

  // ---- 2. Exempeldata -----------------------------------------------------------------------------
  // Fyra deltagare ur exempelpersonerna (Alex, Mia, Leo, Sara) med reservprofilbilden.
  const E = window.VyraExempeldata;
  if (E && typeof E.definiera === 'function' && !(E.har && E.har('fan50'))) {
    E.definiera('fan50', g => ({ deltagare: g.personer.slice(0, 4).map(p => ({ namn: p.namn, bild: p.bild })) }));
  }

  // ---- 3. Testadaptern ------------------------------------------------------------------------------
  //
  // Klonens kort byggs om med exempeldeltagarna (VyraFanLevel50.provHtml, samma renderare som widgeten).
  // Entrén är widgetens Inträdeseffekt, som vyra-intro redan lagt på klonens rot när den ritades. Sedan:
  //   * Slideshow: ett kort per Bytestid, så många som ryms (högst alla fyra), med samma kortbyte som swap().
  //   * Rullande band: bandet rullar (ren CSS) ett varv, högst 16 s.
  // Utgången tonar ut klonen. stoppa() tar bort det fan-level-50.js kan minnas för klonens id.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;
  const UTGANG = 500, BAND_MAX = 16000, VISNING_MAX = 55000;
  const sekunder = k => { const n = Number(k.fanl50Interval); return Number.isFinite(n) ? Math.min(60, Math.max(2, n)) : 6; };
  if (!(T.harAdapter && T.harAdapter('fan50'))) T.registrera('fan50', {
    spela(nod, k, ex, ctl) {
      const F = window.VyraFanLevel50;
      if (!F || typeof F.provHtml !== 'function' || typeof F.bytKort !== 'function') throw new Error('fan-level-50.js saknar VyraFanLevel50.provHtml');
      const lista = (ex.deltagare || []).map(p => ({ name: p.namn, avatar: ex.bild(p.bild), team: '' }));
      if (!lista.length) throw new Error('exempeldatan saknar deltagare');
      const mall = document.createElement('div');
      mall.innerHTML = F.provHtml(k, lista);
      const ny = mall.firstElementChild && mall.firstElementChild.querySelector('.fl50-viewport');
      const egen = nod.querySelector('.fl50-viewport');
      if (!ny || !egen) throw new Error('klonen saknar kortytan');
      egen.innerHTML = ny.innerHTML;
      const intro = k.entranceAnimation && k.entranceAnimation !== 'none';
      const entre = intro ? Math.max(150, Math.min(1500, Number(k.entranceDuration) || 600)) : 300;
      const steg = sekunder(k) * 1000;
      let visning;
      if (arBand(k)) visning = Math.min(4 * steg, BAND_MAX);
      else {
        const kort = Math.max(1, Math.min(lista.length, Math.floor(VISNING_MAX / steg)));
        for (let i = 1; i < kort; i++) {
          ctl.setTimeout(() => {
            const card = nod.querySelector('.fl50-card');
            if (card) F.bytKort(card, k, lista[i], i, (fn, ms) => ctl.setTimeout(fn, ms));
          }, entre + i * steg);
        }
        visning = kort * steg;
      }
      ctl.setTimeout(() => { nod.style.transition = `opacity ${UTGANG}ms ease`; nod.style.opacity = '0'; }, entre + visning);
      return { entre, visning, utgang: UTGANG };
    },
    stoppa(nod, k) {
      if (window.VyraFanLevel50 && typeof window.VyraFanLevel50.glom === 'function') window.VyraFanLevel50.glom(k.id);
    },
  });

  // ---- Bind-omslaget ----------------------------------------------------------------------------------
  //
  // Varje deltagarrad har en platshållare för bilden (data-fl50-bild, fan-level-50.js). I den nya panelen blir
  // den en mediaväljare: Välj bild sparar en egen bild på deltagaren, Använd automatisk tar bort den (då visas
  // standardbilden). Sökvägen syns aldrig. En profilbild som hämtats från TikTok säger det på statusraden.
  function stil() {
    if (document.getElementById('vyra-fl50-panel-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-fl50-panel-stil';
    s.textContent = [
      '.properties [data-panelram-sektion] .fl50-deltagare{display:grid;gap:8px}',
      '.properties [data-panelram-sektion] .fl50-add{flex-wrap:wrap}',
      '.properties [data-panelram-sektion] .fl50-chips{display:grid;gap:8px;margin-top:0}',
      '.properties [data-panelram-sektion] .fl50-rad{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;padding:8px;border-radius:10px}',
      '.properties [data-panelram-sektion] .fl50-rad .fl50-rad-namn{min-width:0;width:100%;box-sizing:border-box}',
      '.properties [data-panelram-sektion] .fl50-rad .fl50-rad-bild{grid-column:1/-1;order:3}',
      '.properties [data-panelram-sektion] .fl50-rad .fl50-chip-x{min-height:0!important;width:30px;height:30px;padding:5px!important}',
      '.properties [data-panelram-sektion] .fl50-rad .fl50-chip-x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}',
    ].join('');
    (document.head || document.documentElement).append(s);
  }

  const manual = w => (Array.isArray(w.fanl50Manual) ? w.fanl50Manual : []);
  function fyllBilder(w) {
    const M = window.VyraMediaval;
    if (!M || typeof M.falt !== 'function') return;
    document.querySelectorAll('.properties [data-panelram-sektion] [data-fl50-bild]').forEach(ruta => {
      if (ruta.querySelector('.vyra-mediaval')) return;
      const i = Number(ruta.getAttribute('data-fl50-bild'));
      const m = manual(w)[i];
      if (!m) return;
      const nod = M.falt({
        w, falt: 'fanl50Manual-' + i, typ: 'bild', etikett: 'Bild för ' + (m.name || 'deltagaren'),
        reserv: FALLBACK, reservText: 'Ingen egen bild – standardbilden visas',
        las: x => { const d = manual(x)[i]; return d ? d.avatar || '' : ''; },
        skriv: (x, v) => {
          const lista = manual(x).slice();
          if (!lista[i]) return;
          const d = Object.assign({}, lista[i], { avatar: v });
          delete d.hamtad;                                  // en egen bild är inte längre den hämtade
          lista[i] = d;
          x.fanl50Manual = lista;
        },
        status: (x, v) => { const d = manual(x)[i]; return d && d.hamtad && v && d.avatar === v ? 'Profilbild hämtad från TikTok' : null; },
      });
      if (nod) { ruta.textContent = ''; ruta.append(nod); }
    });
  }

  function efterBind() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    const P = window.VyraPanelram;
    const w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null;
    if (!w || w.type !== 'templateFanLevel50' || !P || !P.ager || !P.ager(w)) return;
    stil();
    fyllBilder(w);
  }
  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      try { efterBind(); } catch (e) { console.error('[VyraFl50Panel]', e); }
      Promise.resolve().then(() => { try { efterBind(); } catch (_) {} });
      return ut;
    };
  }
})();
