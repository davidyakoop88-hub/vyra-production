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
//
// Raderna filtreras dessutom på faktiskt bidrag: gifter_totals får en rad även för ren NÄRVARO —
// en följare, en delning, en prenumeration skriver en rad med bara nollor. En "topplista" som
// listar folk med noll gåvor och noll diamanter är inte en topplista. Upptäckt i produktion när
// ett follow-event under kedjetestet lade testkontot överst, eftersom listan var det enda som fanns.
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
         best_gift_name, best_gift_diamonds, first_seen, last_seen,
         SUM(diamonds) OVER () AS lifetime_diamonds,
         COUNT(*) FILTER (WHERE gifts > 0 OR diamonds > 0) OVER () AS lifetime_gifters
    FROM gifter_totals
   WHERE workspace_id=$1 AND tiktok_username=$2
     AND (gifts > 0 OR diamonds > 0 OR likes > 0)
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
      const [dagQ, givarQ, slotQ, tierQ] = await Promise.all([
        pool.query(DAGAR_SQL(fonster.fran), params),
        pool.query(GIVARE_SQL, [workspaceId, konto]),
        pool.query('SELECT hour, SUM(diamonds) AS diamonds FROM slot_totals WHERE workspace_id=$1 AND tiktok_username=$2 GROUP BY hour ORDER BY hour',[workspaceId,konto]),
        pool.query(`SELECT CASE WHEN diamonds >= 10000 THEN 'Storgivare' WHEN gifts >= 10 THEN 'Frekventa' ELSE 'Sporadiska' END AS tier,
          COUNT(*) AS users, SUM(diamonds) AS diamonds FROM gifter_totals
          WHERE workspace_id=$1 AND tiktok_username=$2 AND (gifts > 0 OR diamonds > 0)
          GROUP BY tier`,[workspaceId,konto])
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
        timmar: slotQ.rows.map(r=>({hour:tal(r.hour),diamonds:tal(r.diamonds)})),
        givarGrupper: tierQ.rows.filter(r=>r.tier).map(r=>({namn:r.tier,givare:tal(r.users),diamonds:tal(r.diamonds)})),
        // Window aggregates run before LIMIT: the denominator includes every contributor,
        // not just the top 50. These are explicitly lifetime values, independent of period.
        givarUnderlag: {
          period: 'all',
          diamonds: tal(givarQ.rows[0]?.lifetime_diamonds),
          givare: tal(givarQ.rows[0]?.lifetime_gifters)
        },
        // Vilken dag historiken börjar — det som låter framsidan skriva "sedan 1 juni" i stället för
        // en naken siffra. Läses ur den hämtade serien, så ett rullande fönster rapporterar sin
        // egen första dag och inte kontots.
        forstaDagen: dagar.length ? dagar[0].dag : null,
        toppGivare: givarQ.rows.map(r => ({
          id: r.viewer_id, namn: r.display_name || r.viewer_id, avatar: r.avatar_url || '',
          gifts: tal(r.gifts), diamonds: tal(r.diamonds), likes: tal(r.likes),
          forstSedd: r.first_seen || null, senastSedd: r.last_seen || null,
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

  async function supporter(workspaceId,viewerId) {
    const account=await pool.query(KONTO_SQL,[workspaceId]);
    const konto=String(account.rows[0]?.tiktok_username||'').toLowerCase();
    if(!konto)return null;
    const result=await pool.query('SELECT * FROM gifter_totals WHERE workspace_id=$1 AND tiktok_username=$2 AND viewer_id=$3',[workspaceId,konto,viewerId]);
    const row=result.rows[0];if(!row)return null;
    const [daily,notes]=await Promise.all([
      pool.query('SELECT day,gifts,diamonds,last_gift_name,last_gift_diamonds,last_gift_at FROM gifter_daily WHERE workspace_id=$1 AND tiktok_username=$2 AND viewer_id=$3 ORDER BY day DESC LIMIT 90',[workspaceId,konto,viewerId]),
      pool.query('SELECT note,birthday FROM supporter_notes WHERE workspace_id=$1 AND tiktok_username=$2 AND viewer_id=$3',[workspaceId,konto,viewerId])
    ]);
    const latest=daily.rows.find(r=>r.last_gift_at);
    return {id:row.viewer_id,namn:row.display_name||row.viewer_id,avatar:row.avatar_url||'',konto,
      gifts:tal(row.gifts),diamonds:tal(row.diamonds),forstSedd:row.first_seen,senastSedd:row.last_seen,
      bastaGava:row.best_gift_name?{namn:row.best_gift_name,diamanter:tal(row.best_gift_diamonds)}:null,
      senasteGava:latest?{namn:latest.last_gift_name,diamanter:tal(latest.last_gift_diamonds),at:latest.last_gift_at}:null,
      dagar:daily.rows.reverse().map(r=>({dag:typeof r.day==='string'?r.day:datumStrang(new Date(r.day)),gifts:tal(r.gifts),diamonds:tal(r.diamonds)})),
      note:notes.rows[0]?.note||'',birthday:notes.rows[0]?.birthday||'',boosters:null};
  }
  async function saveSupporter(workspaceId,viewerId,input) {
    if(typeof input?.note!=='string'||input.note.length>2000||typeof input.birthday!=='string')throw Object.assign(new Error('Ogiltig anteckning'),{status:400});
    const birthday=input.birthday;
    if(birthday){const match=/^(\d{2})-(\d{2})$/.exec(birthday);const date=match&&new Date(`2000-${birthday}T00:00:00Z`);if(!date||!Number.isFinite(date.getTime())||date.toISOString().slice(5,10)!==birthday)throw Object.assign(new Error('Födelsedagen ska vara MM-DD'),{status:400})}
    const account=await pool.query(KONTO_SQL,[workspaceId]);const konto=String(account.rows[0]?.tiktok_username||'').toLowerCase();
    if(!konto)throw Object.assign(new Error('TikTok-konto saknas'),{status:404});
    if(input.konto!==konto)throw Object.assign(new Error('TikTok-kontot har ändrats. Öppna supporterkortet igen.'),{status:409});
    const out=await pool.query(`INSERT INTO supporter_notes (workspace_id,tiktok_username,viewer_id,note,birthday)
      SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM gifter_totals WHERE workspace_id=$1 AND tiktok_username=$2 AND viewer_id=$3)
      ON CONFLICT (workspace_id,tiktok_username,viewer_id) DO UPDATE SET note=EXCLUDED.note,birthday=EXCLUDED.birthday,updated_at=now() RETURNING viewer_id`,[workspaceId,konto,viewerId,input.note,birthday]);
    if(!out.rows.length)throw Object.assign(new Error('Supportern saknas'),{status:404});
    return {ok:true};
  }
  return { sammanfattning, supporter, saveSupporter };
}

module.exports = { periodFonster, createStatsReader, PERIODER, TOPP_GIVARE, DAGAR_SQL, GIVARE_SQL };
