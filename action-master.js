(() => {
  // EN FÖRARE FÖR AUTOMATIONEN (§15 i docs/tech-debt.md).
  //
  // live-client.js:131 kör handleEvent i VARJE flik som tar emot ett live-event, och studio.html
  // ?overlay=1 är samma sida — alltså kör varje scenlänk sin egen kopia. Uppmätt 2026-08-17 med
  // studion plus tva scenlänkar mot ett delat lager, EN gåva à 100 poäng:
  //
  //   avdrag: 3      fyrverkeriet i scen 1 spelade: 3 ganger (kon hade tre poster)
  //
  // Tittaren betalade tre gånger och såg samma effekt tre gånger. Fixen är inte att flytta
  // avdraget igen utan att bestämma vilken flik som KÖR automationen. Resten tiger och tar emot
  // uppspelningen via localStorage['vyra-action-run'], den brygga action-runtime.js redan lyssnar
  // på — den bar redan trafiken, det var just därför spelningarna blev tre.
  //
  // TVÅ NIVÅER, INTE ETT SKRIVRÄTTSTEST. Att bara låta den skrivbara fliken köra hade tystat varje
  // uppsättning utan öppen studio: en streamer som startar OBS före Studion förväntar sig att
  // tittarnas effekter fungerar direkt. Därför:
  //
  //   Niva 1  en flik i studio-committed tar platsen ALLTID, även från en levande niva 2.
  //   Niva 2  vilken flik som helst tar en ledig eller inaktuell plats.
  //
  // Nivå 1 vinner för att det är den flik som äger layouten: den kan skriva de skyddade nycklarna
  // via writeActive (session-state.js:138, :284) och är den streamern faktiskt tittar på.
  //
  // Nar den har raden skrevs vann niva 1 av ett STARKARE skal: cooldownen levde i
  // vyra-action-event-v2 och kunde darfor bara sparas av en skrivbar flik, sa en sjalvkorande niva
  // 2-flik korde helt utan cooldown. Det ar lagat i §15b — stamplarna bor i vyra-action-cooldowns
  // och fungerar i vilken flik som helst. Niva 2 ar alltsa inte langre ett andra klassens lage.
  //
  // VARFÖR EN HJÄRTSLAGSNYCKEL OCH INTE session-states MARKER_KEY. Markören skrivs vid projektion
  // och skrivning, aldrig på en timer. En stängd studioflik lämnar en markör som ser färsk ut för
  // alltid, och automationen hade tystnat permanent. 6 s TTL är samma fönster som sceneOnline()
  // redan använder för scenernas hjärtslag.
  const NYCKEL = 'vyra-automation-master';
  const LAS = 'vyra-automation-master';
  const TTL = 6000;                     // samma fönster som sceneOnline()
  const PULS = 2000;                    // tre slag innan någon annan får ta över
  const tabId = (typeof crypto === 'object' && crypto.randomUUID)
    ? crypto.randomUUID() : 'flik-' + Math.random().toString(36).slice(2);

  const las = () => { try { return JSON.parse(localStorage.getItem(NYCKEL) || 'null') } catch { return null } };
  const farsk = m => !!m && Date.now() - Number(m.at || 0) < TTL;
  // studio-committed sätts bara när session-state har en committad projektion, och högst en flik
  // kan äga den åt gången. Nivå 1 kan därför aldrig vara två.
  const minNiva = () => (window.VyraSessionState?.mode?.() === 'studio-committed' ? 1 : 2);
  const skriv = niva => { try { localStorage.setItem(NYCKEL, JSON.stringify({ tabId, niva, at: Date.now() })) } catch {} };
  const farTaOver = (m, niva) => !farsk(m) || m.tabId === tabId || (niva === 1 && Number(m.niva || 2) > 1);

  // REN LÄSNING. Svarar bara på frågan, tar aldrig platsen — så den kan användas i prov och
  // diagnostik utan att påverka svaret. Jämför farKora() nedan, som är ett anspråk.
  function arMaster() {
    const m = las();
    return farsk(m) ? m.tabId === tabId : false;
  }

  // ETT ANSPRÅK, INTE EN FRÅGA — och därför heter den inte arMaster(). Står platsen tom tar vi den
  // och kör: hellre ett dubbelavdrag i det ögonblick en master dör än en svart overlay.
  //
  // Kvarvarande lucka: två flikar som behandlar SAMMA event i exakt det ögonblicket kan båda se en
  // tom plats och båda köra. Låset nedan serialiserar hjärtslagen men inte den här synkrona vägen —
  // handleEvent är synkron och kan inte vänta på ett lås. Fönstret är den enda stund då ingen
  // levande master finns, alltså högst TTL efter att en flik försvunnit. Uppmätt kostnad: ett extra
  // avdrag för ett event. Att i stället tiga tills låset svarat hade kostat en tappad uppspelning.
  function farKora() {
    const m = las(), niva = minNiva();
    if (farsk(m) && m.tabId === tabId) return true;
    if (!farTaOver(m, niva)) return false;
    skriv(niva);
    return true;
  }

  // Den auktoritativa vägen: under lås, så att tre flikar som startar samtidigt landar i att exakt
  // en av dem håller nyckeln. Låset finns i varje flik — det är mode, inte navigator.locks, som
  // saknas i en overlay.
  function medLas(fn) {
    const locks = typeof navigator === 'object' && navigator.locks;
    if (!locks || typeof locks.request !== 'function') { try { fn() } catch {} return Promise.resolve() }
    return locks.request(LAS, { mode: 'exclusive' }, async () => { try { fn() } catch {} })
      .catch(() => {});
  }

  function pulsa() {
    return medLas(() => {
      const m = las(), niva = minNiva();
      if (farTaOver(m, niva)) skriv(niva);
    });
  }

  pulsa();
  const timer = setInterval(pulsa, PULS);
  // Lämna platsen direkt när fliken stängs i stället för att låta nästa flik vänta ut TTL:en.
  addEventListener('pagehide', () => {
    clearInterval(timer);
    try { if (arMaster()) localStorage.removeItem(NYCKEL) } catch {}
  });

  window.VyraAutomationMaster = { arMaster, farKora, pulsa, tabId, NYCKEL, TTL };
})();
