(function () {
  'use strict';
  // PANELREGISTRET — deklarationer per widgettyp och modell (PR 1 i panelspecifikationen).
  //
  // Ren data plus små predikat, ingen DOM. vyra-panelram.js läser registret och bygger panelen i
  // sju sektioner för de modeller som har en post. EN MODELL UTAN POST FÅR EXAKT DAGENS PANEL, och
  // därför kan varje senare PR flytta en familj i taget utan att andra påverkas.
  //
  // REGISTRET HAR INGA POSTER ÄN. De läggs till familj för familj (spec kapitel 6). Formatet:
  //
  //   VyraPanelregister.definiera({
  //     typ: 'templateTopCoins',
  //     modell: w => w.tcDesign || 'voltage',        // nyckel inom typen (valfri)
  //     galler: ['voltage', 'basic-v2'],             // modeller posten gäller (valfri = alla)
  //     rubrik: w => 'Top Coins',                    // panelrubrik (valfri)
  //     marke:  w => 'Lista · Voltage',              // ersätter .template-badge (valfri)
  //     test:   'ranking',                           // adapter-id i VyraTestspel (PR 2)
  //     ersatter: ['#pfTestTopGift'],                // gamla testknappar som tas bort
  //     kontroller: [
  //       { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', kalla: 'egen', legacyId: '#likeTitle' },
  //       { sektion: 2, typ: 'tal',  falt: 'likeCount', etikett: 'Antal personer', min: 1, max: 10, enhet: 'st' },
  //       { sektion: 3, typ: 'std-position' },
  //       { sektion: 5, typ: 'farg', falt: 'accent', etikett: 'Accentfärg', arv: 'highlight' },
  //       { sektion: 7, typ: 'std-aterstall' },
  //     ],
  //     utseendeFalt: ['accent', 'vtFont'],          // det "Återställ utseende" återställer
  //   });
  //
  // FÄLTNAMNEN ÄR DE SOM REDAN FINNS. Registret pekar på w.likeCount, w.accent … och byter aldrig
  // namn på något. En kontroll som inte deklareras låter sitt fält ligga kvar i state.

  // Sektionernas nummer och rubriker. Ramen läser dem härifrån; de står här för att en registerpost
  // ska kunna valideras mot dem utan att ramen är laddad.
  const SEKTIONER = Object.freeze({
    1: '▶ Testa widget',
    2: 'Innehåll',
    3: 'Storlek och placering',
    4: 'Text',
    5: 'Utseende',
    6: 'Animation',
    7: 'Återställ utseende',
  });

  const KONTROLLTYPER = Object.freeze(['text', 'tal', 'val', 'kryss', 'farg', 'media', 'knapp']);
  // Gemensamma block (spec 1.5). Innehållet i varje block definieras i vyra-panelram.js.
  const STD = Object.freeze(['std-position', 'std-storlek', 'std-text', 'std-bakgrund', 'std-entre', 'std-aterstall']);
  const KALLOR = Object.freeze(['egen', 'exempel', 'live']);
  const MEDIETYPER = Object.freeze(['bild', 'video']);
  const ARV = Object.freeze(['highlight', 'secondary', 'text', 'background', 'fontFamily']);

  const poster = [];

  const arFunktion = f => typeof f === 'function';
  const arText = s => typeof s === 'string' && s.trim() !== '';

  // Returnerar en lista med fel; tom lista = giltig post. Felen är skrivna för den som lägger till
  // en post, så att ett stavfel syns direkt i konsolen i stället för som en tyst gammal panel.
  function validera(post) {
    const fel = [];
    if (!post || typeof post !== 'object') return ['posten är inte ett objekt'];
    if (!arText(post.typ)) fel.push('typ saknas');
    if (post.modell !== undefined && !arFunktion(post.modell)) fel.push('modell måste vara en funktion');
    if (post.galler !== undefined && !(Array.isArray(post.galler) && post.galler.every(arText))) fel.push('galler måste vara en lista med modellnycklar');
    if (post.galler !== undefined && !arFunktion(post.modell)) fel.push('galler kräver modell(w)');
    for (const f of ['rubrik', 'marke', 'katalognyckel']) {
      if (post[f] !== undefined && !arFunktion(post[f])) fel.push(`${f} måste vara en funktion`);
    }
    if (post.ersatter !== undefined && !(Array.isArray(post.ersatter) && post.ersatter.every(arText))) fel.push('ersatter måste vara en lista med selektorer');
    if (post.utseendeFalt !== undefined && !(Array.isArray(post.utseendeFalt) && post.utseendeFalt.every(arText))) fel.push('utseendeFalt måste vara en lista med fältnamn');
    if (!Array.isArray(post.kontroller)) { fel.push('kontroller saknas'); return fel; }

    post.kontroller.forEach((k, i) => {
      const namn = `kontroll ${i + 1}`;
      if (!k || typeof k !== 'object') { fel.push(`${namn}: inte ett objekt`); return; }
      const std = STD.includes(k.typ);
      if (!std && !KONTROLLTYPER.includes(k.typ)) fel.push(`${namn}: okänd typ "${k.typ}"`);
      // Exempeldata hamnar alltid i sektion 1, så sektionen får utelämnas där.
      const sektion = k.kalla === 'exempel' && k.sektion === undefined ? 1 : k.sektion;
      if (!(Number.isInteger(sektion) && sektion >= 1 && sektion <= 7)) fel.push(`${namn}: sektion måste vara 1–7`);
      if (k.kalla !== undefined && !KALLOR.includes(k.kalla)) fel.push(`${namn}: okänd kalla "${k.kalla}"`);
      if (k.arv !== undefined && !ARV.includes(k.arv)) fel.push(`${namn}: okänt arv "${k.arv}"`);
      if (k.om !== undefined && !arFunktion(k.om)) fel.push(`${namn}: om måste vara en funktion`);
      if (k.utan !== undefined && !(std && Array.isArray(k.utan))) fel.push(`${namn}: utan gäller bara std-block och är en lista`);
      if (k.beror !== undefined && !(k.beror && arText(k.beror.falt) && arFunktion(k.beror.villkor))) fel.push(`${namn}: beror måste vara {falt, villkor}`);
      if (std || k.kalla === 'live') return;
      if (k.typ === 'knapp') {
        if (!arText(k.id)) fel.push(`${namn}: knapp kräver id`);
        if (!k.legacyId && !arFunktion(k.klick)) fel.push(`${namn}: knapp kräver klick(w) eller legacyId`);
        return;
      }
      if (!arText(k.falt)) fel.push(`${namn}: falt saknas`);
      if (k.typ === 'val' && !k.legacyId && !Array.isArray(k.alternativ)) fel.push(`${namn}: val kräver alternativ`);
      // media byggs av vyra-mediaval.js. medietyp är 'bild' (standard) eller 'video'; lagring 'meta'
      // sparar {id,…} ur IndexedDB (som w.mediaMeta) i stället för en länk.
      if (k.typ === 'media') {
        if (k.medietyp !== undefined && !MEDIETYPER.includes(k.medietyp)) fel.push(`${namn}: okänd medietyp "${k.medietyp}"`);
        if (k.lagring !== undefined && !['url', 'meta'].includes(k.lagring)) fel.push(`${namn}: lagring är 'url' eller 'meta'`);
      }
    });
    return fel;
  }

  function modellnyckel(post, w) {
    if (!arFunktion(post.modell)) return null;
    try { return post.modell(w); } catch (_) { return null; }
  }

  function galler(post, w) {
    if (!w || w.type !== post.typ) return false;
    if (!post.galler) return true;
    return post.galler.includes(modellnyckel(post, w));
  }

  // Två poster får aldrig gälla samma modell — då vore det slumpen (laddordningen) som avgjorde
  // vilken panel som visas.
  function overlappar(a, b) {
    if (a.typ !== b.typ) return false;
    if (!a.galler || !b.galler) return true;
    return a.galler.some(m => b.galler.includes(m));
  }

  function definiera(post) {
    const fel = validera(post);
    if (fel.length) throw new Error('VyraPanelregister: ogiltig post för ' + (post && post.typ) + ' — ' + fel.join('; '));
    const krock = poster.find(p => overlappar(p, post));
    if (krock) throw new Error('VyraPanelregister: ' + post.typ + ' har redan en post för samma modeller');
    poster.push(post);
    return post;
  }

  function hitta(w) {
    if (!w || typeof w !== 'object') return null;
    for (const p of poster) if (galler(p, w)) return p;
    return null;
  }

  // Tar bort en post. Provens ingång, och vägen för en familj som vill byta sin post under körning.
  function tabort(post) {
    const i = poster.indexOf(post);
    if (i >= 0) poster.splice(i, 1);
    return i >= 0;
  }

  window.VyraPanelregister = {
    SEKTIONER, KONTROLLTYPER, STD, KALLOR, ARV, MEDIETYPER,
    definiera, hitta, tabort, validera, modellnyckel,
    poster: () => poster.slice(),
  };
})();
