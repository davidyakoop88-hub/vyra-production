(function () {
  'use strict';
  // EN ORDNING FÖR EGENSKAPSPANELEN (2026-09-09).
  //
  // DAVIDS ORD: "just nu hur jag ser layout EGENSKAPER gör mig förvirrad".
  //
  // VARFÖR DEN VAR ORÖRD FÖRUT. Elva filer monkey-patchar props()/bind() och bygger var sin
  // property-group. Ingen av dem vet om de andra, så gruppen hamnar där den råkar hamna: en del
  // gör panel.append(), en del insertBefore(box, firstGroup), en del letar upp en granne. Uppmätt
  // 2026-09-09: "POSITION & STORLEK" låg på plats 4 i Top Gift, plats 3 i Fan Level och plats 8 i
  // Top Like — samma block, tre olika ställen, beroende på vilken widget som var vald. Det går inte
  // att lära sig en panel som flyttar sig.
  //
  // ATT LÖSA DET I DE ELVA FILERNA hade krävt att var och en visste om de tio andra. Det är precis
  // den kunskap ingen av dem kan ha, eftersom flera injiceras asynkront och laddordningen varierar.
  // Därför sorteras panelen i stället EFTER att alla har byggt färdigt, från ett enda ställe.
  //
  // ORDNINGEN, uppifrån och ned, följer hur man faktiskt arbetar med en widget:
  //   innehåll (vad som visas) → design (hur det ser ut) → position (var den är)
  //   → tillägg (ram, animation, bakgrund) → verktyg (preset, prestanda)
  //
  // PRESET & PRESTANDA hamnar sist med flit: mätningen visade att dess två kontroller inte skriver
  // till widgeten alls — de gäller scenen. De ska inte ligga mitt bland widgetens egna inställningar.

  const VIKT = [
    // Verktyg som INTE gäller widgeten — alltid sist.
    [/PRESET\s*&\s*PRESTANDA/, 90],
    // Tillägg: yta och rörelse, samma svans för alla widgets.
    [/^BAKGRUND/, 80],
    [/^ANIMATION|RÖRELSESTIL|PREMIUM RÖRELSE/, 70],
    [/AVATAR-RAM|PROFILRAM/, 60],
    // Var widgeten ligger. Grundpositionen (bredd, höjd, lås) står öppen; de sex offsetfälten för
    // rubrik, namn och värde är finjustering och fälls ihop strax före den.
    [/POSITION\s*·\s*TEXTELEMENT|^FINJUSTERING/, 45],
    [/^POSITION/, 50],
    // Live och test — läses sällan, ändras sällan.
    [/^TRIGGER|LIVE-DATA|VISNINGSTID|^TESTA|TEST OCH RESET|WEBHOOK/, 40],
    // Hur den ser ut.
    [/^DESIGN|^TEMA|FÄRG|^UTSEENDE|TEXTEFFEKT|^PRAKT|PRESET-TEMAN|^LISTA/, 30],
    // Vad den visar. Lägst vikt = överst.
    [/^INNEHÅLL|^ALLMÄNT|VILKA SKA VISAS|^GÅVA|^TEXT$|^KÄLLA|^STORLEK/, 10],
  ];

  // En rubrik som inte står i listan får 20: efter INNEHÅLL, före DESIGN. Där hör en widgets egen
  // huvudgrupp hemma ("CLEAN · VÄNSTER", "GIFT EDITOR · VISA / TA BORT", "NEW FOLLOWER ALERT"), och
  // en grupp som läggs till i framtiden hamnar på ett vettigt ställe utan att den här listan rörs.
  const OKAND = 20;

  function vikt(rubrik) {
    const r = (rubrik || '').toUpperCase().trim();
    for (const [monster, v] of VIKT) if (monster.test(r)) return v;
    return OKAND;
  }

  function rubrikFor(grupp) {
    const h = grupp.querySelector('h4, .pg-toggle');
    return h ? h.textContent.replace(/[▸▾›]/g, '').trim() : '';
  }

  // ---- Hopfällning ------------------------------------------------------------------------------
  //
  // Panelen var 1,9-4,2 SKÄRMAR hög (uppmätt över sex widgets; Top Streak premium 3620 px mot ett
  // fönster på 852). Allt låg utfällt samtidigt, även det man ställer in en gång och sedan aldrig
  // rör. Grupperna från och med "live/test" och nedåt fälls därför ihop: rubriken syns, innehållet
  // öppnas med ett klick. Innehåll, widgetens egen huvudgrupp och design står kvar öppna — det är
  // dem man faktiskt arbetar i.
  //
  // Strukturen (.collapsible > .pg-toggle + .pg-body) och dess CSS fanns redan i studio.css och
  // användes av pgSection() i media.js för Gift Campaign och Like Fountain. Den återanvänds här i
  // stället för att en andra sort hopfällbar grupp uppfinns. Grupper som redan är hopfällbara rörs
  // inte alls.
  // POSITION (50) fälls INTE, till skillnad från allt annat i svansen. Uppmätt 2026-09-09: nio
  // browserprov föll när den var hopfälld — "TOP GIFT · Bredd: fokus stannar på kontrollen",
  // "Egen text · Bredd: fältet finns och tar emot fokus", "kedjelaset visas for lasbara widgets"
  // och sex till. Alla nio letade efter breddfältet, som ligger där. Det är inte provens fel:
  // bredd, höjd och proportionslåset hör till det man ändrar ofta, och en inställning man ändrar
  // ofta får inte kräva ett klick först. Live/test (40) och allt från ram (60) och nedåt fälls.
  const FALLS = new Set([40, 45, 60, 70, 80, 90]);

  // Vad användaren har öppnat, per rubrik. Panelen byggs om från grunden vid varje render(), så utan
  // det här minnet hade varje klick i studion fällt ihop det man just öppnat.
  const OPPNADE = new Set();

  function gorFallbar(grupp, rubrik) {
    if (grupp.classList.contains('collapsible')) return;      // pgSection har redan gjort sitt
    const h4 = grupp.querySelector(':scope > h4');
    if (!h4) return;

    const body = document.createElement('div');
    body.className = 'pg-body';
    while (h4.nextSibling) body.append(h4.nextSibling);       // allt utom rubriken flyttar in

    const knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'pg-toggle';
    knapp.textContent = h4.textContent;
    knapp.insertAdjacentHTML('beforeend', '<i class="pg-chevron">›</i>');

    h4.replaceWith(knapp);
    grupp.append(body);
    grupp.classList.add('collapsible');
    grupp.dataset.propertySection = rubrik;
    if (OPPNADE.has(rubrik)) grupp.classList.add('open');

    knapp.onclick = () => {
      if (grupp.classList.toggle('open')) OPPNADE.add(rubrik);
      else OPPNADE.delete(rubrik);
    };
  }

  function sortera() {
    const panel = document.querySelector('.properties');
    if (!panel) return;
    const barn = [...panel.children];
    const grupper = barn.filter(el => el.classList.contains('property-group'));
    if (grupper.length < 2) return;

    for (const g of grupper) {
      const r = rubrikFor(g);
      if (FALLS.has(vikt(r))) gorFallbar(g, r);
    }

    // Stabil sortering: lika vikt behåller inbördes ordning, så en familj som bygger två grupper
    // efter varandra får behålla sin egen logik.
    const sorterade = grupper
      .map((g, i) => ({ g, v: vikt(rubrikFor(g)), i }))
      .sort((a, b) => a.v - b.v || a.i - b.i)
      .map(x => x.g);

    // ALLT I PANELEN ÄR INTE EN GRUPP, och de lösa elementen har sin egen självklara plats:
    // rubriken, märket och Top Likes flikrad hör överst, "Ta bort"-knappen och åtgärdsraden nederst.
    // Första försöket sorterade bara grupperna och flyttade dem med append() — då hamnade de sist av
    // alla barn, och den RÖDA RADERA-KNAPPEN sköts upp till toppen av panelen. En knapp som tar bort
    // widgeten får inte ligga där handen är på väg. Därför byggs hela barnlistan om: huvud, grupper,
    // svans.
    const arSvans = el => el.matches('.property-actions, .delete, .delete-at-bottom, [data-panel-svans]');
    const huvud = barn.filter(el => !el.classList.contains('property-group') && !arSvans(el));
    const svans = barn.filter(arSvans);
    const onskad = [...huvud, ...sorterade, ...svans];

    // RÖR INGENTING NÄR ORDNINGEN REDAN STÄMMER. Panelen byggs om vid varje render(), men
    // vyraRenderKeepingPanel() behåller den medan man drar i ett reglage — då körs bind() utan
    // ombyggnad, och att flytta DOM-noder mitt i en dragning hade tappat både fokus och pekarfångst.
    if (onskad.length === barn.length && onskad.every((el, i) => el === barn[i])) return;

    // Fokus överlever flytten: att flytta en nod som innehåller markören tar bort fokus från den.
    const fokus = panel.contains(document.activeElement) ? document.activeElement : null;
    const markering = fokus && typeof fokus.selectionStart === 'number'
      ? [fokus.selectionStart, fokus.selectionEnd] : null;

    for (const el of onskad) panel.append(el);

    if (fokus && fokus.isConnected) {
      fokus.focus();
      if (markering) try { fokus.setSelectionRange(markering[0], markering[1]) } catch (_) {}
    }
  }

  // EFTER alla andra bindare, inte bland dem. Den här filen laddas från studio.html och kan därför
  // inte veta om den ligger ytterst i bind-kedjan — de dynamiskt injicerade panelfilerna registrerar
  // sina patchar senare. En schemalagd sortering körs efter allt synkront arbete oavsett ordning,
  // och är dessutom ett enda anrop även när flera bindare kört i samma pass.
  let kolagd = false;
  function schemalagg() {
    if (kolagd) return;
    kolagd = true;
    Promise.resolve().then(() => { kolagd = false; sortera() });
  }

  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () { const ut = foregaende.apply(this, arguments); schemalagg(); return ut };
  }

  window.vyraSorteraPanelen = sortera;   // provens ingång
})();
