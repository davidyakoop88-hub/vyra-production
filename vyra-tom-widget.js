(function () {
  'use strict';
  // TÖM WIDGET, OCH EN TOM WIDGET SYNS INTE I SÄNDNINGEN (2026-09-09).
  //
  // DAVIDS ORD: "vi ska ha töma widget och profilbild och använder namn kommer när första giften
  // kommer." Beteendet han valde: töm automatiskt vid ny sändning, och en tom widget ska vara helt
  // osynlig i sändningen.
  //
  // PROBLEMET. Två skrivare fyller Top Gift och Top Streak med riktiga tittare —
  // live-leaderboard.js (`w.dataName = person.name`) och gift-event-images.js (samma för streaken)
  // — och båda kallar sedan save(). Efter en sändning står alltså en riktig persons namn och avatar
  // kvar i layouten. Nästa gång studion öppnas står deras namn i panelen i stället för
  // "@StreamQueen", och widgeten visar dem i overlayen innan första gåvan hunnit komma in.
  //
  // Gåvorekordet nollställs redan vid live:start (gift-event-images.js: records.giftCoins = 0), just
  // för att en ny sändnings första gåva ska räknas som rekord. Widgetens DATA hade ingen sådan
  // nollställare alls — den här filen är den saknade halvan av samma regel.
  //
  // SEX FAMILJER, INTE TVÅ (2026-09-21). Regeln byggdes för Top Gift och Top Streak, där tomheten
  // står i state och wh()-haken räcker. De fyra övriga som kan hamna i ett nollat läge framför
  // publiken — Top Like, Top Coins, Top Points och Battle MVP — stod kvar som tomma skal hela
  // sändningen. Deras tomhet står i DOM:en och inte i state, så de har en egen väg: avsnitt 5.

  // Fälten en sändning skriver. `giftName` följer med: den hör till samma gåva som bilden, och en
  // kvarglömd gåvorubrik utan bild ser ut som en bugg.
  const LIVEFALT = ['dataName', 'dataValue', 'profileImage', 'giftImage', 'giftName'];

  // Bara familjer som livedata faktiskt skriver till. En widget vars innehåll streamern själv har
  // skrivit (Egen text, Heart Goal) får aldrig tömmas av en sändningsstart.
  const TYPER = ['templateTopGift', 'templateTopStreak'];

  const arLivewidget = w => !!w && TYPER.includes(w.type);

  function tom(w) {
    if (!arLivewidget(w)) return false;
    let rord = false;
    for (const falt of LIVEFALT) {
      if (w[falt] !== undefined) { delete w[falt]; rord = true; }
    }
    return rord;
  }

  // Sant när widgeten inte har någon tittare att visa. `dataValue` räknas som tom även vid 0 —
  // noll coins är ingen gåva, och en nolla på skärmen ser ut som ett fel snarare än som tomhet.
  function arTom(w) {
    if (!arLivewidget(w)) return false;
    const namn = w.dataName, varde = w.dataValue;
    return (namn === undefined || namn === null || namn === '')
      && (varde === undefined || varde === null || varde === '' || Number(varde) === 0);
  }

  // Doljandet ar EN strang pa ETT stalle, sa att approved-rankings.js (vars wh-override aldrig
  // anropar kedjan nedanfor for Top Streak) kan dolja Clean Flip med exakt samma regel.
  const DOLJ = 'display:none!important;';
  function dolj(html) {
    return String(html).replace(/(<div\b[^>]*?style=")/, '$1' + DOLJ);
  }

  // ---- 1. Knappen i panelen -----------------------------------------------------------------
  //
  // Läggs i PRESET & PRESTANDA-gruppen, bredvid "Återställ widget". De två gör olika saker och det
  // ska synas: "Återställ widget" nollställer skala, genomskinlighet, dolt och lager — alltså hur
  // widgeten VISAS. Den här nollställer vem den visar.
  // KNAPPEN LÄGGS ALDRIG LÖST I PANELEN. Första versionen föll tillbaka på panel.append() när
  // "Återställ widget" ännu inte fanns — runtime-controls.js bygger sin grupp i en senare bindare,
  // och laddordningen varierar. Ett löst element räknas av vyra-panelordning.js som "huvud" och
  // hamnade därför ÖVERST i panelen, bredvid rubriken och märket. David: "detta gillade inte jag".
  //
  // Widgeten töms dessutom automatiskt vid varje sändningsstart, så knappen är en nödutgång man
  // sällan behöver. Den hör hemma INNE i PRESET-gruppen, som är hopfälld — den finns, men ligger
  // inte framme.
  function laggTill() {
    if (typeof view !== 'undefined' && view !== 'editor') return;
    const panel = document.querySelector('.properties');
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!panel || !arLivewidget(w) || panel.querySelector('#vyraTomWidget')) return;

    const granne = panel.querySelector('#runtimeResetWidget');
    if (!granne || !granne.parentNode) return;

    const knapp = document.createElement('button');
    knapp.id = 'vyraTomWidget';
    knapp.type = 'button';
    knapp.className = 'vyra-tom-widget';
    knapp.textContent = 'Töm widget';
    knapp.title = 'Nollställer namn, profilbild, gåva och värde. Nästa gåva fyller widgeten igen.';
    granne.parentNode.insertBefore(knapp, granne.nextSibling);

    knapp.onclick = () => {
      if (!tom(liveWidget(selected))) return;
      if (typeof save === 'function') save();
      if (typeof render === 'function') render();
    };
  }

  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      // Två försök: ett direkt, och ett i en mikrotask efter att alla bindare kört. Grannen byggs
      // av runtime-controls.js, som kan ligga senare i kedjan — utan andra försöket försvann
      // knappen helt de gångerna. Samma mönster som vyra-panelordning.js använder, och av exakt
      // samma skäl.
      laggTill();
      Promise.resolve().then(laggTill);
      return ut;
    };
  }

  // ---- 2. En ny sändning tömmer automatiskt -------------------------------------------------
  //
  // BARA live:start, aldrig live:end — samma regel som gift-event-images.js och goal-client.js
  // redan följer: ett avslut ska lämna sista resultatet kvar på skärmen. Nästa sändning MÅSTE
  // passera live:start, så "widgeten står inte kvar mellan två sändningar" håller ändå.
  window.addEventListener('vyra-live-session', function (handelse) {
    const detalj = handelse && handelse.detail;
    if (!detalj || detalj.event !== 'live:start') return;
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;

    let rord = false;
    for (const w of state.widgets) if (tom(w)) rord = true;
    if (!rord) return;
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
  });

  // ---- 3. Tom widget syns inte i sändningen -------------------------------------------------
  //
  // Villkoret är VYN, inte en inställning: i editorn måste widgeten synas för att gå att placera,
  // i overlayen ska tittarna inte se en tom plats. `wh()` bär redan samma mönster för w.hidden
  // (`${w.hidden ? 'display:none;' : ''}`), och det här hakar i samma ställe.
  //
  // OVERLAY-LÄGET LÄSES UR URL:EN, inte ur `view`. Uppmätt 2026-09-09: med ?overlay=1 står `view`
  // kvar på "editor" — den globalen följer studions vy-knappar, inte hur sidan öppnades, så ett
  // villkor på den hade aldrig slagit till i en riktig OBS-källa. layout-safe.js iOverlayLage()
  // löser redan samma sak på samma sätt, och motiverar det så här: "Las ur URL:en och inte ur en
  // global fran en annan fil: det gor funktionen oberoende av laddningsordningen."
  //
  // Rendering, inte borttagning: widgeten finns kvar i state och dyker upp av sig själv så fort
  // första gåvan skriver ett namn.
  const iOverlay = () => new URLSearchParams(location.search).has('overlay');

  if (typeof wh === 'function') {
    const foregaendeWh = wh;
    wh = function (w) {
      const html = foregaendeWh.apply(this, arguments);
      if (!iOverlay() || !arTom(w)) return html;

      // `!important` KRÄVS här, och det är inte slarv. Temaklasserna deklarerar sin layout med
      // samma vapen — `.premium-topgift{display:flex!important}`, `.topgift-cyber{display:grid
      // !important}` — så en vanlig inline-stil förlorar mot dem. Uppmätt: inline `display:none`
      // hamnade rätt i style-attributet men datorn räknade ändå fram `display:flex`.
      //
      // ELEMENTET STANNAR I DOM, det döljs bara. live-leaderboard.js uppdaterar widgeten genom att
      // slå upp `[data-id]` och returnerar tyst när noden saknas — utan den skulle första gåvan
      // skriva till state men aldrig nå skärmen, och widgeten förbli borta hela sändningen.
      return dolj(html);
    };
  }

  // ---- 4. Forsta gavan visar widgeten igen ----------------------------------------------------
  //
  // Livedatan ar en riktad DOM-patch (gift-event-images.js, live-leaderboard.js), ALDRIG en
  // render() - sa den dolda noden fick sitt namn men behall display:none. Uppmatt 2026-09-20 i
  // overlay: Top Gift tomd -> dold; efter en gava stod "wpwer17 ◉ 10" i noden och display var
  // fortfarande none. Varje sandning borjar med live:start, som tommer - sa utan det har steget
  // syntes Top Gift aldrig under en hel sandning. Avslojandet hor hemma har, bredvid doljandet:
  // samma falt (arTom) avgor bada. setTimeout(0), inte requestAnimationFrame: rAF fyrar inte i
  // en dold flik, och skrivarna satter state synkront i sina lyssnare, sa nasta makrotask ser det.
  // `w.hidden` ar streamerns eget val och rors inte - dess display:none kommer fran renderkedjan
  // (media.js liveVisibilityWh, eller cleanStreakHtml for Clean Flip), inte harifran.
  function avsloja() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    if (typeof document === 'undefined') return;
    // EN like-flod ar tusentals event i timmen, och efter forsta gavan finns ingenting att avsloja.
    // Kandidaterna raknas fram ur state (billigt) innan DOM:en rors alls; ar listan tom gor
    // funktionen ingenting. Utan den raden blev varje like tva hela querySelectorAll('[data-id]').
    const kandidater = state.widgets.filter(w => arLivewidget(w) && !arTom(w) && !w.hidden);
    if (!kandidater.length) return;
    const dolda = [...document.querySelectorAll('[data-id]')]
      .filter(el => el.style && el.style.display === 'none');
    if (!dolda.length) return;
    for (const w of kandidater) {
      for (const el of dolda) {
        if (el.dataset && el.dataset.id === w.id) el.style.removeProperty('display');
      }
    }
  }
  window.addEventListener('vyra-live-event', function () { setTimeout(avsloja, 0); });

  // ---- 5. DE FYRA ANDRA FAMILJERNA -----------------------------------------------------------
  //
  // Regeln "en tom widget syns inte i sandningen" gallde tva av sex familjer. Uppmatt i livetestet
  // 2026-09-21: Top Like, Top Coins, Top Points och Battle MVP stod kvar som TOMMA SKAL i overlay
  // — ram, rubrik och fem namnlosa rader med "♥ 0" — hela sandningen tills nagon gav nagot. Samma
  // sex familjer som live-zero-state.js nollar, och av samma skal: det ar de som bar demodata i
  // markup eller state och darmed kan hamna i ett nollat lage framfor publiken.
  //
  // MEN TOMHETEN STAR PA ETT ANNAT STALLE. For Top Gift och Top Streak ligger den i state
  // (`dataName`/`dataValue`), sa wh()-haken ovan racker. De har fyra far sitt innehall av
  // livedatans riktade DOM-patchar och av live-zero-state.js nollning — vid render-tillfallet bar
  // de fortfarande demoraderna, sa wh() kan omojligt veta om de ar tomma. Fragan maste darfor
  // stallas till DOM:en, efter att bade renderaren och nollningen kort.
  //
  // DARFOR EN OBSERVATOR OCH INGEN TIMER: allt som kan andra svaret ar en DOM-mutation — render()
  // bygger om widgeten (childList), live-zero-state.js nollar raderna (characterData) och livedatans
  // riktade patchar skriver namnen (characterData). En timer hade latit ett tomt skal sta kvar till
  // nasta varv och dessutom hallit sidan vaken: den visuella riggen fotograferar nar sidan star
  // still, och ett intervall som tickar i evighet ar precis det den inte far mota.
  const DOM_TYPER = {
    templateTopLike: 'rader', templateTopCoins: 'rader', templateTopPoints: 'rader',
    templateBattleMvp: 'mvp'
  };
  // EXAKT samma namnvaljare som live-zero-state.js SINGLE_WIDGETS bar for .battle-mvp, och det ar
  // med flit: den filen avgor vad som NOLLAS, den har avgor vad som doljs, och de tva maste peka pa
  // samma element. `.mvp-copy strong` star medvetet INTE med — i premiumdesignen ar det poangtalet,
  // inte namnet. Saknas bada elementen doljs ingenting alls, vilket ar ratt fail-safe.
  const MVP_NAMN = 'h2, .mvpf-row strong';
  const text = el => String((el && el.textContent) || '').trim();

  function domTom(el, sort) {
    if (sort === 'rader') {
      const rader = [...el.querySelectorAll('.toplike-row')];
      // Inga rader alls betyder att widgeten annu inte ar ritad — inte att den ar tom. Att dolja
      // pa den grunden hade slackt varje widget en halv render lang.
      if (!rader.length) return false;
      return rader.every(rad => !text(rad.querySelector('strong')));
    }
    const namn = el.querySelector(MVP_NAMN);
    return !!namn && !text(namn);
  }

  function stall() {
    if (!iOverlay()) return;
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    if (typeof document === 'undefined') return;
    for (const w of state.widgets) {
      const sort = DOM_TYPER[w.type];
      // `w.hidden` ar streamerns eget val och ror vi aldrig — dess display:none kommer fran
      // renderkedjan, och att ta bort den har hade tant en widget streamern slackt.
      if (!sort || !w || w.hidden) continue;
      const el = document.querySelector(`[data-id="${w.id}"]`);
      if (!el || !el.style) continue;
      const doljs = el.style.display === 'none';
      const tom = domTom(el, sort);
      // SKRIV ALDRIG SAMMA VARDE TILLBAKA. En identisk skrivning ar anda en DOM-mutation, som
      // vacker observatoren nedan och kallar hit igen — samma regel som live-zero-state.js och
      // live-leaderboard.js nollningsgren redan lyder under, och av samma skal.
      if (tom === doljs) continue;
      // `!important` av precis samma skal som i wh()-haken ovan: temaklasserna deklarerar sin
      // layout med `display:flex!important` och en vanlig inline-stil forlorar mot dem.
      if (tom) el.style.setProperty('display', 'none', 'important');
      else el.style.removeProperty('display');
    }
  }

  if (typeof document !== 'undefined' && iOverlay()) {
    let vantar = false;
    const schemalagg = () => {
      if (vantar) return;
      vantar = true;
      setTimeout(() => { vantar = false; stall() }, 0);
    };
    // Attribut lyssnas det INTE pa: det enda den har filen andrar ar style-attributet, och att
    // vackas av sin egen skrivning ar hur en observator blir en evighetsloop.
    try {
      new MutationObserver(schemalagg)
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
    window.addEventListener('vyra-live-event', schemalagg);
    window.addEventListener('DOMContentLoaded', stall);
    stall();
  }

  window.VyraTomWidget = { tom, arTom, dolj, avsloja, stall, domTom, LIVEFALT, TYPER, DOM_TYPER };
})();
