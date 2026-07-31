// Event Simulator — TikFinity has one-click "Simulate Follow/Share/Subscribe/15 Likes/Gift"
// buttons on the Actions & Events page, distinct from VYRA's existing per-Action/per-Event
// "Testa" buttons (which only replay ONE specific action/event). These route a synthetic but
// realistic event through the exact same pipeline a real TikTok event uses
// (window.VyraLive.ingest), so every trigger listening for that event type fires naturally —
// useful for testing an end-to-end chain without waiting for a real viewer to do the thing.
(() => {
  const SIMULATIONS = [
    ['Simulera Follow', { type: 'follow', username: 'TestFollower', name: 'TestFollower' }],
    ['Simulera Share', { type: 'share', username: 'TestSharer', name: 'TestSharer' }],
    ['Simulera Subscribe / Super Fan', { type: 'member', username: 'TestSubscriber', name: 'TestSubscriber' }],
    ['Simulera 15 Likes', { type: 'likes', username: 'TestLiker', name: 'TestLiker', count: 15 }],
    ['Simulera Gåva', { type: 'gift', username: 'TestGifter', name: 'TestGifter', giftName: 'Rose', coins: 1, count: 1 }]
  ];
  function render() {
    const anchor = document.querySelector('.ae-timers-overview') || document.querySelector('.ae-scenes-overview') || document.querySelector('.ae-steps');
    if (!anchor || document.querySelector('.ae-simulator')) return;
    const section = document.createElement('section');
    section.className = 'ae-simulator card';
    section.innerHTML = `<header><h3>Event Simulator</h3><span>Skickar ett riktigt event genom hela kedjan</span></header><div class="ae-simulator-buttons">${SIMULATIONS.map(([label], i) => `<button type="button" data-sim="${i}">${label}</button>`).join('')}</div>`;
    anchor.after(section);
    section.querySelectorAll('[data-sim]').forEach(btn => btn.onclick = () => {
      const [label, event] = SIMULATIONS[+btn.dataset.sim];
      window.VyraLive?.ingest?.({ ...event });
      window.toast?.(label + ' skickat');
    });
  }
  // See action-scenes.js for why this registration exists.
  (window.VyraActionsExtras = window.VyraActionsExtras || []).push(render);

  document.addEventListener('click', e => { if (e.target.closest('[data-extra="actions"]')) setTimeout(render, 170); }, true);
})();
