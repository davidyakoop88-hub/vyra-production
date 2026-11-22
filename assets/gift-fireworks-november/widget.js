(() => {
  // LJUDET (2026-11-22): app.js skickar 'firework-sound' (launch/burst) per raket i den här sidan.
  // Studion/overlayn som bäddat in sidan spelar uppskjutning och smäll (gift-fireworks.js, fwSpelaLjud).
  // Lyssnaren sätts innan launch() körs, så att ingen raket hinner gå utan ljud.
  addEventListener('firework-sound', ev => {
    try { if (parent !== window && parent.VyraFireworks && frameElement) parent.VyraFireworks.ljudSignal(frameElement, ev.detail); } catch (_) {}
  });
  const params = new URLSearchParams(location.search);
  const effect = window.VyraGavofyrverkeri;
  effect.setProfile(params.get('profile'));
  effect.setStyle(params.get('style'));
  effect.setGift(params.get('gift')).then(key => effect.launch(key, Number(params.get('combo'))));
})();
