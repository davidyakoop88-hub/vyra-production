'use strict';
// Läsvägen bakom "All time" på framsidan.
//
// #136 gav servern tre aggregattabeller, #137 gav den något att skriva i dem. Fram till nu har ingen
// vy läst dem: Command Center visar sessionens siffror ur minnet, som försvinner vid en omladdning.
// Det här är det som gör historiken synlig — och det som gör skillnaden mot att räkna i webbläsaren,
// där en sändning utan Studio-fliken uppe aldrig funnits.
//
// SAMMA UPPDELNING SOM stream-stats.js: den rena regeln (`periodFonster`) avgör vilket fönster som
// menas och går att pröva uttömmande utan databas. Läsaren gör bara SELECT. Felen bor i regeln.

// Uppräknad mängd, inte fri text. Perioden kommer från en URL-parameter och får aldrig nå SQL:en
// som något annat än ett val ur den här listan.
const PERIODER = new Set(['all', '7d', '30d', '90d']);
const DAGAR = { '7d': 7, '30d': 30, '90d': 90 };

// Taket finns för att ETT svar inte ska bli obegränsat stort. TikControl visar 472 givare sedan
// juni; en topplista är ändå bara intressant i toppen, och resten summeras redan i `totalt`.
const TOPP_GIVARE = 50;

function datumStrang(d) {
  return d.toISOString().slice(0, 10);
}

// UTC hela vägen, samma som skrivaren. Lagras lokal tid låses historiken till den tidszon
// användaren råkade ha när raden skrevs.
function periodFonster(period, nu = new Date()) {
  const vald = PERIODER.has(period) ? period : 'all';
  if (vald === 'all') return { period: 'all', fran: null };
  // -1: fönstret inkluderar idag. "7 dagar" ska vara sju dagar, inte åtta.
  const fran = new Date(nu.getTime());
  fran.setUTCDate(fran.getUTCDate() - (DAGAR[vald] - 1));
  return { period: vald, fran: datumStrang(fran) };
}

// node-postgres returnerar bigint som STRÄNG, för att inte tappa precision över 2^53. Summeras de
// som strängar blir "2" + "5" = "25" och siffran på framsidan blir nonsens. Den här funktionen är
// hela skyddet mot det.
function tal(varde) {
  const n = Number(varde);
  return Number.isFinite(n) ? n : 0;
}

const KONTO_SQL = 'SELECT tiktok_username FROM tiktok_connections WHERE workspace_id=$1 AND active=true LIMIT 1';

// $1/$2 alltid; datumgränsen tillkommer som $3 bara när perioden har en. Ingen sträng från
// användaren interpoleras — perioden är uppräknad och allt annat är parametrar.
const DAGAR_SQL = fran => `
  SELECT day, gifts, diamonds, likes
    FROM daily_totals
   WHERE workspace_id=$1 AND tiktok_username=$2${fran ? ' AND day >= $3' : ''}
   ORDER BY day
`;
const GIVARE_SQL = `
  SELECT viewer_id, display_name, avatar_url, gifts, diamonds, likes,
         best_gift_name, best_gift_diamonds, first_seen, last_seen
    FROM gifter_totals
   WHERE workspace_id=$1 AND tiktok_username=$2
   ORDER BY diamonds DESC, gifts DESC
   LIMIT ${TOPP_GIVARE}
`;

function createStatsReader(pool, options = {}) {
  const log = options.log || (() => {});

  const TOMT = () => ({ totalt: { gifts: 0, diamonds: 0, likes: 0 }, dagar: [], toppGivare: [] });

  async function sammanfattning(workspaceId, period, nu = new Date()) {
    const fonster = periodFonster(period, nu);
    const bas = { ...TOMT(), period: fonster.period, fran: fonster.fran, forstaDagen: null, konto: null, fel: false };

    let konto = '';
    try {
      const q = await pool.query(KONTO_SQL, [workspaceId]);
      konto = q.rowCount ? String(q.rows[0].tiktok_username || '').toLowerCase() : '';
    } catch (error) {
      log('stats-read konto lookup failed', error && error.message);
      return { ...bas, fel: true };
    }
    // Ingen ansluten TikTok = ingen historik. Det är ett normalt läge för ett nytt konto, inte ett
    // fel: framsidan ska visa nollor och sin ärliga tomtext, inte en kraschad vy.
    if (!konto) return bas;

    try {
      const params = fonster.fran ? [workspaceId, konto, fonster.fran] : [workspaceId, konto];
      const [dagQ, givarQ] = await Promise.all([
        pool.query(DAGAR_SQL(fonster.fran), params),
        pool.query(GIVARE_SQL, [workspaceId, konto])
      ]);

      const dagar = dagQ.rows.map(r => ({
        dag: typeof r.day === 'string' ? r.day : datumStrang(new Date(r.day)),
        gifts: tal(r.gifts), diamonds: tal(r.diamonds), likes: tal(r.likes)
      }));
      const totalt = dagar.reduce((sum, d) => ({
        gifts: sum.gifts + d.gifts, diamonds: sum.diamonds + d.diamonds, likes: sum.likes + d.likes
      }), { gifts: 0, diamonds: 0, likes: 0 });

      return {
        ...bas, konto,
        totalt, dagar,
        // Vilken dag historiken börjar — det som låter framsidan skriva "sedan 1 juni" i stället för
        // en naken siffra. Läses ur den hämtade serien, så ett rullande fönster rapporterar sin
        // egen första dag och inte kontots.
        forstaDagen: dagar.length ? dagar[0].dag : null,
        toppGivare: givarQ.rows.map(r => ({
          id: r.viewer_id, namn: r.display_name || r.viewer_id, avatar: r.avatar_url || '',
          gifts: tal(r.gifts), diamonds: tal(r.diamonds), likes: tal(r.likes),
          bastaGava: r.best_gift_name ? { namn: r.best_gift_name, diamanter: tal(r.best_gift_diamonds) } : null
        }))
      };
    } catch (error) {
      // En analysvy får aldrig fälla framsidan. Nollor och en flagga är ett sämre svar än riktiga
      // siffror, men oändligt mycket bättre än en tom sida.
      log('stats-read failed', error && error.message);
      return { ...bas, konto, fel: true };
    }
  }

  return { sammanfattning };
}

module.exports = { periodFonster, createStatsReader, PERIODER, TOPP_GIVARE, DAGAR_SQL, GIVARE_SQL };
