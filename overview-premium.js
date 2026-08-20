home = function () {
  const connected = Boolean(state.tiktok);
  const user = state.user || 'VYRA-konto';
  const connectionText = connected ? `TikTok sparad · ${state.tiktok}` : 'TikTok väntar';
  // Statusraden pastod "Overlay redo" for varje anvandare, aven en med noll widgets — den var
  // hardkodad. Nu speglar den state.widgets, som filen redan laser.
  const widgetAntal = Array.isArray(state.widgets) ? state.widgets.length : 0;
  const overlayText = widgetAntal
    ? `Overlay · ${widgetAntal} ${widgetAntal === 1 ? 'widget' : 'widgets'}`
    : 'Overlay tom';

  return `<section class="home-welcome">
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
  <div class="toppgivare" data-toppgivare>
    <p class="toppgivare-tom">Toppgivarna visas här under riktig LIVE.</p>
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
    <p data-alltime-note data-tom="oversikt-historik">Hämtar din historik…</p>
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
    <div class="command-side">
      <article class="card activity premium-activity" data-pulse>
        <div class="card-head"><div><span class="eyebrow">LIVE-PULS</span><h2>Senaste händelser</h2></div></div>
        <p data-tom="oversikt-puls">Inga händelser ännu. Anslut VYRA Desktop så visas riktiga TikTok-händelser här direkt.</p>
      </article>
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
(function () {
  // ---- TOPPGIVARNA ----------------------------------------------------------------------------
  //
  // Ersatte de fyra summakorten (TITTARE/LIKES/GAVOR/DIAMANTER) 2026-08-20 pa Davids beslut:
  // en rad med de fem som gett mest, var och en med sin andel av totalen.
  //
  // DIAMANTER, inte INTAKT — samma skal som det gamla kortet bar: faltet gift.coins fylls fran
  // diamondCount i bada bryggorna, och diamanter ar vad kreatoren far. Coins ar vad tittaren koper
  // for, grovt dubbelt sa manga. Ingen av konkurrenterna rakar heller om till pengar: TikFinity
  // visar "Coins Earned", TikControl "Total Diamonds". Kursen varierar med region och avtal, och
  // ett fel belopp i kronor ar ett fortroendeproblem som inte gar att laga i efterhand.
  //
  // SUMMERING AR SAKER, och det ar inte sjalvklart: bada bryggorna vidarebefordrar bara SISTA
  // ramen av en streakbar gava (tiktok-bridge/bridge.js:314, electron-app/tiktok-service.js:97) —
  // annars hade en combo blivit ett triangeltal. Nar eventet nar hit motsvarar det en avslutad
  // gava eller combo, och `coins` bar REDAN hela combons varde (coinsEach x repeatCount). Det
  // laggs darfor till rakt av och multipliceras ALDRIG med count.
  const TOPP_ANTAL = 5;
  const givare = new Map();              // nyckel -> { namn, avatar, diamanter }
  let total = 0;

  // Nyckeln ar userId nar det finns, annars namnet. Tva tittare kan ha samma visningsnamn, och da
  // ska de inte slas ihop till en rad som ser ut som en storgivare.
  function nyckelFor(data) {
    return String(data.userId || data.username || data.uniqueId || data.user || '').toLowerCase();
  }

  // Avataren ar en URL fran ett event, alltsa data utifran. Bara http/https slapps igenom: allt
  // annat (data:, blob:, javascript:) har ingen legitim anvandning har, och en <img> ar inte ratt
  // plats att lita pa en frammande strang.
  function saker(url) {
    const s = String(url || '');
    return /^https?:\/\//i.test(s) ? s : '';
  }
  let koad = false;
  let levande = true;

  // ---- LIVE PULSE -----------------------------------------------------------------------------
  //
  // Kortet holl en fast mening: "Riktiga TikTok-handelser visas har nar VYRA Desktop ar anslutet."
  //
  // Fas A sa att detta skulle bli enkelt eftersom VyraLiveControl.getSnapshot() redan finns. Det
  // var fel: live-control.js finns som fil och serveras (200 i produktion), men INGENTING laddar
  // den — varken studio.html eller media.js namner den, sa VyraLiveControl definieras aldrig.
  // Pulsen haller darfor sin egen buffert.
  //
  // `viewer` och `chat` utesluts med flit. Tittarantalet ar inte en handelse utan ett tal som redan
  // har ett eget kort, och bada typerna kommer sa tatt att de skulle tranga ut allt annat.
  const PULS_MAX = 8;
  const puls = [];                       // nyaste forst
  const PULS_TEXT = {
    gift: data => '🎁 @' + namn(data) + (data.giftName ? ' · ' + data.giftName : '')
      + (Number(data.count) > 1 ? ' ×' + Math.round(Number(data.count)) : ''),
    follow: data => '＋ @' + namn(data) + ' började följa',
    like: data => '♥ @' + namn(data),
    likes: data => '♥ @' + namn(data),
    share: data => '↗ @' + namn(data) + ' delade',
    subscribe: data => '★ @' + namn(data) + ' prenumererar'
  };
  function namn(data) {
    return String(data.username || data.uniqueId || data.user || 'okänd').replace(/^@/, '');
  }

  function mala() {
    koad = false;
    if (!levande) return;
    malaToppgivare();
    malaPuls();
  }

  // Raderna bar ANVANDARDATA fran TikTok: visningsnamn och avatar-URL. Allt byggs darfor med
  // createElement och textContent — aldrig innerHTML. Ett namn som ser ut som markup ska visas
  // som text, inte tolkas.
  function malaToppgivare() {
    if (!givare.size) return;
    // Vyn kan vara en annan just nu (editor, overlay). Da finns ingen rad, och det ar inte ett fel.
    const rad = document.querySelector('[data-toppgivare]');
    if (!rad) return;

    const topp = [...givare.values()].sort((a, b) => b.diamanter - a.diamanter).slice(0, TOPP_ANTAL);
    const ny = document.createElement('div');
    ny.className = 'toppgivare-rad';

    for (const g of topp) {
      const kort = document.createElement('article');
      kort.className = 'toppgivare-kort';

      const bild = document.createElement('span');
      bild.className = 'toppgivare-avatar';
      if (g.avatar) {
        const img = document.createElement('img');
        img.src = g.avatar;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        bild.append(img);
      }
      kort.append(bild);

      const text = document.createElement('div');
      const namnrad = document.createElement('b');
      namnrad.textContent = g.namn;
      const varde = document.createElement('strong');
      varde.textContent = kort9(g.diamanter) + ' 💎';
      const andel = document.createElement('em');
      // Andelen rundas av HELTAL. En rad som sager "0 %" for nagon som faktiskt gett nagot ser ut
      // som ett fel, sa allt under en procent visas som "<1 %".
      const procent = total > 0 ? (g.diamanter / total) * 100 : 0;
      andel.textContent = '(' + (procent > 0 && procent < 1 ? '<1' : Math.round(procent)) + ' %)';
      text.append(namnrad, varde, andel);
      kort.append(text);
      ny.append(kort);
    }

    const gammal = rad.querySelector('.toppgivare-rad');
    if (gammal) gammal.replaceWith(ny); else rad.append(ny);
    const tomtext = rad.querySelector('.toppgivare-tom');
    if (tomtext) tomtext.hidden = true;
  }

  // 174200 -> "174.2 K", 15000 -> "15 K", 9600 -> "9.6 K". Raden rymmer fem kort, och fulla
  // siffror bryter layouten vid stora tal. EN decimal genomgaende, och en avslutande ",0" stryks:
  // "15,0 K" laser sig som falsk precision pa ett tal som ar jamnt.
  function kort9(n) {
    const skala = (v, suffix) => v.toFixed(1).replace(/\.0$/, '') + ' ' + suffix;
    if (n >= 1e6) return skala(n / 1e6, 'M');
    if (n >= 1e3) return skala(n / 1e3, 'K');
    return String(Math.round(n));
  }

  // Raderna bar ANVANDARDATA fran TikTok. Listan byggs darfor med createElement och textContent —
  // aldrig innerHTML. Ett anvandarnamn som ser ut som markup ska visas som text, inte tolkas.
  function malaPuls() {
    if (!puls.length) return;
    const kort = document.querySelector('[data-pulse]');
    if (!kort) return;
    const lista = document.createElement('ul');
    lista.className = 'pulse-list';
    for (const rad of puls) {
      const post = document.createElement('li');
      post.textContent = rad;
      lista.append(post);
    }
    const gammal = kort.querySelector('.pulse-list');
    if (gammal) gammal.replaceWith(lista);
    else kort.append(lista);
    // Tomtexten har gjort sitt sa fort det finns riktiga handelser.
    const tomtext = kort.querySelector('p');
    if (tomtext) tomtext.hidden = true;
  }

  function schemalagg() {
    if (koad || !levande) return;
    koad = true;
    requestAnimationFrame(mala);
  }

  addEventListener('vyra-live-event', event => {
    if (!levande) return;
    const data = event.detail || {};
    const typ = String(data.type || data.event || '').toLowerCase();
    const berattare = PULS_TEXT[typ];
    if (berattare) {
      puls.unshift(berattare(data));
      if (puls.length > PULS_MAX) puls.length = PULS_MAX;
      schemalagg();
    }

    if (typ !== 'gift') return;
    // Ett trasigt event far inte oka en summa. En felaktig addition sitter kvar hela sessionen —
    // till skillnad fran ett vardet-skrivs-over-kort finns ingen sjalvlakning har.
    const varde = Number(data.coins);
    if (!Number.isFinite(varde) || varde <= 0) return;
    const nyckel = nyckelFor(data);
    if (!nyckel) return;

    const forra = givare.get(nyckel);
    const avatar = saker(data.profileImage || data.avatarUrl || data.profileUrl);
    if (forra) {
      forra.diamanter += Math.round(varde);
      // Avataren kan komma forst i ett senare event. Den skrivs bara over av ett riktigt varde,
      // aldrig tillbaka till tomt.
      if (avatar) forra.avatar = avatar;
      forra.namn = namn(data);
    } else {
      givare.set(nyckel, { namn: namn(data), avatar, diamanter: Math.round(varde) });
    }
    total += Math.round(varde);
    schemalagg();
  });

  // render() bygger om #view fran grunden, sa korten ar nya noder varje gang. Utan den har skulle
  // vardena forsvinna sa fort anvandaren navigerar bort och tillbaka. En observer i stallet for en
  // hake i render(): den fangar varje vag som kan bygga om vyn, aven de som tillkommer senare.
  const observer = new MutationObserver(() => {
    if (puls.length || givare.size) schemalagg();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  addEventListener('vyra-session-ended', () => {
    levande = false;
    givare.clear();
    total = 0;
    puls.length = 0;
    observer.disconnect();
  });
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

  function mala(data) {
    for (const stat of ['gifts', 'diamonds', 'likes']) skriv(stat, nummer(data.totalt?.[stat]));
    for (const knapp of document.querySelectorAll('[data-alltime-period]')) {
      knapp.classList.toggle('vald', knapp.dataset.alltimePeriod === period);
    }
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
    if (!workspace?.id || !window.VyraAuth?.api) return notera('Ingen historik att visa ännu. Logga in så hämtas dina gåvor, diamanter och likes.');
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

  // Raden finns bara i home-vyn, och render() river den vid varje vybyte. Samma observer-mönster
  // som live-korten: fånga varje väg som kan bygga om vyn, även de som tillkommer senare.
  let sedd = null;
  const observer = new MutationObserver(() => {
    if (!levande) return;
    const rad = document.querySelector('[data-alltime]');
    if (rad && rad !== sedd) { sedd = rad; hamta() }
    else if (!rad) sedd = null;
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.querySelector('[data-alltime]')) { sedd = document.querySelector('[data-alltime]'); hamta() }

  addEventListener('vyra-session-ended', () => {
    levande = false;
    generation++;
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
