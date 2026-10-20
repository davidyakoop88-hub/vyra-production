(function () {
  'use strict';
  // TESTMOTORN — ▶ Testa widget (panelspecifikationen kapitel 2, PR 2).
  //
  // Motorn spelar VALD widget lokalt i editorn: entré → visning → utgång, med widgetens aktuella
  // placering, storlek, text, färger och animation och med exempeldata där det behövs. Själva
  // uppspelningen gör en ADAPTER per familj; motorn äger allt runt den och garanterar att ingen
  // adapter kan nå sändningen, servern eller den riktiga layouten — inte ens av misstag.
  //
  // INGA FAMILJER REGISTRERAS HÄR. Knappen visas bara för modeller vars registerpost har `test`
  // med en registrerad adapter, så i den här PR:en ser användaren ingen ändring.
  //
  // ---- Adapterformat --------------------------------------------------------------------------
  //
  //   VyraTestspel.registrera('topgift', {
  //     typer: [['rose', 'Rose'], ['lion', 'Lion']],     // valfri: EN typväljare i sektion 1
  //     typEtikett: 'Gåva',                              // valfri: väljarens etikett (standard Typ)
  //     spela(nod, k, ex, ctl) {                        // synkron, returnerar faserna i ms
  //       nod.classList.add('play');
  //       ctl.setTimeout(() => nod.classList.add('ut'), 2600);
  //       return { entre: 600, visning: 2000, utgang: 500 };
  //     },
  //     stoppa(nod, k) { nod.classList.remove('play', 'ut') },  // rensa canvas, rAF, runtime-poster för k.id
  //   });
  //
  //   nod  KLONENS nod. Den ligger som syskon till den riktiga noden i .canvas, med samma inline-stil
  //        (left/top/transform), och har data-id = k.id. Den riktiga noden rörs aldrig.
  //   k    structuredClone av widgeten vid klicket, med k.id = w.id + '__prov'. Finns aldrig i state.
  //   ex   VyraExempeldata.hamta(adapter-id, typ): ny, djupfryst och deterministisk.
  //   ctl  ctl.setTimeout / clearTimeout / setInterval / clearInterval / raf / cancelRaf / lyssna,
  //        ctl.signal (AbortSignal) och ctl.typ. Allt som registreras den vägen rensas vid stopp.
  //
  // ---- Garantierna ----------------------------------------------------------------------------
  //
  // 1. KLON. Adaptern får klonens nod och en kopia av widgeten. Den riktiga noden göms med en
  //    stilregel (inte genom att röra noden), så den är tecken för tecken densamma efteråt.
  // 2. VAKTER. Under varje adapteranrop — spela, stoppa och varje ctl-återanrop — är de farliga
  //    vägarna (FORBJUDNA nedan) vaktade: ett anrop kastar, loggas och stoppar testet. En adapter
  //    som sväljer felet själv stoppas ändå, för brottet räknas av motorn, inte av adaptern.
  //    Vakterna släpper igenom allt som inte kommer från adaptern: en riktig livehändelse mitt i
  //    ett test går som vanligt (JS är entrådigt, och vakten är bara spänd medan adaptern kör).
  // 3. STATE. Före varje adapteranrop tas en bild av `state`; ändrade adaptern något återställs
  //    det på plats direkt efteråt (samma objekt, så inga referenser blir gamla) och räknas som
  //    brott. ctl.raf-återanrop kontrollerar bara den testade widgeten, för att inte serialisera
  //    hela layouten 60 gånger i sekunden.
  // 4. ASYNKRONT BARA VIA ctl. En async-funktion eller ett Promise från spela avvisas, eftersom
  //    kod efter en await körs utanför vakterna. Det som ska hända senare går via ctl.setTimeout
  //    eller ctl.raf, som körs vaktat.
  // 5. STOPP. ■ Stoppa test, Esc, byte av vald widget, vybyte och varje render() stoppar testet
  //    först. render() bygger om duken, så en omritning kan aldrig lämna en föräldralös klon.
  // 6. OVERLAY. I ?overlay=1 gör motorn ingenting: ingen knapp, inga omslag, spela() är en no-op.

  const KLON_SUFFIX = '__prov';
  const MAX_TOTAL_MS = 60000;
  const BEVAKNING_MS = 200;

  // Vägar en adapter aldrig får anropa. [objektnamn eller null för window, metodnamn eller '*'].
  // '*' vaktar alla funktioner på objektet. Sessionernas objekt äger de riktiga köerna.
  const FORBJUDNA = Object.freeze([
    // Nätet och sändningen
    [null, 'fetch'], [null, 'EventSource'], [null, 'WebSocket'],
    ['WebSocket.prototype', 'send'], ['XMLHttpRequest.prototype', 'open'], ['XMLHttpRequest.prototype', 'send'],
    ['BroadcastChannel.prototype', 'postMessage'], ['navigator', 'sendBeacon'],
    ['VyraLive', '*'], ['VyraAuth', '*'], ['VyraGoals', '*'], ['VyraCloudMedia', '*'],
    // Sparande: save() är `const` i studio.js och kan inte omslutas, men den går alltid via de här
    ['VyraHistorik', '*'], ['VyraSessionState', '*'],
    ['Storage.prototype', 'setItem'], ['Storage.prototype', 'removeItem'], ['Storage.prototype', 'clear'],
    // Köer, poäng, mål, actions och automationer
    ['VyraAlertQueue', '*'], ['VyraPoints', '*'], ['VyraActionRuntime', '*'],
    ['VyraBattleMvp', '*'], ['VyraFanLevel', '*'], ['VyraFanLevel50Session', '*'], ['VyraGifterLevel', '*'],
    ['VyraGuardian', '*'], ['VyraGiftFireworks', '*'], ['VyraHeartFireworks', '*'], ['VyraGiftBubbles', '*'],
    ['VyraCampaignAuraSession', '*'],
    // Globala triggers som filtrerar state.widgets per typ, skriver på w eller kör save()
    [null, 'routeLiveBattleEvent'], [null, 'triggerBattleMvp'], [null, 'triggerFanLevelUp'],
    [null, 'triggerGifterLevelUp'], [null, 'triggerNewFollower'], [null, 'triggerGuardianEmblem'],
    [null, 'triggerGloveSnipe'], [null, 'showLastX'], [null, 'queueLX'],
    [null, 'saveThenRender'], [null, 'vyraRenderKeepingPanel'],
  ]);

  // ---- Lägen -----------------------------------------------------------------------------------
  function iOverlay() {
    if (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY) return true;
    try { return new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; }
  }
  const iEditor = () => typeof view !== 'undefined' && view === 'editor' && !iOverlay();
  const valtId = () => (typeof selected !== 'undefined' ? selected : null);
  const vald = () => (typeof liveWidget === 'function' ? liveWidget(valtId()) : null);
  const st = () => (typeof state !== 'undefined' ? state : null);

  // ---- Adaptrar --------------------------------------------------------------------------------
  const adaptrar = new Map();
  const arAsync = f => !!f && f.constructor && f.constructor.name === 'AsyncFunction';

  function registrera(id, adapter) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('VyraTestspel.registrera: id saknas');
    if (adaptrar.has(id)) throw new Error('VyraTestspel: adaptern ' + id + ' är redan registrerad');
    if (!adapter || typeof adapter.spela !== 'function') throw new Error('VyraTestspel: ' + id + ' saknar spela(nod, k, ex, ctl)');
    if (typeof adapter.stoppa !== 'function') throw new Error('VyraTestspel: ' + id + ' saknar stoppa(nod, k)');
    if (arAsync(adapter.spela) || arAsync(adapter.stoppa)) throw new Error('VyraTestspel: ' + id + ' får inte vara async — använd ctl.setTimeout/ctl.raf');
    if (adapter.typer !== undefined && !(Array.isArray(adapter.typer) && adapter.typer.length
      && adapter.typer.every(t => Array.isArray(t) && t.length === 2 && typeof t[1] === 'string'))) {
      throw new Error('VyraTestspel: ' + id + ' typer måste vara [[värde, etikett], …]');
    }
    if (adapter.typEtikett !== undefined && !(typeof adapter.typEtikett === 'string' && adapter.typEtikett.trim())) {
      throw new Error('VyraTestspel: ' + id + ' typEtikett måste vara en text');
    }
    adaptrar.set(id, Object.freeze({ spela: adapter.spela, stoppa: adapter.stoppa,
      typer: adapter.typer ? Object.freeze(adapter.typer.map(t => Object.freeze(t.slice()))) : null,
      typEtikett: adapter.typEtikett || 'Typ' }));
    return id;
  }

  function postFor(w) {
    if (!w) return null;
    const P = window.VyraPanelram;
    if (P && typeof P.postFor === 'function') return P.postFor(w);
    const R = window.VyraPanelregister;
    return R && typeof R.hitta === 'function' ? R.hitta(w) : null;
  }
  function adapterFor(w) {
    const R = postFor(w);
    if (!R || typeof R.test !== 'string') return null;
    const a = adaptrar.get(R.test);
    return a ? { id: R.test, a, R } : null;
  }
  // Knappen visas bara här: editorn, inte overlay, och en registerpost med en registrerad adapter.
  const kan = w => !!(iEditor() && adapterFor(w || vald()));

  // ---- Vakter ----------------------------------------------------------------------------------
  let vaktDjup = 0;
  const brottLogg = [];
  const installerade = [];

  function nyttBrott(vag) {
    const post = { vag, adapter: spel ? spel.adapterId : null, widget: spel ? spel.wid : null };
    brottLogg.push(post);
    if (spel) spel.brott.push(vag);
    console.error('[VyraTestspel] testet försökte nå ' + vag + ' — förbjudet i testläget. Testet stoppas.');
    return post;
  }
  function brott(vag) {
    nyttBrott(vag);
    const fel = new Error('VyraTestspel: ' + vag + ' är förbjudet i testläget');
    fel.name = 'VyraTestspelBrott';
    throw fel;
  }

  function malObjekt(namn) {
    if (namn === null) return window;
    let o = window;
    for (const del of namn.split('.')) { if (o == null) return null; try { o = o[del]; } catch (_) { return null; } }
    return o && (typeof o === 'object' || typeof o === 'function') ? o : null;
  }

  function vakta(obj, metod, etikett) {
    let orig;
    try { orig = obj[metod]; } catch (_) { return; }
    if (typeof orig !== 'function' || orig.__vyraTestspelVakt) return;
    const omslag = function () {
      if (vaktDjup > 0) brott(etikett);
      return new.target ? Reflect.construct(orig, arguments, new.target) : orig.apply(this, arguments);
    };
    omslag.__vyraTestspelVakt = true;
    if (orig.prototype) omslag.prototype = orig.prototype;
    try { obj[metod] = omslag; } catch (_) { return; }
    if (obj[metod] === omslag) installerade.push({ obj, metod, orig, omslag });
  }

  function spannVakter() {
    for (const [namn, metod] of FORBJUDNA) {
      const obj = malObjekt(namn);
      if (!obj) continue;
      const etikett = (namn ? namn.replace('.prototype', '') + '.' : '') + (metod === '*' ? '' : metod);
      if (metod === '*') {
        for (const m of Object.keys(obj)) if (typeof obj[m] === 'function') vakta(obj, m, etikett + m);
      } else vakta(obj, metod, etikett);
    }
  }
  // Bara de omslag som fortfarande ligger överst tas bort. Har någon annan lindat in metoden efter
  // oss ligger vårt omslag kvar under deras — det släpper igenom allt utanför ett test.
  function slappVakter() {
    while (installerade.length) {
      const v = installerade.pop();
      try { if (v.obj[v.metod] === v.omslag) v.obj[v.metod] = v.orig; } catch (_) {}
    }
  }

  // ---- State-bild ------------------------------------------------------------------------------
  const json = v => { try { return JSON.stringify(v); } catch (_) { return '\u0000'; } };

  function fotografera() {
    const s = st();
    if (!s) return null;
    const top = {};
    for (const k of Object.keys(s)) if (k !== 'widgets') top[k] = json(s[k]);
    const arr = Array.isArray(s.widgets) ? s.widgets : null;
    return { top, arr, poster: arr ? arr.map(w => [w, json(w)]) : [] };
  }

  // Återställer på plats och returnerar vad som ändrats (eller null).
  function aterstall(f) {
    const s = st();
    if (!s || !f) return null;
    const andrat = [];
    const nycklar = new Set([...Object.keys(f.top), ...Object.keys(s).filter(k => k !== 'widgets')]);
    for (const k of nycklar) {
      const nu = k in s ? json(s[k]) : undefined;
      if (nu === f.top[k]) continue;
      andrat.push(k);
      if (f.top[k] === undefined) delete s[k]; else s[k] = JSON.parse(f.top[k]);
    }
    if (s.widgets !== f.arr) { andrat.push('widgets'); s.widgets = f.arr; }
    if (f.arr) {
      const ratt = f.poster.map(p => p[0]);
      if (f.arr.length !== ratt.length || f.arr.some((w, i) => w !== ratt[i])) {
        andrat.push('widgets[]');
        f.arr.length = 0;
        f.arr.push(...ratt);
      }
      for (const [w, j] of f.poster) {
        if (json(w) === j) continue;
        andrat.push('widget ' + (w && w.id));
        const o = JSON.parse(j);
        for (const key of Object.keys(w)) if (!(key in o)) delete w[key];
        Object.assign(w, o);
      }
    }
    return andrat.length ? andrat.join(', ') : null;
  }

  // Lätt bild för rAF: bara den testade widgeten och listans längd.
  function fotograferaLatt(s) {
    const S = st();
    const w = S && Array.isArray(S.widgets) ? S.widgets.find(x => x && x.id === s.wid) : null;
    return { arr: S && S.widgets, len: S && S.widgets ? S.widgets.length : 0, w, j: json(w) };
  }
  function aterstallLatt(f) {
    const S = st();
    const andrat = [];
    if (S && (S.widgets !== f.arr || (S.widgets && S.widgets.length !== f.len))) andrat.push('widgets');
    if (f.w && json(f.w) !== f.j) {
      andrat.push('widget ' + f.w.id);
      const o = JSON.parse(f.j);
      for (const key of Object.keys(f.w)) if (!(key in o)) delete f.w[key];
      Object.assign(f.w, o);
    }
    return andrat.length ? andrat.join(', ') : null;
  }

  // ---- Spelet ----------------------------------------------------------------------------------
  let spel = null;
  let senaste = null;
  const typval = new Map();                     // widget-id → vald typ; bara i minnet, aldrig i state

  // Kör adapterkod vaktat. Returnerar {ut, ok}.
  function skyddat(s, fn, latt) {
    if (!s || spel !== s) return { ok: false };
    const foto = latt ? fotograferaLatt(s) : fotografera();
    const fore = s.brott.length;
    let ut, fel = null;
    vaktDjup++;
    try { ut = fn(); } catch (e) { fel = e; } finally { vaktDjup--; }
    const andrat = latt ? aterstallLatt(foto) : aterstall(foto);
    if (andrat) nyttBrott('state (' + andrat + ')');
    const brutit = s.brott.length > fore;
    if (fel && !brutit) console.error('[VyraTestspel]', fel);
    if ((brutit || fel) && !s.stoppar && spel === s) {
      stoppa(brutit ? 'brott' : 'fel');
      if (brutit && typeof toast === 'function') { try { toast('Testet stoppades: det försökte påverka sändningen eller layouten'); } catch (_) {} }
    }
    return { ut, ok: !fel && !brutit };
  }

  function byggCtl(s) {
    const T = window.setTimeout.bind(window), CT = window.clearTimeout.bind(window);
    const SI = window.setInterval.bind(window), CI = window.clearInterval.bind(window);
    const RAF = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : (f => T(() => f(Date.now()), 16));
    const CRAF = typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame.bind(window) : CT;
    s.rensa = () => {
      s.timers.forEach(CT); s.timers.clear();
      s.intervaller.forEach(CI); s.intervaller.clear();
      s.rafs.forEach(CRAF); s.rafs.clear();
    };
    return Object.freeze({
      signal: s.ctrl.signal,
      typ: s.typ,
      setTimeout(fn, ms) {
        if (spel !== s) return 0;
        const id = T(() => { s.timers.delete(id); skyddat(s, fn); }, ms);
        s.timers.add(id);
        return id;
      },
      clearTimeout(id) { if (s.timers.delete(id)) CT(id); },
      setInterval(fn, ms) {
        if (spel !== s) return 0;
        const id = SI(() => skyddat(s, fn), ms);
        s.intervaller.add(id);
        return id;
      },
      clearInterval(id) { if (s.intervaller.delete(id)) CI(id); },
      raf(fn) {
        if (spel !== s) return 0;
        const id = RAF(t => { s.rafs.delete(id); skyddat(s, () => fn(t), true); });
        s.rafs.add(id);
        return id;
      },
      cancelRaf(id) { if (s.rafs.delete(id)) CRAF(id); },
      lyssna(el, typ, fn, opt) {
        if (spel !== s || !el || typeof el.addEventListener !== 'function') return;
        el.addEventListener(typ, e => skyddat(s, () => fn(e)), Object.assign({}, opt || {}, { signal: s.ctrl.signal }));
      },
    });
  }

  const cssStr = v => String(v).replace(/["\\]/g, '\\$&');
  const riktigNod = id => document.querySelector(`.canvas [data-id="${cssStr(id)}"]:not([data-testspel-klon])`);

  function dolj(id) {
    const stil = document.createElement('style');
    stil.dataset.testspelDolj = id;
    // opacity och visibility: ett barn med egen visibility:visible hade annars synts igenom.
    stil.textContent = `.canvas [data-id="${cssStr(id)}"]:not([data-testspel-klon]){visibility:hidden!important;opacity:0!important}`;
    (document.head || document.documentElement).append(stil);
    return stil;
  }

  function giltigaFaser(f) {
    if (!f || typeof f !== 'object' || typeof f.then === 'function') return null;
    const ut = {};
    for (const k of ['entre', 'visning', 'utgang']) {
      const n = Number(f[k]);
      if (!Number.isFinite(n) || n < 0) return null;
      ut[k] = Math.round(n);
    }
    const total = ut.entre + ut.visning + ut.utgang;
    return total > 0 && total <= MAX_TOTAL_MS ? Object.freeze(ut) : null;
  }

  function spela(w) {
    if (iOverlay() || !iEditor()) return false;
    w = w || vald();
    if (!w || w.id !== valtId()) return false;   // bara VALD widget spelas
    const p = adapterFor(w);
    if (!p) return false;
    if (spel) stoppa('omstart');
    const riktig = riktigNod(w.id);
    if (!riktig || !riktig.parentElement) return false;

    let k;
    try { k = typeof structuredClone === 'function' ? structuredClone(w) : JSON.parse(JSON.stringify(w)); }
    catch (_) { k = JSON.parse(JSON.stringify(w)); }
    k.id = w.id + KLON_SUFFIX;
    const typ = p.a.typer ? (typval.get(w.id) || p.a.typer[0][0]) : null;

    const s = {
      wid: w.id, adapterId: p.id, adapter: p.a, k, typ, nod: null, stil: null,
      ctrl: new AbortController(), timers: new Set(), intervaller: new Set(), rafs: new Set(),
      motor: [], brott: [], faser: null, fas: null, forlopp: [], stoppar: false, startad: false, rensa: () => {},
    };
    spel = s;
    spannVakter();
    s.ctl = byggCtl(s);

    // Klonens nod byggs av samma renderare, vaktat: en renderare som når nätet eller sparar när
    // den ritar en klon är också ett brott.
    const r = skyddat(s, () => {
      const mall = document.createElement('div');
      mall.innerHTML = typeof wh === 'function' ? wh(k) : riktig.outerHTML;
      const nod = mall.firstElementChild;
      if (!nod) throw new Error('klonen kunde inte ritas');
      nod.setAttribute('data-id', k.id);
      nod.style.cssText = riktig.style.cssText;   // exakt samma placering, även transform satt efter render
      nod.style.pointerEvents = 'none';
      nod.classList.remove('selected');
      nod.dataset.testspelKlon = '1';
      nod.setAttribute('aria-hidden', 'true');
      return nod;
    });
    if (!r.ok || spel !== s) { if (spel === s) stoppa('fel'); return false; }
    s.nod = r.ut;
    riktig.after(s.nod);
    s.stil = dolj(w.id);

    const ex = window.VyraExempeldata && typeof window.VyraExempeldata.hamta === 'function'
      ? window.VyraExempeldata.hamta(p.id, typ) : Object.freeze({});
    s.ex = ex;
    s.startad = true;
    const res = skyddat(s, () => s.adapter.spela(s.nod, k, ex, s.ctl));
    if (spel !== s) return false;
    const faser = res.ok ? giltigaFaser(res.ut) : null;
    if (!faser) {
      console.error('[VyraTestspel] ' + p.id + ': spela() ska synkront returnera {entre, visning, utgang} i ms (totalt högst ' + MAX_TOTAL_MS + ')');
      stoppa('fel');
      return false;
    }
    s.faser = faser;
    startaTidslinje(s);
    uppdateraKnapp();
    return true;
  }

  function startaTidslinje(s) {
    const { entre, visning, utgang } = s.faser;
    const vid = (ms, fn) => s.motor.push(setTimeout(() => { if (spel === s) fn(); }, ms));
    // Ett steg på 0 ms (Social Goal har ingen entré) visas inte i tidslinjen: förut stod "Entré"
    // där fast inget spelades (slutgranskning B-033). Förloppet i motorn är detsamma som förut.
    document.querySelectorAll('[data-testspel] .pr-tidslinje li').forEach(li => {
      li.style.display = s.faser[li.dataset.fas] === 0 ? 'none' : '';
    });
    visaFas(s, 'entre');
    vid(entre, () => visaFas(s, 'visning'));
    vid(entre + visning, () => visaFas(s, 'utgang'));
    vid(entre + visning + utgang, () => stoppa('klar'));
    // Selected-vakten: byte av vald widget eller vy utan render() (som annars stoppar först).
    s.bevakning = setInterval(() => {
      if (spel !== s) return;
      if (valtId() !== s.wid || !iEditor() || !s.nod.isConnected) stoppa('val');
    }, BEVAKNING_MS);
  }

  function visaFas(s, fas) {
    s.fas = fas;
    s.forlopp.push(fas);
    document.querySelectorAll('[data-testspel] .pr-tidslinje li').forEach(li => {
      const aktiv = li.dataset.fas === fas;
      if (aktiv) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.style.fontWeight = aktiv ? '700' : '';
      li.style.opacity = aktiv ? '1' : '.55';
    });
  }

  function stoppa(orsak) {
    const s = spel;
    if (!s || s.stoppar) return false;
    s.stoppar = true;
    try { s.ctrl.abort(); } catch (_) {}
    s.rensa();
    s.motor.forEach(clearTimeout);
    if (s.bevakning) clearInterval(s.bevakning);
    if (s.startad && s.nod) skyddat(s, () => s.adapter.stoppa(s.nod, s.k));
    if (s.nod) s.nod.remove();
    if (s.stil) s.stil.remove();
    spel = null;
    slappVakter();
    senaste = Object.freeze({ widget: s.wid, adapter: s.adapterId, faser: s.faser, forlopp: s.forlopp.slice(), orsak: orsak || 'stopp', brott: s.brott.slice() });
    uppdateraKnapp();
    document.querySelectorAll('[data-testspel] .pr-tidslinje li').forEach(li => {
      li.removeAttribute('aria-current'); li.style.fontWeight = ''; li.style.opacity = '';
    });
    return true;
  }

  // ---- Sektion 1: knapp, typväljare och tidslinje ---------------------------------------------
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function uppdateraKnapp() {
    document.querySelectorAll('[data-testspel] #pr-testspel').forEach(b => {
      const igang = !!spel && String(spel.wid) === b.closest('[data-testspel]').dataset.testspelWidget;
      const text = igang ? '■ Stoppa test' : '▶ Testa widget';
      if (b.textContent !== text) b.textContent = text;
      b.setAttribute('aria-pressed', igang ? 'true' : 'false');
    });
  }

  function byggSektion(w) {
    if (!iEditor() || !w) return null;
    const p = adapterFor(w);
    if (!p) return null;
    const rot = document.createElement('div');
    rot.className = 'pr-testspel';
    rot.dataset.testspel = '1';
    rot.dataset.testspelWidget = String(w.id);
    const typer = p.a.typer;
    const valdTyp = typer ? (typval.get(w.id) || typer[0][0]) : null;
    // Typväljaren (t.ex. "Antal gåvor") står FÖRE knappen med luft under sig: man väljer vad som ska
    // spelas och trycker sedan. Förut låg den kant i kant under knappen och mellan knappen och
    // tidslinjen, som hör till knappen (slutgranskning B-026).
    rot.innerHTML = (typer ? `<label style="margin:0 0 10px">${esc(p.a.typEtikett)}<select id="pr-testspel-typ">${typer.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(valdTyp) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : '')
      + `<button type="button" id="pr-testspel" aria-pressed="false">▶ Testa widget</button>`
      + `<ol class="pr-tidslinje" aria-label="Testets förlopp" style="display:flex;gap:10px;list-style:none;margin:6px 0 0;padding:0">`
      + `<li data-fas="entre">Entré</li><li data-fas="visning">Visning</li><li data-fas="utgang">Utgång</li></ol>`;
    rot.querySelector('#pr-testspel').onclick = () => {
      const v = vald();
      if (spel && v && spel.wid === v.id) stoppa('knapp');
      else api.spela(v);
    };
    const val = rot.querySelector('#pr-testspel-typ');
    if (val) val.onchange = () => {
      // Typen hör till testet, inte till widgeten: den sparas inte och kör ingen render().
      const v = typer.find(t => String(t[0]) === val.value);
      if (v) typval.set(w.id, v[0]);
      if (spel && spel.wid === w.id) stoppa('typ');
    };
    if (spel && spel.wid === w.id) {
      rot.querySelector('#pr-testspel').textContent = '■ Stoppa test';
      rot.querySelector('#pr-testspel').setAttribute('aria-pressed', 'true');
    }
    return rot;
  }

  // ---- Inkoppling ------------------------------------------------------------------------------
  const api = {
    registrera,
    spela: w => { try { return spela(w); } catch (e) { console.error('[VyraTestspel]', e); if (spel) stoppa('fel'); return false; } },
    stoppa: () => stoppa('stopp'),
    kan,
    harAdapter: id => adaptrar.has(id),
    status: () => spel
      ? { aktiv: true, widget: spel.wid, adapter: spel.adapterId, fas: spel.fas, faser: spel.faser, typ: spel.typ }
      : { aktiv: false, senaste },
    brott: () => brottLogg.map(b => Object.assign({}, b)),
    FORBJUDNA,
    KLON_SUFFIX,
  };

  if (iOverlay()) {
    // Overlay: ingenting ritas, ingenting lindas in. registrera() finns kvar så att familjernas
    // filer kan laddas på samma sätt i båda lägena.
    api.spela = () => false;
    api.stoppa = () => false;
    api.kan = () => false;
    window.VyraTestspel = api;
    return;
  }

  // Varje render() stoppar testet FÖRST. En adapter som själv anropar render() bryter mot reglerna.
  if (typeof render === 'function') {
    const foregaende = render;
    render = function () {
      if (vaktDjup > 0) brott('render');
      if (spel) stoppa('render');
      return foregaende.apply(this, arguments);
    };
  }
  // Selected-vakten i bind: ett bind utan render (sen skriptladdning) med en annan vald widget.
  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      if (spel && (valtId() !== spel.wid || !iEditor())) stoppa('val');
      return ut;
    };
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && spel) stoppa('esc'); });
  if (window.VyraPanelram && typeof window.VyraPanelram.tillagg === 'function') {
    window.VyraPanelram.tillagg(1, w => byggSektion(w));
  }

  window.VyraTestspel = api;
})();
