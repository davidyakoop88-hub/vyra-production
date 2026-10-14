'use strict';
// GÅVOBEVAKAREN — hittar nya TikTok-gåvor av sig själv.
//
// Problemet: hemsidans gåvobilder var en fast lista från juli (assets/gifts/gifts-manifest.js).
// Uppmätt 2026-10-14: TikToks lista bar 770 gåvor, och 149 av dem fanns inte i manifestet.
//
// VÄGEN SOM FAKTISKT FUNGERAR. docs/gavokatalog-matresultat.md mätte 2026-08-26 att bryggans
// fetchAvailableGifts() faller i produktion: biblioteket SIGNERAR anropet via Euler Stream, och den
// routen kräver en betald Business-plan. Men själva TikTok-routen kräver ingen signering. Uppmätt
// 2026-10-14 från en vanlig server utan cookies: `webcast/gift/list/?aid=1988` svarar HTTP 200 med
// 770 gåvor, alla med id, namn, styckpris och en bild på p16-webcast.tiktokcdn.com.
//
// Ett anrop var sjätte timme. Listan skrivs via noteraRumslista (gavokatalog.js), som sätter `ny`
// på gåvor som dyker upp efter den första listan — det är vad hemsidans väljare visar som NY.
//
// FAIL-QUIET. Ett TikTok-svar som ändrar form, en timeout eller ett 403 får aldrig fälla servern
// eller logga i en loop: en rad per misslyckat försök, nästa försök om sex timmar.
const Gavokatalog = require('./gavokatalog');

const URL_LISTA = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988';
const INTERVALL_MS = 6 * 3600 * 1000;
const FORSTA_MS = 60 * 1000;          // efter uppstarten, inte i den
const MAX_BYTE = 12 * 1024 * 1024;    // svaret är ~3 MB; ett 50 MB-svar är inte en gåvolista
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function hamtaLista({ hamta = fetch, timeoutMs = 20000 } = {}) {
  const svar = await hamta(URL_LISTA, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!svar.ok) throw new Error('TikTok svarade ' + svar.status);
  const langd = Number(svar.headers && svar.headers.get && svar.headers.get('content-length')) || 0;
  if (langd > MAX_BYTE) throw new Error('svaret är för stort');
  const text = await svar.text();
  if (text.length > MAX_BYTE) throw new Error('svaret är för stort');
  const d = JSON.parse(text);
  const gifts = d && d.data && Array.isArray(d.data.gifts) ? d.data.gifts : null;
  if (!gifts) throw new Error('svaret saknar data.gifts');
  return gifts;
}

async function korEnGang(pool, { hamta = fetch, logg = console } = {}) {
  try {
    const gifts = await hamtaLista({ hamta });
    const ut = await Gavokatalog.noteraRumslista(pool, gifts);
    logg.log(JSON.stringify({ level: 'info', event: 'gavobevakning', poster: ut.poster, nya: ut.nya,
      baslinje: !!ut.baslinje, at: new Date().toISOString() }));
    return ut;
  } catch (error) {
    logg.log(JSON.stringify({ level: 'warn', event: 'gavobevakning_misslyckades',
      message: String(error && error.message || error).slice(0, 200), at: new Date().toISOString() }));
    return { ok: false, skal: 'fel' };
  }
}

// Avstängd med GAVOBEVAKNING=0. Timrarna är unref:ade så de aldrig håller processen vid liv.
function startaGavobevakning({ pool, hamta = fetch, logg = console,
                               forstaMs = FORSTA_MS, intervallMs = INTERVALL_MS } = {}) {
  if (process.env.GAVOBEVAKNING === '0') return () => {};
  const kor = () => korEnGang(pool, { hamta, logg });
  const forsta = setTimeout(kor, forstaMs);
  const puls = setInterval(kor, intervallMs);
  forsta.unref?.(); puls.unref?.();
  return () => { clearTimeout(forsta); clearInterval(puls) };
}

module.exports = { hamtaLista, korEnGang, startaGavobevakning, URL_LISTA, INTERVALL_MS };
