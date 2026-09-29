'use strict';
// LÅTÖNSKNINGAR — YouTube-sökningen bor här, på servern, för att nyckeln aldrig får nå en webbläsare.
//
// Tittaren skriver "!önska <låt>" i TikTok-chatten. TikTok stoppar länkar i chatten, så VYRA måste
// SÖKA på låtnamnet — och YouTube Data API kräver en nyckel. Regeln i CLAUDE.md är absolut: aldrig
// API-nycklar i frontendfiler. Klienten (latonskningar.js) frågar därför den här modulen, som läser
// nyckeln ur miljön (YOUTUBE_API_KEY i Railway) och svarar med ett videoId, aldrig med nyckeln.
//
// KVOTEN ÄR DET SOM TAR SLUT. En sökning kostar 100 enheter av 10 000 per dygn och projekt — alltså
// ungefär 100 sökningar om dagen. Varje svar cachas därför (samma låt önskas ofta), och takten
// begränsas per arbetsyta i server/index.js.
//
// Allt är injicerat (fetch, nyckel, klocka) så att modulen provas utan nätverk:
// server/test/musik.test.js.

const SOK_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_URL = 'https://www.googleapis.com/youtube/v3/videos';
const CACHE_MS = 24 * 60 * 60 * 1000, CACHE_MAX = 500;

function sekunderAv(iso) {
  // ISO 8601-längd från YouTube, t.ex. PT3M45S eller PT1H2M. Okänd form ger 0 (= okänd längd).
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}
const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const avkoda = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function createMusik({ fetch: hamta = globalThis.fetch, apiKey = process.env.YOUTUBE_API_KEY, now = Date.now } = {}) {
  const cache = new Map();
  const konfigurerad = () => !!String(apiKey || '').trim();

  async function sokYoutube(fraga) {
    const q = text(fraga, 120);
    if (q.length < 2) throw Object.assign(new Error('Skriv vilken låt du önskar'), { status: 400 });
    if (!konfigurerad()) throw Object.assign(new Error('YouTube är inte kopplat — YOUTUBE_API_KEY saknas på servern'), { status: 503 });
    const nyckel = q.toLowerCase(), traff = cache.get(nyckel);
    if (traff && now() - traff.at < CACHE_MS) return traff.svar;

    const url = `${SOK_URL}?part=snippet&type=video&videoEmbeddable=true&maxResults=1&safeSearch=moderate&q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`;
    const r = await hamta(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      // Nyckeln får aldrig följa med ett felmeddelande ut. Bara statusen.
      const status = r.status === 403 ? 503 : 502;
      throw Object.assign(new Error(r.status === 403 ? 'YouTube-kvoten är slut för i dag eller nyckeln är fel' : `YouTube svarade ${r.status}`), { status });
    }
    const d = await r.json();
    const v = d && d.items && d.items[0];
    const videoId = text(v && v.id && v.id.videoId, 20);
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      const svar = null; cache.set(nyckel, { at: now(), svar }); return svar;
    }
    let sekunder = 0;
    try {
      const rv = await hamta(`${VIDEO_URL}?part=contentDetails&id=${videoId}&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (rv.ok) { const dv = await rv.json(); sekunder = sekunderAv(dv && dv.items && dv.items[0] && dv.items[0].contentDetails && dv.items[0].contentDetails.duration); }
    } catch (e) { /* längden är bara en bonus */ }
    const s = v.snippet || {};
    const svar = {
      videoId,
      titel: text(avkoda(s.title), 160),
      kanal: text(avkoda(s.channelTitle), 120),
      bild: text(s.thumbnails && (s.thumbnails.medium || s.thumbnails.default || {}).url, 500),
      sekunder
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(nyckel, { at: now(), svar });
    return svar;
  }

  // STATUS FÖR DEN SOM VILL VETA OM KOPPLINGEN FUNGERAR (GET /api/musik/status, utan inloggning).
  // Ett riktigt anrop mot YouTube (videos.list, 1 kvotenhet — inte search, som kostar 100), och
  // svaret sparas i tio minuter: sidan kan laddas om hur ofta som helst utan att tömma kvoten.
  // Svaret säger BARA om det fungerar och i så fall varför inte — aldrig nyckeln.
  let senasteStatus = null;
  async function status() {
    if (!konfigurerad()) return { youtube: 'saknas', text: 'YOUTUBE_API_KEY är inte satt på servern' };
    if (senasteStatus && now() - senasteStatus.at < 10 * 60 * 1000) return senasteStatus.svar;
    let svar;
    try {
      const r = await hamta(`${VIDEO_URL}?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) svar = { youtube: 'fungerar', text: 'YouTube-nyckeln fungerar' };
      else {
        let orsak = '';
        try { const d = await r.json(); orsak = String(d?.error?.errors?.[0]?.reason || d?.error?.status || ''); } catch (e) {}
        const text = /keyInvalid|API_KEY_INVALID|badRequest/i.test(orsak) ? 'Nyckeln är ogiltig — kopiera den igen från Google Cloud'
          : /accessNotConfigured|SERVICE_DISABLED|PERMISSION_DENIED/i.test(orsak) ? 'YouTube Data API v3 är inte aktiverat i Google Cloud-projektet'
          : /quota/i.test(orsak) ? 'Dagens kvot är slut — den nollställs runt kl 09 svensk tid'
          : `YouTube svarade ${r.status}`;
        svar = { youtube: 'fel', text: text, orsak: orsak.slice(0, 60) };
      }
    } catch (e) { svar = { youtube: 'fel', text: 'Servern nådde inte YouTube' }; }
    senasteStatus = { at: now(), svar };
    return svar;
  }

  return { sokYoutube, konfigurerad, status };
}

module.exports = { createMusik, sekunderAv };
