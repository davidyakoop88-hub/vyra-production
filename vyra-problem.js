// PROBLEM I SÄNDNINGEN (2026-11-17). Efter sändningen 2026-11-16 fanns ingenting att läsa:
// LIVE-kontrollens händelselogg ligger bara i minnet, och ingen del sa VARFÖR något inte blev som
// det skulle — avataren ignorerade en moderators kommando tyst, battle-klippen klipptes av varandra,
// och MVP:n kom sent utan att något mätte hur sent. David: "ska den inte rapportera felet?"
//
// Varje del rapporterar här, i klartext: VyraProblem.rapportera(kalla, niva, text, data).
//   kalla  'avatar' | 'battle' | 'mvp' | 'tts' | 'ljud' | ...
//   niva   'fel'     något som skulle hända hände inte
//          'varning' något hände, men inte som tänkt
//          'info'    ett beslut som är bra att se i efterhand (X2 väntade 4 s, MVP efter 2 s)
//
// SPARAS (localStorage, max 300 rader) och ligger kvar efter en omladdning. Samma rapport inom 10 s
// räknas upp på raden i stället för att bli en ny. Nyckeln står i session-state.js EPHEMERAL_KEYS:
// raderna bär tittarnamn och torkas vid kontobyte, precis som körloggen.
//
// BARA I STUDION. OBS-overlayn är en egen webbläsare utan delad lagring, och det finns ingen väg
// från den till studion. Studion får samma händelser från TikTok och har samma regler, så den
// räknar ut samma beslut som overlayn (avatarens, battle-klippens) och rapporterar dem. Det den
// INTE kan se är om OBS själv misslyckades med att spela en fil — det står i rutan.
//
// "Spara som fil" ger en JSON med problemen OCH LIVE-kontrollens händelser (VyraLiveControl.
// getSnapshot), så att en sändning kan läsas efteråt i lugn och ro.
(function (root) {
  'use strict';
  const NYCKEL = 'vyra-problemlogg', MAX = 300, DUBBLETT_MS = 10000, VISAS = 60;
  const OVERLAY = !!root.VYRA_OVERLAY_SCENE || !!root.VYRA_OVERLAY || /[?&]overlay(=|&|$)/.test(String(root.location && root.location.search || ''));
  const KALLOR = { avatar: 'Avatar', battle: 'Battle-klipp', mvp: 'MVP', tts: 'TTS', ljud: 'Sound Alerts', action: 'Action & Event', obs: 'OBS-källan' };
  const NIVAER = { fel: 'Fel', varning: 'Varning', info: 'Info' };

  const las = () => { try { const v = JSON.parse(root.localStorage.getItem(NYCKEL) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const skriv = l => { try { root.localStorage.setItem(NYCKEL, JSON.stringify(l)); } catch {} };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Bara enkla värden följer med i data: ingen rå TikTok-payload, inga bilder.
  function rensaData(d) {
    if (!d || typeof d !== 'object') return undefined;
    const ut = {};
    for (const [k, v] of Object.entries(d)) {
      if (Object.keys(ut).length >= 12) break;
      if (v == null || typeof v === 'object' || typeof v === 'function') continue;
      ut[k] = typeof v === 'string' ? v.slice(0, 160) : v;
    }
    return Object.keys(ut).length ? ut : undefined;
  }

  function rapportera(kalla, niva, text, data) {
    if (OVERLAY || !text) return false;
    const n = NIVAER[niva] ? niva : 'info', k = String(kalla || 'okänd'), t = String(text).slice(0, 300), nu = Date.now();
    const l = las();
    const forra = l.find(r => r.kalla === k && r.text === t);
    if (forra && nu - forra.senast < DUBBLETT_MS) {
      forra.antal = (forra.antal || 1) + 1;
      forra.senast = nu;
    } else {
      l.unshift({ at: nu, senast: nu, kalla: k, niva: n, text: t, data: rensaData(data), antal: 1 });
      if (l.length > MAX) l.length = MAX;
    }
    skriv(l);
    rita();
    try { root.dispatchEvent(new CustomEvent('vyra-problem', { detail: { kalla: k, niva: n, text: t } })); } catch {}
    return true;
  }
  function rensa() { skriv([]); rita(); }

  function exportera() {
    const nu = new Date();
    let snapshot = null;
    try { snapshot = root.VyraLiveControl && root.VyraLiveControl.getSnapshot ? root.VyraLiveControl.getSnapshot() : null; } catch {}
    const fil = { format: 'vyra-sandning', version: 1, sparad: nu.toISOString(),
      app: (Array.from(root.document.scripts || []).map(s => s.src).find(s => /media\.js/.test(s)) || '').replace(/^.*\//, ''),
      problem: las(), liveKontroll: snapshot };
    const blob = new Blob([JSON.stringify(fil, null, 1)], { type: 'application/json' });
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const p = n => String(n).padStart(2, '0');
    a.download = `VYRA-sandning-${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}-${p(nu.getHours())}${p(nu.getMinutes())}.json`;
    root.document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return fil;
  }

  const tid = ms => { try { return new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };
  function radHtml(r) {
    return `<li class="lc-problem-rad lc-problem-${esc(r.niva)}"><time>${esc(tid(r.at))}</time>`
      + `<span class="lc-problem-kalla">${esc(KALLOR[r.kalla] || r.kalla)}</span>`
      + `<span class="lc-problem-text">${esc(r.text)}${r.antal > 1 ? ` <b class="lc-problem-antal">×${r.antal}</b>` : ''}</span></li>`;
  }
  function innehall() {
    const l = las(), fel = l.filter(r => r.niva === 'fel').length, varn = l.filter(r => r.niva === 'varning').length;
    const sammanfattning = l.length ? `${fel} fel · ${varn} varningar · ${l.length - fel - varn} info` : 'Inga problem rapporterade';
    return `<div class="lc-panel-head"><h3>Problem i sändningen</h3><span data-problem-summa>${esc(sammanfattning)}</span></div>`
      + `<div class="lc-problem-knappar"><button type="button" data-problem-spara>Spara som fil</button><button type="button" data-problem-rensa>Rensa</button></div>`
      + (l.length ? `<ol class="lc-problem-lista">${l.slice(0, VISAS).map(radHtml).join('')}</ol>`
        : `<p class="lc-problem-tom">Här säger avataren, battle-klippen, MVP, TTS och Sound Alerts till när något inte blir som det ska — och varför.</p>`)
      + `<small class="lc-problem-not">Studion räknar ut samma beslut som OBS-overlayn. Rader märkta OBS-källan kommer från själva sidan i OBS: hur sent tidtagningen går, bildrutor, lagring och filer som inte gick att spela. "Spara som fil" tar med LIVE-kontrollens händelser.</small>`;
  }
  function montera(sida) {
    if (!sida || OVERLAY) return;
    let ruta = sida.querySelector('.lc-problem');
    if (!ruta) {
      ruta = root.document.createElement('section');
      ruta.className = 'lc-panel lc-problem';
      const huvud = sida.querySelector('.lc-head');
      if (huvud) huvud.after(ruta); else sida.prepend(ruta);
    }
    if (!ruta.dataset.obsHamtad) { ruta.dataset.obsHamtad = '1'; try { hamtaObs(); } catch {} }
    ruta.innerHTML = innehall();
    ruta.querySelector('[data-problem-spara]').onclick = exportera;
    ruta.querySelector('[data-problem-rensa]').onclick = rensa;
  }
  function rita() {
    const sida = root.document && root.document.querySelector('.lc-page');
    if (sida) montera(sida);
  }
  // En annan flik (OBS i samma webbläsare, en andra studioflik) kan ha skrivit.
  try { root.addEventListener('storage', e => { if (e.key === NYCKEL) rita(); }); } catch {}

  /* OBS-KÄLLANS RADER (2026-11-19). OBS-overlayn mäter sig själv (overlay-matning.js) och skickar korta
     rader till servern; här hämtas de högst var 30:e sekund och läggs i samma lista. `at` är serverns
     klocka och minns i lagringen, så en omladdad studio inte lägger in samma rad igen. Utan
     inloggning eller utan arbetsyta görs ingenting, och ett fel är tyst — mätningen får aldrig störa. */
  const OBS_EFTER = 'vyra-problem-obs-efter', OBS_MS = 30000;
  let obsHamtar = false;
  function hamtaObs() {
    if (OVERLAY || obsHamtar) return Promise.resolve(0);
    let ws = null;
    try { ws = root.VyraAuth && root.VyraAuth.lastDetail && root.VyraAuth.lastDetail()?.workspaces?.[0]?.id; } catch {}
    if (!ws || !root.VyraAuth || typeof root.VyraAuth.api !== 'function') return Promise.resolve(0);
    let efter = 0;
    try { efter = Number(root.localStorage.getItem(OBS_EFTER)) || 0; } catch {}
    obsHamtar = true;
    return Promise.resolve(root.VyraAuth.api('/api/workspaces/' + ws + '/obs-matning?after=' + efter)).then(d => {
      const rader = d && Array.isArray(d.rader) ? d.rader : [];
      let senast = efter;
      for (const r of rader) {
        if (!r || !(Number(r.at) > efter)) continue;
        senast = Math.max(senast, Number(r.at));
        rapportera('obs', r.niva, r.text, r.data);
      }
      if (senast > efter) { try { root.localStorage.setItem(OBS_EFTER, String(senast)); } catch {} }
      return rader.length;
    }).catch(() => 0).then(n => { obsHamtar = false; return n; });
  }
  // INGEN EGEN KLOCKA. Hämtningen drivs av livehändelserna (högst var 30:e sekund) och av att
  // LIVE-kontroll öppnas. Utan sändning kommer inga händelser, och då finns inget nytt att hämta.
  let obsSenast = 0;
  function hamtaObsVidBehov() {
    const nu = Date.now();
    if (nu - obsSenast < OBS_MS) return;
    obsSenast = nu;
    hamtaObs();
  }
  try { if (!OVERLAY) root.addEventListener('vyra-live-event', hamtaObsVidBehov); } catch {}

  root.VyraProblem = { rapportera, lista: las, rensa, exportera, montera, hamtaObs, NYCKEL, KALLOR };
})(typeof window !== 'undefined' ? window : globalThis);
