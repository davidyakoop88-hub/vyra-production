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

  function resolve(name) {
    return byName.get(key(name)) || null;
  }

  window.VyraGiftImages = {
    count: gifts.length,
    resolve: resolve
  };

  // Sändningens rekord. Exponerade, inte privata, eftersom gift-event-images.js inte är ensam
  // skrivare till templateTopGift — live-leaderboard.js:130 skriver också dit, på varje gåva. Utan
  // en gemensam sanning hade separationen gällt i testet men inte i produktion: Top Gift skulle
  // fortsätta byta namn på varje billig gåva.
  var records = { giftCoins: 0, streakCount: 0 };
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
        sessionId: session, giftCoins: records.giftCoins, streakCount: records.streakCount }));
    } catch (e) {}
  }
  function aterstallRekord() {
    var session = aktivSession();
    if (!session) return false;
    try {
      var sparad = JSON.parse(window.sessionStorage.getItem(REKORD_NYCKEL) || 'null');
      if (!sparad || sparad.sessionId !== session) return false;
      records.giftCoins = Number(sparad.giftCoins) || 0;
      records.streakCount = Number(sparad.streakCount) || 0;
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

  function patchProfileWidget(widget) {
    var shape = SHAPES[widget.type];
    if (!shape) return;
    var amount = widget.dataValue === undefined || widget.dataValue === null
      ? '44 999' : widget.dataValue;

    nodesFor(widget, shape.root).forEach(function (node) {
      setImage(node.querySelector(shape.gift), widget.giftImage);
      setImage(node.querySelector(shape.profile), widget.profileImage);
      node.querySelectorAll(shape.name).forEach(function (el) {
        // '@StreamQueen' AR EN PLATSHALLARE, INTE EN TITTARE. Den slog till nar ett event saknade
        // bade username och name, och skrev da in fabrikens demoperson i en LIVE sandning - exakt
        // det live-zero-state.js finns for att forhindra ("no invented person"). I overlay blir
        // tomt tomt; i editorn ar platshallaren fortfarande det man designar mot.
        var overlay = new URLSearchParams(location.search).has('overlay');
        setText(el, widget.dataName || (overlay ? '' : '@StreamQueen'));
      });
      node.querySelectorAll(shape.value).forEach(function (el) {
        // Tecknet framför siffran står bara i DOM:en och är streamerns val: Top Gift renderar
        // '◉ 44 999', Top Streak '×18' med w.streakPrefix. Behåll det som redan står där i
        // stället för att hårdkoda något av dem — annars byter widgeten utseende vid första gåvan.
        setText(el, String(el.textContent || '').match(/^\D*/)[0] + amount);
      });
    });
  }

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

  function flush() {
    frame = 0;
    var queue = pending.slice();
    pending.length = 0;
    queue.forEach(function (widget) {
      if (widget.type === 'templateGiftCampaign') patchCampaignWidget(widget);
      else patchProfileWidget(widget);
    });
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
    records.streakCount = 0;
    skrivRekord();
  });

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
    // i tiktok-bridge/normalizer.js. En billig gåva spammad 50 gånger är en stor STREAK men en liten
    // GÅVA; en enda dyr gåva är tvärtom.
    var coins = Number(detail.coins || 0) || 0;
    var streak = Number(detail.count || detail.repeatCount || detail.combo || 0) || 1;

    // Båda är topplistor, inte "senaste"-widgetar: de ändras bara när ett rekord slås. Rekorden
    // gäller sändningen, inte layouten — de nollställs vid omladdning, precis som topplistorna.
    // Gåvans eget värde avgör Top Gift; antalet avgör Top Streak. `coins` självt lämnas orört —
    // det är totalen alla andra läsare räknar med.
    var giftVarde = records.styckvarde(coins, streak);
    var newGift = giftVarde > records.giftCoins;
    var newStreak = streak > records.streakCount;
    if (newGift) records.giftCoins = giftVarde;
    if (newStreak) records.streakCount = streak;
    if (newGift || newStreak) skrivRekord();

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
