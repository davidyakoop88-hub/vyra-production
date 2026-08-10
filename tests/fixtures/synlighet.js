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

// NABAR: samma matning, men rullar dit forst.
//
// SYNLIG svarar "ligger elementet i vyn just nu", vilket ar ratt fraga for en modal, en banner
// eller en indikator — sadant som ska mota ogat utan att man letar. Det ar FEL fraga for
// innehall langre ner pa en lang sida: en sidfot, en installningsrad, ett tomt tillstand i en
// 2763 px hog vy. Kravet dar ar att det GAR ATT NA.
//
// Skrivet efter tre fall av samma misstag i rad — sidfoten (#172), nedladdningsraden i
// Installningar (#175) och handlingarna i de tomma tillstanden (6E). Tva ganger ar slump, tre
// ganger ar en saknad matning. Valj SYNLIG nar lage i vyn ar kravet, NABAR nar det inte ar det.
//
// Rullningen sker i SAMMA anrop som matningen med flit: ett separat page.evaluate() foll nar
// auth-security.js hann lagga till fler sektioner daremellan och knuffade tillbaka elementet.
const NABAR = `(el) => {
  if (!el) return { ok: false, skal: 'elementet finns inte' };
  el.scrollIntoView({ block: 'center' });
  return (${SYNLIG})(el);
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

// Lasbarhet, inte bara synlighet. WCAG 2.1 AA kraver kontrastkvot 4.5:1 for normaltext och 3:1
// for stor text (>= 24px, eller >= 18.66px fet). Ett element kan vara fullt synligt och anda
// olasligt — det ar samma familj som resten av filen: syns det, och gar det att TA TILL SIG?
//
// Genomskinlig text och genomskinlig bakgrund blandas mot det som ligger bakom, annars raknar
// formeln pa en farg som ingen ser.
const KONTRAST = `(el) => {
  if (!el) return null;
  function kanal(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) }
  function lum(rgb){ return 0.2126*kanal(rgb[0]) + 0.7152*kanal(rgb[1]) + 0.0722*kanal(rgb[2]) }
  function tolka(s){
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const d = m[1].split(',').map(x => parseFloat(x.trim()));
    return { rgb: [d[0], d[1], d[2]], a: d.length > 3 ? d[3] : 1 };
  }
  const blanda = (fram, bak) => [0,1,2].map(i => Math.round(fram.rgb[i]*fram.a + bak[i]*(1-fram.a)));
  function bakgrundBakom(n){
    while (n && n !== document.documentElement) {
      const b = tolka(getComputedStyle(n).backgroundColor);
      if (b && b.a > 0) return blanda(b, [0,0,0]);
      n = n.parentElement;
    }
    return [0,0,0];
  }
  const cs = getComputedStyle(el);
  // Gradienttext: fargen ar genomskinlig med flit och bilden bakom ar sjalva texten. Kvoten gar
  // inte att rakna pa en farg som inte finns — svaret ar "kan inte matas", inte "faller".
  // (Uppmatt: landningssidans rubrik gav 1:1 och sag ut som ett brott.)
  if ((cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') &&
      /rgba\\(0, 0, 0, 0\\)|transparent/.test(cs.color)) {
    return { omatbar: 'gradienttext (background-clip:text)', klararAA: null };
  }
  const bak = bakgrundBakom(el);
  const fram = tolka(cs.color);
  if (!fram) return null;
  const text = blanda(fram, bak);
  const L1 = lum(text), L2 = lum(bak);
  const px = parseFloat(cs.fontSize), fet = parseInt(cs.fontWeight, 10) >= 700;
  const storText = px >= 24 || (fet && px >= 18.66);
  const kvot = +(((Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05)).toFixed(2));
  return {
    kvot, px: +px.toFixed(1), vikt: cs.fontWeight, radavstand: cs.lineHeight,
    textFarg: cs.color, bakgrund: 'rgb(' + bak.join(',') + ')',
    storText, krav: storText ? 3 : 4.5, klararAA: kvot >= (storText ? 3 : 4.5),
  };
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

module.exports = { SYNLIG, NABAR, INOM, UTSEENDE, MATT, KONTRAST, granskaKalla };
