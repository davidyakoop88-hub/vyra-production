window.VyraPremiumHome = home = function () {
  const connected = Boolean(state.tiktok);
  const user = state.user || 'VYRA-konto';
  const connectionText = connected ? `TikTok sparad · ${state.tiktok}` : 'TikTok väntar';
  // Statusraden pastod "Overlay redo" for varje anvandare, aven en med noll widgets — den var
  // hardkodad. Nu speglar den state.widgets, som filen redan laser.
  const widgetAntal = Array.isArray(state.widgets) ? state.widgets.length : 0;
  const overlayText = widgetAntal
    ? `Overlay · ${widgetAntal} ${widgetAntal === 1 ? 'widget' : 'widgets'}`
    : 'Overlay tom';

  // Skenet ligger FORST och absolut i #view, bakom allt annat. Det ar rent dekorativt och
  // aria-hidden: en skarmlasare ska inte fa tre tomma element upplasta for sig.
  return `<div class="oversikt-sken" aria-hidden="true"><i></i><i></i><i></i></div>
  <section class="home-welcome">
    <div>
      <span class="eyebrow">VYRA LIVE-KOMMANDOCENTRAL</span>
      <h2>Din live är redo att <em>glänsa.</em></h2>
      <p>Bygg din overlay och anslut en riktig TikTok LIVE i VYRA Desktop.</p>
    </div>
    <div class="live-status">
      <span><i class="${connected ? '' : 'offline'}"></i>${connectionText}</span>
      <span><i class="${widgetAntal ? '' : 'offline'}"></i>${overlayText}</span>
    </div>
  </section>
  <!-- TOPPGIVARNA: de fem som gett mest SEDAN START, ur servern (gifter_totals via /stats).
       Raden summerade sjalv ur liveflodet 2026-08-20 -> 2026-10-10 och var da i praktiken alltid
       tom: den levde bara i en oppen, synlig flik medan sandningen pagick och tomdes av varje
       omladdning. Se live-blocket langre ner. Rubriken sager "sedan start" rakt ut: raden foljer
       inte periodknapparna i TOTALT-rutan, eftersom gifter_totals saknar summor per dag. -->
  <div class="toppgivare" data-toppgivare>
    <small class="toppgivare-rubrik">Dina toppgivare <span>sedan start · uppdateras under LIVE</span></small>
    <div class="toppgivare-rad toppgivare-skelett" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
    <p class="toppgivare-tom" data-tom="oversikt-toppgivare">Hämtar dina toppgivare…</p>
  </div>
  <!-- TOTALT: historiken, inte sessionen.
       Korten ovanfor visar SESSIONEN och star pa "—" sa fort man inte sander. Den har raden ar
       summorna som overlever en omladdning. Egna noder, aldrig samma som korten: live-vagen patchar
       dem under sandning, och skriver de tva over varandra betyder siffran olika saker beroende pa
       nar man tittar. "NU" och "TOTALT" ar skilda matningar. -->
  <section class="card alltime" data-alltime>
    <div class="alltime-head">
      <div><span class="eyebrow">TOTALT</span><h3>Din historik</h3></div>
      <div class="alltime-periods">
        ${[['all', 'Alltid'], ['90d', '90 dagar'], ['30d', '30 dagar'], ['7d', '7 dagar']]
          .map(([v, etikett], i) => `<button data-alltime-period="${v}"${i === 0 ? ' class="vald"' : ''}>${etikett}</button>`).join('')}
      </div>
    </div>
    <div class="alltime-stats">
      ${[['◆', 'GÅVOR', 'gifts'], ['💎', 'DIAMANTER', 'diamonds'], ['♥', 'LIKES', 'likes']]
        .map(item => `<div><small>${item[0]} ${item[1]}</small><strong data-alltime-stat="${item[2]}">—</strong></div>`).join('')}
    </div>
    <!-- TOPPGIVARNA SOM STANNAR KVAR.
         Listan hogst upp pa sidan matas av LIVEFLODET och star tom sa fort man inte sander — den
         svarar pa "vem ger just nu". Den har svarar pa "vem har gett mig mest", och overlever en
         omladdning.

         EGEN NOD, ALDRIG SAMMA SOM DEN LEVANDE. Samma regel som korten ovan: skriver de tva over
         varandra betyder listan olika saker beroende pa nar man tittar.

         ⚠️ DEN FOLJER INTE PERIODKNAPPARNA, och det star utskrivet i rubriken. gifter_totals bar
         KUMULATIVA summor per givare — first_seen/last_seen finns, men inte summor per dag. Att
         filtrera pa last_seen och visa livstidssumman hade sett helt ratt ut och varit falskt:
         nagon som gav 10 000 diamanter i fjol och en ros i forra veckan hade legat overst under
         "90 dagar". Ska listan kunna filtreras maste stream-stats.js lagra per givare OCH dag. -->
    <div class="historikgivare" data-historikgivare hidden>
      <h4>Dina toppgivare <span>sedan start</span></h4>
      <ol class="historikgivare-lista"></ol>
    </div>
    <p data-alltime-note data-tom="oversikt-historik">Hämtar din historik…</p>
  </section>
  <!-- SYNLIG FRAN OCH MED #428. Guiden var dold sa lange steg 2 beskrev nagot som inte gick
       att utfora: pluginet foljde inte med appen. Nu gor det det — electron-app/streamdeck-sync.js
       lagger det pa plats vid varje appstart, och tva prov vaktar att mappen faktiskt packas med.
       Blir guiden osann igen ar det attributet hidden som ska tillbaka, inte texten som ska
       skrivas om till nagot vagare. -->
  <section class="card streamdeck-card">
    <div class="sd-head">
      <div><span class="eyebrow">HÅRDVARA</span><h2>Styr din LIVE utan att röra musen</h2></div>
      <span class="sd-badge">Stream Deck &middot; eller din telefon</span>
    </div>
    <div class="sd-topp">
      <div>
        <p class="sd-intro">
          Under en sändning sitter du i bild. Med en fysisk knapp kör du dina Actions utan att växla
          fönster. Har du ingen Stream Deck fungerar telefonen som en — <b>Stream Deck Mobile</b>.
        </p>
        <p class="sd-intro sd-intro-2">
          Varje knapp får en <b>nyckel</b>. Ett Event i Action &amp; Event lyssnar på samma nyckel
          och bestämmer vad som spelas — och i vilken scen.
        </p>
      </div>
      <img class="sd-bild" src="assets/images/streamdeck-knappar.svg" width="260" height="176"
           loading="lazy" decoding="async"
           alt="En knappenhet med femton knappar. Fyra är VYRA-knappar märkta scen-1, scen-2, fyrverkeri och paus.">
    </div>

    <div class="sd-steg">
      <article>
        <b class="sd-nr">1</b>
        <h4>Installera Stream Deck</h4>
        <p>Ladda ner Elgatos program till datorn. Kör du från telefonen behövs programmet ändå —
           knapparna visas på telefonen men körs på datorn.</p>
      </article>
      <article>
        <b class="sd-nr">2</b>
        <h4>Öppna VYRA Desktop</h4>
        <p>Pluginet följer med appen och läggs på plats automatiskt vid start — även om du
           installerade Stream Deck efteråt. Starta om Stream Deck en gång, så dyker
           <b>VYRA</b> upp bland åtgärderna.</p>
      </article>
      <article>
        <b class="sd-nr">3</b>
        <h4>Ge knappen en nyckel</h4>
        <p>Dra in <b>Kör Action</b> på en knapp och skriv en nyckel, t.ex. <code>scen-1</code>.
           Nyckeln är knappens namn — en egen per knapp.</p>
      </article>
      <article>
        <b class="sd-nr">4</b>
        <h4>Peka ett Event på knappen</h4>
        <p>Skapa ett Event i <b>Action &amp; Event</b>, välj triggern <b>Manuell knapp</b> och
           matcha mot samma nyckel. Eventet väljer sedan vilken Action som spelas och i vilken scen.</p>
      </article>
    </div>

    <div class="sd-krav">
      <h4>Tre saker måste vara på plats när du trycker</h4>
      <ul>
        <li><b>VYRA Desktop igång.</b> Knappen pratar med appen på din egen dator — inget går via internet.</li>
        <li><b>OBS-källan öppen</b> för scenen. Actions spelas i overlay-utgången, inte i Studion.
            Trycker du med bara Studion framme händer ingenting, och det är med flit.</li>
        <li><b>Eventet aktivt.</b> Av/på sitter på Eventet, inte på Actionen — samma Action kan
            återanvändas av flera Events.</li>
      </ul>
      <p class="sd-not">Knappen visar själv om det gick: <b>✓</b> när VYRA tog emot trycket,
         <b>✗</b> när appen inte svarade.</p>
    </div>
  </section>
  <div class="command-grid">
    <article class="card live-preview-card">
      <div class="preview-top">
        <div><span class="eyebrow">OVERLAY</span><h3>Din scen</h3></div>
        <button data-go="editor">Öppna Studio <b>↗</b></button>
      </div>
      <div class="preview-stage">
        <div class="ambient a1"></div><div class="ambient a2"></div>
        <div class="phone">
          <div class="phone-live"><span>REDO</span></div>
          <div class="creator"><i>AV</i><span><b>${user}</b><small>VYRA LIVE</small></span></div>
          <div class="preview-widget"><small>DINA WIDGETAR</small><b>${state.widgets.length}</b><strong>redo</strong></div>
        </div>
        <div class="preview-note"><i></i><span><b>Transparent overlay</b><small>För OBS och TikTok LIVE Studio</small></span></div>
      </div>
    </article>
    <!-- LIVE-PULS-kortet ("Senaste händelser") stod har 2026-08 -> 2026-10-10 och ar borttaget pa
         Davids ord ("jag vill inte ens ha den dar"). Handelser i realtid har redan sin vy
         (Handelser) och sin overlay; framsidan ska visa det som star kvar nar man inte sander. -->
    <div class="command-side">
      <article class="card launch-card">
        <span class="eyebrow">SNABBSTART</span>
        <h3>Skapa något som syns.</h3>
        <p>Redigera din overlay och kopiera länken till OBS eller TikTok LIVE Studio.</p>
        <div><button class="primary" data-go="editor">Skapa overlay</button><button id="testGift">Testa widget</button></div>
      </article>
    </div>
  </div>`;
};

if (typeof view !== 'undefined' && view === 'home') render();

// ---- Livedata i Command Center ----------------------------------------------------------------
//
// Korten var 61 rader statisk markup — ett streck och "Visas under riktig LIVE" — utan att nagot
// nagonsin matat dem. Det har ar matningen, ett kort i taget.
//
// KORT-tabellen ar hela monstret. Ett nytt kort ar en rad, inte ett nytt block: vilka eventtyper
// det lyssnar pa och vilket falt som bar vardet. Allt annat — batchning, ateruppritning, teardown —
// delas.
//
// VARFOR JUST DE HAR FALTEN
//
//   viewers  viewer.count       TikTok skickar rummets aktuella antal
//   likes    likes.points       TikToks egen totalLikeCount for rummet
//
// Bada ar OGONBLICKSVARDEN som TikTok redan raknat. Kortet summerar alltsa aldrig sjalvt, och
// behover darfor inte besluta nagot tidsfonster eller skydda sig mot dubbelrakning vid
// ateranslutning. For likes finns aven faltet "count" (likes i den enskilda skuren) — det anvands
// med flit INTE, eftersom en egen summering hade krävt ett beslut om nollstallning mellan
// sandningar och skydd mot dubbelrakning.
//
// TVA STAVNINGAR for likes: bada bryggorna skickar typen "likes", molnets event-bus aliasar den
// till "like" (server/event-bus.js:6) men desktopvagen gar utan det aliaset. Kortet lyssnar pa bada
// — det ar exakt den sortens glapp som gjort fyra widgetar tysta tidigare.
//
// TRE REGLER ur arkitekturkontraktet:
//
//   1. ALDRIG render() harifran. render() satter viewRoot.innerHTML och river darmed hela vyn.
//      Bara ett textContent pa en nod byts.
//   2. Batchat via requestAnimationFrame. Uppmatt: 200 events i rad ger 4 DOM-mutationer, inte 200.
//   3. Teardown pa vyra-session-ended. Ingen lyssnare far overleva en utloggning eller ett kontobyte.
//
// Vardena lever bara i minnet. De ska inte overleva en omladdning, och tokenlaget (?access=) far
// aldrig skriva nagot — darfor ror den har vagen inte session-state.js alls.
// Raden med de fem som gett mest ritas ur SERVERN av historik-blocket nedan. Det har blocket
// lyssnar bara pa liveflodet och ber om en ny hamtning nar en gava kommit in. Funktionen
// tilldelas av historik-blocket; fram till dess ar den tyst.
let uppdateraToppgivareSnart = () => {};

(function () {
  // ---- LIVEFLODET -> TOPPGIVARRADEN ----------------------------------------------------------
  //
  // RADEN HOLL EN EGEN SUMMERING I MINNET 2026-08-20 -> 2026-10-10: en Map per givare som fylldes
  // av `vyra-live-event` och tomdes vid omladdning. Uppmatt i sandningen 2026-10-09: bryggan
  // vidarebefordrade 295 gavor, servern skrev 869 gavor och 98 073 diamanter till gifter_totals,
  // och raden i Davids Studio stod kvar som fem tomma platshallare hela kvallen. En rad som bara
  // lever i en oppen, synlig flik medan sandningen pagar, och som toms av varje omladdning,
  // flikfrysning och vybyte, ar i praktiken alltid tom — och servern hade redan hela svaret.
  //
  // Nu ritas raden ur /stats (gifter_totals, sedan start) av historik-blocket nedan. En gava i
  // liveflodet ber bara om en ny hamtning. EN sanning, ingen summering pa klienten: ingen
  // dubbelrakning vid ateranslutning, inget tidsfonster att besluta, inget som gar forlorat nar
  // fliken laddas om. Diamanter, inte intakt — samma skal som forut: kursen varierar, och ett
  // fel belopp i kronor ar ett fortroendeproblem som inte gar att laga i efterhand.
  //
  // LIVE PULSE-kortet som bodde har (egen handelsebuffert, atta rader) ar borttaget 2026-10-10
  // pa Davids ord. Lyssnaren sitter kvar pa MODULNIVA: den ska finnas fran forsta skriptraden,
  // inte forst nar Oversikten ritas (tests/premiumpaket-laddning.test.js).
  let levande = true;

  addEventListener('vyra-live-event', event => {
    if (!levande) return;
    const data = event.detail || {};
    const typ = String(data.type || data.event || '').toLowerCase();
    if (typ !== 'gift') return;
    // Gavan har just skrivits till gifter_totals pa servern (stream-stats.js skriver per event).
    // Raden hamtas om — en gang per skur, inte en gang per gava. Vardet laggs ALDRIG till har:
    // en trasig gava hade annars okat en summa for resten av sessionen, och ett medvardsrum
    // (tillVarden:false) ar serverns sak att sortera.
    uppdateraToppgivareSnart();
  });

  // Teardown pa vyra-session-ended: ingen hamtning far overleva en utloggning eller ett kontobyte.
  addEventListener('vyra-session-ended', () => { levande = false });
})();

// ---- TOTALT: historiken från servern -----------------------------------------------------------
//
// Davids invändning, ordagrant: "meningen med fram sidan skulle vissa mig så inte när man är live få
// det info". Korten ovanför mäter sessionen och står på "—" när man inte sänder. Den här raden är
// summorna som överlever en omladdning — server/stats-read.js över de tre aggregattabellerna.
//
// EGNA NODER, ALDRIG KORTENS. Live-vägen patchar korten under sändning. Delade de noder skulle de
// två skriva över varandra och siffran betyda olika saker beroende på när man tittar.
(function () {
  const PERIODER = new Set(['all', '90d', '30d', '7d']);
  let period = 'all';
  let levande = true;
  // Ökas vid varje hämtning: ett långsamt svar på en gammal period får inte skriva över ett nyare.
  let generation = 0;

  const nummer = n => Number(n || 0).toLocaleString('sv-SE');

  function skriv(stat, varde) {
    const nod = document.querySelector(`[data-alltime-stat="${stat}"]`);
    if (nod) nod.textContent = varde;
  }
  function notera(text) {
    const nod = document.querySelector('[data-alltime-note]');
    if (nod) nod.textContent = text;
  }

  // ---- TOPPGIVARRADEN: de fem som gett mest, ur servern --------------------------------------
  //
  // Raden overst pa sidan ritas HAR, ur samma /stats-svar som totalsummorna — se live-blocket
  // ovan for varfor den inte langre summerar sjalv. Den foljer INTE periodknapparna:
  // gifter_totals bar livstidssummor per givare och inga summor per dag, sa raden ritas bara om
  // nar svaret galler perioden 'all'. Rubriken sager "sedan start" rakt ut.
  //
  // RADERNA BAR ANVANDARDATA FRAN TIKTOK: visningsnamn och avatar-URL. Allt byggs darfor med
  // createElement och textContent — aldrig innerHTML. Bara http(s)-avatarer slapps in i en <img>:
  // data:, blob: och javascript: har ingen legitim anvandning har.
  const TOPP_ANTAL = 5;
  function saker(url) { const s = String(url || ''); return /^https?:\/\//i.test(s) ? s : '' }
  // 174200 -> "174.2 K", 15000 -> "15 K", 9600 -> "9.6 K". Raden rymmer fem kort, och fulla
  // siffror bryter layouten vid stora tal. EN decimal genomgaende, och en avslutande ".0" stryks.
  function kort9(n) {
    const skala = (v, suffix) => v.toFixed(1).replace(/\.0$/, '') + ' ' + suffix;
    if (n >= 1e6) return skala(n / 1e6, 'M');
    if (n >= 1e3) return skala(n / 1e3, 'K');
    return String(Math.round(n));
  }
  // Tomlaget i raden. Skelettet ar ett LADDNINGSTECKEN och doljs sa fort servern svarat — fem
  // andande platshallare over "inga gavor annu" hade sett ut som att nagot fortfarande hamtas.
  function toppgivareText(rad, text, { skelettBort = false } = {}) {
    const tom = rad.querySelector('.toppgivare-tom');
    if (tom) { tom.textContent = text; tom.hidden = false }
    if (skelettBort) { const s = rad.querySelector('.toppgivare-skelett'); if (s) s.hidden = true }
  }
  function malaToppgivare(data) {
    if (period !== 'all') return;
    const rad = document.querySelector('[data-toppgivare]');
    if (!rad) return;                        // annan vy — inte ett fel
    if (data.fel) {
      // En rad som redan ritats star kvar med sina siffror; bara ett tomt lage far felet.
      if (!rad.querySelector('.toppgivare-kort')) toppgivareText(rad, 'Kunde inte hämta toppgivarna just nu. Raden hämtas om vid nästa försök.', { skelettBort: true });
      return;
    }
    const givare = (Array.isArray(data.toppGivare) ? data.toppGivare : [])
      .map(g => ({ namn: String(g && g.namn || 'Okänd'), avatar: saker(g && g.avatar),
        diamanter: Math.max(0, Math.round(Number(g && g.diamonds) || 0)) }))
      .filter(g => g.diamanter > 0)
      .sort((a, b) => b.diamanter - a.diamanter)
      .slice(0, TOPP_ANTAL);
    if (!givare.length) {
      // Tomlaget ska vara ARLIGT. For ett nytt konto ar sanningen att inspelningen inte borjat,
      // inte att ingen gav nagot.
      toppgivareText(rad, data.konto
        ? 'Inga gåvor registrerade ännu — dina toppgivare visas här efter din första sändning.'
        : 'Ingen TikTok ansluten ännu. Toppgivarna börjar räknas när du sänder första gången.', { skelettBort: true });
      return;
    }
    // Andelen raknas mot ALLA diamanter sedan start (perioden ar 'all' har), aldrig mot bara de
    // fem — annars summerade raden alltid till 100 % oavsett hur manga som gett.
    const total = Math.max(Number(data.totalt && data.totalt.diamonds) || 0,
      givare.reduce((summa, g) => summa + g.diamanter, 0));
    const ny = document.createElement('div');
    ny.className = 'toppgivare-rad';
    for (const g of givare) {
      const kort = document.createElement('article');
      kort.className = 'toppgivare-kort';
      const bild = document.createElement('span');
      bild.className = 'toppgivare-avatar';
      if (g.avatar) {
        const img = document.createElement('img');
        img.src = g.avatar; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        bild.append(img);
      }
      const text = document.createElement('div');
      const namnrad = document.createElement('b');
      namnrad.textContent = g.namn;
      const varde = document.createElement('strong');
      varde.textContent = kort9(g.diamanter) + ' 💎';
      const andel = document.createElement('em');
      // Andelen rundas av HELTAL. "0 %" for nagon som faktiskt gett nagot ser ut som ett fel, sa
      // allt under en procent visas som "<1 %".
      const procent = total > 0 ? (g.diamanter / total) * 100 : 0;
      andel.textContent = '(' + (procent > 0 && procent < 1 ? '<1' : Math.round(procent)) + ' %)';
      text.append(namnrad, varde, andel);
      kort.append(bild, text);
      ny.append(kort);
    }
    // Skelettet bar klassen .toppgivare-rad med flit: forsta riktiga raden byter ut det, och en
    // senare hamtning byter ut den forra raden. Riktad DOM-patchning — aldrig render().
    const gammal = rad.querySelector('.toppgivare-rad');
    if (gammal) gammal.replaceWith(ny); else rad.append(ny);
    const tom = rad.querySelector('.toppgivare-tom');
    if (tom) tom.hidden = true;
  }


  // TOPPGIVARNA UR HISTORIKEN. Servern har returnerat dem sedan #136/#137 — topp 50 med namn,
  // avatar, gavor, diamanter och basta gava — och INGEN klient har ritat dem. Datan raknades,
  // skickades och kastades.
  //
  // RADERNA BAR ANVANDARDATA FRAN TIKTOK: visningsnamn och avatar-URL. Allt byggs darfor med
  // createElement och textContent, aldrig innerHTML — samma regel som den levande listan. Ett namn
  // som ser ut som markup ska visas som text, inte tolkas.
  //
  // ⚠️ LISTAN AR ALLTID SEDAN START, oavsett vald period. Se kommentaren vid markupen. Rubriken
  // sager det rakt ut i stallet for att listan tyst ska verka folja knapparna.
  const HISTORIK_TOPP = 10;

  function malaHistorikgivare(givare) {
    const ruta = document.querySelector('[data-historikgivare]');
    if (!ruta) return;                       // annan vy — inte ett fel
    const lista = ruta.querySelector('.historikgivare-lista');
    if (!lista) return;

    const rader = Array.isArray(givare) ? givare.slice(0, HISTORIK_TOPP) : [];
    // Tom lista doljs HELT i stallet for att visa en rubrik over ingenting. Ett tomt avsnitt med
    // rubrik laser sig som "du har noll givare", vilket for ett nytt konto ar fel: inspelningen har
    // inte borjat. Den arliga texten om det star redan i notraden under.
    if (!rader.length) { ruta.hidden = true; lista.replaceChildren(); return }

    const nya = [];
    for (const g of rader) {
      const li = document.createElement('li');

      const bild = document.createElement('span');
      bild.className = 'historikgivare-avatar';
      const url = String(g && g.avatar || '');
      // Bara http(s). En avatar-URL ar TikToks data, och javascript:/data: hor inte hemma i en src.
      if (/^https?:\/\//.test(url)) {
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        bild.append(img);
      }

      const namn = document.createElement('b');
      namn.textContent = String(g && g.namn || 'Okänd');

      const varde = document.createElement('strong');
      varde.textContent = nummer(g && g.diamonds) + ' 💎';

      const extra = document.createElement('em');
      // Basta gavan ar det som gor raden till en MINNESBILD i stallet for en siffra. Saknas den
      // visas antalet gavor — aldrig en tom rad som ser ut som att nagot inte laddat.
      // bastaGava ar ett OBJEKT {namn, diamanter}, inte en strang. Ett String() pa den hade skrivit
      // "[object Object]" i granssnittet — och det hade inte fallit nagot prov som bara kollar att
      // raden finns.
      const basta = g && g.bastaGava && String(g.bastaGava.namn || '');
      extra.textContent = basta || nummer(g && g.gifts) + ' gåvor';

      li.append(bild, namn, varde, extra);
      nya.push(li);
    }
    lista.replaceChildren(...nya);
    ruta.hidden = false;
  }

  function mala(data) {
    malaToppgivare(data);
    for (const stat of ['gifts', 'diamonds', 'likes']) skriv(stat, nummer(data.totalt?.[stat]));
    for (const knapp of document.querySelectorAll('[data-alltime-period]')) {
      knapp.classList.toggle('vald', knapp.dataset.alltimePeriod === period);
    }
    malaHistorikgivare(data.toppGivare);
    if (data.fel) return notera('Kunde inte hämta historiken just nu. Siffrorna ovan är inte hela sanningen.');
    // Tomläget ska vara ÄRLIGT. Nollor utan förklaring ser ut som ett resultat — och för ett nytt
    // konto är sanningen att inspelningen inte börjat, inte att ingen gav något.
    if (!data.forstaDagen) {
      return notera(data.konto
        ? 'Ingen historik ännu — den börjar byggas vid din nästa sändning.'
        : 'Ingen TikTok ansluten ännu. Historiken börjar när du sänder första gången.');
    }
    notera(period === 'all'
      ? `Allt sedan ${data.forstaDagen} · ${data.dagar?.length || 0} dagar med sändning`
      : `Sedan ${data.fran || data.forstaDagen} · ${data.dagar?.length || 0} dagar med sändning`);
  }

  async function hamta() {
    if (!levande) return;
    const min = ++generation;
    const workspace = window.VyraCloudSync?.current?.()?.workspace;
    // Inte inloggad eller ingen arbetsyta än: markupen står kvar med sitt streck. Det är ett normalt
    // läge i editorn och på en ny installation, inte ett fel att skrika om.
    if (!workspace?.id || !window.VyraAuth?.api) {
      const rad = document.querySelector('[data-toppgivare]');
      if (rad) toppgivareText(rad, 'Inga toppgivare att visa ännu. Logga in så hämtas de fem som gett dig mest.', { skelettBort: true });
      return notera('Ingen historik att visa ännu. Logga in så hämtas dina gåvor, diamanter och likes.');
    }
    try {
      const data = await window.VyraAuth.api(
        `/api/workspaces/${encodeURIComponent(workspace.id)}/stats?period=${encodeURIComponent(period)}`);
      // Ett äldre svar som kommer efter ett nyare får inte vinna.
      if (min !== generation || !levande) return;
      mala(data || {});
    } catch (_) {
      if (min !== generation || !levande) return;
      // Analysvyn får aldrig fälla framsidan. Ett kastat fel här hade tagit hela sidan med sig.
      mala({ fel: true });
    }
  }

  // Delegerad lyssnare på document: render() bygger om #view från grunden, så knapparna är nya
  // noder varje gång. En hake per knapp hade tystnat vid första omritningen.
  document.addEventListener('click', event => {
    const knapp = event.target?.closest?.('[data-alltime-period]');
    if (!knapp || !levande) return;
    const vald = knapp.dataset.alltimePeriod;
    if (!PERIODER.has(vald) || vald === period) return;
    period = vald;
    // Samma lydelse som markupens laddtext. De sa olika saker ("Hämtar…" hor mot "Hämtar din
    // historik…") beroende pa om sidan just laddats eller om man bytt period — samma nod, tva
    // roster. Upptackt av kallvakten i tests/tomma-tillstand.test.js.
    notera('Hämtar din historik…');
    hamta();
  });

  // SAMLAR FLERA ANROP TILL ETT. Uppmatt 2026-10-10 i Api-loggen: 45 anrop till /stats pa nio
  // sekunder vid EN sidladdning — render() kors manga ganger under uppstarten, och varje gang
  // ar [data-alltime] en ny nod. Generationsvakten i hamta() gjorde att bara det sista svaret
  // vann, men alla 45 fragorna gick anda till servern. Det utloggade laget gar fortfarande
  // direkt: det hamtar inget, bara skriver sin text, och ska inte vanta pa en timer.
  //
  // FORSTA anropet gar direkt (raden ska ritas sa fort vyn finns, inte efter en timer); de som
  // foljer inom fonstret samlas till ETT slapande anrop. Liveflodet anvander BARA det slapande:
  // gavan publiceras till strommen i samma andetag som den skrivs till gifter_totals, och en
  // hamtning som gar ivag omedelbart kan hinna fore skrivningen.
  let hamtTimer = null, senastHamtad = 0;
  function hamtaSnart(ms = 300, { direkt = true } = {}) {
    if (!levande) return;
    if (!window.VyraCloudSync?.current?.()?.workspace?.id) return hamta();
    const nu = Date.now();
    if (direkt && !hamtTimer && nu - senastHamtad >= ms) { senastHamtad = nu; return hamta() }
    clearTimeout(hamtTimer);
    hamtTimer = setTimeout(() => { hamtTimer = null; senastHamtad = Date.now(); hamta() }, ms);
  }
  // Liveflodet: en gava har just landat i gifter_totals, sa raden hamtas om — en gang per skur.
  uppdateraToppgivareSnart = () => hamtaSnart(1500, { direkt: false });
  // Langsam puls medan Oversikten ar synlig, sa raden ror sig under en sandning aven om
  // handelsestrommen till Studion skulle tappa ett event. Tyst i bakgrundsflikar och andra vyer.
  const pulsTimer = setInterval(() => {
    if (!levande || document.hidden || !document.querySelector('[data-toppgivare]')) return;
    hamtaSnart(0);
  }, 60_000);

  // Raden finns bara i home-vyn, och render() river den vid varje vybyte. Samma observer-mönster
  // som live-korten: fånga varje väg som kan bygga om vyn, även de som tillkommer senare.
  let sedd = null;
  const observer = new MutationObserver(() => {
    if (!levande) return;
    const rad = document.querySelector('[data-alltime]');
    if (rad && rad !== sedd) { sedd = rad; hamtaSnart() }
    else if (!rad) sedd = null;
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.querySelector('[data-alltime]')) { sedd = document.querySelector('[data-alltime]'); hamtaSnart() }

  addEventListener('vyra-session-ended', () => {
    levande = false;
    generation++;
    clearTimeout(hamtTimer);
    clearInterval(pulsTimer);
    uppdateraToppgivareSnart = () => {};
    observer.disconnect();
  });
})();

// LADDNINGSMARKÖREN (§6 i docs/tech-debt.md). Sex browsertester väntade förr på den här filen
// genom att läsa kopiatexten ur `home.toString()`. När eyebrown byttes i #154 stod grindarna
// evigt falska och 43 prov dog i 20-sekunderstimeouts — grindens signal var själva texten som
// byttes.
//
// Raden ligger SIST med flit: då betyder markören "hela modulen är installerad", inte bara att
// `home` bytts. Kastar någon av IIFE:erna ovan sätts den aldrig, vilket är rätt svar.
document.documentElement.dataset.ccReady = '1';
