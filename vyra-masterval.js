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

  function skapa({ nyckel, minNiva, ttl = TTL, puls = PULS } = {}) {
    const tabId = (typeof crypto === 'object' && crypto.randomUUID)
      ? crypto.randomUUID() : 'flik-' + Math.random().toString(36).slice(2);
    const las = () => { try { return JSON.parse(localStorage.getItem(nyckel) || 'null') } catch { return null } };
    const farsk = m => !!m && Date.now() - Number(m.at || 0) < ttl;
    const niva = () => (typeof minNiva === 'function' ? Number(minNiva()) || 2 : 2);
    const skriv = n => { try { localStorage.setItem(nyckel, JSON.stringify({ tabId, niva: n, at: Date.now() })) } catch {} };
    const farTaOver = (m, n) => !farsk(m) || m.tabId === tabId || (n === 1 && Number(m.niva || 2) > 1);

    // REN LÄSNING. Svarar bara på frågan, tar aldrig platsen — så den kan användas i prov och
    // diagnostik utan att påverka svaret. Jämför farKora() nedan, som är ett anspråk.
    function arMaster() {
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
      return medLas(() => { const m = las(), n = niva(); if (farTaOver(m, n)) skriv(n) });
    }

    pulsa();
    const timer = setInterval(pulsa, puls);
    // Lämna platsen direkt när fliken stängs i stället för att låta nästa flik vänta ut TTL:en.
    addEventListener('pagehide', () => {
      clearInterval(timer);
      try { if (arMaster()) localStorage.removeItem(nyckel) } catch {}
    });

    return { arMaster, farKora, pulsa, tabId, nyckel, TTL: ttl };
  }

  window.VyraMasterval = { skapa, TTL, PULS };
})();
