(function () {
  'use strict';
  // MEDIAVÄLJAREN — en kontroll för bild eller video i egenskapspanelen (PR 3 i panelspecifikationen,
  // kapitel 3). Panelramen (vyra-panelram.js) bygger den för registerkontroller med typ 'media'; den
  // kan också anropas direkt:
  //
  //   VyraMediaval.falt({ w, falt: 'profileImage', typ: 'bild', etikett: 'Egen profilbild',
  //     reserv: 'assets/images/test-profile.svg', reservText: 'Automatisk – tittarens profilbild från TikTok' })
  //
  // Returnerar en DOM-nod: miniatyr (bild, eller videons första bildruta), etikett, status och knapparna
  // "Välj bild"/"Välj video" och "Använd automatisk" (eller "Ta bort" när ingen reserv finns).
  //
  // ALDRIG EN SÖKVÄG I GRÄNSSNITTET. Fältvärdet hamnar bara i miniatyrens src. Statusraden säger vad
  // som är valt ("Egen bild · sparad i molnet"), aldrig var det ligger, och filnamnet visas inte heller
  // (det bär sin filändelse). Ett tomt värde, eller ett som börjar med assets/ (en känd reserv), visas
  // som reservText.
  //
  // FÄLTEN ÄR DE SOM REDAN FINNS. Ett val skrivs till samma fält som i dag (w.profileImage, w.giftImage
  // …), med det värde uppladdningen ger. "Använd automatisk" skriver ''. Renderarna har redan sina egna
  // reserver för ett tomt fält (VyraSafe.url(w.profileImage, 'assets/images/test-profile.svg') och
  // liknande), och de rörs inte härifrån. Ett nästlat värde (Video per nivå: w.levelVideos[nivå]) når man
  // med opts.las(w) och opts.skriv(w, v).
  //
  // UPPLADDNINGSVÄGARNA ÄR DE BEFINTLIGA, och servern ändras inte:
  //   1. Molnet (cloud-media.js): VyraCloudMedia.upload(file) när molnsynken är ansluten. Den ger
  //      {id, status}. När status är 'ready' hämtas läslänken med GET /api/workspaces/:id/media/:assetId
  //      (server/index.js:672). Bara en VARAKTIG länk (expiresIn null, alltså CDN) skrivs till fältet —
  //      en presignerad länk slutar fungera efter fem minuter, och en widget i OBS hade då tappat
  //      bilden mitt i sändningen. Under säkerhetsskanningen visas "Väntar på säkerhetskontroll" och
  //      länken hämtas om var femte sekund i högst två minuter.
  //   2. Lokalt, när molnet saknas eller inte ger en varaktig länk:
  //      * lagring:'meta' — custom-widgets.js cwStore(file) i IndexedDB, och fältet får {id, name, type,
  //        size} (samma form som w.mediaMeta). Syns bara i samma webbläsare.
  //      * annars (ett textfält som renderaren lägger i src) — bilden skalas ned (högst 512 px, ~200 KB)
  //        och sparas som bitmap-data-länk, som VyraSafe.src redan släpper igenom, så länge layoutens
  //        budget för data-länkar räcker (se skalaBild och lokalBudget nedan). En video kräver molnet.
  //      Båda visar varningen "Sparas bara på den här datorn och syns inte i OBS på en annan dator."
  //
  // FOKUS OCH SCROLL. Efter en ändring ritas panelen om med vyraRenderKeepingPanel(), som ger tillbaka
  // scrollpositionen och fokus via elementets id. Knapparna har därför stabila id:n (pr-<falt>-valj,
  // pr-<falt>-auto), och "Använd automatisk" inaktiveras aldrig — en inaktiverad knapp kan inte ta
  // emot fokus igen.
  //
  // Inget här körs i overlay-utdata: noden byggs bara när panelen byggs.

  const VANTA_MS = 5000, VANTA_GANGER = 24;
  const BILDTYPER = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const VIDEOTYPER = ['video/mp4', 'video/webm'];
  const VARNING_LOKAL = 'Sparas bara på den här datorn och syns inte i OBS på en annan dator.';

  // Pågående uppladdningar och meddelanden per widget och fält. Överlever en omritning av panelen.
  const lagen = new Map();
  const nyckelAv = (w, f) => String(w && w.id) + '|' + f;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const idDel = f => String(f).replace(/[^A-Za-z0-9_-]/g, '-');

  function normalisera(opts) {
    const o = Object.assign({}, opts || {});
    // Från panelramen kommer registerkontrollen, där typ är 'media' och medietypen står i medietyp.
    const typ = o.medietyp || o.typ;
    o.typ = typ === 'video' ? 'video' : 'bild';
    o.lagring = o.lagring === 'meta' ? 'meta' : 'url';
    if (!o.etikett) o.etikett = o.typ === 'video' ? 'Video' : 'Bild';
    o.harReserv = !!(o.reserv || o.reservText);
    o.id = 'pr-' + idDel(o.falt || o.id || 'media');
    return o;
  }

  function las(o) {
    if (typeof o.las === 'function') { try { return o.las(o.w); } catch (_) { return ''; } }
    return o.w ? o.w[o.falt] : '';
  }

  // Vilket slags värde fältet har. Avgör statusraden och miniatyren, aldrig vad som visas som text.
  function sort(v) {
    if (v && typeof v === 'object') return v.id ? 'meta' : 'tom';
    const s = String(v == null ? '' : v).trim();
    if (!s || /^assets\//i.test(s)) return 'tom';
    if (/^https?:/i.test(s)) return 'moln';
    if (/^data:/i.test(s)) return 'projekt';
    return 'egen';
  }

  function statustext(o, v) {
    const vad = o.typ === 'video' ? 'Egen video' : 'Egen bild';
    switch (sort(v)) {
      case 'moln': return vad + ' · sparad i molnet';
      case 'projekt': return vad + ' · sparad i projektet';
      case 'meta': return vad + ' · sparad på den här datorn';
      case 'egen': return vad;
      default: return o.reservText || (o.typ === 'video' ? 'Ingen video vald' : 'Ingen bild vald');
    }
  }

  // ---- Miniatyr ---------------------------------------------------------------------------------
  const lokalaLankar = new Map();
  async function lokalLank(meta) {
    if (!meta || !meta.id) return null;
    if (lokalaLankar.has(meta.id)) return lokalaLankar.get(meta.id);
    if (typeof cwRead !== 'function') return null;
    try {
      const blob = await cwRead(meta);
      if (!blob) return null;
      const lank = URL.createObjectURL(blob);
      lokalaLankar.set(meta.id, lank);
      return lank;
    } catch (_) { return null; }
  }

  function kalla(o, v) {
    const s = sort(v);
    if (s === 'meta') return null;                        // hämtas asynkront ur IndexedDB
    if (s === 'tom') return o.reserv || '';
    return String(v).trim();
  }

  function fyllMiniatyr(ruta, o, v) {
    const s = sort(v);
    const arVideo = o.typ === 'video' && s !== 'tom';
    const satt = (src) => {
      const safe = window.VyraSafe ? window.VyraSafe.src(src, '') : src;
      // blob: från IndexedDB är vår egen länk och släpps igenom; allt annat går via VyraSafe.src.
      const lank = /^blob:/.test(String(src || '')) ? src : safe;
      ruta.textContent = '';
      ruta.dataset.vmMiniatyr = lank ? (arVideo ? 'video' : 'bild') : 'tom';
      if (!lank) return;
      let el;
      if (arVideo) {
        el = document.createElement('video');
        el.muted = true; el.playsInline = true; el.preload = 'metadata';
        el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('preload', 'metadata');
      } else {
        el = document.createElement('img');
        el.alt = '';
        el.decoding = 'async';
      }
      el.src = lank;
      ruta.append(el);
    };
    if (s === 'meta') {
      satt('');
      lokalLank(v).then(l => { if (l && ruta.isConnected) satt(l); });
    } else satt(kalla(o, v));
  }

  // ---- Stil -------------------------------------------------------------------------------------
  function stil() {
    if (document.getElementById('vyra-mediaval-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-mediaval-stil';
    s.textContent = [
      '.vyra-mediaval{display:grid;gap:8px;margin:6px 0 10px}',
      '.vyra-mediaval .vm-rad{display:flex;gap:10px;align-items:center}',
      '.vyra-mediaval .vm-miniatyr{flex:0 0 64px;width:64px;height:64px;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.12));display:grid;place-items:center}',
      '.vyra-mediaval .vm-miniatyr img,.vyra-mediaval .vm-miniatyr video{width:100%;height:100%;object-fit:cover;display:block}',
      '.vyra-mediaval .vm-text{display:grid;gap:2px;min-width:0}',
      '.vyra-mediaval .vm-etikett{font-weight:600}',
      '.vyra-mediaval .vm-status{opacity:.75}',
      '.vyra-mediaval .vm-knappar{display:flex;gap:6px;flex-wrap:wrap}',
      '.vyra-mediaval .vm-meddelande{opacity:.85}',
    ].join('');
    (document.head || document.documentElement).append(s);
  }

  // ---- Skrivning --------------------------------------------------------------------------------
  // Widgeten kan ha bytts ut i state medan en uppladdning pågick (molnsynk, ångra). Skriv till den som
  // gäller nu.
  function aktuell(w) {
    try {
      if (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) {
        return state.widgets.find(x => x && x.id === w.id) || w;
      }
    } catch (_) {}
    return w;
  }

  function ritaOm(w) {
    const ar = typeof selected !== 'undefined' && selected === w.id;
    if (ar && typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else if (typeof render === 'function') render();
  }

  function skriv(o, v) {
    const w = aktuell(o.w);
    if (typeof o.skriv === 'function') o.skriv(w, v);
    else w[o.falt] = v;
    if (typeof save === 'function') save();
    ritaOm(w);
  }

  function meddela(o, text, varning) {
    const k = nyckelAv(o.w, o.falt);
    if (text) lagen.set(k, { text, varning: !!varning }); else lagen.delete(k);
    // Uppdatera noden på plats om panelen fortfarande visar den, utan omritning.
    const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(k) : k.replace(/["\\]/g, '\\$&');
    const nod = document.querySelector(`[data-mediaval-nyckel="${sel}"]`);
    if (nod && nod._vm) uppdatera(nod);
  }

  // ---- Uppladdningen ----------------------------------------------------------------------------
  function molnArbetsyta() {
    try {
      const c = window.VyraCloudSync && typeof window.VyraCloudSync.current === 'function' ? window.VyraCloudSync.current() : null;
      return c && c.workspace && c.workspace.id ? c.workspace : null;
    } catch (_) { return null; }
  }
  const harMoln = () => !!(molnArbetsyta() && window.VyraCloudMedia && typeof window.VyraCloudMedia.upload === 'function');

  // Läslänken för en godkänd fil. null om den inte är varaktig eller inte går att hämta än.
  async function varaktigLank(asset) {
    const ws = molnArbetsyta();
    if (!ws || !asset || !asset.id || !window.VyraAuth || typeof window.VyraAuth.api !== 'function') return { klar: false };
    try {
      const svar = await window.VyraAuth.api(`/api/workspaces/${ws.id}/media/${asset.id}`, { method: 'GET' });
      if (!svar || !svar.url) return { klar: false };
      return { klar: true, url: svar.expiresIn == null ? svar.url : null };
    } catch (_) { return { klar: false }; }
  }

  const lasData = blob => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || ''));
    r.onerror = () => no(r.error);
    r.readAsDataURL(blob);
  });

  // ---- Lokala bilder: skalning och budget -------------------------------------------------------
  //
  // En lokalt vald bild hamnar som data-länk i state, och state går hela vägen till molnsynken: servern
  // tar emot overlay-state med body(req, 5 MB) (server/index.js), och en enda bild på 1 MB blir ~1,4 MB
  // som base64. Tre–fyra sådana fick alltså HELA layoutens synk att avvisas med 413, och overlayn i OBS
  // blev tung. Därför:
  //   * skalas bilden till högst 512 px på längsta sidan (proportionerna behålls), kodas som webp
  //     (kvalitet 0,85, sänks stegvis) med png som reserv om webp saknas, och får högst ~200 KB.
  //     Alfakanalen behålls — duken rensas transparent och båda formaten bär alfa. En animerad gif
  //     blir en stillbild (första bildrutan).
  //   * får summan av data-länkar i state.widgets inte passera ~1,5 MB. lokalBudget()/rymsLokalt()
  //     exporteras så att familjernas egna väljare kan räkna med samma tak.
  const MAX_SIDA = 512;
  const MAX_KODAD = 200 * 1024;
  const KVALITETER = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
  const BUDGET_TAK = Math.round(1.5 * 1024 * 1024);
  const BUDGET_TEXT = 'För många egna bilder sparade lokalt – anslut molnet eller ta bort någon bild.';

  function felMed(text) { const e = new Error(text); e.vyraText = text; return e; }

  async function avkoda(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    const lank = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = lank; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(lank), 0); }
  }

  const tillBlob = (duk, typ, q) => new Promise(ok => {
    try { duk.toBlob(b => ok(b || null), typ, q); } catch (_) { ok(null); }
  });

  // Returnerar en data-länk (webp eller png) på högst MAX_SIDA px och MAX_KODAD byte, eller kastar ett
  // fel med en svensk text i fel.vyraText.
  async function skalaBild(file) {
    let bild;
    try { bild = await avkoda(file); } catch (_) { throw felMed('Bilden gick inte att läsa. Välj en annan bild.'); }
    const b0 = bild.width || bild.naturalWidth, h0 = bild.height || bild.naturalHeight;
    if (!b0 || !h0) throw felMed('Bilden gick inte att läsa. Välj en annan bild.');
    const skala = Math.min(1, MAX_SIDA / Math.max(b0, h0));
    const b = Math.max(1, Math.round(b0 * skala)), h = Math.max(1, Math.round(h0 * skala));
    const duk = document.createElement('canvas');
    duk.width = b; duk.height = h;
    const ctx = duk.getContext('2d');
    ctx.clearRect(0, 0, b, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bild, 0, 0, b, h);
    if (bild.close) try { bild.close(); } catch (_) {}
    for (const q of KVALITETER) {
      const blob = await tillBlob(duk, 'image/webp', q);
      if (!blob || blob.type !== 'image/webp') break;      // webp saknas: png nedan
      if (blob.size <= MAX_KODAD) return lasData(blob);
    }
    const png = await tillBlob(duk, 'image/png');
    if (png && png.size <= MAX_KODAD) return lasData(png);
    throw felMed('Bilden blir för stor för att sparas utan molnet, även nedskalad. Anslut molnet eller välj en enklare bild.');
  }

  // Summan av alla data-länkar i state.widgets, i tecken (det är tecknen som skickas i synken).
  function lokalBudget() {
    let anvant = 0;
    const sedda = new Set();
    const gaIgenom = (v, djup) => {
      if (typeof v === 'string') { if (v.length > 5 && /^data:/i.test(v)) anvant += v.length; return; }
      if (!v || typeof v !== 'object' || djup > 6 || sedda.has(v)) return;
      sedda.add(v);
      for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) gaIgenom(v[k], djup + 1);
    };
    try { if (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) gaIgenom(state.widgets, 0); } catch (_) {}
    return { anvant, tak: BUDGET_TAK, kvar: Math.max(0, BUDGET_TAK - anvant) };
  }
  // Ryms en ny data-länk på `tillagg` tecken, om en befintlig på `ersatter` tecken försvinner?
  function rymsLokalt(tillagg, ersatter = 0) {
    const { anvant, tak } = lokalBudget();
    return anvant - (Number(ersatter) || 0) + (Number(tillagg) || 0) <= tak;
  }

  async function sparaLokalt(o, file) {
    if (o.lagring === 'meta') {
      if (typeof cwStore !== 'function') { meddela(o, 'Det gick inte att spara filen på den här datorn.', true); return; }
      const meta = await cwStore(file);
      meddela(o, '');
      skriv(o, meta);
      return;
    }
    if (o.typ === 'video') { meddela(o, 'Anslut molnet för att välja en video här.', true); return; }
    let data;
    try { data = await skalaBild(file); } catch (fel) { meddela(o, fel && fel.vyraText || 'Bilden gick inte att läsa. Välj en annan bild.', true); return; }
    if (!window.VyraSafe || !window.VyraSafe.src(data, '')) { meddela(o, 'Bildformatet stöds inte.', true); return; }
    // Budgeten räknas mot det fältet har NU: ett byte av bild ersätter den gamla data-länken.
    const gammal = las(Object.assign({}, o, { w: aktuell(o.w) }));
    if (!rymsLokalt(data.length, typeof gammal === 'string' && /^data:/i.test(gammal) ? gammal.length : 0)) {
      meddela(o, BUDGET_TEXT, true); return;
    }
    meddela(o, '');
    skriv(o, data);
  }

  async function vantaPaSkanning(o, asset, file, gang) {
    const svar = await varaktigLank(asset);
    if (svar.klar) {
      if (svar.url) { meddela(o, ''); skriv(o, svar.url); }
      else await sparaLokalt(o, file);
      return;
    }
    if (gang >= VANTA_GANGER) { meddela(o, 'Säkerhetskontrollen tar längre tid än väntat. Försök igen om en stund.', true); return; }
    setTimeout(() => { vantaPaSkanning(o, asset, file, gang + 1).catch(fel => meddela(o, felText(fel), true)); }, VANTA_MS);
  }

  // Felmeddelanden från uppladdningen kan bära en adress; de visas aldrig ordagrant.
  const felText = () => 'Det gick inte att ladda upp filen. Försök igen.';

  async function valjFil(o, file) {
    if (!file) return;
    const tillatna = o.typ === 'video' ? VIDEOTYPER : BILDTYPER;
    if (!tillatna.includes(file.type)) { meddela(o, o.typ === 'video' ? 'Välj en videofil (mp4 eller webm).' : 'Välj en bildfil (png, jpeg, webp eller gif).', true); return; }
    try {
      if (harMoln()) {
        meddela(o, 'Laddar upp …');
        const asset = await window.VyraCloudMedia.upload(file);
        if (asset && asset.status === 'ready') {
          const svar = await varaktigLank(asset);
          if (svar.url) { meddela(o, ''); skriv(o, svar.url); return; }
          await sparaLokalt(o, file);
          return;
        }
        meddela(o, 'Väntar på säkerhetskontroll');
        await vantaPaSkanning(o, asset, file, 1);
        return;
      }
      await sparaLokalt(o, file);
    } catch (fel) {
      try { console.warn('[VyraMediaval]', fel); } catch (_) {}
      meddela(o, felText(fel), true);
    }
  }

  // ---- Noden ------------------------------------------------------------------------------------
  function uppdatera(nod) {
    const o = nod._vm;
    o.w = aktuell(o.w);
    const v = las(o);
    const s = sort(v);
    nod.dataset.mediavalLage = s;
    nod.querySelector('.vm-status').textContent = statustext(o, v);
    fyllMiniatyr(nod.querySelector('.vm-miniatyr'), o, v);
    const lage = lagen.get(nyckelAv(o.w, o.falt));
    const medd = nod.querySelector('.vm-meddelande');
    const text = lage ? lage.text : ((s === 'projekt' || s === 'meta') ? VARNING_LOKAL : '');
    medd.textContent = text;
    medd.hidden = !text;
    medd.setAttribute('role', lage && lage.varning ? 'alert' : 'status');
  }

  function falt(opts) {
    const o = normalisera(opts);
    if (!o.w || (!o.falt && typeof o.las !== 'function')) return null;
    stil();
    const nod = document.createElement('div');
    nod.className = 'vyra-mediaval pr-media';
    nod.dataset.mediaval = o.falt || o.id;
    nod.dataset.mediavalTyp = o.typ;
    nod.dataset.mediavalNyckel = nyckelAv(o.w, o.falt);
    const valjText = o.typ === 'video' ? 'Välj video' : 'Välj bild';
    const autoText = o.harReserv ? 'Använd automatisk' : 'Ta bort';
    const accept = (o.typ === 'video' ? VIDEOTYPER : BILDTYPER).join(',');
    nod.innerHTML =
      `<div class="vm-rad"><div class="vm-miniatyr" aria-hidden="true"></div>`
      + `<div class="vm-text"><span class="vm-etikett">${esc(o.etikett)}</span><small class="vm-status"></small></div></div>`
      + `<div class="vm-knappar"><button type="button" id="${o.id}-valj" data-vm-valj>${valjText}</button>`
      + `<button type="button" id="${o.id}-auto" data-vm-auto>${autoText}</button></div>`
      + `<small class="vm-meddelande" hidden></small>`
      + `<input type="file" hidden data-vm-fil accept="${accept}" tabindex="-1">`;
    nod._vm = o;
    const fil = nod.querySelector('[data-vm-fil]');
    nod.querySelector('[data-vm-valj]').onclick = () => fil.click();
    fil.onchange = () => {
      const f = fil.files && fil.files[0];
      fil.value = '';
      valjFil(o, f);
    };
    nod.querySelector('[data-vm-auto]').onclick = () => {
      lagen.delete(nyckelAv(o.w, o.falt));
      const v = las(o);
      if (sort(v) === 'tom' && (v === '' || v == null)) { uppdatera(nod); return; }
      skriv(o, '');
    };
    uppdatera(nod);
    return nod;
  }

  window.VyraMediaval = {
    falt, statustext: (opts, v) => statustext(normalisera(opts), v),
    skalaBild, lokalBudget, rymsLokalt, BUDGET_TEXT,
    GRANSER: Object.freeze({ MAX_SIDA, MAX_KODAD, BUDGET_TAK }),
  };
})();
