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

  window.addEventListener('vyra-live-event', function (event) {
    var detail = event.detail || {};
    var type = String(detail.type || detail.event || '').toLowerCase();
    if (!type.includes('gift')) return;

    var giftName = detail.giftName || detail.gift || detail.name;
    var match = resolve(giftName);
    if (!detail.giftImage && match) detail.giftImage = match.file;

    if (typeof state === 'undefined' || !Array.isArray(state.widgets)) return;

    var changed = false;
    state.widgets.forEach(function (widget) {
      if (widget.type === 'templateTopGift' || widget.type === 'templateTopStreak') {
        widget.giftName = giftName || widget.giftName;
        widget.giftImage = detail.giftImage || widget.giftImage;
        widget.dataName = detail.username || detail.name || widget.dataName;
        widget.dataValue = Number(detail.coins || 0) || detail.count || widget.dataValue;
        changed = true;
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
          changed = true;
        }
      }
    });

    if (changed) {
      if (typeof save === 'function') save();
      if (typeof render === 'function') render();
    }
  });
})();
