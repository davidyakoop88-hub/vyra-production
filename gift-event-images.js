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
      name: '.streak-copy strong, .sframe-row strong',
      value: '.streak-score b, .sframe-row b'
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
        setText(el, widget.dataName || '@StreamQueen');
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
    var slots = typeof window.VyraCampaignItems === 'function'
      ? window.VyraCampaignItems(widget)
      : [];
    if (!slots.length) return;
    nodesFor(widget, '.vyra-campaign').forEach(function (node) {
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

  window.addEventListener('vyra-live-event', function (event) {
    var detail = event.detail || {};
    var type = String(detail.type || detail.event || '').toLowerCase();
    if (!type.includes('gift')) return;

    var giftName = detail.giftName || detail.gift || detail.name;
    var match = resolve(giftName);
    if (!detail.giftImage && match) detail.giftImage = match.file;

    if (typeof state === 'undefined' || !Array.isArray(state.widgets)) return;

    state.widgets.forEach(function (widget) {
      if (widget.type === 'templateTopGift' || widget.type === 'templateTopStreak') {
        widget.giftName = giftName || widget.giftName;
        widget.giftImage = detail.giftImage || widget.giftImage;
        widget.dataName = detail.username || detail.name || widget.dataName;
        widget.dataValue = Number(detail.coins || 0) || detail.count || widget.dataValue;
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
          widget['giftImage' + index] = detail.giftImage || widget['giftImage' + index];
          widget['giftCurrent' + index] =
            Number(widget['giftCurrent' + index] || 0) + Number(detail.count || 1);
          schedule(widget);
        }
      }
    });
  });
})();
