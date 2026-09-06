// battle-mvp-session.js — ger Battle MVP en riktig trigger.
//
// Widgeten fanns färdig (sju emblemramar med uppmätt geometri, sju färgteman, upp/ned-skalning) men
// kunde bara nås från testknappen i panelen. media.js:566 tände den på `battle_mvp` eller `mvp`, och
// bryggan publicerar en enda battle-typ — `battle`, från WebcastEvent.LINK_MIC_BATTLE
// (bridge.js:252). De namnen möts aldrig. `battleStatus` färdades samtidigt hela vägen från
// normalizern via molnets cleanEvent till klientkontraktet och lästes av noll rader klientkod.
//
// Den här filen håller en battle-session: den öppnas när en match går aktiv, summerar coins per
// användare medan den är öppen, och stänger vid slutläge — då väljs MVP:n och overlayn tänds en
// gång. Samma monkey-patch-mönster som last-x-alerts.js: routeLiveBattleEvent skrivs om, den gamla
// anropas först, så ingenting som redan lyssnade slutar fungera.
//
// ---- VARFÖR KLASSIFICERINGEN ÄR TOLERANT ------------------------------------------------------
// battleStatus-VÄRDENA ÄR OMÄTTA. Enda värdet i hela repot är 'active' i ett servertest, hittat på
// av testförfattaren. `tiktok-live-connector ^2` typar battle-payloaden som en generisk
// EventHandler, så inte heller biblioteket ger facit. Att hårdkoda en gissning som `=== 'end'` hade
// gett exakt det fel som redan fanns: en widget som aldrig tänds.
//
// Därför nyckelord i stället för exakta strängar, och därför två regler:
//   1. Ett OKÄNT värde ändrar ingenting. Att gissa "slut" tänder MVP mitt i matchen, vilket är värre
//      än att inte tända alls.
//   2. Varje rått värde som setts sparas i VyraBattleMvp.seenStatuses. En enda riktig battle räcker
//      då för att läsa av sanningen och pinna den här.
//
// Säkerhetsnät om slutvärdet ändå aldrig känns igen: en ny match kan inte börja medan en gammal är
// öppen, så en start stänger den föregående och tänder dess MVP då.
(function (root) {
  'use strict';

  const SLUT = /(end|finish|over|settle|result|punish|complete|close)/;
  const AKTIV = /(start|begin|active|progress|ongoing|running|live)/;

  // Ordningen spelar roll: 'battle_ended' innehåller båda mönstren i vissa former, och slutläget ska
  // vinna — annars öppnas en ny session av sitt eget slutevent.
  function klassa(värde) {
    const v = String(värde == null ? '' : värde).toLowerCase();
    if (!v) return 'okänd';
    if (SLUT.test(v)) return 'slut';
    if (AKTIV.test(v)) return 'aktiv';
    return 'okänd';
  }

  // MVP = högst totalt coinvärde under matchen.
  //
  // TIE-BREAKER, i ordning:
  //   1. Högst coins.
  //   2. Tidigast första bidrag — den som började ge först vann kapplöpningen till samma summa.
  //   3. Användarnamn i bokstavsordning.
  // Steg 3 finns för att urvalet aldrig ska bero på inmatningsordningen. Utan det kan två helt lika
  // bidrag ge olika svar mellan körningar, och ett test på det blir flakigt i stället för fel.
  function valjMvp(bidrag) {
    const lista = [...bidrag];
    lista.sort((a, b) =>
      (b.coins - a.coins)
      || (a.forstAt - b.forstAt)
      || String(a.username).localeCompare(String(b.username), 'sv'));
    return lista[0] || null;
  }

  // ---- fanfar -----------------------------------------------------------------------------------
  // Samma robusthetskrav som gift-fireworks.js ljud: allt i try/catch, och play() returnerar ett
  // löfte som webbläsare AVVISAR när autoplay är blockerad (t.ex. i editorn utan användargest). Det
  // fångas tyst — animationen är det som syns och får aldrig falla för att ljudet nekades.
  //
  // Två steg, för att repot ännu inte har någon MVP-mp3 (assets/sounds/freesound/ innehåller bara
  // gift-fireworks.mp3). Läggs `battle-mvp.mp3` dit senare används den automatiskt; tills dess
  // syntetiseras en kort fanfar med Web Audio, så inställningen inte blir ännu en död knapp.
  const FANFAR_FIL = 'assets/sounds/freesound/battle-mvp.mp3';

  function syntetiseraFanfar() {
    try {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const nu = ctx.currentTime;
      const niva = root.VyraTal?.volymfaktor?.() ?? 1;
      // Tre stigande toner och ett avslutande ackord — en durtreklang, C5-E5-G5-C6.
      const toner = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]];
      for (const [hz, offset] of toner) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = hz;
        const start = nu + offset, slut = start + (offset === 0.36 ? 0.7 : 0.22);
        gain.gain.setValueAtTime(0, start);
        // Duckningen läses EN gång, vid schemaläggningen (§14). Salvan är ~1,1 s förschemalagda
        // ramper; att ändra dem mitt i kräver att varje ramp skrivs om, och vinsten är en dryg
        // sekund av en fallback som bara körs när ljudfilen saknas.
        gain.gain.linearRampToValueAtTime(0.22 * niva, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, slut);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(slut + 0.02);
      }
      setTimeout(() => { try { ctx.close() } catch (_) {} }, 1600);
    } catch (_) { /* inget ljud är alltid bättre än ett kastat fel */ }
  }

  function spelaFanfar() {
    try {
      if (typeof root.Audio !== 'function') return syntetiseraFanfar();
      const a = new root.Audio(FANFAR_FIL);
      // Duckas medan någon talar (§14). Fail-open: saknas vyra-tal.js spelar fanfaren på 0.6.
      if (!root.VyraTal?.duckaLjud?.(a, 0.6)) a.volume = 0.6;
      // Saknas filen får error-händelsen ta över — annars vore ljudet tyst utan att någon märkte det.
      a.addEventListener('error', syntetiseraFanfar, { once: true });
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (_) { syntetiseraFanfar() }
  }

  let session = null;                 // {bidrag: Map, oppnadAt} eller null när ingen match pågår

  // ---- vad TikTok faktiskt skickar --------------------------------------------------------------
  // Värdena är omätta (se filhuvudet), och den enda källan är en riktig battle. Därför överlever
  // anteckningen både en omladdning och att streamen tar slut: den skrivs till localStorage och kan
  // läsas i lugn och ro efteråt, i stället för att kräva att någon står vid konsolen mitt i matchen.
  // En OBS-browserkälla har egen localStorage, sa lasningen ska ske i samma vy som körde matchen.
  const LAGER = 'vyra-battle-status-seen';

  function lasSparade() {
    try {
      const rå = root.localStorage && root.localStorage.getItem(LAGER);
      const lista = rå ? JSON.parse(rå) : [];
      return Array.isArray(lista) ? lista.filter(v => typeof v === 'string') : [];
    } catch (_) { return [] }
  }

  const seenStatuses = lasSparade();  // varje rått battleStatus-värde, i den ordning det setts

  function anteckna(rå) {
    if (!rå || seenStatuses.includes(rå)) return;
    seenStatuses.push(rå);
    // Loggas ocksa: ett varde som klassas 'okänd' ar hela anledningen till att vi tittar.
    try {
      root.console && root.console.log(
        `[VYRA] battleStatus sett: ${JSON.stringify(rå)} → ${klassa(rå)}`);
    } catch (_) {}
    try {
      root.localStorage && root.localStorage.setItem(LAGER, JSON.stringify(seenStatuses.slice(-40)));
    } catch (_) {}
  }

  // battleId foljer med sessionen sa den EGNA fyrningen kan dedupas mot TikToks officiella
  // lista. Utan det tands widgeten tva ganger per match — se dedupen i media.js.
  function oppna(battleId) {
    session = { bidrag: new Map(), oppnadAt: Date.now(), battleId: battleId || '' };
  }

  // Stänger sessionen och tänder MVP — men bara om någon faktiskt gav något. En tom match ska inte
  // visa någon MVP alls. Sessionen nollas oavsett, så nästa match börjar rent.
  function stang() {
    const öppen = session;
    session = null;
    if (!öppen || !öppen.bidrag.size) return null;
    const mvp = valjMvp([...öppen.bidrag.values()]);
    if (!mvp || !(mvp.coins > 0)) return null;
    // Slås upp vid anropet, inte vid laddning: media.js kan ha laddats efter den här filen, och
    // runtime-controls.js byter dessutom ut funktionen mot en köad variant en stund efter start.
    if (typeof root.triggerBattleMvp === 'function') {
      // VISNINGSNAMNET, inte nyckeln. `username` är kvar som reserv för det fall gåvan aldrig bar
      // något namn — då är handtaget det enda vi har, och ett handtag är bättre än en tom ruta.
      // `harledd` markerar att det HAR ar var egen coin-rakning, inte TikToks facit. Sparren
      // nedan later da facit ga fore om det kommer — se kommentaren vid `annonserade`.
      root.triggerBattleMvp({ name: mvp.namn || mvp.username, score: mvp.coins,
        profileImage: mvp.profileImage || '', battleId: öppen.battleId || '', harledd: true });
    }
    spelaFanfar();
    return mvp;
  }

  // Beloppet: coins först, value som reserv. Molnets kontrakt döper coins till value, men
  // liveEventTriggers skriver samtidigt över value med gåvans NAMN för gift-payloads, så value kan
  // vara en sträng — därför krävs ett ändligt positivt tal. Samma resonemang som i gift-fireworks.js.
  function coinsAv(e) {
    for (const v of [e.coins, e.value, e.diamondCount]) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  // "Vår sida": bryggan är ansluten till streamerns EGET rum, så varje gift-event som når klienten
  // är per definition ett bidrag till oss. Motståndarens gåvor kommer aldrig hit.
  function rakna(e) {
    if (!session) return;
    const coins = coinsAv(e);
    if (!coins) return;
    // IDENTITET OCH VISNING ÄR OLIKA SAKER, och det var hela felet här. Nyckeln ska vara stabil —
    // därför `username` (TikToks handle) först. Men handtaget är INTE det folk känner igen; de
    // känner igen visningsnamnet. Tidigare sparades bara nyckeln, och stang() skickade den vidare
    // som `name`, så widgeten skrev ut ett @-handtag där resten av VYRA skriver ut ett namn.
    //
    // Inkonsekvensen syntes bara ibland, vilket gjorde den svår att tro på: när TikToks EGEN
    // armélista avgjorde MVP kom namnet från bryggan (nickname, alltså rätt), och när den här
    // räkningen avgjorde kom handtaget. Samma widget, två olika namn, beroende på vilken källa som
    // hann först.
    const username = String(e.username || e.name || e.userId || '').trim();
    if (!username) return;             // anonymt utan namn går inte att kora fram som MVP
    const nu = Date.now();
    const post = session.bidrag.get(username)
      || { username, namn: '', coins: 0, forstAt: nu, profileImage: '' };
    post.coins += coins;
    // Senast kända visningsnamn vinner: en person kan byta namn mitt i en match, och då är det nya
    // det tittarna ser i chatten.
    const visning = String(e.name || '').trim();
    if (visning) post.namn = visning;
    if (e.profileImage || e.avatar) post.profileImage = String(e.profileImage || e.avatar);
    session.bidrag.set(username, post);
  }

  function hanteraBattle(e) {
    const rå = e.battleStatus == null ? '' : String(e.battleStatus);
    anteckna(rå);
    const läge = klassa(rå);
    if (läge === 'slut') { stang(); return }
    if (läge === 'aktiv') {
      // En ny match kan inte börja medan en gammal är öppen. Säkerhetsnätet: den föregående stängs
      // och tänder sin MVP nu, i stället för att tyst tappas.
      if (session) stang();
      oppna(e.battleId);
    }
    // 'okänd': ingenting händer. Se filhuvudet.
  }

  // DEDUP PER battleId — EN alert per match, oavsett hur manga kallor som vill tanda.
  //
  // Tva kallor finns sedan #312 och #313: TikToks OFFICIELLA lista (bryggan skickar 'battle_mvp'
  // fran LINK_MIC_ARMIES, och media.js routeLiveBattleEvent tander pa den) och den egna
  // coin-rakningen i stang() nedan. Utan sparren tands widgeten TVA ganger per match — och de kan
  // ge OLIKA svar: var summa ar raa coins, TikToks siffra ar battle-poang med Boosting Glove
  // inraknad.
  //
  // LINDNINGEN, inte en egen kontroll pa varje anropsplats: bada kallorna gar genom
  // triggerBattleMvp, sa det ar den enda punkt som ser bada. Samma monster som runtime-controls.js
  // anvander for alertkon — och den lindar i sin tur DEN har, en stund efter start.
  //
  // NYCKELN AR battleId, INTE TID. Tva matcher kan ligga sekunder isar; en tidsbaserad sparr hade
  // tystat den andra. Ett event UTAN battleId slapps alltid fram: hellre en alert for mycket an
  // ingen alls.
  //
  // FACIT VINNER, INTE FORST. Fram till 2026-09-06 var sparren "forst till kvarn", och eftersom de
  // tva kallorna kommer i PRAKTIKEN SAMTIDIGT var det en kapplopning. Uppmatt over 13 matcher i en
  // skarp sandning: TikToks battle_mvp kom mellan 809 ms FORE och 3 ms EFTER var egen stang(),
  // median 1 ms fore. Vem som vann avgjordes alltsa av slumpen.
  //
  // Och svaren skiljer sig: i 2 av 13 matcher pekade var rakning pa en ANNAN person an TikTok — och
  // TikToks MVP lag da pa plats 2 hos oss. Det var precis vad David sag i overlayen. Orsaken ar att
  // TikTok VIKTAR gavor som skickas i boost-fonstret; uppmatta kvoter mellan var summa och deras
  // poang lag mellan 1,17 och 5,00, alltsa ingen konstant vi kan rakna oss till. #368
  //
  // Darfor: en HARLEDD MVP vantar en kort stund pa facit. Kommer det, vinner det och den harledda
  // kastas. Kommer det inte — ingen LINK_MIC_ARMIES i matchen — tands den harledda som forut.
  // Fordrojningen ar osynlig i sammanhanget och ger gott om marginal over de 3 ms som uppmatts.
  const annonserade = new Set();
  const vantande = new Map();
  const FACIT_NADTID_MS = 1200;
  {
    const original = root.triggerBattleMvp;
    const tand = (self, args) => {
      if (typeof original === 'function') return original.apply(self, args);
    };
    root.triggerBattleMvp = function (event = {}) {
      const bid = event && event.battleId ? String(event.battleId) : '';
      if (bid && annonserade.has(bid)) return;

      // Utan battleId gar det inte att para ihop kallorna — slapp fram direkt, som forut.
      if (!bid) return tand(this, arguments);

      if (event.harledd) {
        if (vantande.has(bid)) return;                    // redan en harledd i kon
        const args = arguments, self = this;
        vantande.set(bid, setTimeout(() => {
          vantande.delete(bid);
          if (annonserade.has(bid)) return;               // facit hann emellan
          annonserade.add(bid);
          tand(self, args);
        }, FACIT_NADTID_MS));
        return;
      }

      // FACIT. Riv en vantande harledd for samma match och tand direkt.
      const t = vantande.get(bid);
      if (t) { clearTimeout(t); vantande.delete(bid) }
      annonserade.add(bid);
      return tand(this, arguments);
    };
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    const typ = String(event.type || event.event || '').toLowerCase();
    if (typ === 'battle' || typ.includes('battle')) { hanteraBattle(event); return }
    if (typ === 'gift' || typ.includes('gift')) rakna(event);
  };

  addEventListener('vyra-session-ended', () => annonserade.clear());

  /* FORRA SANDNINGENS VINNARE FAR INTE STA KVAR PA SCENEN.
   *
   * triggerBattleMvp skriver in den VERKLIGA vinnarens namn pa widgetobjektet (`w.mvpName = namn`)
   * och anropar save(). Ingenting nollstallde det. En streamer som kort en battle fick darfor forra
   * sandningens riktiga tittarnamn synligt fran den sekund overlayen laddades — innan en enda ny
   * battle borjat. Fram till 2026-09-03 syntes det bara pa de sju ram-designerna; nu visar alla
   * sjutton namnet, sa det galler dem alla.
   *
   * VARDENA AR FABRIKENS, inte tomma strangar. `VyraSafe.text` faller tillbaka pa sitt reservvarde
   * for '', null OCH undefined — men ramgrenen anropar den med ETT argument
   * (`VyraSafe.text(w.mvpName??'TestAlpha')`), sa dar blir '' en TOM rad medan stilmodellerna visar
   * 'TestAlpha'. Att satta tillbaka exakt det fabriken skapar widgeten med ger samma bild i alla tre
   * renderarvagarna, och i en LIVE-overlay blankar live-zero-state.js 'TestAlpha' eftersom det star
   * i DEMO_NAMES. Provet nedan later fabriken vara facit, sa varden som glider isar faller.
   *
   * BARA live:start — INTE live:end. Huset har redan bestamt det: live-leaderboard.js och
   * last-x-alerts.js nollstaller ocksa enbart vid start, med motiveringen "nar sandningen tar slut
   * ska den sista listan sta kvar pa skarmen". Att nolla vid live:end hade raderat vinnaren i samma
   * sekund som sandningen slutade — precis nar tittarna ska se den. Kravet "gammalt namn overlever
   * inte mellan tva sandningar" ar uppfyllt anda, for nasta sandning MASTE passera live:start.
   *
   * ETT HANDSKRIVET NAMN OVERLEVER INTE HELLER, och det ar medvetet: vilken MVP-alert som helst
   * skriver redan over det, sa faltet ar live-drivet i praktiken. Vinsten — att ingen tittares namn
   * ligger kvar mellan sandningar — vager tyngre.
   *
   * save() KAN MISSLYCKAS, och det ar okej. I en OBS-kalla ar laget 'overlay-token-readonly' och
   * writeActive svarar not-writable. Nollstallningen i minnet plus render() gor anda ratt sak pa
   * skarmen; Studion ar den som persisterar. */
  const TOM_MVP = { mvpName: 'TestAlpha', mvpScore: 1500 };

  function nollstallMvpText() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return 0;
    let rorda = 0;
    for (const w of state.widgets) {
      if (!w || w.type !== 'templateBattleMvp') continue;
      if (w.mvpName === TOM_MVP.mvpName && w.mvpScore === TOM_MVP.mvpScore) continue;
      w.mvpName = TOM_MVP.mvpName;
      // Poangen visas inte i nagon design i dag (mvpShowCoins ar av overallt), men den skrivs av
      // triggerBattleMvp och sparas. Stada bort den ocksa — ett falt som inte syns i dag kan tandas
      // i morgon, och da ska det inte bara forra sandningens siffra.
      w.mvpScore = TOM_MVP.mvpScore;
      rorda++;
    }
    if (!rorda) return 0;
    try { if (typeof save === 'function') save() } catch (_) {}
    try { if (typeof render === 'function') render() } catch (_) {}
    return rorda;
  }

  root.VyraBattleMvp = {
    klassa, valjMvp, seenStatuses,
    aktiv: () => !!session,
    bidrag: () => (session ? [...session.bidrag.values()] : []),
    // Break-glass: stäng en session för hand om slutvärdet visar sig aldrig kännas igen live.
    avsluta: stang,
    // Läs efter en riktig match: varje sett värde och hur klassificeringen tolkade det. Ett värde
    // som står som 'okänd' är precis det som behöver pinnas i SLUT/AKTIV ovan.
    rapport: () => seenStatuses.map(v => ({ värde: v, tolkades_som: klassa(v) })),
    glomStatusar: () => {
      seenStatuses.length = 0;
      try { root.localStorage && root.localStorage.removeItem(LAGER) } catch (_) {}
    },
    // Exponerad for provet — och som break-glass om en gammal MVP nagon gang star kvar och ingen
    // ny sandning ar pa vag. Returnerar antalet widgetar som faktiskt stadades.
    nollstallText: () => nollstallMvpText(),
    TOM_MVP
  };

  // NY SANDNING => ingen match pagar. En battle kan inte overleva att sandningen tog slut, och en
  // kvarliggande `session` hade fatt nasta sandnings forsta gava att raknas in i den forra matchens
  // MVP-lista. Anteckningen om observerade battleStatus-varden (localStorage) ar en MATNING och
  // rors inte — den ar hela poangen med filen.
  root.addEventListener('vyra-live-session', event => {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    session = null;
    nollstallMvpText();
  });
})(window);
