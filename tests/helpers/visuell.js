'use strict';
// VISUELL REGRESSIONSVAKT — riggen. Fotograferar en widget i overlay och jämför pixel för pixel.
//
// NOLLTOLERANS, INTE PROCENT. Uppmätt 2026-08-19: samma widget fotograferad två gånger i samma
// session gav 0 olika pixlar av 224 000, och 0 igen efter en helt ny webbläsarstart. Determinismen
// finns — men bara på SAMMA binär. En procenttolerans hade dolt exakt de små förskjutningar en
// visuell vakt finns för att hitta.
//
// DÄRFÖR BÄR REFERENSERNA ETT MANIFEST. `playwright-core` pinnar en Chromium-revision, och två
// revisioner rastrerar typsnitt olika. Utan manifestet hade en revisionsväxling gett 181 röda prov
// utan att en rad kod ändrats, och felmeddelandet hade pekat på widgetarna i stället för på
// webbläsaren. Med det säger vakten rakt ut vad som hänt.
const fs = require('fs'), path = require('path');
const { REGI } = require('./katalognycklar.js');

const ROOT = path.join(__dirname, '..', '..');
const REFKAT = path.join(ROOT, 'tests', 'visual', 'referenser');
const DIFFKAT = path.join(ROOT, 'tests', 'visual', 'diff');
const MANIFEST = path.join(REFKAT, 'manifest.json');

const filnamn = nyckel => nyckel.replace(/^catalog:/, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.png';
const refvag = nyckel => path.join(REFKAT, filnamn(nyckel));

// Vilken binär referenserna gjordes på — DEN SOM FAKTISKT STARTAS, inte den paketet förväntar sig.
//
// Första versionen läste `chromium.executablePath()`. Den returnerar den revision `playwright-core`
// är pinnad mot, vilket är rätt svar i CI men fel svar överallt där `VYRA_CHROMIUM` pekar på en
// annan binär: manifestet hade sagt 1234 medan bilderna togs på 1194, och krockvakten som ska
// upptäcka just det hade aldrig utlösts. Manifestet måste beskriva verkligheten, inte avsikten.
function motorn() {
  const rigg = require('./webblasare.js');
  const binar = rigg.hittaBinar();
  let version = '';
  if (binar) {
    try {
      version = require('child_process').execFileSync(binar, ['--version'],
        { encoding: 'utf8', timeout: 15000 }).trim();
    } catch (_) { /* en binär som inte svarar på --version identifieras av sin sökväg */ }
  }
  const revision = (/chromium[_a-z]*-(\d+)/.exec(binar || '') || [])[1] || '';
  return {
    playwright: require('playwright-core/package.json').version,
    binar: binar || 'ingen',
    version: version || 'okänd',
    revision: revision || 'ur sökvägen: okänd',
  };
}

function lasManifest() {
  if (!fs.existsSync(MANIFEST)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } catch (_) { return null }
}

// Skälet att vakten inte bara faller tyst på fel binär: felet är då INTE i koden, och ett prov som
// skyller på widgeten när webbläsaren bytts skickar nästa läsare åt fel håll.
// Jämför på `version` — den strängen kommer ur binären själv och är det enda som säkert skiljer
// två builds åt. Sökvägen kan vara identisk för olika revisioner, och revisionsnumret saknas helt
// för en systeminstallerad Chrome.
function motorKrock() {
  const m = lasManifest();
  if (!m) return null;
  const nu = motorn();
  if (m.motor.version === nu.version) return null;
  return `referenserna gjordes på "${m.motor.version}" men den här maskinen kör "${nu.version}". `
    + `Två builds rastrerar typsnitt olika, så en jämförelse här mäter webbläsaren och inte `
    + `widgetarna — varje nyckel hade fallit utan att en rad kod ändrats. Kör vakten där binären `
    + `matchar (CI installerar den pinnade via \`npx playwright install chromium\`), eller `
    + `regenerera referenserna med motivering.`;
}

/* Mätfunktionerna körs INNE i sidan — en gång per sida, inte en gång per widget. */
const RIGG = `(() => {
  window.__visBygg = (nyckel) => {
    try {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create(nyckel);
      w.x = 40; w.y = 30;
      state.widgets.push(w); selected = null; render();
      return { typ: w.type, id: w.id };
    } catch (e) { return { fel: String(e && e.message || e).slice(0, 140) } }
  };
  window.__visBilderKlara = async () => {
    const bilder = [...document.querySelectorAll('[data-id] img')];
    const fel = await Promise.all(bilder.map(i =>
      i.decode().then(() => null).catch(() => i.getAttribute('src') || '')));
    return fel.filter(Boolean);
  };
  // VIDEO AR EN EGEN TIDSLINJE. getAnimations() ser den inte, och en paus av CSS-animationerna
  // lamnar den rullande — tva foton i rad blir da aldrig identiska.
  //
  // UPPMATT 2026-08-19: alla atta Glove Snipe-nycklar fotograferades som 0 procent malade. Innehallet
  // ar ett <video class="pack-fx-video">, och tva saker gick fel samtidigt — bildrutan var annu inte
  // avkodad (readyState under 2, alltsa ingenting att mala), och videons uppspelning styrs av
  // vaggklockan och inte av animationstidslinjen.
  //
  // Losningen ar samma som for animationerna: vanta tills det finns data, pausa, och sok till en FAST
  // tidpunkt. Da ar videon lika reproducerbar som en fryst CSS-animation.
  window.__visVideo = async (sek) => {
    const box = document.querySelector('[data-id]');
    if (!box) return { antal: 0, fel: ['ingen widget'] };
    const videor = [...box.querySelectorAll('video')];
    const utfall = await Promise.all(videor.map(el => new Promise(klar => {
      const stopp = setTimeout(() => klar('timeout'), 6000);
      const gor = () => {
        el.pause();
        const d = (el.duration && isFinite(el.duration)) ? el.duration : 0;
        // Halvvags in i en kort snutt, annars den fasta sekunden. Bada ar reproducerbara; poangen
        // ar bara att inte hamna forbi slutet pa en video som ar kortare an sek.
        const mal = d ? Math.min(sek, d * 0.5) : sek;
        if (Math.abs(el.currentTime - mal) < 0.001) { clearTimeout(stopp); return klar('redan') }
        el.onseeked = () => { clearTimeout(stopp); klar('sokt') };
        try { el.currentTime = mal } catch (e) { clearTimeout(stopp); klar('sokfel') }
      };
      if (el.readyState >= 2) gor();
      else {
        el.onloadeddata = gor;
        el.onerror = () => { clearTimeout(stopp); klar('laddfel: ' + (el.currentSrc || el.src || '?')) };
      }
    })));
    return { antal: videor.length, utfall };
  };
  // KON AR DELAD MELLAN ALLA ALERTS. runtime-controls haller varje alert i 5-8 sekunder, sa efter
  // ett femtiotal widgets stod nasta trigger i ko bakom alla foregaende — uppmatt: emblemet tandes
  // aldrig inom 12 s, inte for att triggern var trasig utan for att den vantade pa sin tur.
  window.__visTomKo = () => {
    if (window.VyraAlertQueue && typeof window.VyraAlertQueue.clear === 'function') {
      window.VyraAlertQueue.clear();
      return window.VyraAlertQueue.size ? window.VyraAlertQueue.size() : -1;
    }
    return -1;
  };
  // SKANNAR EFTER DEN FORSTA BILDRUTAN DAR WIDGETEN AR SOM MEST SYNLIG.
  //
  // En fast frystid gar inte att valja: satts den lagt landar den mitt i en entreanimation, satts
  // den hogt landar den pa en UTTONING. Uppmatt bada vagarna — currentTime 0 gav fyllnad 0 %, och
  // 999 s slackte Glove Snipe helt eftersom dess sista animation tonar ut med fill: both.
  //
  // Skanningen provar en fast stege av tidpunkter, mater arvd opacitet vid var och en och valjer
  // den SENASTE som nar maxvardet.
  //
  // SENAST, INTE TIDIGAST — uppmatt fram i tre steg. Tidigast valde en bildruta mitt i en entre for
  // en widget som redan stod fardig. Stegen slutar darfor med 999000 ms, alltsa bortom varje andlig
  // animations slut: en vilande widget nar sitt max dar och far sin SLUTBILD, medan en widget vars
  // sista animation tonar ut har opacitet 0 dar och i stallet far sin sista hela bildruta. En regel
  // racker for bada, och den ar reproducerbar for att stegen ar fast.
  // VANTAR TILLS ANIMATIONERNA FINNS. Precis sa lat, och precis sa nodvandigt.
  //
  // UPPMATT 2026-08-19, 100 fotograferingar av fyra nycklar: 2 foll, bada med exakt samma bild —
  // "osynlig efter frysning (221x221, opacitet 0, basta bildruta 999000)". 221 ar 340 gangor 0,65,
  // och studio.css rad 31 sager
  //     @keyframes vyraAppear{0%{opacity:0;transform:scale(.65)}15%,100%{opacity:1;transform:scale(1)}}
  // Widgeten stod alltsa pa entreanimationens ALLRA forsta bildruta — den hade inte frysts alls.
  //
  // Skalet: en CSS-animation skapas i webblasarens bildrutesteg "update animations", inte nar
  // noden laggs in i DOM:en. Direkt efter render() ar getAnimations() TOM och den beraknade stilen
  // ar basstilen (opacitet 1, skala 1, alltsa 340x340 och fullt synlig). Riggen sag det och trodde
  // sig fardig: synlighetsvakten slog till pa forsta forsoket, skanningen pausade en tom lista,
  // skrev currentTime pa ingenting och lamnade tillbaka 999000. Forst DARFTER kom bildrutan som
  // skapade vyraAppear och startade den pa 0 procent — och nasta matning last opacitet 0.
  //
  // Att det bara traffade ibland ar hela poangen: utfallet berodde pa om en bildruta hann passera
  // mellan render() och skanningen, alltsa pa maskinen och inte pa widgeten. En vakt med
  // nolltolerans far inte ha en sadan komponent.
  //
  // Villkoret ar darfor: lat tva rundor om tva bildrutor passera innan nagot mats, och invanta
  // varje animations ready-lofte. Se __visStabil nedan for varfor det INTE far vara starkare an sa.
  window.__visStabil = async () => {
    const rakna = () => {
      const box = document.querySelector('[data-id]');
      if (!box) return [];
      return [...box.getAnimations({ subtree: true })];
    };
    const bildruta = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const start = performance.now();

    // TVA RUNDOR, INTE "TILLS DET SLUTAT ANDRA SIG". Skillnaden ar hela skillnaden.
    //
    // Forsta forsoket kravde att antalet animationer stod stilla i tre rundor. Det var for starkt:
    // en fasdriven widget lagger till animationer under hela sin koreografi, sa villkoret betydde
    // "vanta tills forestallningen ar over". Uppmatt: 13 nycklar — Guardian Emblem 1-4, atta Glove
    // Snipe-varianter och Like Fountain — fotograferades da med 0 procent malad yta, for alerten
    // hade hunnit slacka sig och det fanns inte langre nagon animation att spola tillbaka i.
    //
    // Villkoret ska bara tacka det uppmatta felet: att animationerna annu inte SKAPATS. Tva rundor
    // om tva bildrutor racker for det och kostar ~66 ms per nyckel, mot flera sekunder for det
    // starkare villkoret.
    await bildruta();
    await bildruta();

    // TYPSNITTEN MASTE VARA PA PLATS INNAN NAGOT MATS.
    //
    // Ett tecken som ritas i ett reservtypsnitt medan det riktiga annu laddas ger tva fel samtidigt:
    // sjalva glyferna ser annorlunda ut, och textens BREDD blir en annan — vilket flyttar allt som
    // star efter den en braksdel av en pixel.
    //
    // UPPMATT 2026-08-19 i CI, tva korningar pa samma maskin och samma binar:
    //   catalog:giftjar:heart      115 pixlar inom 232x34 px, storsta kanalskillnad 18  (en textrad)
    //   catalog:topstreak:frame:rose-heart   26 pixlar inom 1x40 px, storsta kanalskillnad 1
    // Alltsa en textrad som ritats olika, och en enda pixelkolumn som forskjutits. Bada ar vad ett
    // typsnitt som byts mitt i ser ut som.
    //
    // document.fonts.ready loses nar webblasaren ar klar med alla teckensnitt sidan begart. Den
    // vantar per SIDA, sa kostnaden ar en gang per widget och normalt noll efter den forsta.
    try { await document.fonts.ready } catch (e) {}

    const alla = rakna();
    // ready loses nar animationen faktiskt borjat spela. En animation som annu ar "pending" ignorerar
    // det currentTime skanningen skriver, och da mater stegen samma bildruta nio ganger.
    try { await Promise.all(alla.map(a => a.ready)) } catch (e) {}
    return { antal: alla.length, ms: Math.round(performance.now() - start) };
  };
  window.__visSkanna = async (stege) => {
    const stabilt = await window.__visStabil();
    const box = document.querySelector('[data-id]');
    if (!box) return { fel: 'ingen widget' };
    const alla = [...box.getAnimations({ subtree: true })];

    // SOM DEN STAR ar forsta kandidaten, och det ar den viktigaste raden i hela riggen.
    //
    // Sidan visar redan widgeten. Att satta currentTime ar att SPOLA I den, och for en widget vars
    // animationer redan tagit slut kan varje tidpunkt jag valjer vara samre an den den redan star
    // pa — uppmatt pa catalog:topgift:premium:cyber, som var osynlig vid samtliga nio tidpunkter
    // men fullt synlig innan jag rorde nagot. En matning far inte gora sitt matobjekt samre.
    const fore = alla.map(a => a.currentTime);
    alla.forEach(a => a.pause());
    void box.offsetWidth;
    const somDenStar = window.__visSynlig().o;

    const matt = stege.map(t => {
      alla.forEach(a => { a.currentTime = t });
      void box.offsetWidth;
      return { t, o: window.__visSynlig().o };
    });
    const bastFast = Math.max(...matt.map(m => m.o), 0);

    // En FAST tidpunkt vinner vid lika, for den ar reproducerbar. "Som den star" beror pa nar sidan
    // hann settla och ar bara ett godtagbart val nar den ar STRIKT battre an allt annat — vilket den
    // bara ar for en widget vars ratta bild inte gar att traffa med en tidpunkt alls.
    if (somDenStar > bastFast + 0.001) {
      alla.forEach((a, i) => { a.currentTime = fore[i] });
      void box.offsetWidth;
      return { vald: 'som den står', opacitet: +somDenStar.toFixed(3), animationer: alla.length, stabilt };
    }
    const vald = [...matt].reverse().find(m => m.o >= bastFast - 0.001);
    alla.forEach(a => { a.currentTime = vald.t });
    void box.offsetWidth;
    return { vald: vald.t, opacitet: +bastFast.toFixed(3), animationer: alla.length, stabilt };
  };
  window.__visTrig = (...a) => {
    const n = a.shift();
    if (typeof window[n] !== 'function') return 'saknas: ' + n;
    try { window[n](...a); return 'ok' } catch (e) { return 'FEL: ' + String(e && e.message || e).slice(0, 110) }
  };
  // FRYSER RÖRELSEN. Ett foto taget "när det råkar bli" är ingen referens.
  //
  // TIDPUNKTEN AR BORTOM VARJE ENTREANIMATIONS SLUT, inte en gissad millisekund mitt i forloppet.
  // currentTime 0 gav fyllnad 0 procent — entreanimationens forsta bildruta ar osynlig. En gissad
  // siffra som 2400 ms landar dessutom olika i olika familjer. Med ett tal storre an alla
  // varaktigheter star varje andlig animation pa sin SLUTBILD (fill: both haller den kvar), och
  // varje oandlig pa en bestamd punkt i sin loop. Determinismen kommer av att talet ar fast,
  // synligheten av att det ar stort.
  //
  // INGA BACKTICKS I DEN HAR KOMMENTAREN: den bor inuti en template-literal, och en backtick har
  // avslutar strangen mitt i riggen.
  window.__visFrys = (ms) => {
    const box = document.querySelector('[data-id]');
    const alla = [...box.getAnimations({ subtree: true })];
    alla.forEach(a => { a.pause(); a.currentTime = ms });
    void box.offsetWidth;
    return alla.length;
  };
  window.__visSynlig = () => {
    const box = document.querySelector('[data-id]');
    if (!box) return { b: 0, h: 0, doljd: true, o: 0 };
    const r = box.getBoundingClientRect();
    let o = 1;
    for (let n = box; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return { b: 0, h: 0, doljd: true, o: 0 };
      o *= parseFloat(cs.opacity);
    }
    return { b: Math.round(r.width), h: Math.round(r.height), doljd: false, o: +o.toFixed(3) };
  };
  return true;
})()`;

/* Andelen pixlar med alfa över tröskeln. Kontrollmätningen som skiljer "referens" från "tom ruta".
   MÅSTE tas på en bild med `omitBackground` — annars komponerar Chromium mot vitt och varje bild
   rapporterar 100 % fyllnad, inklusive en helt tom.

   RIKTIGA FUNKTIONER, INTE STRÄNGAR. `page.evaluate(sträng, arg)` evaluerar strängen som ett
   UTTRYCK och anropar den aldrig med argumentet — resultatet blir ett funktionsobjekt som inte går
   att serialisera, alltså `undefined`. Playwright serialiserar däremot en riktig funktion åt oss.
   RIGG nedan får förbli en sträng: den är en IIFE utan argument som körs för sina sidoeffekter. */
const FYLLNAD = (async (b64) => {
  const i = new Image();
  await new Promise(r => { i.onload = r; i.src = 'data:image/png;base64,' + b64 });
  const c = document.createElement('canvas');
  c.width = i.width; c.height = i.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(i, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let p = 0;
  for (let n = 3; n < d.length; n += 4) if (d[n] > 8) p++;
  return { procent: +(p / (d.length / 4) * 100).toFixed(2), bredd: i.width, hojd: i.height };
});

/* Pixeljämförelsen. Chromium avkodar båda bilderna; ingen Node-dependency behövs, och avkodningen
   är samma motor som ritade dem. Vid skillnad byggs en diffbild: originalet nedtonat med de
   avvikande pixlarna i rött, så felet går att SE och inte bara räkna.

   TRÖSKELN ÄR 1 AV 255 PER KANAL, OCH DET ÄR INTE EN PROCENTTOLERANS.

   Skillnaden spelar roll. En procenttolerans säger "upp till N procent av bilden får skilja sig",
   alltså en BUDGET som ett riktigt fel kan gömma sig i: en avklippt etikett på 200 pixlar passerar
   om budgeten är 300. Tröskeln här säger något annat — att två färger som skiljer en 255-del är
   SAMMA färg. Det finns ingen budget: en enda pixel som skiljer 2 fäller provet.

   UPPMÄTT 2026-08-19 varför den behövs. CI skrev 167 referenser och körde sedan vakten mot dem på
   samma maskin och samma binär. 166 reproducerade exakt, noll pixlar. En gjorde inte det:

     catalog:topstreak:frame:rose-heart: 26 av 100800 pixlar, inom 1×40 px vid (127,248),
     största kanalskillnad 1 av 255

   Alltså ett enda hårstreck, en pixel brett, där ett värde avrundas åt olika håll mellan två
   körningar. Samma nyckel reproducerar perfekt lokalt på chromium-1194 över två helt skilda
   webblasarstarter — det är CI:s build som gör det. En avrundning i sista biten är inte en visuell
   regression; den syns inte på någon skärm och för inget mänskligt öga.

   Vad tröskeln INTE döljer: en flyttad kant, en ändrad färg, text ovanpå text, en avklippt platta.
   Allt sådant ändrar kanaler med tiotal eller hundratal, inte med ett. */
/* HÖJD FRÅN 1 TILL 6 DEN 2026-08-20, PÅ ÄGARENS BESLUT.
   Uppmätt: första körningen av vakten mot de incheckade referenserna (CI-körning 692, commit
   45070c5) föll på tre nycklar, alla mikroskopiska —

     catalog:lastx:badge                    1 av 196500 px, 1×1 px vid (241,359), kanal 2 av 255
     catalog:lastx:stack                    6 av 212925 px, 203×246 px vid (142,75),  kanal 6
     catalog:topstreak:frame:crystal-spire  1 av 114600 px, 1×1 px vid (197,232),     kanal 5

   Referensjobbet krävde att session 2 och 3 var EXAKT identiska, och det var de för alla 166. Men
   en fjärde session — vakten i ett annat jobb, på en annan löpare — skiljer sig på enstaka pixlar.
   Ettan kalibrerades på en enda observation och var för snäv; brusgolvet på CI är uppemot 6.

   Alternativet var att undanta de tre nycklarna. Det valdes bort: hålen växer med tiden och
   orsaken finns kvar, så nästa build kan ge tre nya.

   DET HÄR ÄR FORTFARANDE INGEN PROCENTTOLERANS. Tröskeln säger att färger inom 6/255 är samma
   färg — inte att en andel av bilden får skilja sig. Det finns ingen budget att gömma ett fel i:
   EN pixel som skiljer 7 fäller provet. En flyttad kant, en ändrad färg, text ovanpå text eller
   en avklippt platta flyttar kanaler med tiotal eller hundratal. */
const KANALTROSKEL = 6;

const JAMFOR = (async ([a, b, KANALTROSKEL]) => {
  const ld = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + u });
  const [x, y] = await Promise.all([ld(a), ld(b)]);
  if (x.width !== y.width || x.height !== y.height) {
    return { matt: true, ref: x.width + '×' + x.height, ny: y.width + '×' + y.height };
  }
  const c = document.createElement('canvas');
  c.width = x.width; c.height = x.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(x, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height);
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(y, 0, 0); const d2 = g.getImageData(0, 0, c.width, c.height);
  const p1 = d1.data, p2 = d2.data;
  let olika = 0;
  // AVGRANSNINGEN OCH STORSTA KANALSKILLNADEN FOLJER MED I SVARET.
  //
  // Diffbilden skrivs till tests/visual/diff/ — en katalog som forsvinner med lopararen. I CI, alltsa
  // pa det ENDA stalle dar vakten normalt faller, pekade felmeddelandet darfor pa en fil ingen kunde
  // oppna. Siffrorna nedan reser i loggen i stallet: var skillnaden sitter, hur stor den ar per
  // kanal, och darmed om det ar en kantutjamning pa en pixel eller en riktig omritning.
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, storsta = 0;
  const diff = g.createImageData(c.width, c.height);
  for (let i = 0; i < p1.length; i += 4) {
    const d = Math.max(Math.abs(p1[i] - p2[i]), Math.abs(p1[i+1] - p2[i+1]),
      Math.abs(p1[i+2] - p2[i+2]), Math.abs(p1[i+3] - p2[i+3]));
    if (d > KANALTROSKEL) {
      olika++;
      if (d > storsta) storsta = d;
      const punkt = i / 4, px = punkt % c.width, py = (punkt / c.width) | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      diff.data[i] = 255; diff.data[i+1] = 0; diff.data[i+2] = 60; diff.data[i+3] = 255;
    } else {
      diff.data[i] = p2[i]; diff.data[i+1] = p2[i+1]; diff.data[i+2] = p2[i+2];
      diff.data[i+3] = Math.round(p2[i+3] * 0.22);
    }
  }
  const ruta = olika ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;
  if (!olika) return { olika: 0, total: p1.length / 4 };
  g.clearRect(0, 0, c.width, c.height); g.putImageData(diff, 0, 0);
  return { olika, total: p1.length / 4, ruta, storsta, diff: c.toDataURL('image/png').split(',')[1] };
});


/* FOTOGRAFERINGEN, EN GÅNG. Vakten och uppdateringsskriptet måste fotografera på exakt samma sätt,
   annars jämför vakten sina egna bilder med referenser tagna under andra villkor — och skillnaden
   ser ut som en regression i widgeten. Därför bor koden här, inte i två filer.

   ORDNINGEN ÄR MÄTT FRAM:
     1. bygg widgeten
     2. avkoda dess bilder (en halvladdad bild ger en referens som aldrig går att matcha)
     3. väck den om den är en alert — en släckt widget går inte att fotografera alls
     4. VÄNTA tills den faktiskt syns; kön fördröjer visningen och en fast paus gissar
     5. frys bortom varje entréanimations slut
     6. kontrollera synligheten IGEN — frysningen kan i sig släcka den */
// Stegen skanningen provar. Fast lista — det ar det som gor valet reproducerbart. Spannet tacker
// entreanimationer (300-900 ms), hallfaser (1-4 s) och lamnar marginal fore uttoningen.
// Stegen skanningen provar. Fast lista — det är det som gör valet reproducerbart. Spannet täcker
// entréanimationer (300–900 ms) och hållfaser (1–4 s), och slutar bortom varje ändlig animations
// slut så en redan färdig widget får sin slutbild i stället för en tillbakaspolad entré.
const STEGE = [300, 600, 900, 1300, 1800, 2400, 3200, 4200, 999000];

async function fota(sida) {
  const el = await sida.$('[data-id]');
  if (!el) return null;
  let b64;
  try { b64 = (await el.screenshot({ omitBackground: true, timeout: 4000 })).toString('base64') }
  catch (_) { return null }               // playwright vagrar fota ett osynligt element
  return { b64, fyllnad: await sida.evaluate(FYLLNAD, b64) };
}

/* STILLHET AR KRITERIET, INTE FRYSNING.
   En referensbild kraver en enda sak: att widgeten star stilla i det ogonblick den fotograferas.
   Tva pa varandra foljande foton med identiska pixlar BEVISAR det — till skillnad fran en frysning,
   som bara antar det.

   UPPMATT 2026-08-19, varfor frysningen inte racker: Guardian Emblem drivs av FASKLASSER som en
   JS-klocka satter over tid, inte av en enda animation. Att spola animationerna till en tidpunkt
   medan klasserna star pa en annan ger en omojlig kombination — malad yta 0 procent vid samtliga
   nio stegtidpunkter, mot 66-73 procent levande. Frysning ar ratt verktyg for en widget vars hela
   forlopp ar animationer, och fel verktyg for en vars forlopp ar klasser.

   Darav ordningen nedan: prova frysningen forst (billig, och racker for de flesta), och fall
   tillbaka pa att INVANTA stillheten levande nar frysningen forstor bilden. */
async function stilla(sida, tak = 12000, steg = 120) {
  const start = Date.now();
  const sedda = new Map();          // b64 -> { antal, fyllnad }
  let basta = null;                 // högsta fyllnad oavsett upprepning, för felmeddelandet
  while (Date.now() - start < tak) {
    const nu = await fota(sida);
    if (nu && nu.fyllnad.procent >= 3) {
      if (!basta || nu.fyllnad.procent > basta.fyllnad.procent) basta = nu;
      // EN BILD SOM SETTS TVÅ GÅNGER bevisar ett stillastående läge — de behöver inte vara
      // varandras grannar. Ett krav på två i FÖLJD missade Guardian Emblems hållfas var tredje
      // körning: hållet är kort, och en enda mellanliggande bildruta ur nästa fas bröt kedjan.
      // Identiska base64-strängar betyder identiska pixlar; PNG-kodningen i Chromium är
      // deterministisk för samma raster.
      const post = sedda.get(nu.b64);
      if (post) post.antal += 1; else sedda.set(nu.b64, { antal: 1, fyllnad: nu.fyllnad });
    }
    await sida.waitForTimeout(steg);
  }
  let vald = null;
  for (const [b64, post] of sedda) {
    if (post.antal < 2) continue;
    if (!vald || post.fyllnad.procent > vald.fyllnad.procent) vald = { b64, ...post };
  }
  if (vald) return { b64: vald.b64, fyllnad: vald.fyllnad, stilla: true,
    ms: Date.now() - start, seddaGanger: vald.antal, olikaBildrutor: sedda.size };
  return basta ? { ...basta, stilla: false, ms: Date.now() - start, olikaBildrutor: sedda.size } : null;
}

async function bygg(sida, nyckel, ALERTS) {
  const byggd = await sida.evaluate(k => window.__visBygg(k), nyckel);
  if (byggd.fel) return { fel: `kunde inte skapas — ${byggd.fel}` };

  const trasiga = await sida.evaluate(() => window.__visBilderKlara());
  if (trasiga.length) return { fel: `bilden går inte att avkoda — ${trasiga.join(', ')}` };

  // Videorna pausas och söks till en fast tidpunkt — se __visVideo. Görs FÖRE triggern, så en
  // effektvideo som alerten startar ändå fångas: anropet upprepas efter triggern nedan.
  await sida.evaluate(sek => window.__visVideo(sek), 0.5);

  const trigger = ALERTS[byggd.typ];
  if (trigger) {
    await sida.evaluate(() => window.__visTomKo());
    // VANTA TILLS KON SLUTAT SPELA. clear() tommer de vantande men nollstaller inte `busy`, och en
    // trigger som kommer medan busy ar satt lagger sig i ko i stallet for att spela. Uppmatt: nar
    // fotograferingen behovde bygga om en alert-widget svaldes den andra triggern av det 8 s langa
    // busy-fonstret fran den forsta — widgeten blev 0x0 och rapporterades som omalad, fast bade
    // widgeten och triggern var hela. Vantan gor det implicita explicit.
    await sida.waitForFunction(() => {
      const q = window.VyraAlertQueue;
      return !q || typeof q.stats !== 'function' || q.stats().spelar === false;
    }, null, { timeout: 15000, polling: 100 }).catch(() => {});
    const svar = await sida.evaluate(a => window.__visTrig(...a), trigger);
    if (svar !== 'ok') return { fel: `${trigger[0]} → ${svar}` };
    // Alerten kan ha bytt ut eller startat om videon. En andra sökning kostar nästan inget och är
    // skillnaden mellan en fryst bildruta och en som råkar vara den som spelades.
    await sida.evaluate(sek => window.__visVideo(sek), 0.5);
  }

  // EGEN REGI om familjen har en — se REGI i katalognycklar.js. Den ersätter den generella
  // frysningen helt: en widget vars förlopp drivs av klasser måste ställas av kod, inte spolas.
  const regi = REGI[byggd.typ];
  if (regi) {
    const r = await sida.evaluate(regi.regi, [regi.fas, regi.ms]);
    if (r && r.fel) return { fel: `regin för ${byggd.typ} klarade inte att ställa scenen — ${r.fel}` };
    return { typ: byggd.typ, trigger, regi: r };
  }
  return { typ: byggd.typ, trigger };
}

async function fotografera(sida, nyckel, ALERTS) {
  const b = await bygg(sida, nyckel, ALERTS);
  if (b.fel) return b;
  const { trigger } = b;

  // VÄNTA TILLS DEN SYNS — för ALLA widgetar, inte bara för dem som triggas.
  //
  // Skanningen kördes tidigare direkt efter render() för de vilande, och läste då en entréanimation
  // som ännu stod på sin första bildruta. Den bildrutan är osynlig, så både "som den står" och varje
  // fast tidpunkt gav opacitet 0 — och vilken nyckel som råkade drabbas VARIERADE mellan körningar.
  // En vakt vars utfall beror på hur fort maskinen hann rendera mäter maskinen, inte widgeten.
  const tandes = await sida.waitForFunction(() => {
    const m = window.__visSynlig();
    return !m.doljd && m.b > 2 && m.h > 2 && m.o > 0.02;
  }, null, { timeout: 12000, polling: 80 }).then(() => true).catch(() => false);
  if (!tandes) {
    const m = await sida.evaluate(() => window.__visSynlig());
    return { fel: trigger
      ? `${trigger[0]} kördes men widgeten tändes aldrig inom 12 s`
      : `blev aldrig synlig inom 12 s (${m.b}×${m.h}, dold: ${m.doljd}, opacitet ${m.o})` };
  }

  // EN REGEL FÖR ALLA, framletad i tre steg. En fast frystid bortom allt släckte Glove Snipe, vars
  // sista animation tonar ut. En skanning över korta tider spolade tillbaka `topgift:extra:retro`
  // till dess osynliga första bildruta. En delad regel efter widgettyp klarade inte heller båda —
  // `topgift:premium:arch` är vilande OCH tonar ut på slutet. Det som täcker alla tre är samma
  // skanning för alla, med slutbilden som sista steg och den SENASTE bildrutan med full opacitet
  // som val.
  const skann = b.regi
    ? { vald: `regi: fas ${b.regi.fas} vid ${b.regi.ms} ms`, stabilt: { antal: b.regi.animationer } }
    : await sida.evaluate(st => window.__visSkanna(st), STEGE);
  const matt = await sida.evaluate(() => window.__visSynlig());

  if (!matt.doljd && matt.b >= 2 && matt.h >= 2 && matt.o >= 0.02) {
    const ett = await fota(sida);
    // Frysningen står stilla per definition — men bara om den faktiskt frös något. Kontrollen är
    // ett andra foto: är de identiska står widgeten still, och då duger bilden som referens.
    if (ett && ett.fyllnad.procent >= 3) {
      await sida.waitForTimeout(140);
      const tva = await fota(sida);
      if (tva && tva.b64 === ett.b64) {
        return { b64: ett.b64, fyllnad: ett.fyllnad, bildruta: skann && skann.vald, hur: 'fryst' };
      }
    }
  }

  // FRYSNINGEN DUGDE INTE. Bygg om från början — den är förbrukad, animationerna är pausade — och
  // vänta i stället ut widgetens egen stillhet. Kostar bara för de nycklar som behöver det.
  const b2 = await bygg(sida, nyckel, ALERTS);
  if (b2.fel) return b2;
  const levande = await stilla(sida);
  if (!levande) {
    const m = await sida.evaluate(() => window.__visSynlig());
    const st = (skann && skann.stabilt) || {};
    return { fel: `målade aldrig något (${m.b}×${m.h}, dold: ${m.doljd}, opacitet ${m.o}, `
      + `frysning gav bildruta ${skann && skann.vald} med ${st.antal} animationer)` };
  }
  if (!levande.stilla) {
    return { fel: `stod aldrig stilla inom ${levande.ms} ms — ${levande.olikaBildrutor} olika `
      + `bildrutor fotograferades och ingen kom igen. Bästa målade ${levande.fyllnad.procent} %. `
      + `En referens av en widget i ständig rörelse går inte att jämföra mot.` };
  }
  return { b64: levande.b64, fyllnad: levande.fyllnad,
    bildruta: `levande, samma bildruta ${levande.seddaGanger} ggr av ${levande.olikaBildrutor} olika`,
    hur: 'levande' };
}

module.exports = { ROOT, REFKAT, DIFFKAT, MANIFEST, filnamn, refvag, motorn, lasManifest,
  motorKrock, RIGG, FYLLNAD, JAMFOR, fotografera, fota, stilla, STEGE, KANALTROSKEL };
