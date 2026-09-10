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
      return String(html).replace(/(<div\b[^>]*?style=")/, '$1display:none!important;');
    };
  }

  window.VyraTomWidget = { tom, arTom, LIVEFALT, TYPER };
})();
