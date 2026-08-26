'use strict';
// ENGÅNGSOBSERVATION AV RUMMETS GÅVOKATALOG — ren diagnostik, ingen produktlogik.
//
// Syftet är att besvara två frågor som inte går att besvara ur repot eller ur bibliotekets typer,
// inför Heart Me Goal (PR #275):
//   1. Svarar `fetchAvailableGifts()` med data när bryggan INTE sätter något signApiKey?
//      Biblioteket dokumenterar att `gift/list/` "must be signed for TikTok to return data".
//   2. Hur ser en katalogpost ut? `type RoomGiftInfo = any` och `type RoomGiftsResponse = any`
//      i tiktok-live-connector@2.4.0 — fältnamnen är inte kända ur typerna.
//
// DEN HÄR MODULEN FÅR ALDRIG PÅVERKA SÄNDNINGEN. Anropet är fire-and-forget, tidsbegränsat, och
// varje utfall — 403, tomt svar, kastat undantag, timeout — blir en loggrad och ingenting annat.
// Returpromisen resolvar ALLTID; den rejectar aldrig, så en glömd `.catch()` på anropsplatsen kan
// inte fälla processen via unhandledRejection.
//
// REDIGERINGEN ÄR HELA POÄNGEN. Sammanfattningen bär bara AGGREGAT: lyckades/misslyckades,
// antal poster, unionen av fältnamn, typerna på kandidatfälten för id/namn, och antalet exakta
// Heart Me-träffar. Aldrig gåvonamn, aldrig giftId-värden, aldrig payloadinnehåll, aldrig
// användare, roomId eller token.
//
// Felmeddelanden loggas ALDRIG råa. Det är en husregel med ett uppmätt skäl: error.message kan
// bära en uppkopplingssträng med lösenord (samma fynd som rättades i utkorgsworkern). Endast en
// kategori lämnas ut.

const HEART_ME = 'heart me';

// Kandidatfält vi vill veta TYPEN på. Värdena lämnar aldrig modulen — bara typeof.
const ID_KANDIDATER = ['id', 'gift_id', 'giftId', 'gift_id_str', 'giftIdStr'];
const NAMN_KANDIDATER = ['name', 'gift_name', 'giftName', 'describe'];

// Katalogen kan komma som en array, eller inbäddad under ett av de vanliga höljena. Vi gissar
// inte på innehåll — bara på var listan bor.
function posterUr(svar) {
  if (Array.isArray(svar)) return svar;
  if (!svar || typeof svar !== 'object') return null;
  for (const nyckel of ['gifts', 'data', 'giftList', 'gift_list', 'items']) {
    const v = svar[nyckel];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray(v.gifts)) return v.gifts;
  }
  return null;
}

const normaliseraNamn = v => (typeof v === 'string' ? v.trim().toLowerCase() : '');

// Exakt matchning — 'Heart Me Flex' är en ANNAN gåva och får aldrig räknas som träff.
function arHeartMe(post) {
  for (const nyckel of NAMN_KANDIDATER) {
    if (normaliseraNamn(post && post[nyckel]) === HEART_ME) return true;
  }
  return false;
}

// Den redigerade sammanfattningen. Allt som lämnar modulen passerar här.
function sammanfattaKatalog(svar) {
  const poster = posterUr(svar);
  if (!poster) return { ok: false, orsak: 'oformat', poster: 0, falt: [], idTyper: {}, namnTyper: {}, heartMeTraffar: 0 };
  if (!poster.length) return { ok: false, orsak: 'tomt', poster: 0, falt: [], idTyper: {}, namnTyper: {}, heartMeTraffar: 0 };

  const falt = new Set();
  const idTyper = {}, namnTyper = {};
  let heartMeTraffar = 0;

  for (const post of poster) {
    if (!post || typeof post !== 'object') continue;
    for (const nyckel of Object.keys(post)) falt.add(nyckel);
    for (const nyckel of ID_KANDIDATER) {
      if (nyckel in post && !idTyper[nyckel]) idTyper[nyckel] = typeof post[nyckel];
    }
    for (const nyckel of NAMN_KANDIDATER) {
      if (nyckel in post && !namnTyper[nyckel]) namnTyper[nyckel] = typeof post[nyckel];
    }
    if (arHeartMe(post)) heartMeTraffar++;
  }

  return {
    ok: true,
    poster: poster.length,
    falt: Array.from(falt).sort(),          // BARA namnen. Aldrig värdena.
    idTyper,
    namnTyper,
    heartMeTraffar                          // ett antal, aldrig ett id
  };
}

// Grovkategori ur ett fel. Meddelandet självt lämnas aldrig ut.
function felkategori(fel) {
  const status = fel && (fel.status || fel.statusCode || (fel.response && fel.response.status));
  if (status === 403) return 'http_403';
  if (status === 401) return 'http_401';
  if (status === 429) return 'http_429';
  if (typeof status === 'number') return 'http_' + status;
  if (fel && fel.name === 'AbortError') return 'timeout';
  return 'undantag';
}

// Engångsobservationen. `hamta` är en funktion som returnerar katalogpromisen — i bryggan
// `() => connection.fetchAvailableGifts()`.
//
// Tidsbegränsningen är en kapplöpning, inte en avbrytning: biblioteket erbjuder ingen
// AbortSignal här, så vi väntar helt enkelt inte längre. Ett sent svar landar i tomma intet och
// kan inte logga något efteråt, eftersom `klar` redan är satt.
function skapaObservator({ hamta, logg = console, timeoutMs = 4000, schemalagg = setTimeout, avbryt = clearTimeout } = {}) {
  let gjord = false;          // HÖGST ETT ANROP PER ANSLUTNING — och högst en loggrad.

  async function observera() {
    if (gjord) return null;
    gjord = true;

    let klar = false, timer = null;
    const rapportera = rad => {
      if (klar) return;
      klar = true;
      if (timer) avbryt(timer);
      try { logg.log('[gavokatalog] ' + JSON.stringify(rad)); } catch (_) { /* loggning får aldrig fälla */ }
      return rad;
    };

    const tidsutRad = { ok: false, orsak: 'timeout', poster: 0, falt: [], idTyper: {}, namnTyper: {}, heartMeTraffar: 0 };

    const tidsut = new Promise(resolve => {
      timer = schemalagg(() => resolve(rapportera(tidsutRad)), timeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });

    const arbete = (async () => {
      try {
        const svar = await hamta();
        return rapportera(sammanfattaKatalog(svar));
      } catch (fel) {
        return rapportera({ ok: false, orsak: felkategori(fel), poster: 0, falt: [], idTyper: {}, namnTyper: {}, heartMeTraffar: 0 });
      }
    })();

    // Rejectar aldrig: `arbete` fångar allt, och `tidsut` resolvar.
    return Promise.race([arbete, tidsut]);
  }

  return { observera, harKort: () => gjord };
}

module.exports = { skapaObservator, sammanfattaKatalog, felkategori, HEART_ME_NAMN: 'Heart Me' };
