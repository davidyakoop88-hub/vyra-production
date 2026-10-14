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
const crypto = require('node:crypto');
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

// ---- BILDERNA HOS OSS -----------------------------------------------------------------------
//
// Varje katalogbild laddas ner och lagras i gavobild, så hemsidan inte går sönder den dag TikTok
// byter adress eller tar bort en bild. Gäller ALLA rader i gavokatalog med en tillåten bildvärd —
// alltså även gåvor som bara setts i en sändning (exklusiva gåvor ingen lista räknar upp).
//
// Laddas ner igen när TikTok byter bildadress för en gåva. Ett misslyckat försök sparas med
// data = NULL och försöks igen tidigast efter ett dygn, så en död adress inte hamras var sjätte timme.
const BILD_MAX = 2 * 1024 * 1024;
const BILD_TYPER = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif']);

// Innehållet avgör, inte bara huvudet: en server som svarar text/html med image/webp-huvud ska inte
// hamna i en tabell vi serverar som bild till varje kund.
function bildtyp(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}

async function hamtaBild(url, { hamta = fetch, timeoutMs = 15000 } = {}) {
  if (!Gavokatalog.tillatenBild(url)) throw new Error('otillåten bildvärd');
  const svar = await hamta(url, { headers: { 'user-agent': UA, accept: 'image/webp,image/*' },
    signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  if (!svar.ok) throw new Error('bilden svarade ' + svar.status);
  const buf = Buffer.from(await svar.arrayBuffer());
  if (!buf.length || buf.length > BILD_MAX) throw new Error('bilden har fel storlek');
  const typ = bildtyp(buf);
  if (!typ || !BILD_TYPER.has(typ)) throw new Error('inte en bild');
  return { typ, data: buf, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

async function speglaBilder(pool, { hamta = fetch, max = 1500, samtidigt = 4 } = {}) {
  const q = await pool.query(
    `SELECT k.gift_id, k.gift_image
       FROM gavokatalog k
       LEFT JOIN gavobild b ON b.gift_id = k.gift_id
      WHERE k.gift_image <> ''
        AND (b.gift_id IS NULL
             OR b.kalla_url <> k.gift_image
             OR (b.data IS NULL AND b.forsok_at < now() - interval '1 day'))
      ORDER BY k.forsta_sedd DESC
      LIMIT $1`, [max]);
  const ko = q.rows.filter(r => Gavokatalog.tillatenBild(r.gift_image));
  let sparade = 0, fel = 0;
  const arbetare = async () => {
    for (let r = ko.shift(); r; r = ko.shift()) {
      try {
        const b = await hamtaBild(r.gift_image, { hamta });
        await pool.query(
          `INSERT INTO gavobild (gift_id, kalla_url, typ, sha256, data, forsok_at)
           VALUES ($1,$2,$3,$4,$5,now())
           ON CONFLICT (gift_id) DO UPDATE SET kalla_url = EXCLUDED.kalla_url, typ = EXCLUDED.typ,
             sha256 = EXCLUDED.sha256, data = EXCLUDED.data, forsok_at = now()`,
          [r.gift_id, r.gift_image, b.typ, b.sha256, b.data]);
        sparade += 1;
      } catch {
        // Bara försöket noteras. En äldre, fungerande kopia av SAMMA adress får stå kvar.
        await pool.query(
          `INSERT INTO gavobild (gift_id, kalla_url, forsok_at) VALUES ($1,$2,now())
           ON CONFLICT (gift_id) DO UPDATE SET forsok_at = now(),
             kalla_url = EXCLUDED.kalla_url,
             data = CASE WHEN gavobild.kalla_url = EXCLUDED.kalla_url THEN gavobild.data END,
             typ = CASE WHEN gavobild.kalla_url = EXCLUDED.kalla_url THEN gavobild.typ END,
             sha256 = CASE WHEN gavobild.kalla_url = EXCLUDED.kalla_url THEN gavobild.sha256 END`,
          [r.gift_id, r.gift_image]).catch(() => {});
        fel += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, samtidigt) }, arbetare));
  if (sparade) Gavokatalog.tomCache();
  return { sparade, fel };
}

async function lasBild(pool, giftId) {
  const q = await pool.query('SELECT typ, sha256, data FROM gavobild WHERE gift_id = $1 AND data IS NOT NULL', [String(giftId || '').slice(0, 160)]);
  return q.rows[0] || null;
}

async function korEnGang(pool, { hamta = fetch, logg = console } = {}) {
  try {
    const gifts = await hamtaLista({ hamta });
    const ut = await Gavokatalog.noteraRumslista(pool, gifts);
    // Bilderna efter listan, och även när listan inte gav något nytt: händelseraderna (gåvor sedda
    // i en sändning) och tidigare misslyckade försök ska också ifatt.
    const bilder = await speglaBilder(pool, { hamta }).catch(() => ({ sparade: 0, fel: 0 }));
    logg.log(JSON.stringify({ level: 'info', event: 'gavobevakning', poster: ut.poster, nya: ut.nya,
      baslinje: !!ut.baslinje, bilderSparade: bilder.sparade, bilderFel: bilder.fel, at: new Date().toISOString() }));
    return { ...ut, bilder };
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

module.exports = { hamtaLista, korEnGang, startaGavobevakning, speglaBilder, hamtaBild, lasBild, bildtyp, URL_LISTA, INTERVALL_MS };
