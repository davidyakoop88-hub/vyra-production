(function () {
  'use strict';

  function key(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  }

  var gifts = Array.isArray(window.VYRA_GIFTS) ? window.VYRA_GIFTS : [];
  var byName = new Map(gifts.map(function (gift) {
    return [key(gift.name), gift];
  }));

  // Manifestet ar en fast lista fran juli. Gavor TikTok slappt sedan dess finns i molnets katalog
  // (/api/gavor, cachad av gavovaljaren i 'vyra-gift-cloud-v1'), och anvands nar manifestet saknar
  // namnet — samma form ({name, file}) sa ingen anropare behover veta varifran bilden kom.
  // Kartan byggs om hogst en gang i minuten: resolve() kors vid varje gava, och listan kan vara
  // flera tusen poster.
  var moln = { at: 0, karta: new Map() };
  function molnGava(name) {
    if (Date.now() - moln.at > 60000) {
      moln.at = Date.now();
      moln.karta = new Map();
      try {
        var lista = JSON.parse(window.localStorage.getItem('vyra-gift-cloud-v1') || '[]');
        for (var i = 0; i < lista.length; i++) {
          var g = lista[i];
          if (g && g.name && g.image && !moln.karta.has(key(g.name))) moln.karta.set(key(g.name), { name: g.name, file: g.image });
        }
      } catch (e) {}
    }
    return moln.karta.get(key(name)) || null;
  }

  function resolve(name) {
    return byName.get(key(name)) || molnGava(name);
  }

  window.VyraGiftImages = {
    count: gifts.length,
    resolve: resolve,
    arma: arma
  };

  // Sändningens rekord. Exponerade, inte privata, eftersom gift-event-images.js inte är ensam
  // skrivare till templateTopGift — live-leaderboard.js:130 skriver också dit, på varje gåva. Utan
  // en gemensam sanning hade separationen gällt i testet men inte i produktion: Top Gift skulle
  // fortsätta byta namn på varje billig gåva.
  var records = { giftCoins: 0, streakCoins: 0 };
  window.VyraGiftRecords = records;

  // OCH DE OVERLEVER EN SIDLADDNING. Hogvattenmarkena ovan lag i en vanlig variabel: en omladdning
  // mitt i sandningen satte bada till 0, och da rakades NASTA gava — en enkrona — som ett nytt
  // rekord och skrev over den 30 000-coins-gava som faktiskt ledde. Uppmatt i livetestet
  // 2026-09-21. Widgetens synliga tal kom tillbaka med konfig-omhamtningen; det var TROSKELN har
  // som nollstalldes av fel handelse.
  //
  // Samma regel och samma lagringsval som live-leaderboard.js `totals`: nyckeln bar sessionId, sa
  // forra sandningens rekord kan aldrig atertas i den har, och sessionStorage ger exakt sidans
  // kontext — overlever F5, forsvinner nar OBS river kallan. Till skillnad fran topplistan kan de
  // har talen inte dubbelraknas: de ar hogvattenmarken, inte summor.
  var REKORD_NYCKEL = 'vyra-gift-records-v1';

  function aktivSession() {
    try { return window.VyraLiveSession && window.VyraLiveSession.runtime
      ? (window.VyraLiveSession.runtime().aktivSession() || null) : null } catch (e) { return null }
  }
  function skrivRekord() {
    var session = aktivSession();
    try {
      if (!session) window.sessionStorage.removeItem(REKORD_NYCKEL);
      else window.sessionStorage.setItem(REKORD_NYCKEL, JSON.stringify({
        sessionId: session, giftCoins: records.giftCoins, streakCoins: records.streakCoins }));
    } catch (e) {}
  }
  function aterstallRekord() {
    var session = aktivSession();
    if (!session) return false;
    try {
      var sparad = JSON.parse(window.sessionStorage.getItem(REKORD_NYCKEL) || 'null');
      if (!sparad || sparad.sessionId !== session) return false;
      records.giftCoins = Number(sparad.giftCoins) || 0;
      records.streakCoins = Number(sparad.streakCoins) || 0;
      return true;
    } catch (e) { return false }
  }
  // Tva forsok. Filen laddas FORE live-session-client.js i studio.html (rad 155 mot 204), sa vid
  // korning finns VyraLiveSession annu inte — det forsta forsoket ar for provriggen och for en
  // framtida laddordning, det andra ar det som faktiskt tar hem rekorden i webblasaren. Forsta
  // gavan kommer langt senare an DOMContentLoaded, sa ingenting hinner jamforas mot en tom troskel.
  if (!aterstallRekord()) window.addEventListener('DOMContentLoaded', aterstallRekord);

  // Top Gift rankar GÅVANS värde, inte combons summa. Davids regel 2026-08-07: "1 ros 1 coins,
  // 11 rosor 1 coins" — elva rosor är elva gånger samma ros och får aldrig slå ut en gåva som
  // ensam kostar mer.
  //
  // Bryggan skickar med flit totalen (`coins:coinsEach*repeatCount` i tiktok-bridge/normalizer.js),
  // för Top Coins, fyrverkeriernas fwMin, målen och giftCoins-triggern läser alla den. Styckpriset
  // räknas därför fram HÄR i stället för att fältet över nätet ändras, och definitionen exponeras
  // så att live-leaderboard.js — den andra skrivaren till samma widget — inte kan hamna på ett
  // annat tal. Två högvattenmärken för samma värde var precis buggen den här grinden en gång löste.
  records.styckvarde = function (coins, antal) {
    var total = Number(coins);
    if (!Number.isFinite(total) || total <= 0) return 0;
    var n = Math.round(Number(antal));
    if (!Number.isFinite(n) || n < 1) n = 1;              // count saknas, är 0 eller skräp
    return Math.round(total / n);
  };

  // ETT BESLUT PER HANDELSE, och det fattas har (uppmatt 2026-10-18 i Edge mot overlayn).
  //
  // Top Gift har tva skrivare som lyssnar pa samma vyra-live-event: lyssnaren langst ner i den har
  // filen och live-leaderboard.js:updateTopGift. Tidigare jamforde de var for sig mot
  // records.giftCoins — den har strikt (>), live-leaderboard med `value < giftCoins`, alltsa LIKA
  // slapptes igenom. Den regeln var tvungen: den har filen laddas forst och hojer rekordet innan
  // live-leaderboard ser handelsen, sa `<=` dar hade blockerat varje riktigt rekord. Foljden var att
  // en gava lika stor som rekordet (Heart Me 1 coin fran en ny tittare) bytte bild och person i
  // live-leaderboard men inte har — ny bild, gammalt namn.
  //
  // bedom() avgor en gang per handelseobjekt och minns svaret, sa ordningen mellan lyssnarna inte
  // spelar nagon roll: den som fragar forst fattar beslutet och hojer rekordet, den andra far samma
  // svar. Regeln ar strikt storre for bade Top Gift och Top Streak. Faltnamnen ar oforandrade.
  var beslutPerHandelse = typeof WeakMap === 'function' ? new WeakMap() : null;
  records.bedom = function (detail) {
    var arObjekt = !!detail && typeof detail === 'object';
    if (arObjekt && beslutPerHandelse && beslutPerHandelse.has(detail)) return beslutPerHandelse.get(detail);
    var kalla = detail;
    if (!arObjekt) detail = {};
    var coins = Number(detail.diamonds || detail.coins || 0) || 0;   // #133: coins = aldre .exe
    var antal = Number(detail.count || detail.repeatCount || detail.combo || 0) || 1;
    var giftVarde = records.styckvarde(coins, antal);
    var comboVarde = antal >= 2 ? coins : 0;
    var beslut = {
      gift: giftVarde > records.giftCoins,
      streak: comboVarde > records.streakCoins,
      giftVarde: giftVarde,
      comboVarde: comboVarde
    };
    if (beslut.gift) records.giftCoins = giftVarde;
    if (beslut.streak) records.streakCoins = comboVarde;
    if (beslut.gift || beslut.streak) skrivRekord();
    if (arObjekt && beslutPerHandelse) beslutPerHandelse.set(kalla, beslut);
    return beslut;
  };

  // ---- riktad DOM-patchning ------------------------------------------------------------------
  // Den här vägen slutade tidigare på save() + render() för VARJE gåva. render() ritar om hela
  // canvasen, vilket river ner den animation som just spelar — precis det VyraFlip byggdes för att
  // undvika — och save() skrev state en gång per gift, alltså hundratals gånger under en combo.
  // Live data ska aldrig göra något av det: den patchar de noder som redan står på skärmen.

  // Samma selektorkarta som SINGLE_WIDGETS i live-zero-state.js, och av samma skäl: båda
  // widgetarna har två designvarianter. templateTopGift renderas antingen med .topgift-copy eller
  // som .topgift-framed med .tgf-plate; templateTopStreak antingen med .streak-copy + .streak-score
  // eller som .sframe-row. Bara ramklasserna skiljer — bildansiktena är gemensamma.
  //
  // Namn och värde måste pekas ut exakt. Ett blankt querySelector('em') inne i .vyra-streak
  // träffar <em>GOOD</em> i .streak-mechanism, inte något värde alls.
  var SHAPES = {
    templateTopGift: {
      root: '.vyra-topgift',
      gift: '.vyra-gift-face img',
      profile: '.vyra-profile-face img',
      name: '.topgift-copy strong, .tgf-plate strong',
      value: '.topgift-copy em, .tgf-plate em'
    },
    templateTopStreak: {
      root: '.vyra-streak',
      gift: '.streak-gift-face img',
      profile: '.streak-profile-face img',
      // Clean Flip (approved-rankings.js) ar den enda Top Streak som nar skarmen sedan 2026-09-20:
      // namnet i .approved-streak-copy strong och talet i ett eget <b> inne i <em>x<b>18</b> STREAK</em>,
      // sa att prefixet och 'STREAK' star kvar nar patchen skriver talet. Uppmatt fore den har
      // raden: patchen traffade inga noder alls, och Clean Flip stod pa demovardena hela sandningen.
      name: '.streak-copy strong, .sframe-row strong, .approved-streak-copy strong',
      value: '.streak-score b, .sframe-row b, .approved-streak-copy b'
    }
  };
  // live-leaderboard.js skriver namn och varde i samma Top Gift och laser vaeljarna harifran, sa att
  // tva skrivare aldrig kan peka pa olika noder (den pekade tidigare pa ':scope > strong', som inte
  // finns i nagon av designerna neon/royal/fokus: ny bild, gammalt namn).
  window.VyraGiftImages.shapes = SHAPES;

  // Widget-id jämförs exakt. Ett id får aldrig byggas in i en selektorsträng — det är en
  // injektionsyta, och en selektor matchar dessutom '#a' i '#a-kopia' på fel sätt.
  function nodesFor(widget, selector) {
    var found = [];
    if (typeof document === 'undefined' || !widget || !widget.id) return found;
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].dataset && nodes[i].dataset.id === widget.id) found.push(nodes[i]);
    }
    return found;
  }

  function setText(node, value) {
    if (!node) return;
    var next = String(value);
    if (node.textContent !== next) node.textContent = next;
  }

  function setImage(node, url) {
    if (node && url && node.src !== url) node.src = url;
  }

  // EN NOD I TAGET. Skriver givare, gåva och värde i en enda widgetnod — ingen sökning i
  // state.widgets, ingen skrivning till widgetobjektet, ingen save(). Livevägen nedan
  // (patchProfileWidget) anropar den för varje nod som hör till widgeten, och testet
  // (topGiftSpelaPa, ▶ Testa widget) anropar den för klonens nod. Samma kod i båda, så det testet
  // visar är exakt det en riktig gåva skriver.
  //
  //   d.giftImage / d.profileImage  bildlänkar; tomt = rör inte bilden
  //   d.name                         namnet som det ska stå
  //   d.amount                       värdet; tecknet framför siffran behålls (se nedan)
  function skrivProfilNod(node, shape, d) {
    if (!node || !shape) return;
    setImage(node.querySelector(shape.gift), d.giftImage);
    setImage(node.querySelector(shape.profile), d.profileImage);
    node.querySelectorAll(shape.name).forEach(function (el) { setText(el, d.name); });
    node.querySelectorAll(shape.value).forEach(function (el) {
      // Ett ikon-<i> först i <em> (Top Coins-familjen: myntet) står kvar; talet skrivs i textnoden
      // efter det, samma regel som skrivTal i live-leaderboard.js.
      var ikon = el.firstElementChild;
      if (shape.ikon && ikon && ikon.tagName === 'I') {
        var text = ' ' + d.amount;
        var sista = el.lastChild;
        if (sista && sista.nodeType === 3) { if (sista.nodeValue !== text) sista.nodeValue = text; }
        else el.appendChild(document.createTextNode(text));
        return;
      }
      // Tecknet framför siffran står bara i DOM:en och är streamerns val: Top Gift renderar
      // '◉ 44 999', Top Streak '×18' med w.streakPrefix. Behåll det som redan står där i
      // stället för att hårdkoda något av dem — annars byter widgeten utseende vid första gåvan.
      setText(el, String(el.textContent || '').match(/^\D*/)[0] + d.amount);
    });
  }

  function patchProfileWidget(widget) {
    var shape = SHAPES[widget.type];
    if (!shape) return;
    var amount = widget.dataValue === undefined || widget.dataValue === null
      ? '44 999' : widget.dataValue;
    // '@StreamQueen' AR EN PLATSHALLARE, INTE EN TITTARE. Den slog till nar ett event saknade
    // bade username och name, och skrev da in fabrikens demoperson i en LIVE sandning - exakt
    // det live-zero-state.js finns for att forhindra ("no invented person"). I overlay blir
    // tomt tomt; i editorn ar platshallaren fortfarande det man designar mot.
    // Platshållaren räknas bara fram när det finns en nod att skriva i, som förut (handbyggda
    // prov-DOM:ar utan location når aldrig hit).
    var noder = nodesFor(widget, shape.root);
    if (!noder.length) return;
    var namn = widget.dataName || (new URLSearchParams(location.search).has('overlay') ? '' : '@StreamQueen');
    var d = { giftImage: widget.giftImage, profileImage: widget.profileImage, name: namn, amount: amount };
    noder.forEach(function (node) { skrivProfilNod(node, shape, d); });
  }

  // ▶ TESTA WIDGET FÖR TOP GIFT (panelspecifikationen 2.4, adaptern 'topgift' i
  // vyra-topgift-panel.js). Spelar en ny toppgåva på EN nod — klonens — med exempeldatan:
  // samma skrivning som livevägen ovan (skrivProfilNod) och samma klassbyte som
  // live-leaderboard.js armFlip gör på en riktig gåva (flippen 'play' och rekordpulsen 'record').
  // Den går INTE via window.VyraFlip: det registret är nycklat på widget-id och hör till
  // sändningen. Ingen state, ingen save(), ingen kö och inget nät.
  //
  // Signal Orbit (templateTopCoins, Top Gift · Design 4) ritar sin ledare med egna klasser;
  // formen står i SHAPES_ORBIT.
  var SHAPES_ORBIT = {
    root: '.vyra-topcoins-new',
    gift: '.tc-gift img',
    profile: '.tc-portrait > img',
    name: '.tc-copy strong',
    value: '.tc-copy em',
    ikon: true
  };
  function topGiftSpelaPa(nod, k, ex) {
    if (!nod || !k || !ex) return false;
    var orbit = k.type === 'templateTopCoins';
    var shape = orbit ? SHAPES_ORBIT : SHAPES.templateTopGift;
    var gava = ex.gava || {};
    var bild = typeof ex.bild === 'function' ? ex.bild : function (v) { return v; };
    var coins = Number(gava.coins) || 0;
    skrivProfilNod(nod, shape, {
      giftImage: gava.bild ? bild(gava.bild) : '',
      profileImage: ex.profil ? bild(ex.profil) : '',
      name: ex.namn || '',
      // Livevägen skriver gåvans värde som det kommer (live-leaderboard.js); Signal Orbit visar
      // det som renderaren gör, med tusentalsavgränsning och COINS.
      amount: orbit ? Math.round(coins).toLocaleString('sv-SE') + ' COINS' : coins
    });
    if (nod.classList) {
      nod.classList.remove('play', 'record');
      void nod.offsetWidth;
      nod.classList.add('play', 'record');
    }
    return true;
  }
  window.topGiftSpelaPa = topGiftSpelaPa;
  window.VyraGiftImages.skrivProfilNod = skrivProfilNod;

  function patchCampaignWidget(widget) {
    // Aura owns its animated counters. Patching those midway through a reaction would jump.
    if (window.VyraCampaignAuraSession) window.VyraCampaignAuraSession.sync();
    var slots = typeof window.VyraCampaignItems === 'function'
      ? window.VyraCampaignItems(widget)
      : [];
    if (!slots.length) return;
    nodesFor(widget, '.vyra-campaign').forEach(function (node) {
      if (node.classList && node.classList.contains('vyra-campaign-aura')) return;
      var articles = node.querySelectorAll('article');
      for (var i = 0; i < articles.length && i < slots.length; i += 1) {
        var slot = slots[i];
        setImage(articles[i].querySelector('.campaign-gift-image img'), slot.image);
        setText(articles[i].querySelector('span b'), slot.current);
        var bar = articles[i].querySelector('em u');
        // Samma uträkning som campaignHtml() i media.js, annars glider stapeln ifrån siffran.
        if (bar) {
          bar.style.width =
            Math.min(100, Math.round(slot.current / Math.max(1, slot.target) * 100)) + '%';
        }
      }
    });
  }

  // En combo levererar många events per sekund. Samla dem till en enda skrivning per bildruta.
  //
  // Men bara när fliken faktiskt ritar. requestAnimationFrame fyrar inte i en dold flik, så en
  // bakgrundad Studio hade köat hela komboen och släppt den först när streamern klickade tillbaka.
  // Är fliken dold finns ingen bildruta att spara in på — då patchar vi direkt. Samma väg används
  // när requestAnimationFrame saknas helt (tester, node).
  var pending = [];
  var frame = 0;

  function batchable() {
    if (typeof window.requestAnimationFrame !== 'function') return false;
    return !(typeof document !== 'undefined' && document.hidden);
  }

  // TOP STREAK FICK ALDRIG SIN MARKERING I DRIFT (uppmatt 2026-09-22).
  //
  // Top Gift armas av live-leaderboard.js:updateTopGift — `if (!flip.resume(el)) flip.start(el)`
  // foljt av `flip.mark(el)`. Top Streak har ingen sadan skrivare: den enda som ror den pa en
  // riktig gava ar patchen harintill, och den satte aldrig nagon klass. `armFlip` anropas pa
  // exakt ett stalle i hela repot, och det stallet filtrerar pa templateTopGift.
  //
  // Foljden syns i CSS:en. Allt som ar streakens accent hanger pa `.hit`:
  //   .vyra-streak.hit                 streakEnter 3.8s   (engangs)
  //   .vyra-streak.hit .streak-score b streakNumber .8s   (engangs)
  //   .vyra-streak.hit .streak-flip>i  streakFire .8s     (engangs)
  // Rotationen (streakFlipLoop) ar oandlig och rullar vidare, men de tre engangsanimationerna
  // spelar bara nar klassen satts om. I studion satts den om av demoknappens send()-wrapper vid
  // varje tryck, sa dar ser det ratt ut. I sandning satts den aldrig om, och talet byter varde
  // i tystnad — ingen puls, ingen eld, ingen entre.
  //
  // MARKERINGEN, INTE OMSTARTEN. `resume()` lagger bara till triggerklassen om den saknas, sa de
  // tre engangsanimationerna spelar INTE om — det ar med flit, samma regel som ger Top Gift en
  // obruten rotation hela sandningen. Det som visar att ett rekord slagits ar `mark()`: egen
  // klass, egen engangsanimation, ingen omstart av loopen. `mark()` rensar redan delayen pa
  // `.streak-gift-face`, alltsa var den skriven for bada familjerna fran borjan.
  var attArma = [];

  function arma(widget) {
    var flip = window.VyraFlip;
    nodesFor(widget, '.vyra-streak').forEach(function (el) {
      // Den handbyggda DOM:en i tests/gift-images-live-patch.test.js har inga klasslistor, och
      // bade fallbacken och VyraFlip skriver klasser. Utan den har raden kastade armningen mitt i
      // lyssnaren — och lyssnaren ar INTE inpackad, sa kastet hade tagit med sig kampanjpatchen
      // och allt annat efter den. Samma tolerans som live-leaderboard.js skrivTal redan visar mot
      // samma rigg: en nod som saknar det vi behover hoppas over, den fallpar inte flodet.
      if (!el || !el.classList) return;
      if (!flip) {
        // Aldre overlagg utan modulen: samma fallback som live-leaderboard.js armFlip har.
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
        return;
      }
      if (!flip.resume(el)) flip.start(el);
      if (typeof flip.mark === 'function') flip.mark(el);
      koreografera(el);
    });
  }

  // KOREOGRAFIN, EFTER MARKERINGEN (docs/gavororelsen.md §1 och §7).
  //
  // Fabriken kopplar sig inte hit sjalv: den lindar en global trigger och laser ett timerspar per
  // tand lada, och Top Streak ar en PERMANENT widget utan bada. Anropet gors darfor har, pa exakt
  // den rad dar `mark()` redan anropas — efter patchen, sa koreografin aldrig ramar in ett gammalt
  // tal, och efter rekordgrinden, sa en gava UNDER rekordet inte far widgeten att saga "nytt
  // rekord".
  //
  // EN PAGAENDE KOREOGRAFI SPELAR KLART. Det ar §7:s beslut, och det bor HAR och inte i fabriken:
  // `spela()` vagrar inte sjalv spela om, eftersom Fan och Gifter bygger pa att den alltid spelar.
  // Fabriken svarar bara pa FRAGAN om ladan spelar. I en gavostorm kan tva rekord ligga nagra
  // hundra millisekunder isar, och en omstart dar hade visat fas 1 om och om igen — precis det
  // fellage VyraFlip finns for att forhindra, en vaning upp. Ingenting gar forlorat: talet ar
  // redan patchat, och `mark()`-pulsen kvitterar varje enskilt rekord oavsett.
  function koreografera(el) {
    var fas = window.VyraStreakFas;
    if (!fas || typeof fas.spelar !== 'function') return;   // aldre bunt utan arten
    if (fas.spelar(el)) return;
    fas.spela(el);
  }

  function flush() {
    frame = 0;
    var queue = pending.slice();
    pending.length = 0;
    var arm = attArma.slice();
    attArma.length = 0;
    queue.forEach(function (widget) {
      if (widget.type === 'templateGiftCampaign') patchCampaignWidget(widget);
      else patchProfileWidget(widget);
    });
    // EFTER patchen, inte fore: annars startar pulsen pa den gamla bilden och talet byts mitt i.
    arm.forEach(arma);
  }

  function schedule(widget) {
    if (pending.indexOf(widget) === -1) pending.push(widget);
    if (frame) return;
    if (!batchable()) return flush();
    frame = window.requestAnimationFrame(flush);
  }

  // NY SANDNING => rekorden borjar om. Filens egen regel ovan sager att rekorden galler SANDNINGEN
  // och "nollstalls vid omladdning" — men en OBS-kalla laddas inte om nar en ny LIVE borjar, sa
  // utan den har raden bar Top Gift och Top Streak forra sandningens rekord in i den nya. Widgetens
  // synliga tal kommer med konfig-omhamtningen; det ar TROSKELN har som annars stod kvar och
  // hindrade den nya sandningens forsta gavor fran att raknas som rekord alls.
  //
  // Bara live:start. Ett avslut ska lamna sista rekordet kvar pa skarmen.
  window.addEventListener('vyra-live-session', function (event) {
    var detalj = event && event.detail;
    if (!detalj || detalj.event !== 'live:start') return;
    records.giftCoins = 0;
    records.streakCoins = 0;
    skrivRekord();
    nollstallKampanjerIStudio();
  });

  // GIFT CAMPAIGN I STUDIO-LAGET (uppmatt 2026-10-12, #271 avsnitt 4).
  //
  // Raknaren nedan skrivs in i state.widgets — samma objekt som save() serialiserar — och foljer
  // darfor med i layouten vid NASTA sparning, vilken andring som helst. Det ar avsiktligt: servern
  // nollstaller just de nycklarna vid en ny sandning (stream-sessions.js nollstallKampanjerPa), och
  // en OBS-kalla hamtar om konfigurationen vid live:start och far nollan darifran.
  //
  // Studio har ingen sadan omhamtning. Utan raderna nedan stod forra sandningens rakning kvar i
  // Studios minne, och agarens nasta save() skrev tillbaka den OVER serverns nolla — varpa OBS
  // hamtade den med nasta konfigrevision. Har servern redan noll hojs inte ens versionen, sa
  // cloud-sync:s foljare har ingenting att ratta det med.
  //
  // Speglar serverns regel exakt: bara ^giftCurrent\d+$ pa templateGiftCampaign. INGEN save():
  // servern har redan nollan, och en PUT med Studios gamla version hade bara gett en synkkonflikt
  // mot serverns egen nollstallning. Nasta vanliga sparning bar nollan. En OBS-lank (`access`)
  // rors inte — dar ager konfig-omhamtningen raknaren, och en kalla som oppnas mitt i en sandning
  // far live:start ur snapshotet och hade annars nollat den PAGAENDE sandningens rakning.
  function nollstallKampanjerIStudio() {
    if (new URLSearchParams(location.search).has('access')) return;
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    state.widgets.forEach(function (widget) {
      if (!widget || widget.type !== 'templateGiftCampaign') return;
      var rort = false;
      Object.keys(widget).forEach(function (nyckel) {
        if (!/^giftCurrent\d+$/.test(nyckel) || Number(widget[nyckel]) === 0) return;
        widget[nyckel] = 0;
        rort = true;
      });
      if (rort) schedule(widget);
    });
  }

  window.addEventListener('vyra-live-event', function (event) {
    var detail = event.detail || {};
    var type = String(detail.type || detail.event || '').toLowerCase();
    if (!type.includes('gift')) return;

    var giftName = detail.giftName || detail.gift || detail.name;
    var match = resolve(giftName);
    if (!detail.giftImage && match) detail.giftImage = match.file;

    if (typeof state === 'undefined' || !Array.isArray(state.widgets)) return;

    // De två topplistorna mäter olika saker och delade tidigare en gren, så båda blev en dubblett
    // av den senaste gåvan. Bryggan skiljer dem åt: `coins:coinsEach*repeatCount, count:repeatCount`
    // i tiktok-bridge/normalizer.js.
    // Vardet (coins/diamonds) lases i records.bedom ovan, en gang per handelse.
    var streak = Number(detail.count || detail.repeatCount || detail.combo || 0) || 1;

    // Båda är topplistor, inte "senaste"-widgetar: de ändras bara när ett rekord slås. Rekorden
    // gäller sändningen, inte layouten — de nollställs vid omladdning, precis som topplistorna.
    // `coins` självt lämnas orört — det är totalen alla andra läsare räknar med.
    //
    // TOP GIFT rankas på gåvans STYCKVÄRDE (coins ÷ antal): den enskilt dyraste gåvan vinner.
    //
    // TOP STREAK rankas på COMBONS VÄRDE (coins = styckpris × antal), inte på antalet. Davids regel
    // 2026-09-27: 10 handhjärtan à 100 coins (1 000) slår 20 rosor à 1 coin (20) — den DYRARE combon
    // vinner även om den är kortare, och widgeten stannar på den. Tidigare avgjorde antalet, så en
    // billig gåva spammad många gånger tog streaken; det var fel. Widgeten VISAR fortfarande antalet
    // (`dataValue = streak`, renderaren skriver ×N) — bara vem som vinner bytte grund.
    //
    // En enstaka gåva (antal 1) är ingen combo och kan aldrig ta streaken — den hör till Top Gift.
    // Annars hade en enda dyr gåva fastnat som "×1 STREAK" och låst widgeten hela sändningen.
    var beslut = records.bedom(detail);
    var giftVarde = beslut.giftVarde;
    var newGift = beslut.gift;
    var newStreak = beslut.streak;

    state.widgets.forEach(function (widget) {
      if (widget.type === 'templateTopGift' && newGift) {
        widget.giftName = giftName || widget.giftName;
        widget.giftImage = detail.giftImage || widget.giftImage;
        widget.dataName = detail.username || detail.name || widget.dataName;
        widget.dataValue = giftVarde;
        schedule(widget);
      }

      if (widget.type === 'templateTopStreak' && newStreak) {
        widget.giftName = giftName || widget.giftName;
        widget.giftImage = detail.giftImage || widget.giftImage;
        widget.dataName = detail.username || detail.name || widget.dataName;
        // Renderaren skriver `×${dataValue}`, så det här ÄR combolängden — inte coins.
        widget.dataValue = streak;
        // Top Gifts avatar sätts av live-leaderboard.js. Streaken har ingen sådan skrivare, så
        // utan den här raden står den kvar på testbilden hela sändningen.
        widget.profileImage = detail.profileImage || detail.avatar || widget.profileImage;
        if (attArma.indexOf(widget) === -1) attArma.push(widget);
        schedule(widget);
      }

      if (widget.type === 'templateGiftCampaign') {
        // Match against the slot names the widget actually SHOWS, defaults included. Reading
        // widget.giftName<i> alone missed every untouched slot (undefined -> key '' -> no match),
        // so a campaign only ever counted gifts whose names the streamer had retyped by hand.
        var slots = typeof window.VyraCampaignItems === 'function'
          ? window.VyraCampaignItems(widget)
          : [];
        // An unnamed incoming gift keys to '' and would otherwise match every empty slot at once.
        var incoming = key(giftName);
        for (var index = 0; incoming && index < slots.length; index += 1) {
          if (key(slots[index].name) !== incoming) continue;
          var amount = Number(detail.count == null ? 1 : detail.count);
          if (!Number.isFinite(amount) || amount <= 0) continue;
          widget['giftImage' + index] = detail.giftImage || widget['giftImage' + index];
          widget['giftCurrent' + index] =
            Number(widget['giftCurrent' + index] || 0) + amount;
          // Same accepted event and same quantity as the counter; no second listener/dedupe.
          if (window.VyraCampaignAuraSession) {
            window.VyraCampaignAuraSession.receive(widget, index, amount, widget['giftCurrent' + index]);
          }
          schedule(widget);
        }
      }
    });
  });
})();
