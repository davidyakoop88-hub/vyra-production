// Lifecycle only. gift-event-images.js remains the single live campaign counter writer.
(function (root) {
  'use strict';
  const mounted = new Map();
  function widgets() { return typeof state !== 'undefined' && Array.isArray(state.widgets) ? state.widgets : []; }
  function eligible(node, widget) {
    return !!widget && !widget.hidden && node.isConnected && !document.hidden &&
      !node.closest('.widget-catalog, .catalog-card, .widget-hidden, [hidden]') &&
      node.classList.contains('widget');
  }
  function dispose(node) {
    root.VyraCampaignAuraEngine?.dispose(node);
    mounted.delete(node);
  }
  function sync() {
    const engine = root.VyraCampaignAuraEngine;
    if (!engine || !root.document) return;
    const list = widgets();
    for (const [node, widget] of mounted) {
      if (!list.includes(widget) || !eligible(node, widget) || !engine.inspect(node)) dispose(node);
    }
    document.querySelectorAll('.vyra-campaign-aura').forEach(node => {
      const widget = list.find(w => w.type === 'templateGiftCampaign' && w.id === node.dataset.id);
      if (!eligible(node, widget) || mounted.has(node)) return;
      engine.mount(node, widget);
      mounted.set(node, widget);
    });
  }
  function receive(widget, index, amount, current) {
    sync();
    for (const [node, owner] of mounted) {
      if (owner !== widget || !eligible(node, widget)) continue;
      const image = node.querySelectorAll('.gift .frame img')[index];
      if (image && widget['giftImage' + index]) image.src = widget['giftImage' + index];
      root.VyraCampaignAuraEngine.receive(node, index, amount, current);
    }
  }
  function clear() { for (const node of Array.from(mounted.keys())) dispose(node); }
  root.VyraCampaignAuraSession = { sync, receive, clear, active: () => mounted.size };
  // Observe insertion/removal, not per-frame style writes made by animation.
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => {
      if (records.some(r => Array.from(r.addedNodes).concat(Array.from(r.removedNodes))
        .some(n => n.nodeType === 1))) sync();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('visibilitychange', sync);
  root.addEventListener('vyra-session-ended', clear);
  root.VyraSessionState?.registerTeardown?.('gift-campaign-aura', clear);
  if (typeof bind === 'function') {
    const previous = bind;
    bind = function () { const result = previous.apply(this, arguments); sync(); return result; };
  }
  sync();
})(window);
