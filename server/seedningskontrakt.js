'use strict';
// GRANSKADE SEEDNINGSKONTRAKT — vad en komplett gåvokatalog SKA innehålla, per region.
//
// VARFÖR FILEN FINNS. Kontrolltalen låg tidigare i anropets kropp, alltså i samma payload som
// gåvolistan. Då är de inte oberoende: den som skickar en trunkerad lista skickar matchande sänkta
// tal och får seedningen markerad `klar`. Ett kontrolltal som följer med det den ska kontrollera
// kontrollerar ingenting.
//
// Här går talen i stället genom kodgranskning och CI innan de kan användas. Att ändra vad som
// räknas som en komplett katalog kräver en pull request — inte ett HTTP-anrop.
//
// HUR MAN LÄGGER TILL EN REGION. Mät först: hämta `webcast/gift/list/` från en INLOGGAD session i
// den regionen, räkna poster, distinkta id och poster utan id, och skriv in dem här tillsammans
// med datum och källa. Gissa aldrig. En region utan kontrakt kan inte seedas, och det är avsikten.

const KONTRAKT = {
  // Uppmätt 2026-08-29 mot en inloggad SE-session.
  //   783 poster, 779 distinkta id (fyra id förekommer två gånger), 0 poster utan id.
  //   `is_full_gift_data` var false — TikTok säger själv att listan är kontextuell, vilket är
  //   precis därför talen måste bindas till EN region och inte behandlas som global sanning.
  SE: {
    poster: 783,
    unikaId: 779,
    utanId: 0,
    // MEDLEMSKAPSBEVIS — SHA-256 over en sorterad multimangd av alla 783 normaliserade id.
    //
    // ANNU OMATT, och det ar med FLIT null i stallet for ett pahittat varde. Kontrolltalen bevisar
    // bara ANTAL: en lista kan ha 783/779/0 och anda sakna ett id ur den observerade katalogen och
    // bara ett annat i stallet. Utan digest kan SE darfor inte seedas alls — modulen avvisar ett
    // kontrakt utan medlemskapsbevis.
    //
    // SA HAR MATER MAN DEN: hamta webcast/gift/list/ fran en INLOGGAD SE-session, plocka ut
    // gifts[].id, normalisera med samma regel som servern (String, kapad till 160 tecken), sortera
    // ALLA 783 inklusive dubbletter, sla ihop med radbrytning, SHA-256, hex. Samma varde ska falla
    // ut ur Gavokatalog.digestAvPoster(gifts). Skriv in det har via granskad PR.
    digest: null,
    matt_at: '2026-08-29',
    kalla: 'webcast/gift/list/ fran inloggad SE-session (appContext.region=SE)'
  }
};

// Slår upp kontraktet på EXAKT regionkod. Ingen normalisering: `se` ger null, inte `SE`. En
// anropare som skickar fel form har troligen fel källa också, och ett tyst normaliserat uppslag
// hade dolt det.
function forRegion(region) {
  if (typeof region !== 'string' || !/^[A-Z]{2}$/.test(region)) return null;
  const k = KONTRAKT[region];
  if (!k) return null;
  return { poster: k.poster, unikaId: k.unikaId, utanId: k.utanId,
           digest: k.digest, matt_at: k.matt_at, kalla: k.kalla };
}

const regioner = () => Object.keys(KONTRAKT).sort();

module.exports = { for: forRegion, forRegion, regioner };
