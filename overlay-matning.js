// OBS-KÄLLAN MÄTER SIG SJÄLV (2026-11-19).
//
// Sändningen 2026-11-18: pratbubblan låg kvar i minuter, Fan Level Up fastnade, fyrverkeriet gav
// bara ljud. Allt hände i OBS-källan, och ingenting där kunde säga varför — "Problem i sändningen"
// finns bara i Studion, som räknar ut samma beslut men inte ser hur sidan i OBS mår.
//
// Den här filen mäter fyra saker i OBS-källan och skickar korta rader till Studion via servern
// (server/obs-matning.js → vyra-problem.js):
//   1. TIDTAGNINGEN. En klocka som ska slå varje sekund; hur mycket för sent den slår är precis
//      hur sent pratbubblan, Fan Level Up och TTS kommer.
//   2. BILDRUTORNA. Hur många bildrutor sidan hinner rita per sekund.
//   3. LAGRINGEN. Hur stora poänglistan och dagens topplista är i OBS egen lagring — den går inte
//      att läsa utifrån.
//   4. FYRVERKERIET OCH VIDEOR. Om ett fyrverkeri som startade fick några bildrutor, och om en
//      video inte gick att spela.
//
// BARA I EN RIKTIG OBS-LÄNK (?overlay och ?access=). Studion och en lokal förhandsvisning mäter
// ingenting och skickar ingenting. Raderna bär aldrig tittarnamn — bara tal och filnamn.
(function (root) {
  'use strict';

  const FONSTER_S = 60;            // en sammanfattning per minut
  const SLAPAR_MS = 1000;          // klockan mer än 1 s efter = varning
  const LAG_BILDTAKT = 20;         // färre bildrutor per sekund = varning
  const INFO_VAR = 5;              // annars en lugn inforad var femte minut
  const STOR_LAGRING_KB = 1000;
  const sv = (n, d = 1) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ',');

  // ---- den rena räknaren: provas utan webbläsare ---------------------------------------------
  function skapaMatare() {
    let lagMax = 0, lagSumma = 0, slag = 0, rutor = 0, handelser = 0, upptagenMs = 0, dold = false, fonsterNr = 0;
    return {
      slag(lagMs) { const l = Math.max(0, Number(lagMs) || 0); slag += 1; lagSumma += l; if (l > lagMax) lagMax = l; },
      ruta() { rutor += 1; },
      handelse() { handelser += 1; },
      upptagen(ms) { upptagenMs += Math.max(0, Number(ms) || 0); },
      varDold() { dold = true; },
      // Stänger fönstret. Svarar med en rad att skicka, eller null när inget är värt att säga.
      fonster(sekunder = FONSTER_S) {
        fonsterNr += 1;
        const s = Math.max(1, sekunder);
        const d = { lagMaxMs: Math.round(lagMax), lagSnittMs: slag ? Math.round(lagSumma / slag) : 0,
          bildrutorPerS: Math.round(rutor / s), handelser, upptagenProcent: Math.round(upptagenMs / (s * 10)) };
        const varDold = dold, nr = fonsterNr;
        lagMax = 0; lagSumma = 0; slag = 0; rutor = 0; handelser = 0; upptagenMs = 0; dold = false;
        const slapar = d.lagMaxMs >= SLAPAR_MS;
        // En dold källa (inaktiv scen i OBS) ritar inga bildrutor — det är inte ett fel.
        const hackar = !varDold && d.bildrutorPerS < LAG_BILDTAKT;
        const detaljer = `${d.bildrutorPerS} bildrutor/s, ${d.handelser} händelser, upptagen ${d.upptagenProcent} % av tiden`;
        if (slapar) return { niva: 'varning', data: d,
          text: `OBS-källan släpar: tidtagningen låg upp till ${sv(d.lagMaxMs / 1000)} s efter den senaste minuten (${detaljer})` };
        if (hackar) return { niva: 'varning', data: d,
          text: `OBS-källan hackar: bara ${d.bildrutorPerS} bildrutor/s den senaste minuten (tidtagningen som mest ${sv(d.lagMaxMs / 1000)} s efter, ${d.handelser} händelser)` };
        if (nr % INFO_VAR === 1) return { niva: 'info', data: d,
          text: `OBS-källan mår bra: tidtagningen som mest ${sv(d.lagMaxMs / 1000)} s efter (${detaljer})` };
        return null;
      }
    };
  }

  function lagringsrad(storlekar) {
    const kb = n => Math.round((Number(n) || 0) / 1024);
    const poang = kb(storlekar.poang), topp = kb(storlekar.topplista), allt = kb(storlekar.allt);
    const stor = poang >= STOR_LAGRING_KB || topp >= STOR_LAGRING_KB;
    return { niva: stor ? 'varning' : 'info', data: { poangKb: poang, topplistaKb: topp, alltKb: allt },
      text: `Lagring i OBS: poänglistan ${poang} kB, dagens topplista ${topp} kB, allt ${allt} kB` + (stor ? ' — stora listor gör varje händelse dyrare' : '') };
  }

  const filnamn = url => { try { const u = new URL(String(url), 'https://x.invalid/'); return (u.hostname === 'x.invalid' ? '' : u.hostname + '/…/') + (u.pathname.split('/').pop() || '').slice(0, 60); } catch (_) { return 'okänd fil'; } };

  const api = { skapaMatare, lagringsrad, filnamn, FONSTER_S, SLAPAR_MS, LAG_BILDTAKT };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.VyraOverlayMatning = api;

  // ---- inkopplingen i OBS-källan -------------------------------------------------------------
  let params;
  try { params = new URLSearchParams(root.location.search); } catch (_) { return; }
  const access = params.get('access');
  if (!params.has('overlay') || !access) return;

  const ko = [];
  let skickar = false;
  function skicka(rad) {
    if (!rad) return;
    ko.push(rad);
    if (ko.length > 8) ko.shift();
    tomKo();
  }
  function tomKo() {
    if (skickar || !ko.length) return;
    skickar = true;
    const rad = ko.shift();
    root.fetch(`/api/overlay-access/${encodeURIComponent(access)}/matning`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rad),
      cache: 'no-store', referrerPolicy: 'no-referrer', keepalive: true
    }).catch(() => {}).then(() => { root.setTimeout(() => { skickar = false; tomKo(); }, 3000); });
  }

  const m = skapaMatare();

  // 1. Tidtagningen: en klocka per sekund, och hur sent den slår.
  const UPPSTART_MS = root.performance.now() + 10000;
  let forra = root.performance.now();
  root.setInterval(() => {
    const nu = root.performance.now();
    // De första tio sekunderna laddar sidan sina filer; det släpet säger ingenting om sändningen.
    if (nu > UPPSTART_MS) m.slag(nu - forra - 1000);
    forra = nu;
    if (root.document.hidden) m.varDold();
  }, 1000);

  // 2. Bildrutorna.
  const ruta = () => { m.ruta(); root.requestAnimationFrame(ruta); };
  root.requestAnimationFrame(ruta);

  // Hur stor del av tiden sidan var upptagen (långa uppgifter), där webbläsaren kan säga det.
  try {
    new root.PerformanceObserver(lista => { for (const p of lista.getEntries()) m.upptagen(p.duration); })
      .observe({ entryTypes: ['longtask'] });
  } catch (_) {}

  root.addEventListener('vyra-live-event', () => m.handelse());

  root.setInterval(() => skicka(m.fonster(FONSTER_S)), FONSTER_S * 1000);

  // 3. Lagringen: vid start och sedan var tionde minut.
  function matLagring() {
    try {
      const l = root.localStorage;
      let allt = 0;
      for (let i = 0; i < l.length; i++) allt += (l.getItem(l.key(i)) || '').length;
      skicka(lagringsrad({ poang: (l.getItem('vyra-points-v1') || '').length,
        topplista: (l.getItem('vyra-leaderboard-daily-v1') || '').length, allt }));
    } catch (_) {}
  }
  root.setTimeout(matLagring, 15000);
  root.setInterval(matLagring, 10 * 60 * 1000);

  // 4a. Fyrverkeriet: när ett startar räknas bildrutorna de följande tre sekunderna.
  try {
    new root.MutationObserver(lista => {
      for (const post of lista) for (const n of post.addedNodes) {
        if (n.nodeType !== 1 || !n.parentNode || !n.parentNode.classList || !n.parentNode.classList.contains('gift-fireworks-fx')) continue;
        let rutor = 0, slut = false;
        const rakna = () => { if (slut) return; rutor += 1; root.requestAnimationFrame(rakna); };
        root.requestAnimationFrame(rakna);
        const start = root.performance.now();
        root.setTimeout(() => {
          slut = true;
          const sek = (root.performance.now() - start) / 1000;
          const kvar = n.isConnected;
          if (root.document.hidden) return;
          if (rutor < 45 || sek > 4.5 || !kvar) skicka({ niva: 'varning', data: { rutor, sekunder: Math.round(sek * 10) / 10, kvar },
            text: `Fyrverkeriet i OBS fick ${rutor} bildrutor på ${sv(sek)} s` + (kvar ? '' : ' och togs bort innan det hann spela klart') + ' — det syns hackigt eller inte alls' });
          else skicka({ niva: 'info', data: { rutor, sekunder: Math.round(sek * 10) / 10 },
            text: `Fyrverkeriet i OBS ritades: ${rutor} bildrutor på ${sv(sek)} s` });
        }, 3000);
        return;
      }
    }).observe(root.document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // 4b. En video eller bild som inte gick att läsa. `error` bubblar inte, därför capture.
  const rapporterade = new Set();
  root.document.addEventListener('error', ev => {
    const el = ev.target;
    if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'SOURCE' && el.tagName !== 'AUDIO')) return;
    const fil = filnamn(el.currentSrc || el.src || '');
    if (rapporterade.has(fil) || rapporterade.size > 40) return;
    rapporterade.add(fil);
    skicka({ niva: 'fel', data: { fil }, text: `En ${el.tagName === 'AUDIO' ? 'ljudfil' : 'video'} kunde inte spelas i OBS: ${fil}` });
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
