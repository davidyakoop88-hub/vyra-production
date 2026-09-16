// Event Simulator — facit §5 i docs/referens/tikfinity-events-facit.md.
//
// Skickar ett syntetiskt men realistiskt event genom EXAKT samma väg ett riktigt TikTok-event tar
// (window.VyraLive.ingest), så varje trigger som lyssnar fyrar naturligt. Skild från "Testa"-
// knappen på en enskild Action, som bara spelar upp just den actionen utan att röra triggerkedjan.
//
// ALLA EVENT HÄRIFRÅN BÄR `__simulerad: true`. live-client.js hoppar då över inlärningen av gåvor,
// emotes och användare. Utan den flaggan hamnar `TestGifter` i användarväljaren och en falsk
// `Rose / 1 coins` i gåvokatalogen, märkt som inlärd från en riktig sändning — ett påstående om
// verkligheten som aldrig var sant. Uppmätt: de fem testanvändarna låg redan i väljaren hos alla
// som någonsin tryckt på en simuleringsknapp.
(() => {
  // Facit rad 1: fyra knappar. Rad 2: gåvorullgardin plus "Simulera Gåva".
  const KNAPPAR = [
    ['Simulera Follow', { type: 'follow', username: 'TestFollower', name: 'TestFollower' }],
    ['Simulera Share', { type: 'share', username: 'TestSharer', name: 'TestSharer' }],
    ['Simulera Subscribe', { type: 'member', username: 'TestSubscriber', name: 'TestSubscriber' }],
    ['Simulera 15 Likes', { type: 'likes', username: 'TestLiker', name: 'TestLiker', count: 15 }]
  ];

  // Samma två källor som gåvoväljaren, inlärda först — se action-event-advanced.js gavolistan().
  // Dubbletten är medveten: simulatorn laddas i filer som inte har den andra filen i minnet, och en
  // delad global bara för en rullgardin hade kostat mer än de sex raderna.
  function gavor() {
    let lardda = [];
    try {
      const rad = JSON.parse(localStorage.getItem('vyra-seen-gifts-v1') || '[]');
      if (Array.isArray(rad)) lardda = rad.filter(g => g && g.name).map(g => ({ name: g.name, coins: Number(g.coins) || 0, lard: true }));
    } catch { /* tom katalog är ett giltigt läge, inte ett fel */ }
    const sedda = new Set(lardda.map(g => g.name.toLowerCase()));
    const manifest = (window.VYRA_GIFTS || [])
      .filter(g => !sedda.has(String(g.name || '').toLowerCase()))
      .map(g => ({ name: g.name, coins: 0, lard: false }));
    return [...lardda, ...manifest];
  }

  // BORTOM FACIT, OCH MEDVETET. `subscriberEmote`, `fanSticker` och `chatCommand` är triggrar som
  // inte går att prova utan att en riktig tittare gör just den saken — en Fan Club-sticker kräver
  // en fanklubbsmedlem. Att bygga en trigger som ingen kan verifiera är precis det mönster som
  // redan drabbat fem widgetar i det här projektet (se vyra_widget_live_trigger_pattern).
  //
  // Emote-id:t tas ur det som faktiskt setts live när det finns; annars ett uppenbart falskt id,
  // så att ett prov utan data inte ser ut som ett prov med data.
  function forstaSedda(nyckel) {
    try {
      const lista = JSON.parse(localStorage.getItem(nyckel) || '[]');
      return Array.isArray(lista) && lista[0] && lista[0].id ? lista[0].id : '';
    } catch { return '' }
  }

  function skicka(event) {
    const ingest = window.VyraLive && window.VyraLive.ingest;
    if (typeof ingest !== 'function') { window.toast?.('Livekedjan är inte igång än — vänta några sekunder'); return false }
    ingest({ ...event, __simulerad: true });
    return true;
  }

  function render() {
    const ankare = document.querySelector('.ae-timers-overview') || document.querySelector('.ae-scenes-overview') || document.querySelector('.ae-steps');
    if (!ankare || document.querySelector('.ae-simulator')) return;
    const lista = gavor();
    const section = document.createElement('section');
    section.className = 'ae-simulator card';
    section.innerHTML = `<header><h3>Event Simulator</h3><span>Skickar ett riktigt event genom hela kedjan</span></header>
      <p class="ae-sim-intro">Här kan du simulera events. Ingenting av det här lärs in — dina gåvo-, emote- och användarlistor rörs inte.</p>
      <div class="ae-simulator-buttons">${KNAPPAR.map(([etikett], i) => `<button type="button" data-sim="${i}">${etikett}</button>`).join('')}</div>
      <div class="ae-sim-rad">
        <select id="aeSimGift"><option value="">Välj gåva…</option>${lista.slice(0, 400).map(g => `<option value="${VyraSafe.text(g.name)}" data-coins="${g.coins}">${VyraSafe.text(g.name)}${g.coins ? ` · ${g.coins} coins` : ''}</option>`).join('')}</select>
        <button type="button" id="aeSimGiftBtn">Simulera Gåva</button>
      </div>
      <div class="ae-sim-rad ae-sim-extra">
        <button type="button" data-sim-typ="emote">Simulera Subscriber-emote</button>
        <button type="button" data-sim-typ="sticker">Simulera Fan Club-sticker</button>
        <button type="button" data-sim-typ="kommando">Simulera Kommando !hype</button>
      </div>
      <small class="ae-sim-hint">De tre sista finns inte hos TikFinity. De är med för att emote-, sticker- och kommandotriggarna annars inte går att prova utan en riktig tittare som gör just den saken.</small>`;
    ankare.after(section);

    section.querySelectorAll('[data-sim]').forEach(btn => btn.onclick = () => {
      const [etikett, event] = KNAPPAR[+btn.dataset.sim];
      if (skicka(event)) window.toast?.(etikett + ' skickat');
    });

    const valj = section.querySelector('#aeSimGift');
    section.querySelector('#aeSimGiftBtn').onclick = () => {
      const namn = valj.value;
      if (!namn) { window.toast?.('Välj en gåva först'); return }
      // Coin-värdet följer med. Utan det triggar inte "Skickar gåva med minsta coin-värde" över
      // någon tröskel alls, och just den triggern är den vanligaste i en riktig uppsättning.
      const coins = Number(valj.selectedOptions[0]?.dataset.coins) || 1;
      if (skicka({ type: 'gift', username: 'TestGifter', name: 'TestGifter', giftName: namn, gift: namn, coins, diamonds: coins, count: 1 })) {
        window.toast?.(`Gåva "${namn}" (${coins} coins) skickad`);
      }
    };

    section.querySelectorAll('[data-sim-typ]').forEach(btn => btn.onclick = () => {
      const typ = btn.dataset.simTyp;
      if (typ === 'kommando') {
        if (skicka({ type: 'chat', username: 'TestUser', name: 'TestUser', comment: '!hype' })) window.toast?.('Kommando !hype skickat');
        return;
      }
      const sticker = typ === 'sticker';
      const id = forstaSedda(sticker ? 'vyra-seen-stickers-v1' : 'vyra-seen-emotes-v1') || (sticker ? 'simulerad-sticker' : 'simulerad-emote');
      // `packageId 'fansclub'` skiljer en sticker från en emote — INTE emoteScene. Uppmätt mot 156
      // emotes i tre skarpa inspelningar: scenen var 2 i 59 fall och 3 i 97, medan paketet sa
      // 'fansclub' i 150. Simuleringen sätter därför paketet, annars provar den fel trigger.
      // Scenen skickas med som uppmätt data (3 är majoriteten i verkligheten), men avgör inget.
      if (skicka({ type: 'subscriberemote', username: 'TestUser', name: 'TestUser', emote: id,
                   emotePaket: sticker ? 'fansclub' : '', emoteScene: sticker ? 3 : 0 })) {
        window.toast?.(`${sticker ? 'Fan Club-sticker' : 'Subscriber-emote'} ${id} skickad`);
      }
    });
  }

  // See action-scenes.js for why this registration exists.
  (window.VyraActionsExtras = window.VyraActionsExtras || []).push(render);

  document.addEventListener('click', e => { if (e.target.closest('[data-extra="actions"]')) setTimeout(render, 170); }, true);
})();
