'use strict';
// Delade matningar for "syns det, och ser det ratt ut?" (tech-debt 8).
//
// VARFOR INTE EN [data-must-be-visible]-VAKT. Forslaget lag pa bordet efter fyra fall. Uppmatt mot
// dem alla skulle ett synlighetssvep ha fangat ETT:
//
//   autospar-indikatorn pa y=902 i ett 900px fonster     utanfor vyn        JA
//   snappvaxeln, aria-pressed ratt men lagena identiska  fullt synlig       nej
//   verifieringsbannern pa y=806                         synlig, fel plats  nej
//   verifieringsbannern 882x720                          synlig, fel mata   nej
//
// Tre av fyra var inte osynliga — de var SYNLIGA MEN FEL. En vakt som svarar "elementet syns" hade
// gett gront pa dem och skapat falsk trygghet, vilket ar samre an ingen vakt alls. En attributvakt
// hade dessutom bara natt de element nagon kom ihag att tagga, och den som skriver ett trasigt
// element ar den minst benagna att tagga det.
//
// Det som faktiskt fangade fallen var fyra matningar. De bor har, som EN kalla, sa nasta prov
// slipper skriva om dem — och sa formuleringen blir densamma i alla prov.
//
// Funktionerna returnerar KALLTEXT att kora i sidan (page.evaluate), inte varden: matningen maste
// ske i webblasaren, och fixturen kors i Node.

// Allt som gor ett element osynligt utan att ta bort det ur DOM:en, plus lage i vyn.
const SYNLIG = `(el) => {
  if (!el) return { ok: false, skal: 'elementet finns inte' };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (cs.display === 'none') return { ok: false, skal: 'display:none' };
  if (cs.visibility === 'hidden') return { ok: false, skal: 'visibility:hidden' };
  if (parseFloat(cs.opacity) === 0) return { ok: false, skal: 'opacity:0' };
  if (el.hasAttribute('hidden')) return { ok: false, skal: 'hidden-attribut' };
  if (r.width <= 0 || r.height <= 0) return { ok: false, skal: 'nollstor ruta' };
  const vh = innerHeight, vw = innerWidth;
  if (r.bottom <= 0 || r.top >= vh) return { ok: false, skal: 'utanfor vyn i hojdled (y=' + Math.round(r.top) + ', vy=' + vh + ')' };
  if (r.right <= 0 || r.left >= vw) return { ok: false, skal: 'utanfor vyn i sidled (x=' + Math.round(r.left) + ', vy=' + vw + ')' };
  return { ok: true, skal: null, ruta: { x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.width), h: Math.round(r.height) } };
}`;

// Ligger elementet innanfor foralderns SYNLIGA ruta? Fangar den klass dar ett absolut placerat
// element ankras mot innehallets botten i en rullande behallare och hamnar under vecket.
const INOM = `(el, foralder) => {
  if (!el || !foralder) return { ok: false, skal: 'element eller foralder saknas' };
  const a = el.getBoundingClientRect(), b = foralder.getBoundingClientRect();
  const slack = 1;
  const brott = [];
  if (a.top < b.top - slack) brott.push('ovanfor (' + Math.round(b.top - a.top) + 'px)');
  if (a.bottom > b.bottom + slack) brott.push('nedanfor (' + Math.round(a.bottom - b.bottom) + 'px)');
  if (a.left < b.left - slack) brott.push('till vanster (' + Math.round(b.left - a.left) + 'px)');
  if (a.right > b.right + slack) brott.push('till hoger (' + Math.round(a.right - b.right) + 'px)');
  return { ok: !brott.length, skal: brott.length ? brott.join(', ') : null };
}`;

// Fingeravtryck av det VISUELLA tillstandet. Tva lagen som ger samma strang ser likadana ut for
// anvandaren, hur ratt aria-pressed an ar.
const UTSEENDE = `(el) => {
  if (!el) return 'saknas';
  const cs = getComputedStyle(el);
  return [cs.backgroundColor, cs.backgroundImage, cs.borderTopColor, cs.borderTopWidth,
    cs.color, cs.opacity, cs.textDecorationLine, cs.transform].join(' | ');
}`;

// Ratt matt? Fangar det stretchade elementet: tva regler i tva filer som satte top respektive
// bottom, och elementet spande over hela hojden.
const MATT = `(el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { b: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
    andelAvVyn: { b: +(r.width / innerWidth).toFixed(2), h: +(r.height / innerHeight).toFixed(2) } };
}`;

// Bekvamlighet: en enda evaluate som ger alla fyra for en selektor.
function granskaKalla(selektor, foralderSelektor) {
  return `() => {
    const el = document.querySelector(${JSON.stringify(selektor)});
    const far = ${foralderSelektor ? `document.querySelector(${JSON.stringify(foralderSelektor)})` : 'null'};
    return {
      synlig: (${SYNLIG})(el),
      inom: far ? (${INOM})(el, far) : null,
      utseende: (${UTSEENDE})(el),
      matt: (${MATT})(el),
    };
  }`;
}

module.exports = { SYNLIG, INOM, UTSEENDE, MATT, granskaKalla };
