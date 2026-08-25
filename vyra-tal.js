(() => {
  // TALUTRYMMET — ETT LJUD I TAGET, OCH RESTEN SÄNKER SIG (§14 i docs/tech-debt.md).
  //
  // Uppmätt 2026-08-17 i en flik: en TTS-action startade 12 ms in i en pågående chattuppläsning.
  // Två röster i mun på varandra, i det ögonblick en tittare precis betalat för att höras.
  //
  // Orsaken var att de två talsystemen aldrig kände till varandra. tts-chat.js hade en egen kö med
  // en `speaking`-flagga; action-runtime.js:s tts() ropade rakt på speechSynthesis. Ingen av dem
  // exponerade något — tts-chat.js lade inte en enda symbol på window.
  //
  // KÖN ÄR INTE TALSPECIFIK, OCH DET ÄR HELA POÄNGEN MED DEN HÄR FILEN. Enheten var
  // `{text, opts}`, men det verkliga villkoret är "ett ljud åt gången, nästa startar när
  // föregående rapporterar klart". Här är enheten därför ett ANSPRÅK med ett löfte:
  //
  //     koa({ kalla, spela: () => Promise, maxKo })
  //
  // Då kan tts-chat.js:s uppläsning och en TTS-action dela exakt samma kö utan att kön behöver
  // veta vad ett `cloud:`-röstnamn är.
  //
  // LJUDFILER KÖAS INTE — DE DUCKAS. Ett gåvoljud hör ihop med sin visuella effekt i tid; att
  // lägga det bakom en tjugo sekunder lång uppläsning förstör larmet i stället för att rädda det.
  // Därför volymfaktor() och lyssna(): den som spelar ett ljud sänker sig medan någon talar.
  // Duckningen är ENKELRIKTAD med flit — talet duckar aldrig för ett gåvoljud, för talet är det
  // man måste höra.
  const DUCK = 0.35;
  const ko = [];
  let talarNu = false;
  const lyssnare = new Set();

  const volymfaktor = () => (talarNu ? DUCK : 1);
  function meddela() {
    const f = volymfaktor();
    for (const fn of lyssnare) { try { fn(f) } catch (err) { console.warn('[VYRA] duckningslyssnare kastade', err) } }
  }
  // Returnerar en avregistrerare, så en widget som rivs ner inte lämnar kvar en referens till sin
  // egen döda nod. Utan den läcker varje uppspelning en lyssnare.
  function lyssna(fn) {
    if (typeof fn !== 'function') return () => {};
    lyssnare.add(fn);
    try { fn(volymfaktor()) } catch (_) {}
    return () => lyssnare.delete(fn);
  }

  // DUCKNINGENS TRE STEG, PÅ ETT STÄLLE. Sätt basvolymen, prenumerera under hela uppspelningen,
  // och AVREGISTRERA när ljudet tar slut. Missas det sista läcker varje uppspelning en lyssnare
  // mot en död nod — se lyssna() ovan.
  //
  // Dansen låg tidigare som en privat `duckaMedan` i action-runtime.js, och §14 lämnade tre
  // fristående ljudkällor helt utanför den. Att kopiera den till de tre hade gett fyra
  // implementationer som kan glida isär; det var precis invändningen mot väg 1 i §13.
  //
  // Tar både <audio> och <video>: action-runtime.js duckar sina videoelement med samma anrop.
  function duckaLjud(el, basvolym = 1) {
    if (!el || typeof el.addEventListener !== 'function') return () => {};
    const bas = Math.min(1, Math.max(0, Number(basvolym) || 0));
    // SAMMA ELEMENT KAN SPELAS OM. sound-alerts.js bygger ett audioEl per kort och återanvänder
    // det vid varje klick. Utan den här raden staplas en ny prenumeration per klick, och den
    // gamla fortsätter skriva sin egen basvolym på samma nod.
    try { el.__vyraDuckAv?.() } catch (_) {}
    const satt = f => { try { el.volume = bas * f } catch (_) {} };
    satt(volymfaktor());
    const av = lyssna(satt);
    const slapp = () => {
      av();
      if (el.__vyraDuckAv === slapp) el.__vyraDuckAv = null;
      el.removeEventListener('ended', slapp);
      el.removeEventListener('error', slapp);
    };
    el.__vyraDuckAv = slapp;
    el.addEventListener('ended', slapp);
    el.addEventListener('error', slapp);
    return slapp;
  }

  // KÖLÄNGDEN MÅSTE VARA LÄSBAR FRÅN EN ANNAN FLIK (§14). Den som DRAR kostnaden för en chattrad
  // är automationsmastern; den som TALAR är röstmastern, och de är sällan samma flik. Kollar den
  // betalande fliken sin egen tomma kö tar den betalt för rader som röstmastern sedan slänger —
  // uppmätt: 40 poäng för två upplästa rader. Röstmastern publicerar därför sin kölängd.
  const KO_NYCKEL = 'vyra-tal-ko';
  function publicera() {
    if (!window.VyraRostMaster?.arMaster?.()) return;
    try { localStorage.setItem(KO_NYCKEL, JSON.stringify({ langd: ko.length, at: Date.now() })) } catch {}
  }
  // Färsk främmande publicering vinner över den egna kön; är jag själv röstmaster är min egen kö
  // sanningen. Utan färskhetskravet skulle en stängd flik lämna en evig fantomkö efter sig.
  function koLangdDelad() {
    if (window.VyraRostMaster?.arMaster?.()) return ko.length;
    try {
      const d = JSON.parse(localStorage.getItem(KO_NYCKEL) || 'null');
      if (d && Date.now() - Number(d.at || 0) < 6000) return Number(d.langd) || 0;
    } catch (_) {}
    return ko.length;
  }

  // Den post som TALAR just nu. Behovs for att kunna avbryta ett pagaende yttrande — ett tomt
  // ko racker inte nar meningen ar "sluta prata om forra sandningen NU".
  let pagaendePost = null;

  function nasta() {
    if (talarNu || !ko.length) return;
    const post = ko.shift();
    pagaendePost = post;
    publicera();
    talarNu = true;
    meddela();
    let klar = false;
    const klarSignal = () => {
      if (klar) return;
      klar = true;
      talarNu = false;
      if (pagaendePost === post) pagaendePost = null;
      meddela();
      nasta();
    };
    // Verklig webbläsarflakighet (dokumenterad, bl.a. kring bakgrundade flikar): SpeechSynthesis
    // fyrar ibland varken onend eller onerror. Utan en bortre gräns står `talarNu` kvar för alltid
    // och HELA talutrymmet är låst tills sidan laddas om — nu även för actions, inte bara chatten.
    const bortreGrans = setTimeout(klarSignal, Math.max(8000, Number(post.maxMs) || 0));
    const avsluta = () => { clearTimeout(bortreGrans); klarSignal() };
    let p;
    try { p = post.spela() } catch (err) { console.warn('[VYRA] talpost kastade direkt', err); avsluta(); return }
    Promise.resolve(p).then(avsluta, err => { console.warn('[VYRA] talpost misslyckades', err); avsluta() });
  }

  // maxKo speglar samma "släng nyanlända när det är fullt"-mönster som action-runtime.js redan
  // använder för scenernas köer, och som tts-chat.js hade internt.
  function koa({ kalla = 'okand', spela, avbryt = null, maxKo = 5, maxMs = 0 } = {}) {
    if (typeof spela !== 'function') return false;
    if (ko.length >= Math.max(1, Number(maxKo) || 5)) return false;
    ko.push({ kalla, spela, avbryt, maxMs });
    publicera();
    nasta();
    return true;
  }

  // TOM KON — och tysta det som redan talar.
  //
  // En NY SANDNING ska inte inledas med forra sandningens kommentarer. Att bara toma kon racker
  // inte: yttrandet som redan pagar kan vara flera sekunder langt, och det ar det tittarna hor
  // forst i den nya sandningen. `avbrytPagaende` ber darfor den talande posten sjalv sluta — den
  // vet hur, vi vet det inte (lokal rost och molnrost stoppas pa olika satt).
  //
  // `kalla` filtrerar: en sandningsreset ska tomma chattens ko, inte en actions ljudlarm.
  function tomKo({ avbrytPagaende = false, kalla = null } = {}) {
    const kvar = kalla ? ko.filter(p => p.kalla !== kalla) : [];
    const bort = ko.length - kvar.length;
    ko.length = 0;
    for (const p of kvar) ko.push(p);
    publicera();
    if (avbrytPagaende && talarNu && pagaendePost
      && (!kalla || pagaendePost.kalla === kalla)
      && typeof pagaendePost.avbryt === 'function') {
      // Avbrytaren far INTE anses vara "klart" harifran: post.spela()-loftet loser sig sjalvt nar
      // rosten faktiskt tystnat, och det ar den vagen som satter talarNu = false.
      try { pagaendePost.avbryt() } catch (e) { console.warn('[VYRA] avbryt kastade', e) }
    }
    return bort;
  }

  window.VyraTal = {
    koa, tomKo, lyssna, volymfaktor, duckaLjud,
    talar: () => talarNu,
    koLangd: () => ko.length,
    koLangdDelad,
    DUCK,
  };

  // RÖSTENS FÖRARE — samma mekanism som automationens, med OMVÄND prioritet.
  //
  // Nivå 1 är en OVERLAY, inte studion. En streamer fångar sitt ljud via browser source i OBS,
  // inte via desktop audio, så en röst som bara talar i Studion försvinner ur sändningen. Nivå 2
  // är studion, så en ensam studioflik utan öppen overlay fortfarande låter — samma fail-open som
  // resten av kedjan.
  //
  // Avdraget hör INTE hit: kostnaden är en ekonomifråga och dras av automationsmastern, exakt en
  // gång, oavsett var det låter. Se tts-chat.js.
  const val = window.VyraMasterval?.skapa?.({
    nyckel: 'vyra-rost-master',
    minNiva: () => (window.VYRA_OVERLAY_SCENE ? 1 : 2),
  });
  window.VyraRostMaster = val || {
    arMaster: () => true, farKora: () => true, pulsa: () => Promise.resolve(),
    tabId: 'utan-masterval', nyckel: 'vyra-rost-master', TTL: 6000,
  };
})();
