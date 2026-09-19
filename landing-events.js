(function () {
  'use strict';

  const root = document.querySelector('[data-tiktok-events]');
  if (!root) return;
  const source = window.VYRA_TIKTOK_EVENTS || { events: [] };
  const events = Array.isArray(source.events) ? source.events : [];
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const validUrl = value => { try { const url = new URL(value); return /^https:$/.test(url.protocol) ? url.href : ''; } catch { return ''; } };
  const date = value => { const result = new Date(value); return Number.isFinite(result.getTime()) ? result : null; };
  const formatDate = value => date(value)?.toLocaleString('sv-SE', {timeZone:source.timezone || 'Europe/Stockholm',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) || 'Tid saknas';
  const formatRemaining = milliseconds => {
    if (milliseconds <= 0) return 'nu';
    const total = Math.floor(milliseconds / 1000), days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
    return days ? `${days}d ${hours}h ${minutes}m` : `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  };

  function stateFor(event, now) {
    const start = date(event.startAt), end = date(event.endAt);
    if (start && now < start) return ['Kommande', 'upcoming'];
    if (end && now > end) return ['Avslutat', 'ended'];
    return ['Aktivt nu', 'active'];
  }

  function nextBonus(event, now) {
    return (event.bonusWindows || []).map(item => ({...item,start:date(item.startAt),end:date(item.endAt)})).filter(item => item.start && item.end && item.end > now).sort((a,b) => a.start - b.start)[0] || null;
  }

  function giftMarkup(gifts) {
    if (!Array.isArray(gifts) || !gifts.length) return '<p class="event-empty-line">Inga verifierade bonusgåvor ännu.</p>';
    return `<div class="event-gifts">${gifts.map(gift => `<div><span>${safe(gift.icon || '🎁')}</span><b>${safe(gift.name)}</b><em>${safe(gift.multiplier || '2×')} poäng</em></div>`).join('')}</div>`;
  }

  function eventMarkup(event, now) {
    const [label, status] = stateFor(event, now), bonus = nextBonus(event, now), link = validUrl(event.officialUrl);
    const bonusActive = bonus && now >= bonus.start && now < bonus.end;
    const tasks = Array.isArray(event.tasks) ? event.tasks : [];
    return `<article class="tiktok-event-card" data-event-id="${safe(event.id)}">
      <header><div><span class="event-status ${status}"><i></i>${label}</span><small>${safe(event.region || 'Kontrollera ditt konto')}</small></div><div class="event-dates">${formatDate(event.startAt)} – ${formatDate(event.endAt)}</div></header>
      <div class="event-title"><div class="event-mark">${safe(event.mark || 'LIVE')}</div><div><p>${safe(event.series || 'TIKTOK LIVE EVENT')}</p><h3>${safe(event.name || 'Veckans event')}</h3><span>${safe(event.summary || '')}</span></div></div>
      <div class="event-grid"><section><h4>DET HÄR BEHÖVER DU GÖRA</h4>${tasks.length ? `<ol>${tasks.map(task => `<li>${safe(task)}</li>`).join('')}</ol>` : '<p class="event-empty-line">Uppgifterna väntar på verifiering.</p>'}</section><section><h4>GÅVOR MED BONUS</h4>${giftMarkup(event.boostedGifts)}</section></div>
      <div class="event-bonus ${bonusActive ? 'is-active' : ''}"><div><span>${bonusActive ? '⚡ BONUS AKTIV' : 'NÄSTA BONUSTID'}</span><b>${bonus ? `${formatDate(bonus.startAt)}–${date(bonus.endAt)?.toLocaleTimeString('sv-SE',{timeZone:source.timezone || 'Europe/Stockholm',hour:'2-digit',minute:'2-digit'})}` : 'Ingen verifierad bonustid'}</b></div><strong data-event-countdown data-start="${bonus?.start?.toISOString() || ''}" data-end="${bonus?.end?.toISOString() || ''}">${bonus ? formatRemaining((bonusActive ? bonus.end : bonus.start) - now) : '—'}</strong></div>
      <footer><span>Kontrollera att eventet är tillgängligt på ditt TikTok-konto.</span>${link ? `<a href="${safe(link)}" target="_blank" rel="noopener noreferrer">Öppna hos TikTok →</a>` : ''}</footer>
    </article>`;
  }

  function emptyMarkup() {
    return `<article class="tiktok-event-card event-waiting"><div class="event-title"><div class="event-mark">LIVE</div><div><p>TIKTOK-EVENT DENNA VECKA</p><h3>Vi verifierar veckans event</h3><span>VYRA visar inga obekräftade gifts, multiplikatorer eller bonustider.</span></div></div><div class="event-grid"><section><h4>UNDER TIDEN</h4><ol><li>Öppna TikTok och gå till LIVE Center.</li><li>Kontrollera kampanjer för ditt konto och din region.</li><li>Anmäl dig i TikTok innan eventet startar.</li></ol></section><section><h4>VAD SOM KOMMER VISAS</h4><div class="event-placeholder"><span>2×-gåvor</span><span>Uppgifter</span><span>Bonustider</span><span>Nedräkning</span></div></section></div><footer><span>Event kan skilja sig mellan konto, land och agency.</span></footer></article>`;
  }

  function render() {
    const now = new Date(), visible = events.filter(event => event && event.published !== false);
    root.querySelector('[data-event-list]').innerHTML = visible.length ? visible.map(event => eventMarkup(event, now)).join('') : emptyMarkup();
    const stamp = date(source.updatedAt);
    root.querySelector('[data-event-updated]').textContent = stamp ? `Senast kontrollerad ${stamp.toLocaleDateString('sv-SE',{timeZone:source.timezone || 'Europe/Stockholm',day:'numeric',month:'long'})}` : 'Väntar på verifiering';
  }

  function tick() {
    const now = new Date();
    root.querySelectorAll('[data-event-countdown]').forEach(element => {
      const start = date(element.dataset.start), end = date(element.dataset.end);
      if (!start || !end) return;
      element.textContent = formatRemaining((now < start ? start : end) - now);
    });
  }

  render(); tick(); setInterval(tick, 1000);
})();
