// chattavatar-modell.js — CHATTAVATARENS REGLER, utan DOM. Provas i tests/chattavatar.test.js.
//
// Paketet "VYRA Chattavatar" (Codex, 2026-11-06) granskat och flyttat in i VYRA. Här ligger det som
// avgör VAD som ska spelas; chattavatar.js avgör HUR (video, pratbubbla, kö i sidan).
//
//   tolka(text)          chattraden -> { key, namn } eller null. Bara kända kommandon.
//   arFarsk(e, nu)       kvällens historik som spelas upp vid sidladdning är inte nya kommandon.
//   skapaRouter(opts)    en händelse -> ett köobjekt (eller inget). Behörighet, väntetider, dubbletter.
//   sidor(text, matt)    pratbubblans delar: högst två rader per del, hela texten, inget kapas.
//
// BEHÖRIGHET KOMMER FRÅN HÄNDELSEN, ALDRIG FRÅN TEXTEN. isModerator sätts av bryggan ur TikToks
// userIdentity (tiktok-bridge/normalizer.js) och följer med den token-skyddade händelseströmmen.
// Streamerns eget konto känns igen på sitt unika TikTok-handtag (username = uniqueId), samma regel
// som !skip i spotify-kommandon.js och latonskningar.js — aldrig på visningsnamnet, som vem som helst
// kan sätta till vad som helst.
(function (root) {
  'use strict';

  const ALIAS = { '#d1': '#dansa', '#d2': '#dansa2', '#d3': '#dansa3', '#t': '#tap', '#g': '#glove', '#f': '#fira', '#s': '#säg', '#sag': '#säg', '#stop': '#stopp' };
  // Klipp, etikett och förvald text per kommando. Danserna har ALDRIG text (Davids design 2026-11-06).
  const KOMMANDON = Object.freeze({
    '#dansa':    { klipp: 'dance',  etikett: 'Dans 1',          text: null, dans: true },
    '#dansa2':   { klipp: 'dance2', etikett: 'Dans 2',          text: null, dans: true },
    '#dansa3':   { klipp: 'dance3', etikett: 'Dans 3',          text: null, dans: true },
    '#tap':      { klipp: null,     etikett: 'Tap tap',         text: 'Tap tap!' },
    '#glove':    { klipp: 'glove',  etikett: 'Handske',         text: 'Använd handsken!' },
    '#fira':     { klipp: 'fira',   etikett: 'Fira',            text: 'Vi klarade det!' },
    '#säg':      { klipp: null,     etikett: 'Meddelande',      text: null },
    '#hej':      { klipp: 'wave',   etikett: 'Hälsning',        text: 'Hej allihopa!' },
    '#stopp':    { klipp: null,     etikett: 'Stopp',           text: null },
    // Automatiska, aldrig från chatten:
    'följare':   { klipp: 'wave',   etikett: 'Tack följare',    text: 'Tack alla nya följare!', auto: true },
    'välkommen': { klipp: 'wave',   etikett: 'Medlemshälsning', text: null, auto: true }
  });
  // Tittarkommandon när streamern slagit på "Tittare får dansa". Inget av dem visar text.
  const PUBLIKA = new Set(['#dansa', '#dansa2', '#dansa3', '#tap']);
  // TikToks kommentarer är högst 150 tecken. Hela meddelandet visas, uppdelat i delar.
  const MAX_TEXT = 150, MAX_NAMN = 40;
  const MAX_KO = 5, MAX_AUTO_I_KO = 2;
  const FARSKT_MS = 15000;
  const TITTARE_MS = 20000, PUBLIK_MS = 8000, FOLJARE_MS = 10000, HALSAD_MS = 10 * 60000, DUBBLETT_MS = 2000;

  const tvatta = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function tolka(text) {
    const t = tvatta(text, 400);
    if (t[0] !== '#') return null;
    const delar = t.split(' '), forsta = delar.shift().toLowerCase(), key = ALIAS[forsta] || forsta;
    const k = KOMMANDON[key];
    if (!k || k.auto) return null;
    const rest = delar.join(' ');
    if (key === '#säg' || key === '#fira') {
      const namn = tvatta(rest, MAX_TEXT);
      if (key === '#säg' && !namn) return null;
      return { key, namn };
    }
    if (key === '#hej') return { key, namn: tvatta(rest, MAX_NAMN) };
    // Danser, tap, handske och stopp tar inga argument: "#d1 hej" är inte ett kommando.
    return rest ? null : { key, namn: '' };
  }

  // Texten i pratbubblan för ett köobjekt. Danser: ingen text.
  function bubbeltext(item) {
    const k = KOMMANDON[item && item.key];
    if (!k || k.dans) return '';
    if (item.key === '#säg') return item.namn || '';
    if (item.key === '#fira') return item.namn || k.text;
    if (item.key === '#hej') return item.namn ? 'Hej ' + item.namn + '!' : k.text;
    if (item.key === 'välkommen') return 'Välkommen ' + item.namn + '!';
    return k.text || '';
  }

  function tidAv(e) {
    const at = Number(e && e.at);
    if (Number.isFinite(at) && at > 0) return at;
    const ts = e && e.timestamp;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function arFarsk(e, nu) { const at = tidAv(e); return !at || (nu - at) <= FARSKT_MS; }
  const handtag = s => String(s || '').replace(/^@/, '').trim().toLowerCase();
  const arTest = e => !!(e.__test || e.__simulerad || e.test || e.simulated || /^test-/.test(String(e.id || '')));

  // Router per widget och sida. opts:
  //   publik()     'alla' -> tittare får #d1 #d2 #d3 #t (20 s per person, 8 s mellan två tittare)
  //   halsa()      hälsa fanklubbsmedlemmar och prenumeranter välkomna
  //   tacka()      tacka nya följare
  //   streamer()   det anslutna kontots handtag, eller ''
  //   nu()         klockan (serverns om den finns)
  function skapaRouter(opts) {
    const o = opts || {};
    const nu = typeof o.nu === 'function' ? o.nu : Date.now;
    const sedda = new Set(), tittare = new Map(), halsade = new Map();
    let senastPublik = -Infinity, senastFoljare = -Infinity;
    const minns = (map, k, t, tak) => { map.delete(k); map.set(k, t); if (map.size > tak) map.delete(map.keys().next().value); };

    function ta(e) {
      if (!e || typeof e !== 'object' || arTest(e)) return null;
      const t = nu();
      if (!arFarsk(e, t)) return null;
      if (e.id != null && e.id !== '') {
        const id = String(e.id);
        if (sedda.has(id)) return null;
        sedda.add(id); if (sedda.size > 2000) sedda.delete(sedda.values().next().value);
      }
      const typ = String(e.type || e.event || '').toLowerCase().replace(/[\s_-]/g, '');
      if (typ === 'chat' || typ === 'chatcommand' || typ === 'comment') {
        // Kommandot läses BARA ur kommentaren — aldrig ur namnet: en tittare som döpt sig till "#d1"
        // ska inte kunna dansa genom att gå in i rummet.
        const k = tolka(e.comment != null ? e.comment : e.message);
        if (!k) return null;
        const jag = typeof o.streamer === 'function' ? handtag(o.streamer()) : '';
        const vem = handtag(e.username || e.uniqueId);
        const behorig = e.isModerator === true || (!!jag && vem === jag);
        if (!behorig) {
          if (!(typeof o.publik === 'function' && o.publik() === 'alla') || !PUBLIKA.has(k.key)) return null;
          const anv = String(e.userId || vem || '');
          if (!anv) return null;
          if (t - (tittare.get(anv) ?? -Infinity) < TITTARE_MS || t - senastPublik < PUBLIK_MS) return null;
          minns(tittare, anv, t, 1000); senastPublik = t;
        }
        return { key: k.key, namn: k.namn, kalla: behorig ? 'moderator' : 'tittare' };
      }
      if (typ === 'follow') {
        if (!(typeof o.tacka === 'function' && o.tacka())) return null;
        if (t - senastFoljare < FOLJARE_MS) return null;
        senastFoljare = t;
        return { key: 'följare', namn: '', kalla: 'auto' };
      }
      // 'member' är att någon går in i rummet. Bara fanklubbsmedlemmar och prenumeranter hälsas, och
      // varje person högst en gång var tionde minut — folk går in och ut hela kvällen.
      const medlem = typ === 'subscribe' || ((typ === 'member' || typ === 'superfan')
        && (Number(e.fanClubLevel || e.teamLevel) > 0 || e.isSubscriber === true));
      if (medlem) {
        if (!(typeof o.halsa === 'function' && o.halsa())) return null;
        const namn = tvatta(e.name || e.username, MAX_NAMN);
        const nyckel = handtag(e.username || e.uniqueId) || namn.toLowerCase();
        if (!namn || !nyckel) return null;
        if (t - (halsade.get(nyckel) ?? -Infinity) < HALSAD_MS) return null;
        minns(halsade, nyckel, t, 500);
        return { key: 'välkommen', namn, kalla: 'auto' };
      }
      return null;
    }
    function nollstall() { sedda.clear(); tittare.clear(); halsade.clear(); senastPublik = -Infinity; senastFoljare = -Infinity; }
    return { ta, nollstall };
  }

  // Kön: högst fem, samma kommando bara en gång i kön, samma kommando inom 2 s är en dubblett, och
  // automatiska hälsningar tränger aldrig undan en moderator — de tar högst två platser.
  function skapaKo() {
    const ko = [], senast = new Map();
    const signatur = item => item.key + ' ' + String(item.namn || '').toLowerCase();
    function lagg(item, spelar, nu) {
      if (!item || !KOMMANDON[item.key]) return 'okänt';
      const s = signatur(item), t = typeof nu === 'number' ? nu : Date.now();
      if ((spelar && signatur(spelar) === s) || ko.some(x => signatur(x) === s) || t - (senast.get(s) ?? -Infinity) < DUBBLETT_MS) return 'dubblett';
      if (ko.length >= MAX_KO) return 'full';
      if (KOMMANDON[item.key].auto && ko.length >= MAX_AUTO_I_KO) return 'full';
      senast.delete(s); senast.set(s, t); if (senast.size > 100) senast.delete(senast.keys().next().value);
      ko.push(item);
      return 'köad';
    }
    return { lagg, ta: () => ko.shift() || null, tom: () => { ko.length = 0; }, lista: () => ko.slice(), get antal() { return ko.length; } };
  }

  // Pratbubblans delar. matt(text) -> bredd i px; bredd = textytans bredd. Ord som inte får plats på
  // en rad delas på tecken. Inget kapas: delarna tillsammans är hela texten.
  function sidor(text, matt, bredd) {
    const ord = String(text || '').split(/\s+/).filter(Boolean), rader = [];
    let rad = '';
    for (const w of ord) {
      const prov = rad ? rad + ' ' + w : w;
      if (matt(prov) <= bredd) { rad = prov; continue; }
      if (rad) { rader.push(rad); rad = ''; }
      if (matt(w) <= bredd) { rad = w; continue; }
      for (const ch of Array.from(w)) {
        if (rad && matt(rad + ch) > bredd) { rader.push(rad); rad = ''; }
        rad += ch;
      }
    }
    if (rad) rader.push(rad);
    const ut = [];
    for (let i = 0; i < rader.length; i += 2) ut.push(rader.slice(i, i + 2).join('\n'));
    return ut;
  }

  const api = Object.freeze({ tolka, bubbeltext, arFarsk, skapaRouter, skapaKo, sidor, tvatta, KOMMANDON, PUBLIKA,
    MAX_TEXT, MAX_KO, MAX_AUTO_I_KO, FARSKT_MS, TITTARE_MS, PUBLIK_MS, FOLJARE_MS, HALSAD_MS, DUBBLETT_MS, SIDA_MS: 4000 });
  root.VyraChattavatarModell = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
