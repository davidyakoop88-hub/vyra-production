// bertil-paket.js — BERTIL PAKET: en interaktiv gåvoscen där tittarnas gåvor kastar ägg, glass,
// vattenmelon eller allt samtidigt på Bertil (Davids paket, 2026-11-02). En egen widgettyp,
// templateBertilPaket.
//
// STREAMERN VÄLJER GÅVORNA. Inga gåvor och inga coinpriser är förvalda: en ny widget kastar ingenting
// förrän streamern kopplat minst en gåva till ett kast. Flera gåvor kan kopplas till samma kast, men en
// gåva kan bara höra till ett. Gåvorna väljs ur samma katalog som Action & Events gåvoväljare
// (window.VyraGavokatalog) och sparas med katalogens giftId, så en gåva träffar även när TikTok skickar
// namnet på ett annat språk. Valen ligger i widgeten — alltså i arbetsytan och kontots molnsynk, inte i
// webbläsarens localStorage som i paketets fristående förhandsvisning.
//
// KLIPPEN ÄR FÄRDIGA. De 16 MP4-filerna i assets/gift-scene/ är redan kompositerade över samma
// grundbild och har träffljud och tal inbakat: ingen grönnyckling och inget extra ljud ovanpå. Engelska
// har tre repliker per kast och alla tre spelas innan samma replik kommer igen; svenska har en.
// Grundbilden (berra-neutral-v2.png) ligger kvar mellan klippen, så bakgrunden står still.
//
// BARA OBS REAGERAR PÅ RIKTIGA GÅVOR. Klippen har ljud: om studion också spelade dem hade streamern
// hört varje kast två gånger. Studion spelar bara ▶ Testa. Logiken för gåvor, kö och repliker är
// paketets egen och provad (gift-scene.js, window.VyraGiftSceneModel):
//   * en gåvocombo blir ett kast per gåva, utan tak, i en kompakt kö
//   * samma händelse två gånger, eller kvällens uppspelade historik vid omladdning, kastar inget igen
//   * blockerat ljud eller ett klipp som stannar lägger tillbaka kastet i kön och försöker igen
// Kön sparas i sessionStorage per widget, så en omladdad OBS-källa fortsätter där den var.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraBertilPaket) return;
  const M = window.VyraGiftSceneModel;
  if (!M) { console.error('[VYRA] Bertil paket: gift-scene.js saknas'); return; }

  const TYP = 'templateBertilPaket';
  const NAMN = 'Bertil paket';
  const OVERLAY = (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY) || /[?&]overlay(=|&|$)/.test(location.search);
  const MAPP = 'assets/gift-scene/';
  const BAKGRUND = MAPP + 'berra-neutral-v2.png';
  const FARSKT_MS = 15000;
  const DUK_B = 432, FORMAT = 16 / 9;
  const KAST = ['egg', 'icecream', 'melon', 'finale'];
  const MAX_GAVOR = 20;
  const OMFORSOK_MS = 5000;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const sakerBild = s => { try { return window.VyraSafe && window.VyraSafe.url ? window.VyraSafe.url(String(s || '')) : (/^(https?:|assets\/|\/api\/)/.test(String(s || '')) ? String(s) : ''); } catch (_) { return ''; } };
  const rost = w => (w && w.bpRost === 'sv' ? 'sv' : 'en');
  const volym = w => klamp(w && w.bpVolym, 0, 100, 65) / 100;

  // ---------- ren logik (provas utan DOM i tests/bertil-paket.test.js) ----------
  // Klippen per kast och språk. Melon och final heter "chaos" i paketet.
  function klipp(kast, sprak) {
    const kaos = kast === 'melon' || kast === 'finale';
    if (sprak === 'sv') return [MAPP + kast + (kaos ? '-chaos-sv.mp4' : '-v4.mp4')];
    return [MAPP + kast + (kaos ? '-chaos-en.mp4' : '-v5-en.mp4'), ...[1, 2].map(n => MAPP + kast + (kaos ? '-chaos-fun' : '-fun') + n + '-en.mp4')];
  }
  // Widgetens gåvoval, tvättat. En gåva som står under två kast räknas bara under det första.
  function gavor(w) {
    const ut = {}, tagna = new Set(), src = (w && w.bpGavor && typeof w.bpGavor === 'object') ? w.bpGavor : {};
    KAST.forEach(k => {
      ut[k] = (Array.isArray(src[k]) ? src[k] : []).filter(g => g && String(g.name || '').trim()).slice(0, MAX_GAVOR)
        .map(g => ({ name: String(g.name).trim().slice(0, 160), giftId: String(g.giftId || '').slice(0, 160), image: String(g.image || '').slice(0, 1200),
          // Förvalen bär flera id:n (TikTok har flera Mishka Bear) och namnet på flera språk (Munk/Doughnut).
          giftIds: (Array.isArray(g.giftIds) ? g.giftIds : []).map(String).filter(Boolean).slice(0, 10),
          alias: (Array.isArray(g.alias) ? g.alias : []).map(a => String(a).trim()).filter(Boolean).slice(0, 10) }))
        .filter(g => { const n = nyckel(g); if (tagna.has(n)) return false; tagna.add(n); return true; });
    });
    return ut;
  }
  const nyckel = g => g.giftId ? 'id:' + g.giftId : 'namn:' + g.name.toLowerCase();
  function katalogIdn(namn) { try { return window.VyraGavokatalog && window.VyraGavokatalog.idn ? window.VyraGavokatalog.idn(namn) : new Set(); } catch (_) { return new Set(); } }
  // Vilket kast startar den här gåvan? Id:t först, sedan namnet, sedan katalogens id:n för namnet.
  function kastFor(w, e) {
    if (!e || String(e.type || '').toLowerCase() !== 'gift') return undefined;
    const id = String(e.giftId || ''), namn = String(e.giftName || '').trim().toLowerCase(), val = gavor(w);
    for (const k of KAST) for (const g of val[k]) {
      if (id && (g.giftId === id || g.giftIds.includes(id))) return k;
      if (namn && [g.name, ...g.alias].some(n => n.toLowerCase() === namn)) return k;
      if (id && !g.giftId && katalogIdn(g.name).has(id)) return k;
    }
    return undefined;
  }
  function serverNu() {
    try { const n = Number(window.VyraLive && window.VyraLive.serverNu && window.VyraLive.serverNu()); if (n > 0) return n; } catch (_) {}
    return Date.now();
  }
  // live-leaderboard.js spelar upp kvällens händelser när sidan laddas. De är historik, inte nya kast.
  function arFarsk(e, nu) {
    const at = Number(e && (e.at || (e.timestamp && Date.parse(e.timestamp))));
    return !(Number.isFinite(at) && at > 0 && (nu || serverNu()) - at > FARSKT_MS);
  }

  // ---------- läget per widget i den här fliken ----------
  const LIVE = new Map();
  const lagrad = id => { try { return JSON.parse(sessionStorage.getItem('vyra-bertil-paket:' + id) || 'null'); } catch (_) { return null; } };
  function till(id) {
    let t = LIVE.get(id);
    if (!t) {
      const s = lagrad(id) || {};
      t = { ko: Array.isArray(s.ko) ? s.ko.filter(r => KAST.includes(r && r.kind) && Number.isSafeInteger(r.count) && r.count > 0) : [],
        seen: new Set(Array.isArray(s.seen) ? s.seen.map(String) : []), streaks: new Map(), historik: {}, videor: new Map(), trasiga: new Set(),
        spelar: null, vantaTill: 0, status: '', vakt: 0 };
      LIVE.set(id, t);
    }
    return t;
  }
  function spara(id) {
    const t = LIVE.get(id); if (!t) return;
    try { sessionStorage.setItem('vyra-bertil-paket:' + id, JSON.stringify({ ko: t.ko, seen: [...t.seen].slice(-300) })); } catch (_) {}
  }
  function nollstall() {
    LIVE.forEach((t, id) => { t.ko = []; t.seen.clear(); t.streaks.clear(); spara(id); });
  }
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  const widget = id => widgetar().find(w => String(w.id) === String(id));
  const rotFor = id => document.querySelector(`.vyra-bertil[data-id="${String(id).replace(/["\\]/g, '\\$&')}"]`);

  function videoFor(w, src) {
    const t = till(w.id);
    let v = t.videor.get(src);
    if (!v) {
      v = document.createElement('video');
      v.className = 'bp-video'; v.playsInline = true; v.setAttribute('playsinline', ''); v.disablePictureInPicture = true;
      v.preload = OVERLAY ? 'auto' : 'metadata'; v.hidden = true; v.src = src;
      t.videor.set(src, v);
    }
    return v;
  }
  // Flyttar widgetens videonoder in i den aktuella lådan, synkront efter render() (som hjartmoln.js).
  // I OBS skapas alla klipp för valt språk direkt så att de hinner laddas före första gåvan.
  function koppla() {
    document.querySelectorAll('.vyra-bertil[data-id]').forEach(rot => {
      const w = widget(rot.dataset.id), vard = rot.querySelector('.bp-vard');
      if (!w || !vard) return;
      const t = till(w.id);
      if (OVERLAY) KAST.forEach(k => klipp(k, rost(w)).forEach(src => videoFor(w, src)));
      t.videor.forEach(v => { if (v.parentNode !== vard) vard.append(v); });
      visaBanderoll(w, t);
    });
  }
  function visaBanderoll(w, t) {
    const rot = rotFor(w.id); if (!rot) return;
    const b = rot.querySelector('.bp-banderoll');
    if (b) { b.textContent = t.spelar ? t.spelar.text : ''; b.classList.toggle('bp-pa', !!t.spelar); }
    const s = rot.querySelector('.bp-status');
    if (s) s.textContent = t.status;
  }

  // ---------- kön ----------
  function koa(w, kind, user, count) {
    const t = till(w.id);
    if (!M.addPending(t.ko, { kind, user: String(user || 'En tittare').slice(0, 80), count })) return false;
    spara(w.id); nasta(w);
    return true;
  }
  const iKo = w => M.pendingCount(till(w.id).ko);
  function nasta(w) {
    const t = till(w.id);
    if (t.spelar || !t.ko.length || Date.now() < t.vantaTill) return;
    if (w.bpPausad) { t.status = 'Kön pausad · ' + iKo(w) + ' kast väntar'; visaBanderoll(w, t); return; }
    if (OVERLAY && (w.hidden || !rotFor(w.id))) return;
    const kind = t.ko[0].kind;
    const kandidater = klipp(kind, rost(w)).filter(src => !t.trasiga.has(src));
    const src = M.nextVariant(kandidater.length ? kandidater : klipp(kind, rost(w)), t.historik[kind]);
    const v = videoFor(w, src);
    koppla();
    if (v.readyState < 2) {
      // Laddar fortfarande. Kastet ligger kvar först i kön; tickern försöker igen.
      t.status = 'Laddar klippet · ' + iKo(w) + ' kast väntar';
      if (v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
      visaBanderoll(w, t); return;
    }
    const jobb = M.takePending(t.ko); spara(w.id);
    const info = M.catalog[jobb.kind];
    t.spelar = { jobb, v, text: jobb.user + ' · ' + info.label };
    t.status = iKo(w) ? iKo(w) + ' kast i kö' : '';
    t.historik[kind] = [...(t.historik[kind] || []), src].slice(-6);
    const slapp = window.VyraTal && window.VyraTal.duckaLjud ? window.VyraTal.duckaLjud(v, volym(w)) : null;
    if (!slapp) v.volume = volym(w);
    let klar = false;
    const sluta = () => { klar = true; clearTimeout(t.vakt); v.onended = v.onerror = v.onpause = null; try { slapp && slapp(); } catch (_) {} v.pause(); v.hidden = true; t.spelar = null; };
    // Ett kast som inte kunde spelas klart läggs tillbaka först i kön — det får aldrig försvinna.
    const tillbaka = (orsak, trasig) => {
      if (klar) return; sluta();
      if (trasig) t.trasiga.add(src);
      t.ko.unshift({ kind: jobb.kind, user: jobb.user, count: 1 });
      if (t.ko[1] && t.ko[1].kind === jobb.kind && t.ko[1].user === jobb.user) { t.ko[1].count++; t.ko.shift(); }
      spara(w.id); t.vantaTill = Date.now() + OMFORSOK_MS; t.status = orsak + ' · ' + iKo(w) + ' kast väntar';
      visaBanderoll(w, t);
    };
    v.onended = () => { if (klar) return; sluta(); visaBanderoll(w, t); nasta(w); };
    v.onerror = () => tillbaka('Klippet gick inte att spela', true);
    // En omritning kan flytta noden och pausa den mitt i klippet: fortsätt i stället för att börja om.
    v.onpause = () => { if (!klar && !v.ended && v.isConnected) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } };
    t.vakt = setTimeout(() => tillbaka('Klippet stannade', false), ((v.duration || 8) + 3) * 1000);
    v.currentTime = 0; v.hidden = false;
    visaBanderoll(w, t);
    const p = v.play();
    if (p && p.catch) p.catch(() => tillbaka(OVERLAY ? 'Ljudet blockerades — tillåt ljud i OBS-källan' : 'Klicka på Testa igen för att tillåta ljud', false));
  }
  const tickare = setInterval(() => {
    try { widgetar().forEach(w => { const t = LIVE.get(w.id); if (t && t.ko.length && !t.spelar) nasta(w); }); } catch (_) { clearInterval(tickare); }
  }, 1000);

  // ---------- kopplingen till liven ----------
  function hantera(e) {
    if (!OVERLAY || !e || String(e.type || '').toLowerCase() !== 'gift' || !arFarsk(e)) return;
    widgetar().forEach(w => {
      if (w.hidden || !rotFor(w.id)) return;
      const kind = kastFor(w, e); if (!kind) return;
      const t = till(w.id), antal = M.giftDelta(e, t.streaks, t.seen);
      if (antal) koa(w, kind, e.name || e.username, antal); else spara(w.id);
    });
  }
  window.addEventListener('vyra-live-event', ev => { try { hantera(ev && ev.detail); } catch (err) { console.warn('[VYRA] Bertil paket', err); } });
  // Ny sändning eller utloggning (kontobyte): väntande kast hör till den gamla och kastas bort.
  window.addEventListener('vyra-live-session', ev => { if (ev && ev.detail && ev.detail.event === 'live:start') nollstall(); });
  window.addEventListener('vyra-session-ended', nollstall);

  // ▶ Testa: spelar i DEN HÄR fliken, aldrig i OBS. Klicket ger webbläsaren lov att spela ljud.
  function testa(w, kind) { if (KAST.includes(kind)) koa(w, kind, 'Test', 1); }

  // ---------- render ----------
  function meny(w, kinds) {
    const val = gavor(w);
    return kinds.map(k => {
      const lista = val[k], info = M.catalog[k];
      if (OVERLAY && !lista.length) return '';
      const bilder = lista.slice(0, 3).map(g => { const b = sakerBild(g.image); return b ? `<img src="${esc(b)}" alt="" title="${esc(g.name)}">` : `<i title="${esc(g.name)}">${esc(info.icon)}</i>`; }).join('');
      return `<div class="bp-val${lista.length ? '' : ' bp-tom'}"><span class="bp-gavor">${bilder || `<i>${esc(info.icon)}</i>`}${lista.length > 3 ? `<em>+${lista.length - 3}</em>` : ''}</span>`
        + `<b>${esc(info.label)}</b>${lista.length ? '' : '<small>Välj gåva</small>'}</div>`;
    }).join('');
  }
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    if (OVERLAY && w.hidden) return '';
    const bredd = klamp(w.width, 120, 1080, DUK_B), hojd = Math.round(bredd * FORMAT);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    return `<div class="widget vyra-bertil${OVERLAY ? '' : ' bp-studio'}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${bredd}px;height:${hojd}px;zoom:${klamp(w.widgetScale, 0.1, 5, 1)}">`
      + `<img class="bp-bakgrund" src="${BAKGRUND}" alt="" draggable="false"><div class="bp-vard"></div>`
      + `<div class="bp-titel">BERTIL PAKET</div><div class="bp-meny bp-vanster">${meny(w, ['egg', 'icecream'])}</div><div class="bp-meny bp-hoger">${meny(w, ['melon', 'finale'])}</div>`
      + `<div class="bp-banderoll" aria-live="polite"></div><small class="bp-ai">AI-ANIMERAD UNDERHÅLLNING · VYRA</small>`
      + (OVERLAY ? '' : '<span class="bp-status"></span>')
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  const oldRender = render;
  render = function () {
    const ut = oldRender.apply(this, arguments);
    try { koppla(); } catch (err) { console.warn('[VYRA] Bertil paket: koppla', err); }
    return ut;
  };
  try {
    new MutationObserver(lista => {
      for (const m of lista) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.('.vyra-bertil') || n.querySelector?.('.vyra-bertil'))) { koppla(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // ---------- panelen ----------
  function katalogGavor() {
    try { const l = window.VyraGavokatalog && window.VyraGavokatalog.lista && window.VyraGavokatalog.lista(); if (Array.isArray(l) && l.length) return l.filter(g => g && g.name); } catch (_) {}
    return (Array.isArray(window.VYRA_GIFTS) ? window.VYRA_GIFTS : []).map(g => ({ name: g.name, image: g.file, coins: 0, giftId: '' }));
  }
  function kastPanel(w, k) {
    const lista = gavor(w)[k], info = M.catalog[k];
    return `<div class="bp-kast" data-kast="${k}"><b>${esc(info.icon)} ${esc(info.label)}</b>`
      + `<div class="bp-chips">${lista.map((g, i) => { const b = sakerBild(g.image); return `<span class="bp-chip">${b ? `<img src="${esc(b)}" alt="">` : ''}${esc(g.name)}<button type="button" data-bp-bort="${k}:${i}" title="Ta bort ${esc(g.name)}" aria-label="Ta bort ${esc(g.name)}">✕</button></span>`; }).join('') || '<small>Ingen gåva vald — kastet startar inte.</small>'}</div>`
      + `<div class="bp-knappar"><button type="button" data-bp-valj="${k}">+ Välj gåva</button><button type="button" data-bp-testa="${k}">▶ Testa</button></div></div>`;
  }
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    return `<h3>BERTIL PAKET</h3><div class="template-badge">GÅVOSCEN · LJUD · LIVE</div><div hidden><input id="pt" value="${NAMN}"><input id="pv" value=""></div>`
      + `<div class="property-group bp-panel"><h4>GÅVOR SOM KASTAR</h4><small>Välj själv vilka gåvor som startar varje kast. Varje skickad gåva ger ett kast, även i en stor combo. Flera gåvor kan dela kast, men en gåva kan bara höra till ett.</small>`
      + KAST.map(k => kastPanel(w, k)).join('') + `</div>`
      + `<div class="property-group"><h4>LJUD</h4><label>Tal<select id="bpRost"><option value="en"${rost(w) === 'en' ? ' selected' : ''}>English · AI-genererad röst</option><option value="sv"${rost(w) === 'sv' ? ' selected' : ''}>Svenska · klippta originalrepliker</option></select></label>`
      + `<label>Volym <span class="bp-varde">${Math.round(volym(w) * 100)}%</span><input id="bpVolym" type="range" min="0" max="100" value="${Math.round(volym(w) * 100)}"></label>`
      + `<small>Ljudet spelas i OBS. Slå på "Styr ljud via OBS" i webbläsarkällan om du vill styra det i mixern.</small></div>`
      + `<div class="property-group"><h4>KÖ</h4><label><input id="bpPausad" type="checkbox"${w.bpPausad ? ' checked' : ''}> Pausa kön</label><small>Pågående klipp spelas klart. Väntande kast sparas och fortsätter när du slår av pausen.</small></div>`
      + `<div class="property-group"><h4>OM KLIPPEN</h4><small>Engelskt tal är AI-genererat från ett godkänt röstprov. Munrörelserna är inte synkade med replikerna. Scenen visar alltid märkningen AI-animerad underhållning.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><button type="button" id="bpHelskarm">Fyll hela skärmen</button><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || DUK_B}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  function sattVal(w, kind, gava) {
    const val = gavor(w), n = nyckel(gava);
    KAST.forEach(k => { val[k] = val[k].filter(g => nyckel(g) !== n && g.name.toLowerCase() !== gava.name.toLowerCase()); });
    if (val[kind].length >= MAX_GAVOR) { if (typeof toast === 'function') toast('Högst ' + MAX_GAVOR + ' gåvor per kast'); return; }
    val[kind].push(gava);
    w.bpGavor = val;
  }
  function oppnaValjare(w, kind) {
    document.querySelector('.gift-picker-modal')?.remove();
    const alla = katalogGavor(), info = M.catalog[kind];
    const modal = document.createElement('div');
    modal.className = 'gift-picker-modal bp-valjare';
    modal.innerHTML = `<div><header><b>${esc(info.icon)} ${esc(info.label.toUpperCase())} · VÄLJ GÅVA</b><button type="button" class="ae-ik ae-ik--stang" title="Stäng" aria-label="Stäng"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>`
      + `<input placeholder="Sök bland ${alla.length} gåvor..."><small class="gp-hint">Samma gåvokatalog som Action & Events. En gåva som redan kastar något annat flyttas hit.</small><section></section></div>`;
    document.body.append(modal);
    const sektion = modal.querySelector('section');
    const rita = lista => {
      sektion.innerHTML = lista.slice(0, 200).map((g, i) => `<button type="button" data-i="${i}">${g.image ? `<img loading="lazy" src="${esc(sakerBild(g.image))}">` : '<i>🎁</i>'}<span>${esc(g.name)}</span><small>${g.coins ? g.coins + ' coins' : 'okänt värde'}</small></button>`).join('');
      sektion.querySelectorAll('button').forEach(b => b.onclick = () => {
        const g = lista[+b.dataset.i];
        sattVal(w, kind, { name: String(g.name), giftId: String(g.giftId || ''), image: String(g.image || '') });
        modal.remove();
        if (typeof save === 'function') save(); if (typeof render === 'function') render();
      });
    };
    rita(alla);
    modal.querySelector('header button').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.querySelector('input').oninput = e => { const q = e.target.value.trim().toLowerCase(); rita(q ? alla.filter(g => String(g.name).toLowerCase().includes(q)) : alla); };
    modal.querySelector('input').focus();
  }

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-bp-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'bp-katalog';
    sek.innerHTML = `<h4>${NAMN.toUpperCase()}</h4>`;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.bpSkapa = '1'; b.dataset.catalogKey = 'catalog:bertilpaket';
    b.innerHTML = `<img class="bp-katalogbild" src="${MAPP}bertil-paket-katalog.webp" alt="" loading="lazy"><span><b>${NAMN}</b><small>Tittarnas gåvor kastar ägg, glass och vattenmelon på Bertil</small></span>`;
    b.onclick = () => {
      if (!window.VyraWidgets || typeof state === 'undefined') return;
      const w = window.VyraWidgets.create('catalog:bertilpaket');
      state.widgets.push(w); selected = w.id;
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
      if (typeof toast === 'function') toast(NAMN + ' tillagt — välj gåvorna i panelen');
    };
    sek.append(b);
    cat.append(sek);
  }

  const oldBind = bind;
  bind = function () {
    oldBind();
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    katalog();
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const satt = (falt, v, ritaOm = true) => { w[falt] = v; if (typeof save === 'function') save(); if (ritaOm && typeof render === 'function') render(); };
    document.querySelectorAll('[data-bp-valj]').forEach(b => b.onclick = () => oppnaValjare(w, b.dataset.bpValj));
    document.querySelectorAll('[data-bp-testa]').forEach(b => b.onclick = () => testa(w, b.dataset.bpTesta));
    document.querySelectorAll('[data-bp-bort]').forEach(b => b.onclick = () => {
      const [k, i] = b.dataset.bpBort.split(':'), val = gavor(w);
      if (!val[k]) return;
      val[k].splice(+i, 1); satt('bpGavor', val);
    });
    const el = id => document.querySelector(id);
    if (el('#bpRost')) el('#bpRost').onchange = e => satt('bpRost', e.target.value === 'sv' ? 'sv' : 'en');
    if (el('#bpVolym')) el('#bpVolym').oninput = e => {
      const v = klamp(Math.round(+e.target.value), 0, 100, 65);
      const etikett = document.querySelector('.bp-varde'); if (etikett) etikett.textContent = v + '%';
      const t = LIVE.get(w.id); if (t && t.spelar) t.spelar.v.volume = v / 100;
      satt('bpVolym', v, false);
    };
    if (el('#bpPausad')) el('#bpPausad').onchange = e => { satt('bpPausad', e.target.checked, false); nasta(w); };
    if (el('#bpHelskarm')) el('#bpHelskarm').onclick = () => { Object.assign(w, { x: 0, y: 0, width: DUK_B }); if (typeof save === 'function') save(); if (typeof render === 'function') render(); };
  };

  window.VyraBertilPaket = Object.freeze({ typ: TYP, namn: NAMN, KAST, klipp, gavor, kastFor, arFarsk, testa, iKo, FARSKT_MS, _live: LIVE });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
