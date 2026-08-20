(() => {
  // EN MEKANISM FÖR "VILKEN FLIK GÖR DET HÄR", ANVÄND TVÅ GÅNGER.
  //
  // §15a gav automationen en förare: varje öppen flik tog emot samma live-event, så en gåva
  // betalades och spelades en gång per flik. §14 visade att rösten har exakt samma fel — uppmätt
  // 2026-08-17 med tre flikar och EN chattrad: tre röster i mun på varandra och tre avdrag.
  //
  // Samma fel, men INTE samma svar på "vem". Automationen vill att studion kör: den är den enda
  // flik som får skriva, och actions routas ändå till rätt scen. Rösten vill tvärtom att overlayn
  // hörs: en streamer fångar sitt ljud via browser source i OBS, inte via desktop audio, så en
  // röst som bara talar i Studion försvinner ur sändningen. Prioriteringen är alltså inverterad
  // mellan de två — men allt annat är identiskt.
  //
  // Därför en fabrik i stället för en andra kopia. Två hjärtslagsnycklar, en implementation.
  // Att kopiera 60 rader elektionslogik hade varit precis det fel §13 handlade om: två ställen
  // som måste hållas i takt.
  //
  // TVÅ NIVÅER. Nivå 1 tar platsen ALLTID, även från en levande nivå 2. Nivå 2 tar en ledig eller
  // inaktuell plats. Nivå 2 är inget artighetsundantag: utan den vore varje uppsättning utan den
  // föredragna fliken helt död, och fail-open är regeln i hela den här kedjan.
  const TTL = 6000;                     // samma fönster som sceneOnline()
  const PULS = 2000;                    // tre slag innan någon annan får ta över

  // EN DOMARE BADA SER (2026-08-20). UPPMATT mot OBS 32.2.1: en browser source har sin EGEN
  // localStorage-rymd, sa nyckeln nedan nar aldrig over gransen mellan Studion och overlayn — och
  // bada kan tro att de ar forare. Skrivbordsappens lokala server ser BADA (de talar redan med
  // 127.0.0.1), och blir darfor domare nar den finns.
  //
  // Svaret CACHAS: farKora() ar synkron och kan inte vanta pa ett HTTP-anrop. Hjartslaget fragar,
  // cachen svarar — exakt samma form som localStorage-vagen, bara med sanningen pa ett stalle
  // bada ser.
  //
  // FAIL-OPEN NAR DOMAREN TIGER. Webben utan appen har ingen server, och en nedslagen server far
  // aldrig tysta automationen: da galler den lokala vagen ofrandrad. Hellre ett dubbelavdrag an
  // en svart overlay, samma regel som resten av kedjan.
  function skapa({ nyckel, minNiva, ttl = TTL, puls = PULS, domare = null } = {}) {
    const tabId = (typeof crypto === 'object' && crypto.randomUUID)
      ? crypto.randomUUID() : 'flik-' + Math.random().toString(36).slice(2);
    const las = () => { try { return JSON.parse(localStorage.getItem(nyckel) || 'null') } catch { return null } };
    const farsk = m => !!m && Date.now() - Number(m.at || 0) < ttl;
    const niva = () => (typeof minNiva === 'function' ? Number(minNiva()) || 2 : 2);
    const skriv = n => { try { localStorage.setItem(nyckel, JSON.stringify({ tabId, niva: n, at: Date.now() })) } catch {} };
    const farTaOver = (m, n) => !farsk(m) || m.tabId === tabId || (n === 1 && Number(m.niva || 2) > 1);

    // REN LÄSNING. Svarar bara på frågan, tar aldrig platsen — så den kan användas i prov och
    // diagnostik utan att påverka svaret. Jämför farKora() nedan, som är ett anspråk.
    // Domarens senaste svar. `null` = domaren har inte svarat (an), och da galler den lokala
    // vagen. Tidsstampeln finns for att ett gammalt ja inte ska leva vidare om domaren tystnar.
    let domarSvar = null, domarSvarAt = 0;
    const domarenGaller = () => domarSvar !== null && Date.now() - domarSvarAt < ttl;

    async function fragaDomaren() {
      if (!domare || typeof fetch !== 'function') return false;
      try {
        const r = await fetch(domare + '/api/automation/master', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nyckel, tabId, niva: niva() }),
        });
        const d = r && r.ok ? await r.json() : null;
        if (!d || d.ok === false) { domarSvar = null; return false; }
        domarSvar = d.jagArMaster === true;
        domarSvarAt = Date.now();
        return true;
      } catch { domarSvar = null; return false; }   // fail-open: den lokala vagen tar over
    }

    function arMaster() {
      if (domarenGaller()) return domarSvar;
      const m = las();
      return farsk(m) ? m.tabId === tabId : false;
    }

    // ETT ANSPRÅK, INTE EN FRÅGA — och därför heter den inte arMaster(). Står platsen tom tar vi
    // den och kör: hellre en dubblett i det ögonblick en master dör än en tyst overlay.
    //
    // Kvarvarande lucka: två flikar som behandlar SAMMA event i exakt det ögonblicket kan båda se
    // en tom plats och båda köra. Låset nedan serialiserar hjärtslagen men inte den här synkrona
    // vägen — anroparen är synkron och kan inte vänta på ett lås. Fönstret är den enda stund då
    // ingen levande master finns, alltså högst ttl efter att en flik försvunnit.
    function farKora() {
      // Domaren gar fore den lokala nyckeln nar den svarat: den ser bada rymderna, det gor inte
      // localStorage. Har den inte svarat pa ttl ar den tyst, och da galler vagen nedan.
      if (domarenGaller()) return domarSvar;
      const m = las(), n = niva();
      if (farsk(m) && m.tabId === tabId) return true;
      if (!farTaOver(m, n)) return false;
      skriv(n);
      return true;
    }

    // Den auktoritativa vägen: under lås, så att flera flikar som startar samtidigt landar i att
    // exakt en av dem håller nyckeln. Låset finns i varje flik — det är session-states mode, inte
    // navigator.locks, som saknas i en overlay.
    function medLas(fn) {
      const locks = typeof navigator === 'object' && navigator.locks;
      if (!locks || typeof locks.request !== 'function') { try { fn() } catch {} return Promise.resolve() }
      return locks.request(nyckel, { mode: 'exclusive' }, async () => { try { fn() } catch {} }).catch(() => {});
    }
    function pulsa() {
      // Fraga domaren OCH halla den lokala nyckeln vid liv. Den lokala behovs an: faller domaren
      // bort mitt i en sandning ska valet fortsatta fungera mellan flikarna i samma rymd.
      const lokalt = () => medLas(() => { const m = las(), n = niva(); if (farTaOver(m, n)) skriv(n) });
      if (!domare) return lokalt();
      return fragaDomaren().then(() => lokalt());
    }

    pulsa();
    const timer = setInterval(pulsa, puls);
    // Lämna platsen direkt när fliken stängs i stället för att låta nästa flik vänta ut TTL:en.
    addEventListener('pagehide', () => {
      clearInterval(timer);
      try { if (arMaster()) localStorage.removeItem(nyckel) } catch {}
      // Lamna aven domarens plats direkt, sa nasta flik slipper vanta ut TTL:en.
      try {
        if (domare && typeof fetch === 'function') fetch(domare + '/api/automation/master', {
          method: 'DELETE', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nyckel, tabId }), keepalive: true,
        }).catch(() => {});
      } catch {}
    });

    return { arMaster, farKora, pulsa, tabId, nyckel, TTL: ttl, domare };
  }

  window.VyraMasterval = { skapa, TTL, PULS };
})();
