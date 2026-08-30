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
    // UPPMATT 2026-08-30 fran en INLOGGAD SE-session: 783 poster, 779 unika id, 0 utan id,
    // appContext.region = SE. Samma siffror som kontrolltalen ovan.
    //
    // Kontrolltalen bevisar bara ANTAL. En lista kan ha 783/779/0 och anda sakna ett id ur den
    // observerade katalogen och bara ett annat i stallet — digesten ar det som fangar det.
    //
    // BERAKNINGEN, identisk pa bada sidor: normalisera varje id med samma regel som servern
    // (String, kapad till 160 tecken), sortera ALLA 783 inklusive dubbletter, sla ihop med
    // radbrytning, SHA-256, hex. Korskontrollerad 2026-08-30: webblasarens och serverns
    // Gavokatalog.digestAvPoster gav samma varde for samma lista.
    //
    // Att andra det har vardet ar att andra vad som raknas som en komplett SE-katalog. Det kraver
    // en granskad PR — aldrig ett anrop.
    digest: '7f5b53a17079709f8f625ee49b59c155e8a34b81af7b36c2dfeb380e8084fdff',
    matt_at: '2026-08-30',
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
